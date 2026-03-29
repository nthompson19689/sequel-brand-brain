import { google } from "googleapis";
import { getServiceAccountCredentials } from "@/lib/google-auth";
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

interface AhrefsData {
  url_rating: number;
  referring_domains: number;
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

// ─── Google Auth ─────────────────────────────────────────────────────────────

function getGoogleAuth() {
  const creds = getServiceAccountCredentials();
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/analytics.readonly",
    ],
  });
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

// ─── Ahrefs ──────────────────────────────────────────────────────────────────

async function fetchAhrefsData(urls: string[]): Promise<Map<string, AhrefsData>> {
  const apiKey = process.env.AHREFS_API_KEY;
  const results = new Map<string, AhrefsData>();

  if (!apiKey) {
    console.log("Ahrefs: AHREFS_API_KEY not set, skipping");
    return results;
  }

  // Batch in groups of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map(async (url) => {
        const res = await fetch(
          `https://api.ahrefs.com/v3/site-explorer/url-rating?target=${encodeURIComponent(url)}&mode=exact`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: "application/json",
            },
          }
        );

        if (!res.ok) {
          console.warn(`Ahrefs: ${res.status} for ${url}`);
          return { url, url_rating: 0, referring_domains: 0 };
        }

        const data = await res.json();
        return {
          url,
          url_rating: data.url_rating ?? data.ahrefs_rank ?? 0,
          referring_domains: data.referring_domains ?? data.refdomains ?? 0,
        };
      })
    );

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.set(result.value.url, {
          url_rating: result.value.url_rating,
          referring_domains: result.value.referring_domains,
        });
      }
    }

    // Brief pause between batches
    if (i + batchSize < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log(`Ahrefs: fetched data for ${results.size}/${urls.length} URLs`);
  return results;
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
      const siteUrl = (process.env.GSC_SITE_URL || "").replace(/\/$/, "");
      for (const row of ga4Data) {
        const fullUrl = siteUrl + row.pagePath;
        ga4Map.set(fullUrl, row);
      }
    } catch (err) {
      console.warn("SEO Sync: GA4 fetch failed, continuing without GA4 data:", err);
    }

    // 3. Fetch Ahrefs data
    const ahrefsMap = await fetchAhrefsData(gscData.map((r) => r.url));

    // 4. Calculate scores
    const maxClicks = Math.max(...gscData.map((r) => r.clicks), 1);
    const maxCtr = Math.max(...gscData.map((r) => r.ctr), 0.01);
    const now = new Date().toISOString();

    const rows: PageMetrics[] = gscData.map((gsc) => {
      const ga4 = ga4Map.get(gsc.url);
      const ahrefs = ahrefsMap.get(gsc.url);

      const { score, status } = calculateHealthScore({
        clicks: gsc.clicks,
        maxClicks,
        avgPosition: gsc.position,
        engagementRate: ga4?.engagementRate || 0,
        urlRating: ahrefs?.url_rating || 0,
        ctr: gsc.ctr,
        maxCtr,
      });

      return {
        url: gsc.url,
        clicks: gsc.clicks,
        impressions: gsc.impressions,
        ctr: Math.round(gsc.ctr * 10000) / 10000,
        avg_position: Math.round(gsc.position * 10) / 10,
        sessions: ga4?.sessions || 0,
        engagement_rate: Math.round((ga4?.engagementRate || 0) * 10000) / 10000,
        url_rating: ahrefs?.url_rating || 0,
        referring_domains: ahrefs?.referring_domains || 0,
        health_score: score,
        status,
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
