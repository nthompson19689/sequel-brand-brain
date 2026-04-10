import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// 5-minute cache
let cache: { data: unknown; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * GET /api/seo/source-breakdown
 * Returns sessions grouped by traffic source channel (last 30 days).
 */
export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_TTL) {
    return Response.json(cache.data);
  }

  try {
    const auth = getGoogleAuth();
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      return Response.json({ error: "GA4_PROPERTY_ID not set" }, { status: 500 });
    }

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (analyticsdata.properties as any).runReport({
      property: `properties/${propertyId}`,
      requestBody: {
        dateRanges: [{ startDate: "30daysAgo", endDate: "today" }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: 20,
      },
    });

    // Map channels to display names and group small ones
    const channelMap: Record<string, string> = {
      "Organic Search": "Organic Search",
      Direct: "Direct",
      Referral: "Referral",
      "Organic Social": "Social",
      "Paid Social": "Social",
      "Paid Search": "Paid Search",
      Email: "Email",
      Display: "Display",
    };

    const grouped = new Map<string, number>();
    for (const row of res.data.rows || []) {
      const rawChannel = row.dimensionValues?.[0]?.value || "Other";
      const sessions = parseInt(row.metricValues?.[0]?.value || "0", 10);
      const label = channelMap[rawChannel] || "Other";
      grouped.set(label, (grouped.get(label) || 0) + sessions);
    }

    const channels = Array.from(grouped.entries())
      .map(([channel, sessions]) => ({ channel, sessions }))
      .sort((a, b) => b.sessions - a.sessions);

    const result = { channels };
    cache = { data: result, ts: Date.now() };

    return Response.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[source-breakdown] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
