import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isEmbeddingsConfigured } from "@/lib/embeddings";
import { backfillAll } from "@/lib/embed-backfill";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/embed-backfill
 *
 * Hourly Vercel Cron. Mops up any rows whose background auto-embed
 * never landed (server restart, OpenAI rate limit, transient error,
 * etc.) by walking every embeddable table and embedding any rows
 * still sitting at NULL.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is set in the project's env. We match the same pattern
 * used by the other cron routes in this app. If CRON_SECRET is unset
 * the route only runs locally / in dev.
 *
 * Per run we drain up to 500 rows per table. With the cron firing
 * hourly that comfortably keeps up with normal ingest volumes; if
 * you ever ingest >500/hour for any single table, this will simply
 * catch up on the next tick.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isEmbeddingsConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const started = Date.now();
  const results = await backfillAll(supabase, "all", 500);
  const duration_ms = Date.now() - started;

  const totals = results.reduce(
    (acc, r) => {
      acc.checked += r.checked;
      acc.embedded += r.embedded;
      acc.errors += r.errors;
      return acc;
    },
    { checked: 0, embedded: 0, errors: 0 },
  );

  if (totals.embedded > 0 || totals.errors > 0) {
    console.log(
      `[cron embed-backfill] embedded=${totals.embedded} checked=${totals.checked} errors=${totals.errors} duration=${duration_ms}ms`,
    );
  }

  return NextResponse.json({ ok: true, duration_ms, totals, results });
}
