import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [sourceRes, outputsRes] = await Promise.all([
    supabase.from("studio_sources").select("*").eq("id", id).single(),
    supabase.from("studio_outputs").select("*").eq("source_id", id).order("created_at"),
  ]);

  if (sourceRes.error) return NextResponse.json({ error: sourceRes.error.message }, { status: 404 });
  return NextResponse.json({ source: sourceRes.data, outputs: outputsRes.data || [] });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  const allowed = ["title", "speaker_name", "speaker_title", "speaker_company", "speaker_bio", "topic_summary", "key_quotes", "key_themes", "status"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];

  const { data, error } = await supabase.from("studio_sources").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await supabase.from("studio_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
