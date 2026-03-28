import { getSupabaseServerClient } from "./supabase";

export interface BrandDoc {
  id: string;
  name: string;
  doc_type: string;
  content: string;
}

export interface ArticleResult {
  id: string;
  title: string;
  url: string | null;
  full_text: string;
  primary_keyword: string | null;
  content_type?: string;
  similarity: number;
}

/**
 * Load all active brand docs. These are always included in every Claude call
 * as the governance layer (brand voice, MVV, guidelines).
 */
export async function loadBrandDocs(): Promise<BrandDoc[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("brand_docs")
    .select("id, name, doc_type, content")
    .eq("is_active", true)
    .order("doc_type");

  if (error) {
    console.error("Failed to load brand docs:", error.message);
    return [];
  }

  return data || [];
}

/**
 * Search articles by vector similarity using the search_articles RPC function.
 * Requires a pre-computed embedding vector.
 * Optional contentType filter: 'blog', 'case_study', 'product_page', 'other'
 */
export async function searchArticles(
  queryEmbedding: number[],
  matchCount: number = 5,
  matchThreshold: number = 0.7,
  contentType?: string
): Promise<ArticleResult[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  // Try the type-filtered function first, fall back to original
  if (contentType) {
    const { data, error } = await supabase.rpc("search_articles_by_type", {
      query_embedding: queryEmbedding,
      match_count: matchCount,
      match_threshold: matchThreshold,
      filter_content_type: contentType,
    });

    if (!error) return data || [];
    // If function doesn't exist yet, fall back
    console.warn("search_articles_by_type not available, using unfiltered search");
  }

  const { data, error } = await supabase.rpc("search_articles", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });

  if (error) {
    console.error("Article search failed:", error.message);
    return [];
  }

  return data || [];
}

/**
 * Text-based article search using Supabase ilike/textSearch.
 * Used when vector embeddings aren't available.
 * Extracts key terms from the query and finds matching articles.
 */
export async function searchArticlesByText(
  query: string,
  matchCount: number = 8,
  contentType?: string
): Promise<ArticleResult[]> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return [];

  // Extract meaningful keywords (remove stop words)
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "i", "me", "my", "we", "our", "you", "your", "he", "she", "it",
    "they", "them", "what", "which", "who", "whom", "this", "that",
    "these", "those", "am", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "having", "do", "does", "did",
    "doing", "a", "an", "the", "and", "but", "if", "or", "because",
    "as", "until", "while", "of", "at", "by", "for", "with", "about",
    "against", "between", "through", "during", "before", "after",
    "above", "below", "to", "from", "up", "down", "in", "out", "on",
    "off", "over", "under", "again", "further", "then", "once",
    "find", "best", "good", "get", "make", "know", "take", "see",
    "come", "think", "look", "want", "give", "use", "tell", "ask",
    "work", "seem", "feel", "try", "leave", "call", "show", "let",
    "keep", "help", "begin", "go", "say", "each", "us", "how",
  ]);

  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) return [];

  // Strategy 1: Try Postgres full-text search using OR across keywords
  // Search title and full_text columns
  const results: ArticleResult[] = [];
  const seenIds = new Set<string>();

  // Search by title matching (most relevant)
  for (const kw of keywords.slice(0, 5)) {
    let q = supabase
      .from("articles")
      .select("id, title, url, full_text, primary_keyword, content_type")
      .ilike("title", `%${kw}%`)
      .limit(matchCount);

    if (contentType) {
      q = q.eq("content_type", contentType);
    }

    const { data } = await q;
    for (const row of (data || []) as Record<string, string>[]) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        results.push({
          id: row.id,
          title: row.title || "",
          url: row.url || null,
          full_text: row.full_text || "",
          primary_keyword: row.primary_keyword || null,
          content_type: row.content_type,
          similarity: 0.8, // title match = high relevance
        });
      }
    }
  }

  // If we don't have enough, also search full_text
  if (results.length < matchCount) {
    for (const kw of keywords.slice(0, 3)) {
      let q = supabase
        .from("articles")
        .select("id, title, url, full_text, primary_keyword, content_type")
        .ilike("full_text", `%${kw}%`)
        .limit(matchCount - results.length);

      if (contentType) {
        q = q.eq("content_type", contentType);
      }

      const { data } = await q;
      for (const row of (data || []) as Record<string, string>[]) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          results.push({
            id: row.id,
            title: row.title || "",
            url: row.url || null,
            full_text: row.full_text || "",
            primary_keyword: row.primary_keyword || null,
            content_type: row.content_type,
            similarity: 0.6, // body match = lower relevance
          });
        }
      }
      if (results.length >= matchCount) break;
    }
  }

  // Score results: more keyword matches = higher relevance
  for (const r of results) {
    const titleLower = (r.title || "").toLowerCase();
    const textLower = (r.full_text || "").toLowerCase().slice(0, 5000);
    let score = 0;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 0.15;
      if (textLower.includes(kw)) score += 0.05;
    }
    r.similarity = Math.min(0.99, r.similarity + score);
  }

  // Sort by relevance and return top N
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, matchCount);
}

/**
 * Format brand docs into a system prompt block.
 * Mirrors the brand brain loading pattern from the reference agents.
 */
export function formatBrandDocsForPrompt(docs: BrandDoc[]): string {
  if (docs.length === 0) return "";

  const sections: string[] = ["=== BRAND BRAIN (Governance Layer) ==="];

  const grouped: Record<string, BrandDoc[]> = {};
  for (const doc of docs) {
    if (!grouped[doc.doc_type]) grouped[doc.doc_type] = [];
    grouped[doc.doc_type].push(doc);
  }

  for (const [docType, typeDocs] of Object.entries(grouped)) {
    const label = docType.replace(/_/g, " ").toUpperCase();
    sections.push(`\n--- ${label} ---`);
    for (const doc of typeDocs) {
      sections.push(`[${doc.name}]\n${doc.content}`);
    }
  }

  return sections.join("\n");
}

/**
 * Format retrieved articles as context for Claude.
 */
export function formatArticlesForPrompt(articles: ArticleResult[]): string {
  if (articles.length === 0) return "";

  const sections: string[] = ["\n=== RETRIEVED CONTENT (for reference) ==="];

  for (const article of articles) {
    const truncated =
      article.full_text.length > 2000
        ? article.full_text.slice(0, 2000) + "..."
        : article.full_text;

    sections.push(
      `\n[Article: ${article.title}]` +
        (article.url ? `\nURL: ${article.url}` : "") +
        (article.primary_keyword ? `\nKeyword: ${article.primary_keyword}` : "") +
        `\nRelevance: ${(article.similarity * 100).toFixed(0)}%` +
        `\n${truncated}`
    );
  }

  return sections.join("\n");
}
