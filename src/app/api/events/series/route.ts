import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ series: [] });

  const { data, error } = await supabase
    .from("event_series")
    .select("*, events(id, event_name, event_date, status, registration_count, attendance_count)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const { data, error } = await supabase
    .from("event_series")
    .insert({
      series_name: body.series_name,
      description: body.description || null,
      cadence: body.cadence || null,
      default_event_type: body.default_event_type || "webinar",
      default_duration_minutes: body.default_duration_minutes || 60,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ series: data });
}
