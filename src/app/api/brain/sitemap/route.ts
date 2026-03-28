import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/brain/sitemap — Fetch and parse a sitemap URL, return list of page URLs */
export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string };

    if (!url) {
      return Response.json({ error: "URL is required" }, { status: 400 });
    }

    // Fetch the sitemap XML
    const res = await fetch(url, {
      headers: { "User-Agent": "SequelBrandBrain/1.0" },
    });

    if (!res.ok) {
      return Response.json(
        { error: `Failed to fetch sitemap: HTTP ${res.status}` },
        { status: 400 }
      );
    }

    const xml = await res.text();

    // Check if this is a sitemap index (contains other sitemaps)
    const sitemapIndexUrls = Array.from(xml.matchAll(/<sitemap>\s*<loc>(.*?)<\/loc>/gi)).map((m) => m[1].trim());

    let allUrls: string[] = [];

    if (sitemapIndexUrls.length > 0) {
      // It's a sitemap index — fetch each child sitemap
      const childFetches = await Promise.allSettled(
        sitemapIndexUrls.slice(0, 10).map(async (sitemapUrl) => {
          const childRes = await fetch(sitemapUrl, {
            headers: { "User-Agent": "SequelBrandBrain/1.0" },
          });
          if (!childRes.ok) return [];
          const childXml = await childRes.text();
          return Array.from(childXml.matchAll(/<url>\s*<loc>(.*?)<\/loc>/gi)).map(
            (m) => m[1].trim()
          );
        })
      );

      for (const result of childFetches) {
        if (result.status === "fulfilled") {
          allUrls.push(...result.value);
        }
      }
    } else {
      // Regular sitemap
      allUrls = Array.from(xml.matchAll(/<url>\s*<loc>(.*?)<\/loc>/gi)).map((m) =>
        m[1].trim()
      );
    }

    // Deduplicate
    allUrls = Array.from(new Set(allUrls));

    // Categorize URLs by pattern
    const categorized = allUrls.map((pageUrl) => {
      const path = new URL(pageUrl).pathname.toLowerCase();
      let category = "other";

      if (
        path.includes("/blog") ||
        path.includes("/article") ||
        path.includes("/post") ||
        path.includes("/news")
      ) {
        category = "blog";
      } else if (
        path.includes("/case-stud") ||
        path.includes("/customer-stor") ||
        path.includes("/success")
      ) {
        category = "case_study";
      } else if (
        path.includes("/product") ||
        path.includes("/feature") ||
        path.includes("/solution") ||
        path.includes("/platform")
      ) {
        category = "product";
      } else if (
        path.includes("/doc") ||
        path.includes("/guide") ||
        path.includes("/help") ||
        path.includes("/resource")
      ) {
        category = "resource";
      } else if (
        path.includes("/about") ||
        path.includes("/team") ||
        path.includes("/career") ||
        path.includes("/company")
      ) {
        category = "company";
      }

      return { url: pageUrl, category };
    });

    return Response.json({
      total: categorized.length,
      urls: categorized,
      is_index: sitemapIndexUrls.length > 0,
      child_sitemaps: sitemapIndexUrls.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Sitemap scan failed";
    return Response.json({ error: msg }, { status: 500 });
  }
}
