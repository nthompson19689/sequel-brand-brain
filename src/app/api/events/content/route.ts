import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Update an existing content piece (status, body, publish_url)
  if (body.id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.body !== undefined) updates.body = body.body;
    if (body.publish_url !== undefined) updates.publish_url = body.publish_url;

    const { data, error } = await supabase.from("event_content").update(updates).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ content: data });
  }

  return NextResponse.json({ error: "id required for update" }, { status: 400 });
}
