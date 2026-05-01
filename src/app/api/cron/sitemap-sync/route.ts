import { getSupabaseServerClient } from "@/lib/supabase";
import { embedAndStore } from "@/lib/embeddings";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SITEMAPS = [
  { url: "https://sequel.io/post-sitemap.xml", defaultCategory: "blog" },
  { url: "https://sequel.io/page-sitemap.xml", defaultCategory: "other" },
  { url: "https://sequel.io/story-sitemap.xml", defaultCategory: "case_study" },
];

/**
 * GET /api/cron/sitemap-sync
 *
 * Called by Vercel Cron every 3 days.
 * Fetches all 3 sitemaps, finds URLs not yet in the articles table,
 * fetches and imports only the new ones.
 */
export async function GET(request: NextRequest) {
  // Verify caller: accept either cron secret OR authenticated user session
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = !cronSecret || authHeader === `Bearer ${cronSecret}`;

  if (!hasCronAuth) {
    // Fall back to user session auth (for manual "Sync Now" from UI)
    const { createSupabaseServerAuthClient } = await import("@/lib/supabase-auth-server");
    const authClient = createSupabaseServerAuthClient();
    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 500 });
  }

  console.log("[Sitemap Sync] Starting scan of", SITEMAPS.length, "sitemaps");

  // 1. Fetch all URLs from all sitemaps
  const allUrlEntries: Array<{ url: string; category: string }> = [];

  for (const sitemap of SITEMAPS) {
    try {
      const res = await fetch(sitemap.url, {
        headers: { "User-Agent": "SequelBrandBrain/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.warn(`[Sitemap Sync] Failed to fetch ${sitemap.url}: HTTP ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const urls = Array.from(xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>/gi)).map((m) => m[1].trim());

      for (const url of urls) {
        // Categorize based on URL path
        const path = new URL(url).pathname.toLowerCase();
        let category = sitemap.defaultCategory;
        if (path.includes("/blog") || path.includes("/article") || path.includes("/post") || path.includes("/news")) {
          category = "blog";
        } else if (path.includes("/case-stud") || path.includes("/customer-stor") || path.includes("/success") || path.includes("/story")) {
          category = "case_study";
        } else if (path.includes("/product") || path.includes("/feature") || path.includes("/solution") || path.includes("/platform")) {
          category = "product_page";
        }
        allUrlEntries.push({ url, category });
      }

      console.log(`[Sitemap Sync] ${sitemap.url}: found ${urls.length} URLs`);
    } catch (err) {
      console.warn(`[Sitemap Sync] Error fetching ${sitemap.url}:`, err instanceof Error ? err.message : err);
    }
  }

  if (allUrlEntries.length === 0) {
    console.log("[Sitemap Sync] No URLs found in any sitemap");
    return Response.json({ success: true, total_found: 0, new_imported: 0, already_existed: 0 });
  }

  // 2. Check which URLs already exist in articles table
  const allUrls = allUrlEntries.map((e) => e.url);
  const { data: existing } = await supabase
    .from("articles")
    .select("url")
    .in("url", allUrls);

  const existingSet = new Set((existing || []).map((r: { url: string }) => r.url));
  const newEntries = allUrlEntries.filter((e) => !existingSet.has(e.url));

  console.log(`[Sitemap Sync] ${allUrlEntries.length} total, ${existingSet.size} exist, ${newEntries.length} new`);

  if (newEntries.length === 0) {
    return Response.json({
      success: true,
      total_found: allUrlEntries.length,
      already_existed: existingSet.size,
      new_imported: 0,
    });
  }

  // 3. Import new URLs
  let imported = 0;
  let failed = 0;

  for (const entry of newEntries) {
    try {
      const pageRes = await fetch(entry.url, {
        headers: { "User-Agent": "SequelBrandBrain/1.0" },
        signal: AbortSignal.timeout(15000),
      });

      if (!pageRes.ok) {
        console.warn(`[Sitemap Sync] Failed to fetch ${entry.url}: HTTP ${pageRes.status}`);
        failed++;
        continue;
      }

      const html = await pageRes.text();

      // Extract title
      const ogTitleMatch = html.match(/<meta\s+(?:property|name)="og:title"\s+content="(.*?)"/i);
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = ogTitleMatch?.[1] || titleMatch?.[1] || new URL(entry.url).pathname;

      // Extract meta description
      const metaDescMatch = html.match(/<meta\s+name="description"\s+content="(.*?)"/i);
      const metaDesc = metaDescMatch?.[1] || null;

      // Strip HTML to get clean text
      const fullText = stripHtml(html);

      if (fullText.length < 100) {
        console.log(`[Sitemap Sync] Skipping ${entry.url}: too little content`);
        continue;
      }

      const slug = new URL(entry.url).pathname.replace(/^\/|\/$/g, "").replace(/\//g, "-");

      const insertedTitle = decodeEntities(title).slice(0, 500);
      const { data: inserted, error: insertErr } = await supabase
        .from("articles")
        .insert({
          title: insertedTitle,
          url: entry.url,
          slug,
          full_text: fullText,
          meta_description: metaDesc ? decodeEntities(metaDesc).slice(0, 500) : null,
          primary_keyword: entry.category === "blog" ? null : entry.category,
          word_count: fullText.split(/\s+/).length,
          status: "published",
          content_type: entry.category,
        })
        .select("id")
        .single();

      if (insertErr) {
        // Could be a unique constraint violation (race condition) — that's fine
        if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
          console.log(`[Sitemap Sync] ${entry.url}: already exists (race condition)`);
        } else {
          console.warn(`[Sitemap Sync] Insert failed for ${entry.url}:`, insertErr.message);
          failed++;
        }
      } else {
        imported++;
        if (inserted?.id) {
          void embedAndStore({
            supabase,
            table: "articles",
            id: inserted.id,
            text: `${insertedTitle}\n\n${fullText}`,
          });
        }
        console.log(`[Sitemap Sync] Imported: ${decodeEntities(title).slice(0, 60)}`);
      }
    } catch (err) {
      console.warn(`[Sitemap Sync] Error importing ${entry.url}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`[Sitemap Sync] Done. Imported: ${imported}, Failed: ${failed}`);

  return Response.json({
    success: true,
    total_found: allUrlEntries.length,
    already_existed: existingSet.size,
    new_imported: imported,
    failed,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  const mainMatch = text.match(/<(?:main|article)[^>]*>([\s\S]*?)<\/(?:main|article)>/i);
  if (mainMatch) text = mainMatch[1];

  text = text
    .replace(/<\/?(p|div|h[1-6]|li|br|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return decodeEntities(text);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C");
}
