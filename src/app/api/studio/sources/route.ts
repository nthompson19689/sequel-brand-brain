import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ sources: [] });

  const { data, error } = await supabase
    .from("studio_sources")
    .select("*, studio_outputs(id, output_type, title, status, publish_url)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  const { data, error } = await supabase
    .from("studio_sources")
    .insert({
      title: body.title,
      source_type: body.source_type || "transcript_upload",
      speaker_name: body.speaker_name || null,
      speaker_title: body.speaker_title || null,
      speaker_company: body.speaker_company || null,
      speaker_bio: body.speaker_bio || null,
      raw_transcript: body.raw_transcript,
      status: "processing",
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}
