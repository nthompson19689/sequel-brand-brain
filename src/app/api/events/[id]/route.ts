import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [eventRes, contentRes, questionsRes, registrantsRes] = await Promise.all([
    supabase.from("events").select("*, event_series(series_name)").eq("id", id).single(),
    supabase.from("event_content").select("*").eq("event_id", id).order("created_at"),
    supabase.from("event_questions").select("*").eq("event_id", id).order("display_order"),
    supabase.from("event_registrants").select("*").eq("event_id", id).order("created_at"),
  ]);

  if (eventRes.error) return NextResponse.json({ error: eventRes.error.message }, { status: 404 });

  const registrants = registrantsRes.data || [];
  const attendees = registrants.filter((r) => r.attended);
  const hotLeads = registrants.filter((r) =>
    r.attended &&
    r.engagement_score >= 7 &&
    ["VP", "C-suite", "Director", "SVP"].some((level) =>
      (r.title || "").toLowerCase().includes(level.toLowerCase())
    )
  );

  return NextResponse.json({
    event: eventRes.data,
    content: contentRes.data || [],
    questions: questionsRes.data || [],
    registrants,
    stats: {
      total_registrants: registrants.length,
      total_attendees: attendees.length,
      attendance_rate: registrants.length > 0 ? Math.round((attendees.length / registrants.length) * 100) : 0,
      hot_leads: hotLeads.length,
    },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  const allowed = [
    "event_name", "event_type", "description", "speaker_names", "event_date",
    "duration_minutes", "registration_url", "landing_page_url", "status",
    "target_audience", "topic_tags", "registration_count", "attendance_count",
    "recording_url", "transcript", "series_id",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];

  const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
