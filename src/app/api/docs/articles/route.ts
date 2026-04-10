import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ articles: [] });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const visibility = searchParams.get("visibility");
  const productArea = searchParams.get("product_area");
  const categoryId = searchParams.get("category_id");

  let query = supabase
    .from("docs_articles")
    .select("*, docs_categories(name, icon)")
    .order("updated_at", { ascending: false });

  if (status && status !== "all") query = query.eq("status", status);
  if (visibility) query = query.eq("visibility", visibility);
  if (productArea) query = query.eq("product_area", productArea);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articles: data || [] });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();

  // Bulk insert (from AI agents)
  if (Array.isArray(body.articles)) {
    const { data, error } = await supabase.from("docs_articles").insert(body.articles).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ articles: data, count: (data || []).length });
  }

  const slug = (body.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { data, error } = await supabase
    .from("docs_articles")
    .insert({
      title: body.title,
      slug: slug + "-" + Date.now().toString(36),
      category_id: body.category_id || null,
      subcategory: body.subcategory || null,
      content_markdown: body.content_markdown || "",
      content_html: body.content_html || null,
      excerpt: body.excerpt || (body.content_markdown || "").slice(0, 150),
      source_type: body.source_type || "manual",
      source_id: body.source_id || null,
      status: body.status || "draft",
      visibility: body.visibility || "public",
      product_area: body.product_area || null,
      difficulty_level: body.difficulty_level || "beginner",
      search_keywords: body.search_keywords || [],
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}
