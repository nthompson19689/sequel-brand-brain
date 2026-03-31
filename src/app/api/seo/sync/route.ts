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
  health_score: number;
  status: "working" | "needs_push" | "not_working";
  synced_at: string;
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

    // 3. Fetch Ahrefs domain rating
    const { domainRating } = await fetchAhrefsDomainRating();

    // 4. Fetch GA4 conversions (book_demo events per page)
    const conversionMap = await fetchGa4Conversions(auth);

    // 5. Fetch GA4 new vs returning visitors
    const visitorTypes = await fetchGa4VisitorTypes(auth);

    // 4. Calculate scores
    const maxClicks = Math.max(...gscData.map((r) => r.clicks), 1);
    const maxCtr = Math.max(...gscData.map((r) => r.ctr), 0.01);
    const now = new Date().toISOString();

    const rows: PageMetrics[] = gscData.map((gsc) => {
      const ga4 = ga4Map.get(gsc.url) || ga4Map.get(gsc.url.replace(/\/$/, ""));

      const { score, status } = calculateHealthScore({
        clicks: gsc.clicks,
        maxClicks,
        avgPosition: gsc.position,
        engagementRate: ga4?.engagementRate || 0,
        urlRating: domainRating, // Same domain rating for all pages
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
        url_rating: domainRating,
        referring_domains: 0,
        health_score: score,
        status,
        conversions,
        new_users: visitorTypes.newSessions,
        returning_users: visitorTypes.returningSessions,
        synced_at: now,
      };
    });

    // 5. Upsert to database
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

    return Response.json({ status: "sync complete", summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SEO Sync error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
