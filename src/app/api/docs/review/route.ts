import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/** POST /api/docs/review — Log a review and update article */
export async function POST(request: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json();
  if (!body.article_id || !body.review_result) {
    return NextResponse.json({ error: "article_id and review_result required" }, { status: 400 });
  }

  // Log the review
  await supabase.from("docs_review_log").insert({
    article_id: body.article_id,
    reviewed_by: body.reviewed_by || null,
    review_result: body.review_result,
    notes: body.notes || null,
  });

  // Update the article
  const updates: Record<string, unknown> = {
    last_reviewed_at: new Date().toISOString(),
    reviewed_by: body.reviewed_by || null,
    updated_at: new Date().toISOString(),
  };

  if (body.review_result === "archived") {
    updates.status = "archived";
  } else if (body.review_result === "accurate") {
    updates.status = "published";
  } else {
    // minor_update or major_rewrite — keep in review
    updates.status = "review";
  }

  const { data, error } = await supabase
    .from("docs_articles")
    .update(updates)
    .eq("id", body.article_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}
