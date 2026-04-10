import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ───────────────────────────────────────────────────────────────────

interface GscRow {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Ga4Row {
  pagePath: string;
  sessions: number;
  engagementRate: number;
}


interface PageMetrics {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
  sessions: number;
  engagement_rate: number;
  url_rating: number;
  referring_domains: number;
  backlinks: number;
  health_score: number;
  status: "working" | "needs_push" | "not_working";
  synced_at: string;
  [key: string]: unknown;
}

// ─── GSC ─────────────────────────────────────────────────────────────────────

async function fetchGscData(auth: InstanceType<typeof google.auth.JWT>): Promise<GscRow[]> {
  const siteUrl = process.env.GSC_SITE_URL;
  if (!siteUrl) throw new Error("GSC_SITE_URL is not set");

  const searchconsole = google.searchconsole({ version: "v1", auth });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: fmt(startDate),
      endDate: fmt(endDate),
      dimensions: ["page"],
      rowLimit: 1000,
    },
  });

  const rows = res.data.rows || [];
  console.log(`GSC: fetched ${rows.length} pages`);

  return rows.map((r) => ({
    url: r.keys?.[0] || "",
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  }));
}

// ─── GA4 ─────────────────────────────────────────────────────────────────────

async function fetchGa4Data(auth: InstanceType<typeof google.auth.JWT>): Promise<Ga4Row[]> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) throw new Error("GA4_PROPERTY_ID is not set");

  const analyticsdata = google.analyticsdata({ version: "v1beta", auth });

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (analyticsdata.properties as any).runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "engagementRate" }],
      limit: 1000,
    },
  });

  interface Ga4ApiRow {
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }
  const rows: Ga4ApiRow[] = res.data.rows || [];
  console.log(`GA4: fetched ${rows.length} pages`);

  return rows.map((r) => ({
    pagePath: r.dimensionValues?.[0]?.value || "",
    sessions: parseInt(r.metricValues?.[0]?.value || "0", 10),
    engagementRate: parseFloat(r.metricValues?.[1]?.value || "0"),
  }));
}

// ─── GA4: Conversions (book_demo events per page, organic only) ──────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchGa4Conversions(auth: any): Promise<Map<string, number>> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return new Map();

  try {
    const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (analyticsdata.properties as any).runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: {
          andGroup: {
            expressions: [
              { filter: { fieldName: "eventName", stringFilter: { value: "book_demo" } } },
              { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } } },
            ],
          },
        },
        limit: 1000,
      },
    });

    const map = new Map<string, number>();
    for (const row of res.data.rows || []) {
      const path = row.dimensionValues?.[0]?.value || "";
      const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
      if (path) map.set(path, count);
    }
    console.log(`GA4 conversions: ${map.size} pages with book_demo events`);
    return map;
  } catch (err) {
    console.warn("GA4 conversions fetch failed:", err);
    return new Map();
  }
}

// ─── GA4: New vs Returning visitors (organic only) ──────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchGa4VisitorTypes(auth: any): Promise<{ newSessions: number; returningSessions: number }> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return { newSessions: 0, returningSessions: 0 };

  try {
    const analyticsdata = google.analyticsdata({ version: "v1beta", auth });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (analyticsdata.properties as any).runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: fmt(startDate), endDate: fmt(endDate) }],
        dimensions: [{ name: "newVsReturning" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } },
        },
        limit: 10,
      },
    });

    let newSessions = 0;
    let returningSessions = 0;
    for (const row of res.data.rows || []) {
      const type = row.dimensionValues?.[0]?.value || "";
      const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
      if (type === "new") newSessions = count;
      else if (type === "returning") returningSessions = count;
    }
    console.log(`GA4 visitors: ${newSessions} new, ${returningSessions} returning`);
    return { newSessions, returningSessions };
  } catch (err) {
    console.warn("GA4 visitor types fetch failed:", err);
    return { newSessions: 0, returningSessions: 0 };
  }
}

// ─── Ahrefs ──────────────────────────────────────────────────────────────────

async function fetchAhrefsDomainRating(): Promise<{ domainRating: number; ahrefsRank: number }> {
  const apiKey = process.env.AHREFS_API_KEY;

  if (!apiKey) {
    console.log("Ahrefs: AHREFS_API_KEY not set, skipping");
    return { domainRating: 0, ahrefsRank: 0 };
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `https://api.ahrefs.com/v3/site-explorer/domain-rating?target=sequel.io&date=${today}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`Ahrefs domain-rating failed: HTTP ${res.status} — ${errBody}`);
      return { domainRating: 0, ahrefsRank: 0 };
    }

    const data = await res.json();
    const dr = data.domain_rating?.domain_rating ?? 0;
    const rank = data.domain_rating?.ahrefs_rank ?? 0;
    console.log(`Ahrefs: domain rating = ${dr}, rank = ${rank}`);
    return { domainRating: dr, ahrefsRank: rank };
  } catch (err) {
    console.warn("Ahrefs: domain-rating fetch failed:", err);
    return { domainRating: 0, ahrefsRank: 0 };
  }
}

// ─── Ahrefs: Domain Metrics (backlinks + referring domains) ─────────────────

async function fetchAhrefsDomainMetrics(): Promise<{
  totalBacklinks: number;
  referringDomains: number;
}> {
  const apiKey = process.env.AHREFS_API_KEY;
  if (!apiKey) return { totalBacklinks: 0, referringDomains: 0 };

  // Try multiple Ahrefs v3 endpoints — availability depends on subscription tier
  const today = new Date().toISOString().split("T")[0];
  const endpoints = [
    // Option 1: backlinks-stats (requires date param)
    {
      url: `https://api.ahrefs.com/v3/site-explorer/backlinks-stats?target=sequel.io&mode=domain&date=${today}`,
      extract: (data: Record<string, unknown>) => ({
        totalBacklinks: (data.live as number) ?? (data.all_time as number) ?? 0,
        referringDomains: (data.live_refdomains as number) ?? (data.all_time_refdomains as number) ?? 0,
      }),
    },
    // Option 2: metrics endpoint (requires date param)
    {
      url: `https://api.ahrefs.com/v3/site-explorer/metrics?target=sequel.io&mode=domain&date=${today}`,
      extract: (data: Record<string, unknown>) => {
        const m = (data.metrics || data) as Record<string, number>;
        return {
          totalBacklinks: m.live ?? m.backlinks ?? m.all ?? 0,
          referringDomains: m.live_refdomains ?? m.refdomains ?? 0,
        };
      },
    },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.warn(`Ahrefs ${ep.url.split("?")[0].split("/").pop()} failed: HTTP ${res.status} — ${errBody.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const result = ep.extract(data);
      console.log(`Ahrefs: ${result.totalBacklinks} backlinks, ${result.referringDomains} referring domains (from ${ep.url.split("?")[0].split("/").pop()})`);
      return result;
    } catch (err) {
      console.warn(`Ahrefs endpoint failed:`, err);
      continue;
    }
  }

  console.warn("Ahrefs: all domain metrics endpoints failed, returning zeros");
  return { totalBacklinks: 0, referringDomains: 0 };
}

// ─── Ahrefs: Per-page URL rating (top N pages only) ────────────────────────

async function fetchAhrefsUrlRatings(
  urls: string[],
  maxPages = 10
): Promise<Map<string, { urlRating: number; backlinks: number; refDomains: number }>> {
  const apiKey = process.env.AHREFS_API_KEY;
  const result = new Map<string, { urlRating: number; backlinks: number; refDomains: number }>();
  if (!apiKey || urls.length === 0) return result;

  const batch = urls.slice(0, maxPages);
  console.log(`Ahrefs: fetching URL ratings for ${batch.length} pages...`);

  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < batch.length; i += 3) {
    const chunk = batch.slice(i, i + 3);
    const today = new Date().toISOString().split("T")[0];
    const promises = chunk.map(async (url) => {
      try {
        // Use backlinks-stats with mode=url for per-page data
        const res = await fetch(
          `https://api.ahrefs.com/v3/site-explorer/backlinks-stats?target=${encodeURIComponent(url)}&mode=url&date=${today}`,
          {
            headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
          }
        );
        if (!res.ok) {
          if (i === 0) {
            const errBody = await res.text().catch(() => "");
            console.warn(`Ahrefs per-page backlinks-stats failed: HTTP ${res.status} — ${errBody.slice(0, 200)}`);
          }
          return { url, urlRating: 0, backlinks: 0, refDomains: 0 };
        }
        const data = await res.json();
        return {
          url,
          urlRating: 0, // backlinks-stats doesn't return UR, keep domain DR as fallback
          backlinks: data.live ?? data.all_time ?? 0,
          refDomains: data.live_refdomains ?? data.all_time_refdomains ?? 0,
        };
      } catch {
        return { url, urlRating: 0, backlinks: 0, refDomains: 0 };
      }
    });

    const results = await Promise.allSettled(promises);
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        result.set(r.value.url, {
          urlRating: r.value.urlRating,
          backlinks: r.value.backlinks,
          refDomains: r.value.refDomains,
        });
      }
    }

    // Small delay between batches to avoid rate limits
    if (i + 3 < batch.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`Ahrefs: got URL ratings for ${result.size} pages`);
  return result;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function calculateHealthScore(metrics: {
  clicks: number;
  maxClicks: number;
  avgPosition: number;
  engagementRate: number;
  urlRating: number;
  ctr: number;
  maxCtr: number;
}): { score: number; status: "working" | "needs_push" | "not_working" } {
  const clicksNorm = metrics.maxClicks > 0
    ? Math.min((metrics.clicks / metrics.maxClicks) * 100, 100)
    : 0;

  const positionNorm = Math.max(0, Math.min(100, 100 - (metrics.avgPosition - 1) * 2));

  const engagementNorm = Math.min(metrics.engagementRate * 100, 100);

  const urNorm = Math.min(metrics.urlRating, 100);

  const ctrNorm = metrics.maxCtr > 0
    ? Math.min((metrics.ctr / metrics.maxCtr) * 100, 100)
    : 0;

  const score = Math.round(
    clicksNorm * 0.3 +
    positionNorm * 0.25 +
    engagementNorm * 0.2 +
    urNorm * 0.15 +
    ctrNorm * 0.1
  );

  const status: "working" | "needs_push" | "not_working" =
    score >= 70 ? "working" : score >= 40 ? "needs_push" : "not_working";

  return { score, status };
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    console.log("SEO Sync: starting...");
    console.log(`SEO Sync: GSC_SITE_URL=${process.env.GSC_SITE_URL}, GA4_PROPERTY_ID=${process.env.GA4_PROPERTY_ID}, AHREFS_API_KEY=${process.env.AHREFS_API_KEY ? "set" : "NOT SET"}`);
    const auth = getGoogleAuth();

    // 1. Fetch GSC data
    const gscData = await fetchGscData(auth);
    if (gscData.length === 0) {
      return Response.json({ error: "No data returned from Google Search Console" }, { status: 404 });
    }

    // 2. Fetch GA4 data
    const ga4Map = new Map<string, Ga4Row>();
    try {
      const ga4Data = await fetchGa4Data(auth);
      // GSC URLs are full URLs like https://sequel.io/post/foo
      // GA4 pagePaths are like /post/foo
      // Build the base domain from GSC URLs (not from GSC_SITE_URL which may be sc-domain:)
      const sampleUrl = gscData[0]?.url || "";
      const urlMatch = sampleUrl.match(/^(https?:\/\/[^/]+)/);
      const baseDomain = urlMatch ? urlMatch[1] : "https://sequel.io";
      console.log(`SEO Sync: using base domain ${baseDomain} for GA4 URL matching`);

      for (const row of ga4Data) {
        // Match by path — store both with and without trailing slash
        const fullUrl = baseDomain + row.pagePath;
        ga4Map.set(fullUrl, row);
        ga4Map.set(fullUrl.replace(/\/$/, ""), row);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn("SEO Sync: GA4 fetch failed, continuing without GA4 data:", errMsg);
    }

    // 3. Fetch Ahrefs domain rating + domain metrics in parallel
    const [ahrefsRating, ahrefsMetrics] = await Promise.all([
      fetchAhrefsDomainRating(),
      fetchAhrefsDomainMetrics(),
    ]);
    const { domainRating, ahrefsRank } = ahrefsRating;
    const { totalBacklinks, referringDomains: domainRefDomains } = ahrefsMetrics;

    // 4. Fetch GA4 conversions (book_demo events per page)
    const conversionMap = await fetchGa4Conversions(auth);

    // 5. Fetch GA4 new vs returning visitors
    const visitorTypes = await fetchGa4VisitorTypes(auth);

    // 6. Fetch per-page Ahrefs URL ratings for top 20 pages by clicks
    const sortedByClicks = [...gscData].sort((a, b) => b.clicks - a.clicks);
    const topUrls = sortedByClicks.slice(0, 20).map((r) => r.url);
    const urlRatings = await fetchAhrefsUrlRatings(topUrls);

    // 7. Save Ahrefs domain metrics to history table
    try {
      await supabase.from("ahrefs_domain_metrics").insert({
        domain_rating: domainRating,
        total_backlinks: totalBacklinks,
        referring_domains: domainRefDomains,
        ahrefs_rank: ahrefsRank,
      });
      console.log("SEO Sync: saved Ahrefs domain metrics to history");
    } catch (err) {
      console.warn("SEO Sync: failed to save Ahrefs domain metrics:", err);
    }

    // 8. Calculate scores and build rows
    const maxClicks = Math.max(...gscData.map((r) => r.clicks), 1);
    const maxCtr = Math.max(...gscData.map((r) => r.ctr), 0.01);
    const now = new Date().toISOString();

    const rows: PageMetrics[] = gscData.map((gsc) => {
      const ga4 = ga4Map.get(gsc.url) || ga4Map.get(gsc.url.replace(/\/$/, ""));

      // Use per-page Ahrefs data if available, otherwise fall back to domain level
      const pageAhrefs = urlRatings.get(gsc.url);
      const pageUrlRating = pageAhrefs?.urlRating ?? domainRating;
      const pageRefDomains = pageAhrefs?.refDomains ?? 0;
      const pageBacklinks = pageAhrefs?.backlinks ?? 0;

      const { score, status } = calculateHealthScore({
        clicks: gsc.clicks,
        maxClicks,
        avgPosition: gsc.position,
        engagementRate: ga4?.engagementRate || 0,
        urlRating: pageUrlRating,
        ctr: gsc.ctr,
        maxCtr,
      });

      // Extract path for conversion matching
      let pagePath = "/";
      try { pagePath = new URL(gsc.url).pathname; } catch { /* ignore */ }
      const conversions = conversionMap.get(pagePath) || conversionMap.get(pagePath.replace(/\/$/, "")) || 0;

      return {
        url: gsc.url,
        clicks: gsc.clicks,
        impressions: gsc.impressions,
        ctr: Math.round(gsc.ctr * 10000) / 10000,
        avg_position: Math.round(gsc.position * 10) / 10,
        sessions: ga4?.sessions || 0,
        engagement_rate: Math.round((ga4?.engagementRate || 0) * 10000) / 10000,
        url_rating: pageUrlRating,
        referring_domains: pageRefDomains,
        backlinks: pageBacklinks,
        health_score: score,
        status,
        conversions,
        new_users: visitorTypes.newSessions,
        returning_users: visitorTypes.returningSessions,
        synced_at: now,
      };
    });

    // 9. Upsert to database
    const { error } = await supabase
      .from("seo_page_metrics")
      .upsert(rows, { onConflict: "url" });

    if (error) {
      console.error("SEO Sync: upsert failed:", error.message);
      return Response.json({ error: `Database upsert failed: ${error.message}` }, { status: 500 });
    }

    const summary = {
      total: rows.length,
      working: rows.filter((r) => r.status === "working").length,
      needs_push: rows.filter((r) => r.status === "needs_push").length,
      not_working: rows.filter((r) => r.status === "not_working").length,
    };

    console.log(`SEO Sync: complete — ${summary.total} pages (${summary.working} working, ${summary.needs_push} needs push, ${summary.not_working} not working)`);

    return Response.json({
      status: "sync complete",
      summary,
      ahrefs: {
        api_key_set: !!process.env.AHREFS_API_KEY,
        domain_rating: domainRating,
        ahrefs_rank: ahrefsRank,
        total_backlinks: totalBacklinks,
        referring_domains: domainRefDomains,
        pages_with_url_rating: urlRatings.size,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SEO Sync error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
