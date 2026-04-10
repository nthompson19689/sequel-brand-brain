import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Bulk CSV import of registrants
  if (Array.isArray(body.registrants) && body.event_id) {
    const rows = body.registrants.map((r: Record<string, unknown>) => ({
      event_id: body.event_id,
      first_name: r.first_name || (r.name as string || "").split(" ")[0] || "",
      last_name: r.last_name || (r.name as string || "").split(" ").slice(1).join(" ") || "",
      email: r.email || null,
      company: r.company || r.organization || null,
      title: r.title || r.job_title || null,
      attended: r.attended === true || r.attended === "Yes" || r.attended === "yes",
      engagement_score: Number(r.engagement_score) || 0,
    }));

    const { data, error } = await supabase.from("event_registrants").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update event counts
    const totalReg = rows.length;
    const totalAttended = rows.filter((r: { attended: boolean }) => r.attended).length;
    await supabase.from("events").update({
      registration_count: totalReg,
      attendance_count: totalAttended,
      updated_at: new Date().toISOString(),
    }).eq("id", body.event_id);

    return NextResponse.json({ registrants: data, imported: (data || []).length });
  }

  return NextResponse.json({ error: "registrants array and event_id required" }, { status: 400 });
}
