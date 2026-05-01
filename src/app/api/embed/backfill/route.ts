import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { embedBatch, isEmbeddingsConfigured } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/embed/backfill?table=articles&limit=200
 *
 * Backfills embeddings for any row where `embedding IS NULL` on the
 * targeted table. Pass `?table=all` to walk every supported table.
 *
 * Tables and the text source we embed for each:
 *   articles               → title + "\n\n" + full_text (column: full_text)
 *   brand_docs             → name  + "\n\n" + content
 *   battle_cards           → competitor_name + "\n\n" + full_content
 *   call_insights          → company_name + "\n\n" + full_content
 *   campaigns              → name + "\n\n" + brief
 *   campaign_assets        → title + "\n\n" + body
 *   competitor_scan_results→ title + "\n\n" + summary
 */

interface TableSpec {
  table: string;
  selectCols: string;
  buildText: (row: Record<string, unknown>) => string;
}

const TABLE_SPECS: Record<string, TableSpec> = {
  articles: {
    table: "articles",
    selectCols: "id, title, full_text",
    buildText: (r) => `${(r.title as string) || ""}\n\n${(r.full_text as string) || ""}`,
  },
  brand_docs: {
    table: "brand_docs",
    selectCols: "id, name, content",
    buildText: (r) => `${(r.name as string) || ""}\n\n${(r.content as string) || ""}`,
  },
  battle_cards: {
    table: "battle_cards",
    selectCols: "id, competitor_name, full_content",
    buildText: (r) => `${(r.competitor_name as string) || ""}\n\n${(r.full_content as string) || ""}`,
  },
  call_insights: {
    table: "call_insights",
    selectCols: "id, company_name, full_content",
    buildText: (r) => `${(r.company_name as string) || ""}\n\n${(r.full_content as string) || ""}`,
  },
  campaigns: {
    table: "campaigns",
    selectCols: "id, name, brief",
    buildText: (r) => `${(r.name as string) || ""}\n\n${(r.brief as string) || ""}`,
  },
  campaign_assets: {
    table: "campaign_assets",
    selectCols: "id, title, body",
    buildText: (r) => `${(r.title as string) || ""}\n\n${(r.body as string) || ""}`,
  },
  competitor_scan_results: {
    table: "competitor_scan_results",
    selectCols: "id, title, summary",
    buildText: (r) => `${(r.title as string) || ""}\n\n${(r.summary as string) || ""}`,
  },
};

async function backfillOne(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  spec: TableSpec,
  limit: number,
): Promise<{ table: string; checked: number; embedded: number; skipped: number; errors: number }> {
  if (!supabase) return { table: spec.table, checked: 0, embedded: 0, skipped: 0, errors: 0 };

  const { data, error } = await supabase
    .from(spec.table)
    .select(spec.selectCols)
    .is("embedding", null)
    .limit(limit);

  if (error) {
    return { table: spec.table, checked: 0, embedded: 0, skipped: 0, errors: 1 };
  }

  const rows = (data || []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) {
    return { table: spec.table, checked: 0, embedded: 0, skipped: 0, errors: 0 };
  }

  const ids = rows.map((r) => r.id as string);
  const texts = rows.map((r) => spec.buildText(r).trim());

  // Skip rows with empty source text
  const liveIdxs = texts.map((t, i) => (t ? i : -1)).filter((i) => i !== -1);
  const liveTexts = liveIdxs.map((i) => texts[i]);

  let embedded = 0;
  let errors = 0;
  let vectors: (number[] | null)[] = [];
  try {
    vectors = await embedBatch(liveTexts);
  } catch (err) {
    console.error(`[backfill ${spec.table}] embed batch failed:`, err);
    errors += 1;
    return { table: spec.table, checked: rows.length, embedded: 0, skipped: rows.length - liveIdxs.length, errors };
  }

  // Updates run sequentially to keep this simple — a few hundred rows is fine.
  for (let k = 0; k < liveIdxs.length; k++) {
    const v = vectors[k];
    if (!v) continue;
    const id = ids[liveIdxs[k]];
    const { error: upErr } = await supabase.from(spec.table).update({ embedding: v }).eq("id", id);
    if (upErr) errors += 1;
    else embedded += 1;
  }

  return {
    table: spec.table,
    checked: rows.length,
    embedded,
    skipped: rows.length - liveIdxs.length,
    errors,
  };
}

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

  const specs: TableSpec[] =
    tableParam === "all"
      ? Object.values(TABLE_SPECS)
      : TABLE_SPECS[tableParam]
        ? [TABLE_SPECS[tableParam]]
        : [];

  if (specs.length === 0) {
    return NextResponse.json(
      { error: `Unknown table '${tableParam}'. Use one of: all, ${Object.keys(TABLE_SPECS).join(", ")}` },
      { status: 400 },
    );
  }

  const results = [];
  for (const spec of specs) {
    results.push(await backfillOne(supabase, spec, limit));
  }

  return NextResponse.json({
    ok: true,
    limit,
    results,
    note: "Re-run until 'checked' returns 0 to fully drain a table.",
  });
}
