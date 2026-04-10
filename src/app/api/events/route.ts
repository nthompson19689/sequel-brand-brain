import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ events: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const eventType = searchParams.get("event_type");

  let query = supabase
    .from("events")
    .select("*, event_series(series_name), event_content(id, content_type, status)")
    .order("event_date", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (eventType) query = query.eq("event_type", eventType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  const { data, error } = await supabase
    .from("events")
    .insert({
      event_name: body.event_name,
      event_type: body.event_type || "webinar",
      description: body.description || null,
      speaker_names: body.speaker_names || [],
      event_date: body.event_date || null,
      duration_minutes: body.duration_minutes || 60,
      registration_url: body.registration_url || null,
      target_audience: body.target_audience || null,
      topic_tags: body.topic_tags || [],
      series_id: body.series_id || null,
      status: "planning",
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
