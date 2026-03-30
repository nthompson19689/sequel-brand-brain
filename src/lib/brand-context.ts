/**
 * Centralized brand context for ecosystem-wide prompt caching.
 *
 * The key insight: Block 1 text must be IDENTICAL across every Claude call —
 * chat, agents, content brief, writer, editor. Same content, same order,
 * same formatting = cache hit every time.
 *
 * Block 1: Brand docs (shared by ALL routes)
 * Block 2: Writing standards (shared by content pipeline routes)
 */

import { getSupabaseServerClient } from "./supabase";
import { WRITING_STANDARDS } from "./content/standards";

export interface BrandDoc {
  id: string;
  name: string;
  doc_type: string;
  content: string;
}

// ── In-memory cache with 30-minute TTL ──────────────
let cachedBrandText: string | null = null;
let cachedDocs: BrandDoc[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (brand docs rarely change)

// ── Cached article list (for internal link reference) ──
let cachedArticleList: string | null = null;
let articleCacheTimestamp = 0;
const ARTICLE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/** Canonical doc type ordering — NEVER change this order or cache breaks */
const DOC_TYPE_ORDER = [
  "mission_vision_values",
  "voice_and_tone",
  "editorial_longform",
  "editorial_shortform",
  "positioning",
  "icp",
  "content_examples",
  "other",
];

/**
 * Load brand docs and build the canonical Block 1 text.
 * Cached in-memory, refreshes every 5 minutes.
 * Returns identical text every call = Anthropic cache hit.
 */
async function loadAndCacheBrandDocs(): Promise<{ text: string; docs: BrandDoc[] }> {
  const now = Date.now();
  if (cachedBrandText && now - cacheTimestamp < CACHE_TTL) {
    return { text: cachedBrandText, docs: cachedDocs };
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    cachedBrandText = "";
    cachedDocs = [];
    cacheTimestamp = now;
    return { text: "", docs: [] };
  }

  const { data, error } = await supabase
    .from("brand_docs")
    .select("id, name, doc_type, content")
    .eq("is_active", true);

  if (error) {
    console.error("[BrandContext] Failed to load brand docs:", error.message);
    // Keep stale cache if available
    if (cachedBrandText) return { text: cachedBrandText, docs: cachedDocs };
    return { text: "", docs: [] };
  }

  const docs = (data || []) as BrandDoc[];

  // Group by type in canonical order
  const grouped: Record<string, BrandDoc[]> = {};
  for (const doc of docs) {
    if (!grouped[doc.doc_type]) grouped[doc.doc_type] = [];
    grouped[doc.doc_type].push(doc);
  }

  // Sort docs within each group alphabetically by name for consistency
  for (const type of Object.keys(grouped)) {
    grouped[type].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Build the text in canonical order
  const sections: string[] = ["=== BRAND BRAIN (Governance Layer) ==="];
  for (const docType of DOC_TYPE_ORDER) {
    const typeDocs = grouped[docType];
    if (!typeDocs || typeDocs.length === 0) continue;
    const label = docType.replace(/_/g, " ").toUpperCase();
    sections.push(`\n--- ${label} ---`);
    for (const doc of typeDocs) {
      sections.push(`[${doc.name}]\n${doc.content}`);
    }
  }

  const text = docs.length > 0 ? sections.join("\n") : "";

  // Cache it
  cachedBrandText = text;
  cachedDocs = docs;
  cacheTimestamp = now;

  return { text, docs };
}

/**
 * Load and cache the internal article list for link references.
 * Used by brief/write routes — cached to avoid 300-row DB query + 45K tokens per call.
 * Returns the formatted link reference text ready for a system block.
 */
export async function getArticleLinkReference(): Promise<string> {
  const now = Date.now();
  if (cachedArticleList && now - articleCacheTimestamp < ARTICLE_CACHE_TTL) {
    return cachedArticleList;
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    cachedArticleList = "";
    articleCacheTimestamp = now;
    return "";
  }

  const { data, error } = await supabase
    .from("articles")
    .select("title, slug, primary_keyword, url")
    .not("url", "is", null)
    .order("title")
    .limit(300);

  if (error || !data || data.length === 0) {
    cachedArticleList = "";
    articleCacheTimestamp = now;
    return "";
  }

  const articles = (data as Array<{ title: string; slug: string; primary_keyword: string; url: string }>)
    .filter(a => a.url && a.url.includes("sequel.io"));

  if (articles.length === 0) {
    cachedArticleList = "";
    articleCacheTimestamp = now;
    return "";
  }

  const text =
    "\n=== INTERNAL LINK REFERENCE — SEQUEL BLOG POSTS ===\n" +
    "Use ONLY URLs from this list for internal links. NEVER invent a URL.\n" +
    `Total articles available: ${articles.length}\n\n` +
    articles.map((a, i) => `${i + 1}. "${a.title}" → ${a.url} (keyword: ${a.primary_keyword || "n/a"})`).join("\n");

  cachedArticleList = text;
  articleCacheTimestamp = now;
  return text;
}

/**
 * Clear the article list cache (e.g., after new articles are imported).
 */
export function clearArticleCache() {
  cachedArticleList = null;
  articleCacheTimestamp = 0;
}

/**
 * The system block type that Anthropic API expects for prompt caching.
 */
interface SystemBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

/**
 * Build the system blocks for any Claude call.
 *
 * @param options.includeWritingStandards — true for content pipeline (brief/write/edit)
 * @param options.includeArticleReference — true for brief/write (internal link reference, CACHED)
 * @param options.additionalContext — step-specific text (agent prompt, chat system, etc.)
 * @returns Array of system blocks ready for the Claude API `system` parameter
 */
export async function buildSystemBlocks(options: {
  includeWritingStandards?: boolean;
  includeArticleReference?: boolean;
  additionalContext?: string;
} = {}): Promise<{ blocks: SystemBlock[]; docs: BrandDoc[] }> {
  const { text: brandText, docs } = await loadAndCacheBrandDocs();

  const blocks: SystemBlock[] = [];

  // Block 1: Brand docs (CACHED — shared across ALL routes)
  if (brandText) {
    blocks.push({
      type: "text",
      text: brandText,
      cache_control: { type: "ephemeral" },
    });
  }

  // Block 2: Writing standards (CACHED — shared across content pipeline)
  if (options.includeWritingStandards) {
    blocks.push({
      type: "text",
      text: WRITING_STANDARDS,
      cache_control: { type: "ephemeral" },
    });
  }

  // Block 2b: Article link reference (CACHED — shared across brief/write)
  if (options.includeArticleReference) {
    const articleRef = await getArticleLinkReference();
    if (articleRef) {
      blocks.push({
        type: "text",
        text: articleRef,
        cache_control: { type: "ephemeral" },
      });
    }
  }

  // Block 3: Additional context (NOT cached — unique per call)
  if (options.additionalContext) {
    blocks.push({
      type: "text",
      text: options.additionalContext,
    });
  }

  // If no blocks at all, add a minimal one
  if (blocks.length === 0) {
    blocks.push({ type: "text", text: "You are a helpful assistant." });
  }

  return { blocks, docs };
}

/**
 * Log cache performance from a Claude API response.
 * Call this after any Claude API call to track cache efficiency.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function logCachePerformance(
  route: string,
  usage: any
) {
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const totalInput = usage.input_tokens || 0;

  const block1Status = cacheRead > 0 ? "HIT" : cacheCreation > 0 ? "CREATED" : "MISS";
  const savedTokens = cacheRead;
  const savingsPct = totalInput > 0 ? ((cacheRead / (totalInput + cacheRead)) * 100).toFixed(0) : "0";

  console.log(
    `[Cache] ${route}: Block 1 [${block1Status}] — ` +
    `${cacheRead.toLocaleString()} cached / ${cacheCreation.toLocaleString()} created / ${totalInput.toLocaleString()} input ` +
    `(${savingsPct}% savings, ~${savedTokens.toLocaleString()} tokens saved)`
  );
}

/**
 * Convenience: get just the brand text string (for simple cases).
 */
export async function getBrandContextText(): Promise<string> {
  const { text } = await loadAndCacheBrandDocs();
  return text;
}

/**
 * Force-clear the in-memory cache (e.g., after brand docs are updated).
 */
export function clearBrandCache() {
  cachedBrandText = null;
  cachedDocs = [];
  cacheTimestamp = 0;
  clearArticleCache();
}
