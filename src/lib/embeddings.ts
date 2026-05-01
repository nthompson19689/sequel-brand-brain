/**
 * OpenAI embeddings client.
 *
 * Model: text-embedding-3-small (1536 dimensions). Matches the
 * vector(1536) columns on articles, brand_docs, battle_cards,
 * call_insights, campaigns, campaign_assets, and
 * competitor_scan_results.
 *
 * Implemented with raw fetch so we don't have to add the openai
 * SDK as a dependency.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

interface EmbedResponse {
  data: { embedding: number[]; index: number }[];
  usage: { prompt_tokens: number; total_tokens: number };
  model: string;
}

function getKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

export function isEmbeddingsConfigured(): boolean {
  return !!getKey();
}

/**
 * text-embedding-3-small accepts up to 8192 tokens. We truncate to
 * ~24,000 chars (≈ 6k tokens, conservative) to avoid 400s on long
 * articles or transcripts. The model gracefully embeds the leading
 * portion — for long-form content the first 6k tokens carry the
 * topical signal we care about for retrieval.
 */
function trim(text: string, maxChars = 24000): string {
  if (!text) return "";
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

/** Embed a single string. Returns null if no API key is configured. */
export async function embed(text: string): Promise<number[] | null> {
  const key = getKey();
  if (!key) return null;
  const cleaned = trim(text).trim();
  if (!cleaned) return null;

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: cleaned,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as EmbedResponse;
  return json.data[0]?.embedding ?? null;
}

/**
 * Embed many strings in one API call. The OpenAI endpoint accepts up
 * to 2048 inputs per request; we batch in chunks of 96 to stay well
 * under the per-request token cap.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const key = getKey();
  if (!key) return texts.map(() => null);

  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  const BATCH = 96;

  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const cleaned = slice.map((t) => trim(t || "").trim());
    const liveIdxs = cleaned
      .map((t, j) => (t ? j : -1))
      .filter((j) => j !== -1);
    const inputs = liveIdxs.map((j) => cleaned[j]);
    if (inputs.length === 0) continue;

    const res = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: inputs,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings batch failed (${res.status}): ${detail}`);
    }

    const json = (await res.json()) as EmbedResponse;
    for (const item of json.data) {
      const localIdx = liveIdxs[item.index];
      out[i + localIdx] = item.embedding;
    }
  }

  return out;
}

/**
 * Postgres pgvector wants the literal "[0.1,0.2,...]" string when
 * inserting via the REST API. Supabase JS handles arrays fine, but
 * this helper is here for raw SQL paths.
 */
export function toPgVector(v: number[]): string {
  return `[${v.join(",")}]`;
}

/**
 * Fire-and-forget embedding for a row. Used by upload/save routes so a
 * failed embedding never breaks the user's save.
 */
export async function embedAndStore(opts: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  table: string;
  id: string;
  text: string;
}): Promise<void> {
  try {
    const v = await embed(opts.text);
    if (!v) return;
    await opts.supabase.from(opts.table).update({ embedding: v }).eq("id", opts.id);
  } catch (err) {
    console.error(`[embeddings] background embed failed (${opts.table}/${opts.id}):`, err);
  }
}
