import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/docs/health — Documentation health dashboard data
 */
export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ health: null });

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [articlesRes, staleRes, unhelpfulRes, reviewQueueRes, categoriesRes] = await Promise.all([
    // All articles
    supabase.from("docs_articles").select("id, status, product_area, visibility, view_count, helpful_yes, helpful_no, last_reviewed_at, updated_at"),
    // Stale articles (not reviewed in 90+ days, published)
    supabase.from("docs_articles")
      .select("id, title, product_area, view_count, last_reviewed_at, updated_at")
      .eq("status", "published")
      .or(`last_reviewed_at.is.null,last_reviewed_at.lt.${ninetyDaysAgo.toISOString()}`)
      .order("view_count", { ascending: false })
      .limit(20),
    // Unhelpful articles (high helpful_no count)
    supabase.from("docs_articles")
      .select("id, title, helpful_yes, helpful_no, view_count")
      .eq("status", "published")
      .gt("helpful_no", 0)
      .order("helpful_no", { ascending: false })
      .limit(20),
    // Review queue (flagged by agents)
    supabase.from("docs_articles")
      .select("id, title, source_type, product_area, updated_at")
      .in("status", ["review", "outdated"])
      .order("updated_at", { ascending: false })
      .limit(30),
    // Category coverage
    supabase.from("docs_categories")
      .select("id, name, icon")
      .order("display_order"),
  ]);

  const articles = articlesRes.data || [];
  const total = articles.length;
  const published = articles.filter((a) => a.status === "published").length;
  const stale = (staleRes.data || []).length;
  const inReview = (reviewQueueRes.data || []).length;

  // Coverage: count articles per product_area
  const coverageMap: Record<string, number> = {};
  for (const a of articles) {
    const area = a.product_area || "uncategorized";
    coverageMap[area] = (coverageMap[area] || 0) + 1;
  }

  // Calculate health score (0-100)
  const freshnessPct = total > 0 ? Math.max(0, 100 - (stale / Math.max(published, 1)) * 100) : 0;
  const totalVotes = articles.reduce((s, a) => s + (a.helpful_yes || 0) + (a.helpful_no || 0), 0);
  const yesVotes = articles.reduce((s, a) => s + (a.helpful_yes || 0), 0);
  const helpfulnessPct = totalVotes > 0 ? (yesVotes / totalVotes) * 100 : 50;
  const coverageScore = Math.min(100, Object.keys(coverageMap).length * 15);
  const healthScore = Math.round(freshnessPct * 0.35 + helpfulnessPct * 0.35 + coverageScore * 0.3);

  return NextResponse.json({
    health: {
      score: healthScore,
      total_articles: total,
      published,
      in_review: inReview,
      stale_count: stale,
      freshness_pct: Math.round(freshnessPct),
      helpfulness_pct: Math.round(helpfulnessPct),
    },
    stale_articles: staleRes.data || [],
    unhelpful_articles: unhelpfulRes.data || [],
    review_queue: reviewQueueRes.data || [],
    coverage: coverageMap,
    categories: categoriesRes.data || [],
  });
}
