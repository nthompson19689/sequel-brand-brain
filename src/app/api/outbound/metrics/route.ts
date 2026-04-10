import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ metrics: null });

  // Get aggregate prospect counts by status
  const { data: prospects } = await supabase
    .from("prospects")
    .select("prospect_status");

  const statusCounts: Record<string, number> = {};
  for (const p of prospects || []) {
    statusCounts[p.prospect_status] = (statusCounts[p.prospect_status] || 0) + 1;
  }

  // Get this week's message activity
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: sentMessages } = await supabase
    .from("prospect_messages")
    .select("status")
    .gte("sent_at", weekAgo.toISOString())
    .not("sent_at", "is", null);

  const { data: repliedMessages } = await supabase
    .from("prospect_messages")
    .select("status")
    .gte("replied_at", weekAgo.toISOString())
    .not("replied_at", "is", null);

  const sentThisWeek = (sentMessages || []).length;
  const repliesThisWeek = (repliedMessages || []).length;
  const positiveReplies = (repliedMessages || []).filter((m) => m.status === "positive_reply" || m.status === "booked").length;
  const bookingsThisWeek = (repliedMessages || []).filter((m) => m.status === "booked").length;

  const totalActive = Object.entries(statusCounts)
    .filter(([s]) => !["disqualified", "booked"].includes(s))
    .reduce((sum, [, count]) => sum + count, 0);

  return NextResponse.json({
    metrics: {
      total_prospects: (prospects || []).length,
      active_prospects: totalActive,
      status_counts: statusCounts,
      sent_this_week: sentThisWeek,
      replies_this_week: repliesThisWeek,
      reply_rate: sentThisWeek > 0 ? Math.round((repliesThisWeek / sentThisWeek) * 100) : 0,
      positive_reply_rate: sentThisWeek > 0 ? Math.round((positiveReplies / sentThisWeek) * 100) : 0,
      bookings_this_week: bookingsThisWeek,
      booking_rate: sentThisWeek > 0 ? Math.round((bookingsThisWeek / sentThisWeek) * 100) : 0,
    },
  });
}
