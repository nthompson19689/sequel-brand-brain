import { NextRequest } from "next/server";
import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── In-memory cache (5-minute TTL) ────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface GscPageRow {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface Ga4SessionRow {
  pagePath: string;
  sessions: number;
  engagementRate: number;
}

interface Ga4ConversionRow {
  pagePath: string;
  conversions: number;
}

interface VisitorBreakdown {
  new_pct: number;
  returning_pct: number;
  new_count: number;
  returning_count: number;
}

interface MergedPage {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
  sessions: number;
  engagement_rate: number;
  conversions: number;
}

// ─── Date helpers ──────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDateRange(days: string): { startDate: string; endDate: string } {
  if (days === "7") return { startDate: "7daysAgo", endDate: "today" };
  if (days === "30") return { startDate: "30daysAgo", endDate: "today" };
  if (days === "90") return { startDate: "90daysAgo", endDate: "today" };
  // fallback
  return { startDate: `${days}daysAgo`, endDate: "today" };
}

function getGscDateRange(days: string): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  const numDays = parseInt(days, 10);
  start.setDate(end.getDate() - numDays);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function getMomPeriods(): {
  current: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
} {
  const now = new Date();
  const currentEnd = new Date(now);
  const currentStart = new Date(now);
  currentStart.setDate(now.getDate() - 30);

  const previousEnd = new Date(now);
  previousEnd.setDate(now.getDate() - 31);
  const previousStart = new Date(now);
  previousStart.setDate(now.getDate() - 60);

  return {
    current: { startDate: fmt(currentStart), endDate: fmt(currentEnd) },
    previous: { startDate: fmt(previousStart), endDate: fmt(previousEnd) },
  };
}

// ─── GSC fetch ─────────────────────────────────────────────────────────────

async function fetchGscPages(
  auth: InstanceType<typeof google.auth.JWT>,
  startDate: string,
  endDate: string
): Promise<GscPageRow[]> {
  const siteUrl = process.env.GSC_SITE_URL || "sc-domain:sequel.io";
  const searchconsole = google.searchconsole({ version: "v1", auth });

  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 1000,
    },
  });

  return (res.data.rows || []).map((r) => ({
    url: r.keys?.[0] || "",
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  }));
}

// ─── GA4 fetches ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalyticsDataClient = any;

function getAnalyticsClient(auth: InstanceType<typeof google.auth.JWT>): AnalyticsDataClient {
  return google.analyticsdata({ version: "v1beta", auth });
}

interface Ga4ApiRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

async function fetchGa4Sessions(
  analyticsdata: AnalyticsDataClient,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<Ga4SessionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (analyticsdata.properties as any).runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "sessions" }, { name: "engagementRate" }],
      limit: 1000,
    },
  });

  return ((res.data.rows || []) as Ga4ApiRow[]).map((r) => ({
    pagePath: r.dimensionValues?.[0]?.value || "",
    sessions: parseInt(r.metricValues?.[0]?.value || "0", 10),
    engagementRate: parseFloat(r.metricValues?.[1]?.value || "0"),
  }));
}

async function fetchGa4Visitors(
  analyticsdata: AnalyticsDataClient,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<VisitorBreakdown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (analyticsdata.properties as any).runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "newVsReturning" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { matchType: "EXACT", value: "Organic Search" },
        },
      },
    },
  });

  const rows: Ga4ApiRow[] = res.data.rows || [];
  let newCount = 0;
  let returningCount = 0;

  for (const row of rows) {
    const dim = row.dimensionValues?.[0]?.value || "";
    const val = parseInt(row.metricValues?.[0]?.value || "0", 10);
    if (dim === "new") newCount = val;
    else if (dim === "returning") returningCount = val;
  }

  const total = newCount + returningCount;
  return {
    new_pct: total > 0 ? Math.round((newCount / total) * 10000) / 100 : 0,
    returning_pct: total > 0 ? Math.round((returningCount / total) * 10000) / 100 : 0,
    new_count: newCount,
    returning_count: returningCount,
  };
}

async function fetchGa4Conversions(
  analyticsdata: AnalyticsDataClient,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<Ga4ConversionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (analyticsdata.properties as any).runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: "eventName",
                stringFilter: { matchType: "EXACT", value: "book_demo" },
              },
            },
            {
              filter: {
                fieldName: "sessionDefaultChannelGroup",
                stringFilter: { matchType: "EXACT", value: "Organic Search" },
              },
            },
          ],
        },
      },
    },
  });

  return ((res.data.rows || []) as Ga4ApiRow[]).map((r) => ({
    pagePath: r.dimensionValues?.[0]?.value || "",
    conversions: parseInt(r.metricValues?.[0]?.value || "0", 10),
  }));
}

// ─── Merge logic ───────────────────────────────────────────────────────────

function extractPath(fullUrl: string): string {
  try {
    return new URL(fullUrl).pathname.replace(/\/$/, "") || "/";
  } catch {
    return fullUrl;
  }
}

function normalizePath(p: string): string {
  return p.replace(/\/$/, "") || "/";
}

function mergeData(
  gscRows: GscPageRow[],
  sessionRows: Ga4SessionRow[],
  conversionRows: Ga4ConversionRow[]
): MergedPage[] {
  const sessionMap = new Map<string, Ga4SessionRow>();
  for (const row of sessionRows) {
    sessionMap.set(normalizePath(row.pagePath), row);
  }

  const conversionMap = new Map<string, number>();
  for (const row of conversionRows) {
    conversionMap.set(normalizePath(row.pagePath), row.conversions);
  }

  return gscRows.map((gsc) => {
    const path = normalizePath(extractPath(gsc.url));
    const session = sessionMap.get(path);
    const conversions = conversionMap.get(path) || 0;

    return {
      url: gsc.url,
      clicks: gsc.clicks,
      impressions: gsc.impressions,
      ctr: Math.round(gsc.ctr * 10000) / 10000,
      avg_position: Math.round(gsc.position * 10) / 10,
      sessions: session?.sessions || 0,
      engagement_rate: Math.round((session?.engagementRate || 0) * 10000) / 10000,
      conversions,
    };
  });
}

// ─── Full data fetch for a period ──────────────────────────────────────────

interface PeriodData {
  pages: MergedPage[];
  visitors: VisitorBreakdown;
  totals: { clicks: number; impressions: number; sessions: number; conversions: number };
}

async function fetchPeriodData(
  auth: InstanceType<typeof google.auth.JWT>,
  gscStart: string,
  gscEnd: string,
  ga4Start: string,
  ga4End: string
): Promise<PeriodData> {
  const propertyId = process.env.GA4_PROPERTY_ID || "308410468";
  const analyticsdata = getAnalyticsClient(auth);

  const [gscRows, sessionRows, visitors, conversionRows] = await Promise.all([
    fetchGscPages(auth, gscStart, gscEnd),
    fetchGa4Sessions(analyticsdata, propertyId, ga4Start, ga4End),
    fetchGa4Visitors(analyticsdata, propertyId, ga4Start, ga4End),
    fetchGa4Conversions(analyticsdata, propertyId, ga4Start, ga4End),
  ]);

  const pages = mergeData(gscRows, sessionRows, conversionRows);

  const totals = pages.reduce(
    (acc, p) => ({
      clicks: acc.clicks + p.clicks,
      impressions: acc.impressions + p.impressions,
      sessions: acc.sessions + p.sessions,
      conversions: acc.conversions + p.conversions,
    }),
    { clicks: 0, impressions: 0, sessions: 0, conversions: 0 }
  );

  return { pages, visitors, totals };
}

// ─── Delta calculation ─────────────────────────────────────────────────────

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

// ─── Route Handler ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const days = request.nextUrl.searchParams.get("days") || "30";

  if (!["7", "30", "90", "mom"].includes(days)) {
    return Response.json(
      { error: "Invalid days parameter. Use 7, 30, 90, or mom." },
      { status: 400 }
    );
  }

  // Check cache
  const cacheKey = `seo-query-${days}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

  try {
    const auth = getGoogleAuth();

    if (days === "mom") {
      const periods = getMomPeriods();

      const [current, previous] = await Promise.all([
        fetchPeriodData(
          auth,
          periods.current.startDate,
          periods.current.endDate,
          "30daysAgo",
          "today"
        ),
        fetchPeriodData(
          auth,
          periods.previous.startDate,
          periods.previous.endDate,
          periods.previous.startDate,
          periods.previous.endDate
        ),
      ]);

      const result = {
        pages: current.pages,
        visitors: current.visitors,
        mom_deltas: {
          clicks_delta: pctDelta(current.totals.clicks, previous.totals.clicks),
          impressions_delta: pctDelta(current.totals.impressions, previous.totals.impressions),
          sessions_delta: pctDelta(current.totals.sessions, previous.totals.sessions),
          conversions_delta: pctDelta(current.totals.conversions, previous.totals.conversions),
        },
      };

      setCache(cacheKey, result);
      return Response.json(result);
    }

    // Standard period query
    const gscRange = getGscDateRange(days);
    const ga4Range = getDateRange(days);

    const data = await fetchPeriodData(
      auth,
      gscRange.startDate,
      gscRange.endDate,
      ga4Range.startDate,
      ga4Range.endDate
    );

    const result = {
      pages: data.pages,
      visitors: data.visitors,
    };

    setCache(cacheKey, result);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SEO Query error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
