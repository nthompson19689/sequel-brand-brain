import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export interface ContentPost {
  id: string;
  cluster_id: string | null;
  title: string | null;
  primary_keyword: string;
  secondary_keywords: string[] | null;
  search_intent: string | null;
  post_type: string | null;
  status: string;
  brief: string | null;
  draft: string | null;
  edited_draft: string | null;
  editor_notes: Record<string, unknown> | null;
  internal_links: Record<string, unknown> | null;
  word_count: number | null;
  created_at: string;
  updated_at: string;
}

/** GET /api/content — List all content posts */
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 503 });

  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("content_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ posts: data || [] });
}

/** POST /api/content — Create or update content posts */
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json();

  // Bulk create (from CSV import)
  if (Array.isArray(body.posts)) {
    const rows = body.posts.map((p: Record<string, unknown>) => ({
      primary_keyword: p.primary_keyword || p.keyword,
      secondary_keywords: p.secondary_keywords || null,
      search_intent: p.search_intent || null,
      post_type: p.post_type || "supporting",
      word_count: p.word_count || null,
      status: "queued",
    }));

    const { data, error } = await supabase.from("content_posts").insert(rows).select();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ posts: data });
  }

  // Single create or update
  if (body.id) {
    // Update
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["title", "status", "brief", "draft", "edited_draft", "editor_notes", "internal_links", "word_count", "post_type", "search_intent"]) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const { data, error } = await supabase.from("content_posts").update(updates).eq("id", body.id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ post: data });
  }

  // Create single
  const { data, error } = await supabase.from("content_posts").insert({
    primary_keyword: body.primary_keyword || body.keyword,
    secondary_keywords: body.secondary_keywords || null,
    search_intent: body.search_intent || null,
    post_type: body.post_type || "supporting",
    word_count: body.word_count || null,
    status: "queued",
  }).select().single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ post: data });
}

/** DELETE /api/content?id=xxx */
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 503 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("content_posts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
