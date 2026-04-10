import { getSupabaseServerClient } from "@/lib/supabase";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/cron/docs-review — Daily check for articles past their review date.
 * Flags stale articles by setting status to "review".
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const { createSupabaseServerAuthClient } = await import("@/lib/supabase-auth-server");
    const authClient = createSupabaseServerAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) return Response.json({ error: "Supabase not configured" }, { status: 500 });

  // Find published articles past their review interval
  // Default review_interval_days is 90
  const { data: articles } = await supabase
    .from("docs_articles")
    .select("id, title, review_interval_days, last_reviewed_at, updated_at")
    .eq("status", "published");

  if (!articles || articles.length === 0) {
    return Response.json({ message: "No published articles to check", flagged: 0 });
  }

  const now = Date.now();
  let flagged = 0;

  for (const article of articles) {
    const intervalDays = article.review_interval_days || 90;
    const lastReview = article.last_reviewed_at || article.updated_at;
    const daysSince = (now - new Date(lastReview).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince >= intervalDays) {
      await supabase.from("docs_articles")
        .update({ status: "review", updated_at: new Date().toISOString() })
        .eq("id", article.id)
        .eq("status", "published"); // Only flag if still published

      flagged++;
    }
  }

  return Response.json({
    message: `Checked ${articles.length} articles, flagged ${flagged} for review`,
    checked: articles.length,
    flagged,
  });
}
