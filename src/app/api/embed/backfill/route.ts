import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isEmbeddingsConfigured } from "@/lib/embeddings";
import { TABLE_SPECS, backfillAll } from "@/lib/embed-backfill";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/embed/backfill?table=articles&limit=200
 *
 * Backfills embeddings for any row where `embedding IS NULL` on the
 * targeted table. Pass `?table=all` to walk every supported table.
 *
 * The same backfill logic runs every hour from the Vercel cron at
 * GET /api/cron/embed-backfill so orphaned NULL rows can never sit
 * un-embedded for long.
 */

export async function POST(req: Request) {
  // ─── Shared-secret gate ──────────────────────────────────────────
  // The route lives outside the auth middleware (PUBLIC_PATHS) so it
  // can be hit from a terminal. To keep it safe in production we
  // require EMBED_BACKFILL_SECRET to match either:
  //   - X-Embed-Secret header
  //   - ?secret=... query param
  // If the env var is unset we refuse outright (fail closed) to
  // prevent accidentally shipping an open endpoint.
  const expected = process.env.EMBED_BACKFILL_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "EMBED_BACKFILL_SECRET not configured on server. Set it in .env to enable this route." },
      { status: 503 },
    );
  }
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-embed-secret") ||
    url.searchParams.get("secret") ||
    "";
  if (provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmbeddingsConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const tableParam = url.searchParams.get("table") || "all";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10) || 200, 500);

  if (tableParam !== "all" && !TABLE_SPECS[tableParam]) {
    return NextResponse.json(
      { error: `Unknown table '${tableParam}'. Use one of: all, ${Object.keys(TABLE_SPECS).join(", ")}` },
      { status: 400 },
    );
  }

  const results = await backfillAll(supabase, tableParam, limit);

  return NextResponse.json({
    ok: true,
    limit,
    results,
    note: "Re-run until 'checked' returns 0 to fully drain a table.",
  });
}
