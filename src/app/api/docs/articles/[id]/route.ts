import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  // Increment view count (best effort)
  try {
    const { data: current } = await supabase.from("docs_articles").select("view_count").eq("id", id).single();
    if (current) {
      await supabase.from("docs_articles").update({ view_count: (current.view_count || 0) + 1 }).eq("id", id);
    }
  } catch { /* non-critical */ }
  const { data, error } = await supabase.from("docs_articles").select("*, docs_categories(name, icon)").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ article: data });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await req.json();
  const allowed = [
    "title", "slug", "category_id", "subcategory", "content_markdown", "content_html",
    "excerpt", "status", "visibility", "product_area", "difficulty_level",
    "related_articles", "search_keywords", "helpful_yes", "helpful_no",
    "last_reviewed_at", "reviewed_by",
  ];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of allowed) if (body[f] !== undefined) updates[f] = body[f];

  // Handle helpfulness vote
  if (body.vote === "yes") {
    const { data: current } = await supabase.from("docs_articles").select("helpful_yes").eq("id", id).single();
    updates.helpful_yes = (current?.helpful_yes || 0) + 1;
  } else if (body.vote === "no") {
    const { data: current } = await supabase.from("docs_articles").select("helpful_no").eq("id", id).single();
    updates.helpful_no = (current?.helpful_no || 0) + 1;
  }

  const { data, error } = await supabase.from("docs_articles").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  const { error } = await supabase.from("docs_articles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
