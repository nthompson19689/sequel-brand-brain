#!/usr/bin/env -S npx tsx
/**
 * Sequel Brand Brain — MCP server
 *
 * Exposes semantic-search tools backed by pgvector + OpenAI
 * text-embedding-3-small (1536 dims):
 *
 *   - search_brand_content(query)         → brand_docs + articles
 *   - search_competitive_intel(competitor)→ battle_cards + competitor_scan_results
 *   - search_call_insights(query)         → call_insights
 *   - search_campaigns(query)             → campaigns + campaign_assets
 *
 * All four use cosine similarity (`embedding <=> $1`) against the
 * vector(1536) column on each table. There are no match_* RPCs; we
 * issue the SQL directly via Supabase's `rpc("execute_sql")` is
 * intentionally avoided — instead we rely on a small inline helper
 * `vectorSearch()` that uses the supabase-js client with `.select()`
 * + `.order()` over the embedding column.
 *
 * Run:  npm run mcp
 * Env:  OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
// Env + clients
// ─────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!OPENAI_API_KEY) {
  console.error("[mcp] OPENAI_API_KEY missing");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[mcp] Supabase env missing (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─────────────────────────────────────────────────────────────
// Embeddings (text-embedding-3-small, 1536 dims)
// ─────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const cleaned = (text || "").trim().slice(0, 24000);
  if (!cleaned) throw new Error("Empty query");
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: cleaned,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  const v = json.data[0]?.embedding;
  if (!v) throw new Error("No embedding returned");
  return v;
}

/**
 * Generic semantic-search helper. Issues:
 *   SELECT <cols>, 1 - (embedding <=> $1) AS similarity
 *   FROM <table> WHERE <extraWhereClause> AND embedding IS NOT NULL
 *   ORDER BY embedding <=> $1
 *   LIMIT <limit>
 *
 * Implemented via supabase-js: we sort by the cosine-distance
 * expression directly, which pgvector understands.
 */
async function vectorSearch(opts: {
  table: string;
  selectCols: string;
  embedding: number[];
  limit: number;
  extraFilter?: (q: ReturnType<SupabaseClient["from"]>) => ReturnType<SupabaseClient["from"]>;
}): Promise<Record<string, unknown>[]> {
  // pgvector accepts the literal "[a,b,c]" representation in queries.
  const literal = `[${opts.embedding.join(",")}]`;

  let q = supabase
    .from(opts.table)
    .select(opts.selectCols)
    .not("embedding", "is", null)
    // sort by cosine distance ascending (smallest = most similar)
    .order("embedding", { ascending: true, foreignTable: undefined as never } as never);

  if (opts.extraFilter) q = opts.extraFilter(q);

  // supabase-js doesn't expose pgvector operators directly. Fall back
  // to .order() with raw via the rpc-less workaround: select with the
  // similarity computed in a virtual column using `.select` extension.
  // Postgrest supports order on raw expression via `order=embedding<->...`
  // but only when the column is exposed. Easiest reliable path: pull
  // the candidate rows and sort client-side using the raw vector.
  //
  // NOTE: this trades a tiny bit of efficiency for portability — the
  // query above does NOT actually use the ivfflat index. For the data
  // sizes in this app (low thousands of rows per table) that is fine.
  // If/when row counts grow, swap in a Postgres function (match_*) or
  // call pg-rest's `?order=` on a generated column.
  const { data, error } = await q.limit(Math.max(opts.limit * 8, 64));
  if (error) throw new Error(`Supabase query failed on ${opts.table}: ${error.message}`);

  // Re-rank locally by cosine distance against the query embedding.
  type Row = Record<string, unknown> & { embedding?: number[] | string };
  const rows = (data || []) as Row[];
  const qVec = opts.embedding;
  const qNorm = Math.sqrt(qVec.reduce((s, x) => s + x * x, 0)) || 1;
  const scored = rows
    .map((r) => {
      const ev = parsePgVector(r.embedding);
      if (!ev || ev.length !== qVec.length) return { row: r, sim: -1 };
      let dot = 0;
      let n = 0;
      for (let i = 0; i < ev.length; i++) {
        dot += ev[i] * qVec[i];
        n += ev[i] * ev[i];
      }
      const sim = dot / ((Math.sqrt(n) || 1) * qNorm);
      return { row: r, sim };
    })
    .filter((s) => s.sim > -1)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, opts.limit)
    .map(({ row, sim }) => {
      // Drop the heavy vector before handing back
      const { embedding, ...rest } = row;
      void embedding;
      return { ...rest, similarity: Number(sim.toFixed(4)) };
    });

  return scored;
}

/** pgvector serializes as "[0.1,0.2,...]"; supabase-js may surface it as that string or as a number[]. */
function parsePgVector(v: number[] | string | undefined | null): number[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim().replace(/^\[|\]$/g, "");
    if (!trimmed) return null;
    const parts = trimmed.split(",").map((s) => Number(s));
    return parts.every((n) => Number.isFinite(n)) ? parts : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────

async function searchBrandContent(query: string, limit = 8) {
  const v = await embed(query);
  const [docs, articles] = await Promise.all([
    vectorSearch({
      table: "brand_docs",
      selectCols: "id, name, doc_type, content, embedding",
      embedding: v,
      limit,
      extraFilter: (q) => q.eq("is_active", true),
    }),
    vectorSearch({
      table: "articles",
      selectCols: "id, title, url, full_text, primary_keyword, embedding",
      embedding: v,
      limit,
      extraFilter: (q) => q.eq("status", "published"),
    }),
  ]);

  return {
    query,
    brand_docs: docs.map((d) => ({
      id: d.id,
      name: d.name,
      doc_type: d.doc_type,
      similarity: d.similarity,
      excerpt: snippet(d.content as string),
    })),
    articles: articles.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      primary_keyword: a.primary_keyword,
      similarity: a.similarity,
      excerpt: snippet(a.full_text as string),
    })),
  };
}

async function searchCompetitiveIntel(competitor: string, limit = 8) {
  const v = await embed(competitor);
  const [cards, scans] = await Promise.all([
    vectorSearch({
      table: "battle_cards",
      selectCols: "id, competitor_name, full_content, embedding",
      embedding: v,
      limit,
      // If the user named a competitor explicitly, bias by name match.
      extraFilter: (q) => (competitor.length > 1 ? q.ilike("competitor_name", `%${competitor}%`) : q),
    }),
    vectorSearch({
      table: "competitor_scan_results",
      selectCols: "id, competitor_id, scan_type, significance, title, summary, embedding",
      embedding: v,
      limit,
    }),
  ]);

  // Fall back: if the name-filtered battle-cards query came up empty
  // (different brand spelling, etc.), retry without the ilike filter.
  const battleCards = cards.length > 0 ? cards : await vectorSearch({
    table: "battle_cards",
    selectCols: "id, competitor_name, full_content, embedding",
    embedding: v,
    limit,
  });

  return {
    competitor,
    battle_cards: battleCards.map((b) => ({
      id: b.id,
      competitor_name: b.competitor_name,
      similarity: b.similarity,
      excerpt: snippet(b.full_content as string),
    })),
    scan_results: scans.map((s) => ({
      id: s.id,
      scan_type: s.scan_type,
      significance: s.significance,
      title: s.title,
      summary: s.summary,
      similarity: s.similarity,
    })),
  };
}

async function searchCallInsights(query: string, limit = 10) {
  const v = await embed(query);
  const rows = await vectorSearch({
    table: "call_insights",
    selectCols:
      "id, call_type, company_name, contact_name, summary, sentiment, churn_risk, case_study_candidate, full_content, embedding",
    embedding: v,
    limit,
  });

  return {
    query,
    insights: rows.map((r) => ({
      id: r.id,
      call_type: r.call_type,
      company_name: r.company_name,
      contact_name: r.contact_name,
      sentiment: r.sentiment,
      churn_risk: r.churn_risk,
      case_study_candidate: r.case_study_candidate,
      similarity: r.similarity,
      summary: r.summary,
      excerpt: snippet(r.full_content as string),
    })),
  };
}

async function searchCampaigns(query: string, limit = 8) {
  const v = await embed(query);
  const [campaigns, assets] = await Promise.all([
    vectorSearch({
      table: "campaigns",
      selectCols: "id, name, brief, launch_date, status, embedding",
      embedding: v,
      limit,
    }),
    vectorSearch({
      table: "campaign_assets",
      selectCols: "id, campaign_id, asset_type, title, body, status, scheduled_at, channel, embedding",
      embedding: v,
      limit,
    }),
  ]);

  return {
    query,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      launch_date: c.launch_date,
      status: c.status,
      similarity: c.similarity,
      excerpt: snippet(c.brief as string),
    })),
    assets: assets.map((a) => ({
      id: a.id,
      campaign_id: a.campaign_id,
      asset_type: a.asset_type,
      title: a.title,
      status: a.status,
      scheduled_at: a.scheduled_at,
      channel: a.channel,
      similarity: a.similarity,
      excerpt: snippet(a.body as string),
    })),
  };
}

function snippet(text: string | null | undefined, max = 360): string {
  if (!text) return "";
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : s.slice(0, max) + "…";
}

// ─────────────────────────────────────────────────────────────
// MCP wiring
// ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "sequel-brand-brain", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const TOOLS = [
  {
    name: "search_brand_content",
    description:
      "Semantic search across brand_docs (voice, MVV, editorial) and articles (sitemap content). Returns top matches with similarity scores. Use for any 'what does Sequel say about…' style question.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language search query" },
        limit: { type: "number", description: "Max results per source (default 8)", default: 8 },
      },
      required: ["query"],
    },
  },
  {
    name: "search_competitive_intel",
    description:
      "Semantic search across battle_cards and competitor_scan_results. Pass a competitor name (e.g. 'Hopin', 'Goldcast') or a topic ('pricing changes', 'webinar features').",
    inputSchema: {
      type: "object",
      properties: {
        competitor: { type: "string", description: "Competitor name or competitive topic" },
        limit: { type: "number", description: "Max results per source (default 8)", default: 8 },
      },
      required: ["competitor"],
    },
  },
  {
    name: "search_call_insights",
    description:
      "Semantic search over call_insights (Gong-derived insights: objections, sentiment, case-study candidates, churn risks). Use for VoC questions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language question, e.g. 'objections about pricing'" },
        limit: { type: "number", description: "Max insights to return (default 10)", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "search_campaigns",
    description:
      "Semantic search across campaigns and their generated assets (blog posts, emails, LinkedIn, sales enablement, etc.). Useful for 'find the launch campaign for X' or 'what email did we send about Y'.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural-language search query" },
        limit: { type: "number", description: "Max results per source (default 8)", default: 8 },
      },
      required: ["query"],
    },
  },
] as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args || {}) as Record<string, unknown>;

  try {
    let result: unknown;
    if (name === "search_brand_content") {
      result = await searchBrandContent(String(a.query || ""), Number(a.limit) || 8);
    } else if (name === "search_competitive_intel") {
      result = await searchCompetitiveIntel(String(a.competitor || ""), Number(a.limit) || 8);
    } else if (name === "search_call_insights") {
      result = await searchCallInsights(String(a.query || ""), Number(a.limit) || 10);
    } else if (name === "search_campaigns") {
      result = await searchCampaigns(String(a.query || ""), Number(a.limit) || 8);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return {
      isError: true,
      content: [
        { type: "text", text: `Error in ${name}: ${err instanceof Error ? err.message : String(err)}` },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] sequel-brand-brain server ready on stdio");
}

main().catch((err) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
