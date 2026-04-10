import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

interface DayPoint {
  date: string;
  sessions: number;
}

// 5-minute in-memory cache
let cache: { key: string; data: unknown; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * GET /api/seo/traffic-timeseries?days=30|60|90
 * Returns daily organic sessions + previous period total for trend arrow.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const validDays = [30, 60, 90].includes(days) ? days : 30;

  const cacheKey = `timeseries-${validDays}`;
  if (cache && cache.key === cacheKey && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  try {
    const auth = getGoogleAuth();
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return Response.json({ error: "GA4_PROPERTY_ID not set" }, { status: 500 });
    }

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth });

    // Current period: daily sessions
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentRes = await (analyticsdata.properties as any).runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: `${validDays}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: validDays + 1,
      },
    });

    const data: DayPoint[] = (currentRes.data.rows || []).map(
      (r: { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }) => ({
        date: r.dimensionValues?.[0]?.value || "",
        sessions: parseInt(r.metricValues?.[0]?.value || "0", 10),
      })
    );

    const currentTotal = data.reduce((sum, d) => sum + d.sessions, 0);

    // Previous period: total sessions only (for trend)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevRes = await (analyticsdata.properties as any).runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [
          { startDate: `${validDays * 2}daysAgo`, endDate: `${validDays + 1}daysAgo` },
        ],
        metrics: [{ name: "sessions" }],
        dimensionFilter: {
          filter: {
            fieldName: "sessionDefaultChannelGroup",
            stringFilter: { value: "Organic Search" },
          },
        },
      },
    });

    const prevTotal = parseInt(
      prevRes.data.rows?.[0]?.metricValues?.[0]?.value || "0",
      10
    );

    const result = { data, currentTotal, previousTotal: prevTotal };
    cache = { key: cacheKey, data: result, ts: Date.now() };

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[traffic-timeseries] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
