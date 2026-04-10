import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ categories: [] });

  const { data, error } = await supabase
    .from("docs_categories")
    .select("*, docs_articles(id)")
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const categories = (data || []).map((c) => ({
    ...c,
    article_count: (c.docs_articles || []).length,
    docs_articles: undefined,
  }));

  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  const slug = (body.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const { data, error } = await supabase
    .from("docs_categories")
    .insert({
      name: body.name,
      slug,
      description: body.description || null,
      icon: body.icon || "📄",
      display_order: body.display_order || 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}
