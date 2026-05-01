/**
 * Shared backfill logic. Used by both the manual route
 * (POST /api/embed/backfill) and the hourly Vercel cron
 * (GET /api/cron/embed-backfill) so they can never drift.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedBatch } from "@/lib/embeddings";

export interface TableSpec {
  table: string;
  selectCols: string;
  buildText: (row: Record<string, unknown>) => string;
}

export const TABLE_SPECS: Record<string, TableSpec> = {
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

export interface BackfillResult {
  table: string;
  checked: number;
  embedded: number;
  skipped: number;
  errors: number;
}

export async function backfillTable(
  supabase: SupabaseClient,
  spec: TableSpec,
  limit: number,
): Promise<BackfillResult> {
  const { data, error } = await supabase
    .from(spec.table)
    .select(spec.selectCols)
    .is("embedding", null)
    .limit(limit);

  if (error) {
    console.error(`[backfill ${spec.table}] select failed:`, error.message);
    return { table: spec.table, checked: 0, embedded: 0, skipped: 0, errors: 1 };
  }

  const rows = (data || []) as unknown as Record<string, unknown>[];
  if (rows.length === 0) {
    return { table: spec.table, checked: 0, embedded: 0, skipped: 0, errors: 0 };
  }

  const ids = rows.map((r) => r.id as string);
  const texts = rows.map((r) => spec.buildText(r).trim());

  const liveIdxs = texts.map((t, i) => (t ? i : -1)).filter((i) => i !== -1);
  const liveTexts = liveIdxs.map((i) => texts[i]);

  let embedded = 0;
  let errors = 0;
  let vectors: (number[] | null)[] = [];
  try {
    vectors = await embedBatch(liveTexts);
  } catch (err) {
    console.error(`[backfill ${spec.table}] embed batch failed:`, err);
    return { table: spec.table, checked: rows.length, embedded: 0, skipped: rows.length - liveIdxs.length, errors: 1 };
  }

  for (let k = 0; k < liveIdxs.length; k++) {
    const v = vectors[k];
    if (!v) continue;
    const id = ids[liveIdxs[k]];
    const { error: upErr } = await supabase.from(spec.table).update({ embedding: v }).eq("id", id);
    if (upErr) errors += 1;
    else embedded += 1;
  }

  return { table: spec.table, checked: rows.length, embedded, skipped: rows.length - liveIdxs.length, errors };
}

export async function backfillAll(
  supabase: SupabaseClient,
  tableParam: string,
  limit: number,
): Promise<BackfillResult[]> {
  const specs: TableSpec[] =
    tableParam === "all"
      ? Object.values(TABLE_SPECS)
      : TABLE_SPECS[tableParam]
        ? [TABLE_SPECS[tableParam]]
        : [];

  const out: BackfillResult[] = [];
  for (const spec of specs) {
    out.push(await backfillTable(supabase, spec, limit));
  }
  return out;
}
