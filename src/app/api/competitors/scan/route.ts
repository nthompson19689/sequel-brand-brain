import { getClaudeClient, resolveModel, MAX_TOKENS } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";
import { NextRequest } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — scans are heavy

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Competitor {
  id: string;
  name: string;
  domain: string;
  website_url: string;
  pricing_url?: string | null;
  careers_url?: string | null;
  g2_url?: string | null;
  changelog_url?: string | null;
  events_url?: string | null;
}

interface ScanFinding {
  type: string;
  title: string;
  detail: string;
  significance: "high" | "medium" | "low";
  url?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 5,
};

const SONNET = resolveModel("claude-sonnet-4-6");

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function md5(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

/** Fetch with a timeout */
async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "SequelBrandBrain/1.0" } });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract text blocks from Claude response */
function extractText(response: { content: Array<{ type: string; text?: string }> }): string {
  let out = "";
  for (const block of response.content) {
    if (block.type === "text" && block.text) out += block.text;
  }
  return out;
}

/** Categorize a URL by its path pattern */
function categorizeUrl(url: string): string {
  const path = url.toLowerCase();
  if (/\/(blog|post|article|resources)/.test(path)) return "blog_post";
  if (/\/(case-stud|customer|stor)/.test(path)) return "case_study";
  if (/\/(product|feature|platform)/.test(path)) return "product_page";
  if (/\/pricing/.test(path)) return "pricing_change";
  if (/\/(event|webinar)/.test(path)) return "event";
  return "other";
}

// ---------------------------------------------------------------------------
// Scan Methods
// ---------------------------------------------------------------------------

async function scanSitemap(
  competitor: Competitor,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "sitemap", status: "running" });
  const findings: ScanFinding[] = [];

  const sitemapPaths = ["/sitemap.xml", "/sitemap_index.xml", "/post-sitemap.xml"];
  let sitemapText = "";

  for (const path of sitemapPaths) {
    try {
      const url = competitor.website_url.replace(/\/$/, "") + path;
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        sitemapText = await res.text();
        break;
      }
    } catch {
      // Try next path
    }
  }

  if (!sitemapText) {
    findings.push({ type: "sitemap", title: "Sitemap not found", detail: "Could not fetch sitemap from any standard path", significance: "low" });
    send({ type: "scan_result", competitor: competitor.name, method: "sitemap", findings });
    return findings;
  }

  // Parse URLs and lastmod from XML using regex
  const urlEntries: Array<{ url: string; lastmod: string | null }> = [];
  // Extract all <url> blocks
  const urlBlockRegex = /<url>([\s\S]*?)<\/url>/g;
  let blockMatch;
  while ((blockMatch = urlBlockRegex.exec(sitemapText)) !== null) {
    const block = blockMatch[1];
    const locMatch = /<loc>\s*(.*?)\s*<\/loc>/.exec(block);
    const lastmodMatch = /<lastmod>\s*(.*?)\s*<\/lastmod>/.exec(block);
    if (locMatch) {
      urlEntries.push({ url: locMatch[1], lastmod: lastmodMatch ? lastmodMatch[1] : null });
    }
  }

  // If no <url> blocks, try parsing <sitemap> blocks (sitemap index)
  if (urlEntries.length === 0) {
    const sitemapBlockRegex = /<sitemap>([\s\S]*?)<\/sitemap>/g;
    let sitemapMatch;
    while ((sitemapMatch = sitemapBlockRegex.exec(sitemapText)) !== null) {
      const block = sitemapMatch[1];
      const locMatch = /<loc>\s*(.*?)\s*<\/loc>/.exec(block);
      const lastmodMatch = /<lastmod>\s*(.*?)\s*<\/lastmod>/.exec(block);
      if (locMatch) {
        urlEntries.push({ url: locMatch[1], lastmod: lastmodMatch ? lastmodMatch[1] : null });
      }
    }
  }

  if (urlEntries.length === 0) {
    findings.push({ type: "sitemap", title: "Empty sitemap", detail: "Sitemap was fetched but contained no parseable URLs", significance: "low" });
    send({ type: "scan_result", competitor: competitor.name, method: "sitemap", findings });
    return findings;
  }

  // Get existing cache for this competitor
  const { data: cachedUrls } = await supabase
    .from("competitor_sitemap_cache")
    .select("url, lastmod")
    .eq("competitor_id", competitor.id);

  const cachedMap = new Map<string, string | null>();
  if (cachedUrls) {
    for (const row of cachedUrls) {
      cachedMap.set(row.url, row.lastmod);
    }
  }

  // Find new or updated URLs
  const newUrls: Array<{ url: string; lastmod: string | null; category: string }> = [];
  for (const entry of urlEntries) {
    const cached = cachedMap.get(entry.url);
    if (cached === undefined || (entry.lastmod && entry.lastmod !== cached)) {
      newUrls.push({ ...entry, category: categorizeUrl(entry.url) });
    }
  }

  // Upsert into cache
  if (urlEntries.length > 0) {
    const upsertRows = urlEntries.map((e) => ({
      competitor_id: competitor.id,
      url: e.url,
      lastmod: e.lastmod,
    }));
    // Batch upsert in chunks of 500
    for (let i = 0; i < upsertRows.length; i += 500) {
      const batch = upsertRows.slice(i, i + 500);
      await supabase
        .from("competitor_sitemap_cache")
        .upsert(batch, { onConflict: "competitor_id,url" });
    }
  }

  if (newUrls.length > 0) {
    // Group by category for the finding
    const byCategory: Record<string, number> = {};
    for (const u of newUrls) {
      byCategory[u.category] = (byCategory[u.category] || 0) + 1;
    }

    const breakdown = Object.entries(byCategory)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(", ");

    findings.push({
      type: "sitemap",
      title: `${newUrls.length} new/updated pages detected`,
      detail: `Breakdown: ${breakdown}. Sample URLs: ${newUrls.slice(0, 5).map((u) => u.url).join(", ")}`,
      significance: newUrls.some((u) => u.category === "pricing_change") ? "high" : newUrls.length > 10 ? "medium" : "low",
    });

    // Store individual new URLs as scan results
    await supabase.from("competitor_scan_results").insert(
      newUrls.slice(0, 50).map((u) => ({
        competitor_id: competitor.id,
        scan_type: "sitemap",
        significance: u.category === "pricing_change" ? "high" : "medium",
        title: `New ${u.category}: ${u.url}`,
        detail: `Last modified: ${u.lastmod || "unknown"}`,
        url: u.url,
        raw_data: { category: u.category, lastmod: u.lastmod },
      }))
    );
  } else {
    findings.push({ type: "sitemap", title: "No new pages", detail: `Checked ${urlEntries.length} URLs, no changes detected`, significance: "low" });
  }

  send({ type: "scan_result", competitor: competitor.name, method: "sitemap", findings });
  return findings;
}

async function scanPricing(
  competitor: Competitor,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  claude: ReturnType<typeof getClaudeClient>,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "pricing", status: "running" });
  const findings: ScanFinding[] = [];

  if (!competitor.pricing_url) {
    findings.push({ type: "pricing", title: "No pricing URL configured", detail: "Skipped pricing scan", significance: "low" });
    send({ type: "scan_result", competitor: competitor.name, method: "pricing", findings });
    return findings;
  }

  let pageText = "";
  try {
    const res = await fetchWithTimeout(competitor.pricing_url);
    if (res.ok) {
      const html = await res.text();
      // Strip HTML tags to get text content
      pageText = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 10000); // Limit for hashing and Claude input
    }
  } catch {
    findings.push({ type: "pricing", title: "Could not fetch pricing page", detail: `Failed to load ${competitor.pricing_url}`, significance: "low" });
    send({ type: "scan_result", competitor: competitor.name, method: "pricing", findings });
    return findings;
  }

  if (!pageText) {
    findings.push({ type: "pricing", title: "Empty pricing page", detail: "Page returned no text content", significance: "low" });
    send({ type: "scan_result", competitor: competitor.name, method: "pricing", findings });
    return findings;
  }

  const contentHash = md5(pageText);

  // Get latest snapshot
  const { data: latestSnapshot } = await supabase
    .from("competitor_pricing_snapshots")
    .select("content_hash")
    .eq("competitor_id", competitor.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const changesDetected = !latestSnapshot || latestSnapshot.content_hash !== contentHash;

  // Store new snapshot
  await supabase.from("competitor_pricing_snapshots").insert({
    competitor_id: competitor.id,
    content_hash: contentHash,
    page_text: pageText,
    changes_detected: changesDetected,
  });

  if (changesDetected && latestSnapshot) {
    // Get the old page text for comparison
    const { data: oldSnapshot } = await supabase
      .from("competitor_pricing_snapshots")
      .select("page_text")
      .eq("competitor_id", competitor.id)
      .eq("content_hash", latestSnapshot.content_hash)
      .limit(1)
      .single();

    let summary = "Pricing page content has changed (first scan or no previous snapshot for comparison).";

    if (oldSnapshot?.page_text) {
      await delay(2000);
      const response = await claude.messages.create({
        model: SONNET,
        max_tokens: MAX_TOKENS,
        messages: [
          {
            role: "user",
            content: `Compare these two versions of ${competitor.name}'s pricing page and summarize the key changes.

PREVIOUS VERSION:
${oldSnapshot.page_text.slice(0, 4000)}

CURRENT VERSION:
${pageText.slice(0, 4000)}

Summarize the pricing changes concisely. Focus on: plan names, price changes, feature additions/removals, new tiers.`,
          },
        ],
      });
      summary = extractText(response);
    }

    findings.push({
      type: "pricing",
      title: "Pricing page changed",
      detail: summary,
      significance: "high",
      url: competitor.pricing_url,
    });

    await supabase.from("competitor_scan_results").insert({
      competitor_id: competitor.id,
      scan_type: "pricing",
      significance: "high",
      title: "Pricing page changed",
      detail: summary,
      url: competitor.pricing_url,
      raw_data: { content_hash: contentHash, changes_detected: true },
    });
  } else {
    findings.push({
      type: "pricing",
      title: changesDetected ? "First pricing snapshot captured" : "No pricing changes",
      detail: changesDetected ? "Baseline snapshot stored for future comparison" : "Pricing page content identical to last scan",
      significance: "low",
    });
  }

  send({ type: "scan_result", competitor: competitor.name, method: "pricing", findings });
  return findings;
}

async function scanHiring(
  competitor: Competitor,
  claude: ReturnType<typeof getClaudeClient>,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "hiring", status: "running" });
  const findings: ScanFinding[] = [];

  await delay(2000);
  const response = await claude.messages.create({
    model: SONNET,
    max_tokens: MAX_TOKENS,
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Research the current hiring activity for "${competitor.name}" (${competitor.domain}).

Search for:
1. "${competitor.name} careers" to find their careers page
2. "${competitor.name} jobs site:linkedin.com" for LinkedIn postings

Analyze and return a JSON object (no markdown, just raw JSON) with:
{
  "estimated_open_roles": <number>,
  "role_breakdown": {
    "sales_sdrs_aes": <number>,
    "engineering": <number>,
    "marketing": <number>,
    "customer_success": <number>,
    "product": <number>,
    "other": <number>
  },
  "notable_roles": ["<role title with seniority and location>"],
  "locations": ["<locations found>"],
  "hiring_signal": "aggressive" | "moderate" | "minimal",
  "summary": "<2-3 sentence summary of hiring trends and what they signal>"
}`,
      },
    ],
  });

  const text = extractText(response);

  // Try to parse JSON from the response
  let hiringData: Record<string, unknown> = {};
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      hiringData = JSON.parse(jsonMatch[0]);
    }
  } catch {
    hiringData = { summary: text, parse_error: true };
  }

  const significance = (hiringData.hiring_signal === "aggressive" ? "high" : hiringData.hiring_signal === "moderate" ? "medium" : "low") as "high" | "medium" | "low";
  const summary = (hiringData.summary as string) || text.slice(0, 500);

  findings.push({
    type: "hiring",
    title: `Hiring: ${hiringData.hiring_signal || "unknown"} (est. ${hiringData.estimated_open_roles || "?"} roles)`,
    detail: summary,
    significance,
  });

  await supabase.from("competitor_scan_results").insert({
    competitor_id: competitor.id,
    scan_type: "hiring",
    significance,
    title: findings[0].title,
    detail: summary,
    raw_data: hiringData,
  });

  send({ type: "scan_result", competitor: competitor.name, method: "hiring", findings });
  return findings;
}

async function scanG2Reviews(
  competitor: Competitor,
  claude: ReturnType<typeof getClaudeClient>,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "g2_reviews", status: "running" });
  const findings: ScanFinding[] = [];

  await delay(2000);
  const response = await claude.messages.create({
    model: SONNET,
    max_tokens: MAX_TOKENS,
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Research the G2 reviews profile for "${competitor.name}" (${competitor.domain}).

${competitor.g2_url ? `Their G2 page: ${competitor.g2_url}` : `Search for "${competitor.name} G2 reviews"`}

Return a JSON object (no markdown, just raw JSON):
{
  "g2_rating": <number like 4.5>,
  "total_reviews": <number>,
  "recent_review_themes": ["<theme>"],
  "positive_themes": ["<what users love>"],
  "negative_themes": ["<common complaints>"],
  "notable_changes": "<any recent rating changes or review spikes>",
  "summary": "<2-3 sentence summary>"
}`,
      },
    ],
  });

  const text = extractText(response);
  let reviewData: Record<string, unknown> = {};
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      reviewData = JSON.parse(jsonMatch[0]);
    }
  } catch {
    reviewData = { summary: text, parse_error: true };
  }

  // Get previous tracking entry
  const { data: prevTracking } = await supabase
    .from("competitor_review_tracking")
    .select("*")
    .eq("competitor_id", competitor.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Detect changes
  let significance: "high" | "medium" | "low" = "low";
  const rating = reviewData.g2_rating as number | undefined;
  const reviewCount = reviewData.total_reviews as number | undefined;

  if (prevTracking) {
    const ratingDrop = rating && prevTracking.rating && rating < prevTracking.rating - 0.2;
    const reviewSpike = reviewCount && prevTracking.review_count && reviewCount > prevTracking.review_count * 1.2;
    if (ratingDrop) significance = "high";
    else if (reviewSpike) significance = "medium";
  }

  // Store tracking entry
  await supabase.from("competitor_review_tracking").insert({
    competitor_id: competitor.id,
    platform: "g2",
    rating: rating || null,
    review_count: reviewCount || null,
    themes: reviewData.recent_review_themes || [],
    positive_themes: reviewData.positive_themes || [],
    negative_themes: reviewData.negative_themes || [],
    raw_data: reviewData,
  });

  const summary = (reviewData.summary as string) || text.slice(0, 500);

  findings.push({
    type: "g2_reviews",
    title: `G2: ${rating || "?"}/5 (${reviewCount || "?"} reviews)`,
    detail: summary,
    significance,
    url: competitor.g2_url || undefined,
  });

  await supabase.from("competitor_scan_results").insert({
    competitor_id: competitor.id,
    scan_type: "g2_reviews",
    significance,
    title: findings[0].title,
    detail: summary,
    url: competitor.g2_url || null,
    raw_data: reviewData,
  });

  send({ type: "scan_result", competitor: competitor.name, method: "g2_reviews", findings });
  return findings;
}

async function scanNews(
  competitor: Competitor,
  claude: ReturnType<typeof getClaudeClient>,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "news", status: "running" });
  const findings: ScanFinding[] = [];

  await delay(2000);
  const response = await claude.messages.create({
    model: SONNET,
    max_tokens: MAX_TOKENS,
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Search for recent news about "${competitor.name}" (${competitor.domain}) from the last 7 days.

Search: "${competitor.name} announcement OR launch OR partnership OR funding"

Return a JSON array (no markdown, just raw JSON array):
[
  {
    "headline": "<headline>",
    "source": "<publication>",
    "url": "<url>",
    "date": "<date>",
    "category": "funding" | "partnership" | "product_launch" | "acquisition" | "executive_hire" | "pr",
    "significance": "high" | "medium" | "low",
    "summary": "<1-2 sentence summary>"
  }
]

Categorize significance:
- funding, acquisition = HIGH
- partnership, product_launch, executive_hire = MEDIUM
- generic PR = LOW

Return an empty array [] if no recent news found.`,
      },
    ],
  });

  const text = extractText(response);
  let newsItems: Array<Record<string, unknown>> = [];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      newsItems = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Could not parse — store raw
  }

  if (newsItems.length > 0) {
    for (const item of newsItems) {
      const sig = (item.significance as string) || "low";
      findings.push({
        type: "news",
        title: (item.headline as string) || "News item",
        detail: (item.summary as string) || "",
        significance: sig as "high" | "medium" | "low",
        url: item.url as string | undefined,
      });
    }

    await supabase.from("competitor_scan_results").insert(
      newsItems.map((item) => ({
        competitor_id: competitor.id,
        scan_type: "news",
        significance: (item.significance as string) || "low",
        title: (item.headline as string) || "News item",
        detail: (item.summary as string) || "",
        url: (item.url as string) || null,
        raw_data: item,
      }))
    );
  } else {
    findings.push({ type: "news", title: "No recent news", detail: "No significant news or announcements found in the last 7 days", significance: "low" });
  }

  send({ type: "scan_result", competitor: competitor.name, method: "news", findings });
  return findings;
}

async function scanProductUpdates(
  competitor: Competitor,
  claude: ReturnType<typeof getClaudeClient>,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "product_updates", status: "running" });
  const findings: ScanFinding[] = [];

  await delay(2000);
  const response = await claude.messages.create({
    model: SONNET,
    max_tokens: MAX_TOKENS,
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Search for recent product updates, changelog entries, and release notes from "${competitor.name}" (${competitor.domain}).

${competitor.changelog_url ? `Their changelog: ${competitor.changelog_url}` : `Search: "${competitor.name} changelog OR release notes OR product updates"`}

Return a JSON array (no markdown, just raw JSON array):
[
  {
    "update_title": "<title>",
    "date": "<date if found>",
    "description": "<what changed>",
    "threat_level": "high" | "medium" | "low",
    "threat_reason": "<why this threat level — high=direct competition with our features, medium=adjacent to our space, low=irrelevant to us>",
    "category": "feature" | "integration" | "performance" | "ui" | "api" | "other"
  }
]

Return an empty array [] if nothing recent found.`,
      },
    ],
  });

  const text = extractText(response);
  let updates: Array<Record<string, unknown>> = [];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      updates = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Could not parse
  }

  if (updates.length > 0) {
    for (const item of updates) {
      findings.push({
        type: "product_updates",
        title: (item.update_title as string) || "Product update",
        detail: `${item.description || ""} — Threat: ${item.threat_level} (${item.threat_reason || ""})`,
        significance: (item.threat_level as "high" | "medium" | "low") || "low",
      });
    }

    await supabase.from("competitor_scan_results").insert(
      updates.map((item) => ({
        competitor_id: competitor.id,
        scan_type: "product_updates",
        significance: (item.threat_level as string) || "low",
        title: (item.update_title as string) || "Product update",
        detail: `${item.description || ""} — Threat: ${item.threat_level} (${item.threat_reason || ""})`,
        raw_data: item,
      }))
    );
  } else {
    findings.push({ type: "product_updates", title: "No recent product updates", detail: "No changelog or release notes found", significance: "low" });
  }

  send({ type: "scan_result", competitor: competitor.name, method: "product_updates", findings });
  return findings;
}

async function scanEvents(
  competitor: Competitor,
  claude: ReturnType<typeof getClaudeClient>,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  send: (data: Record<string, unknown>) => void
): Promise<ScanFinding[]> {
  send({ type: "scan_progress", competitor: competitor.name, method: "events", status: "running" });
  const findings: ScanFinding[] = [];

  await delay(2000);
  const response = await claude.messages.create({
    model: SONNET,
    max_tokens: MAX_TOKENS,
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Search for upcoming events, webinars, and conferences involving "${competitor.name}" (${competitor.domain}).

${competitor.events_url ? `Their events page: ${competitor.events_url}` : `Search: "${competitor.name} webinar OR event OR conference 2025 2026"`}

Return a JSON array (no markdown, just raw JSON array):
[
  {
    "event_name": "<name>",
    "date": "<date>",
    "type": "webinar" | "conference" | "workshop" | "meetup" | "virtual_event",
    "topic": "<topic/theme>",
    "url": "<url if found>",
    "significance": "high" | "medium" | "low",
    "notes": "<why this matters — competing topics, shared audience, etc.>"
  }
]

Return an empty array [] if nothing found.`,
      },
    ],
  });

  const text = extractText(response);
  let events: Array<Record<string, unknown>> = [];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      events = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Could not parse
  }

  if (events.length > 0) {
    for (const item of events) {
      findings.push({
        type: "events",
        title: (item.event_name as string) || "Event",
        detail: `${item.date || "TBD"} — ${item.topic || ""} (${item.type || ""})`,
        significance: (item.significance as "high" | "medium" | "low") || "low",
        url: item.url as string | undefined,
      });
    }

    await supabase.from("competitor_scan_results").insert(
      events.map((item) => ({
        competitor_id: competitor.id,
        scan_type: "events",
        significance: (item.significance as string) || "low",
        title: (item.event_name as string) || "Event",
        detail: `${item.date || "TBD"} — ${item.topic || ""} (${item.type || ""})`,
        url: (item.url as string) || null,
        raw_data: item,
      }))
    );
  } else {
    findings.push({ type: "events", title: "No upcoming events found", detail: "No webinars, conferences, or events detected", significance: "low" });
  }

  send({ type: "scan_result", competitor: competitor.name, method: "events", findings });
  return findings;
}

// ---------------------------------------------------------------------------
// Main scan orchestrator
// ---------------------------------------------------------------------------

async function runCompetitorScan(
  competitor: Competitor,
  supabase: ReturnType<typeof getSupabaseServerClient> & object,
  claude: ReturnType<typeof getClaudeClient>,
  send: (data: Record<string, unknown>) => void
): Promise<void> {
  send({ type: "competitor_start", competitor: competitor.name });

  const scanMethods = [
    () => scanSitemap(competitor, supabase, send),
    () => scanPricing(competitor, supabase, claude, send),
    () => scanHiring(competitor, claude, supabase, send),
    () => scanG2Reviews(competitor, claude, supabase, send),
    () => scanNews(competitor, claude, supabase, send),
    () => scanProductUpdates(competitor, claude, supabase, send),
    () => scanEvents(competitor, claude, supabase, send),
  ];

  for (const method of scanMethods) {
    try {
      await method();
    } catch (err) {
      const methodName = method.name || "unknown";
      const message = err instanceof Error ? err.message : "Scan method failed";
      send({
        type: "scan_error",
        competitor: competitor.name,
        method: methodName,
        error: message,
      });
    }
  }

  // Update last_scanned_at
  await supabase
    .from("competitor_watch")
    .update({ last_scanned_at: new Date().toISOString() })
    .eq("id", competitor.id);

  send({ type: "competitor_complete", competitor: competitor.name });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  let body: { competitor_id?: string; scan_all?: boolean };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { competitor_id, scan_all } = body;

  if (!competitor_id && !scan_all) {
    return Response.json({ error: "Provide competitor_id or scan_all: true" }, { status: 400 });
  }

  // Fetch competitors to scan
  let competitors: Competitor[] = [];
  if (scan_all) {
    const { data, error } = await supabase
      .from("competitor_watch")
      .select("*")
      .order("name");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    competitors = data || [];
  } else {
    const { data, error } = await supabase
      .from("competitor_watch")
      .select("*")
      .eq("id", competitor_id)
      .single();
    if (error || !data) return Response.json({ error: "Competitor not found" }, { status: 404 });
    competitors = [data];
  }

  if (competitors.length === 0) {
    return Response.json({ error: "No competitors to scan" }, { status: 404 });
  }

  const claude = getClaudeClient();
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send({ type: "scan_start", competitors: competitors.map((c) => c.name), total: competitors.length });

        for (const competitor of competitors) {
          await runCompetitorScan(competitor, supabase, claude, send);
        }

        send({ type: "scan_complete", message: `Scanned ${competitors.length} competitor(s)` });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scan failed";
        send({ type: "error", error: message });
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
