import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ outputs: [] });

  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("source_id");

  let query = supabase.from("studio_outputs").select("*").order("created_at", { ascending: false });
  if (sourceId) query = query.eq("source_id", sourceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ outputs: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Bulk insert (from generate route)
  if (Array.isArray(body.outputs)) {
    const { data, error } = await supabase.from("studio_outputs").insert(body.outputs).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ outputs: data });
  }

  // Single update (status change, edit, publish URL)
  if (body.id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.body !== undefined) updates.body = body.body;
    if (body.title !== undefined) updates.title = body.title;
    if (body.publish_url !== undefined) updates.publish_url = body.publish_url;

    const { data, error } = await supabase.from("studio_outputs").update(updates).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ output: data });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
