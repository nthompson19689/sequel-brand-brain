import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";
import { getClaudeClient, resolveModel } from "@/lib/claude";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

interface PeriodData {
  totalClicks: number;
  totalImpressions: number;
  totalSessions: number;
  totalConversions: number;
  pages: Map<string, { clicks: number; impressions: number; sessions: number; conversions: number; position: number }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPeriodData(auth: any, startDate: string, endDate: string): Promise<PeriodData> {
  const siteUrl = process.env.GSC_SITE_URL || "sc-domain:sequel.io";
  const propertyId = process.env.GA4_PROPERTY_ID;

  // GSC
  const webmasters = google.webmasters({ version: "v3", auth });
  const gscRes = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 500,
    },
  });

  const pages = new Map<string, { clicks: number; impressions: number; sessions: number; conversions: number; position: number }>();
  let totalClicks = 0;
  let totalImpressions = 0;

  for (const row of gscRes.data.rows || []) {
    const url = (row.keys?.[0] || "");
    const clicks = row.clicks || 0;
    const impressions = row.impressions || 0;
    totalClicks += clicks;
    totalImpressions += impressions;
    pages.set(url, { clicks, impressions, sessions: 0, conversions: 0, position: row.position || 0 });
  }

  // GA4 sessions
  let totalSessions = 0;
  let totalConversions = 0;

  if (propertyId) {
    try {
      const analyticsdata = google.analyticsdata({ version: "v1beta", auth });

      // Sessions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sessRes = await (analyticsdata.properties as any).runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "sessions" }],
          dimensionFilter: {
            filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { value: "Organic Search" } },
          },
          limit: 500,
        },
      });

      for (const row of sessRes.data.rows || []) {
        const path = row.dimensionValues?.[0]?.value || "";
        const sess = parseInt(row.metricValues?.[0]?.value || "0", 10);
        totalSessions += sess;
        // Match to GSC pages
        for (const [url, data] of Array.from(pages)) {
          try {
            if (new URL(url).pathname === path || new URL(url).pathname === path.replace(/\/$/, "")) {
              data.sessions = sess;
            }
          } catch { /* ignore */ }
        }
      }

      // Conversions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const convRes = await (analyticsdata.properties as any).runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
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
          limit: 500,
        },
      });

      for (const row of convRes.data.rows || []) {
        const path = row.dimensionValues?.[0]?.value || "";
        const count = parseInt(row.metricValues?.[0]?.value || "0", 10);
        totalConversions += count;
        for (const [url, data] of Array.from(pages)) {
          try {
            if (new URL(url).pathname === path || new URL(url).pathname === path.replace(/\/$/, "")) {
              data.conversions = count;
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.warn("Report: GA4 fetch failed:", err);
    }
  }

  return { totalClicks, totalImpressions, totalSessions, totalConversions, pages };
}

// ─── POST Handler ───────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const auth = getGoogleAuth();

    // This week (last 7 days) vs last week (8-14 days ago)
    const [thisWeek, lastWeek] = await Promise.all([
      fetchPeriodData(auth, dateStr(7), dateStr(0)),
      fetchPeriodData(auth, dateStr(14), dateStr(7)),
    ]);

    // Compute deltas
    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : curr > 0 ? 100 : 0;

    const metrics = {
      clicks: { current: thisWeek.totalClicks, previous: lastWeek.totalClicks, change: pctChange(thisWeek.totalClicks, lastWeek.totalClicks) },
      impressions: { current: thisWeek.totalImpressions, previous: lastWeek.totalImpressions, change: pctChange(thisWeek.totalImpressions, lastWeek.totalImpressions) },
      sessions: { current: thisWeek.totalSessions, previous: lastWeek.totalSessions, change: pctChange(thisWeek.totalSessions, lastWeek.totalSessions) },
      conversions: { current: thisWeek.totalConversions, previous: lastWeek.totalConversions, change: pctChange(thisWeek.totalConversions, lastWeek.totalConversions) },
    };

    // Top 3 pages by click growth
    const pageGrowth: Array<{ url: string; current: number; previous: number; growth: number }> = [];
    for (const [url, data] of Array.from(thisWeek.pages)) {
      const prev = lastWeek.pages.get(url);
      const growth = data.clicks - (prev?.clicks || 0);
      pageGrowth.push({ url, current: data.clicks, previous: prev?.clicks || 0, growth });
    }
    pageGrowth.sort((a, b) => b.growth - a.growth);
    const topGrowing = pageGrowth.slice(0, 3);

    // Pages that dropped 30%+
    const declining: Array<{ url: string; current: number; previous: number; drop: number }> = [];
    for (const [url, prevData] of Array.from(lastWeek.pages)) {
      const curr = thisWeek.pages.get(url);
      const currClicks = curr?.clicks || 0;
      if (prevData.clicks >= 5 && currClicks < prevData.clicks * 0.7) {
        declining.push({
          url,
          current: currClicks,
          previous: prevData.clicks,
          drop: pctChange(currClicks, prevData.clicks),
        });
      }
    }
    declining.sort((a, b) => a.drop - b.drop);

    // Top 3 keywords by position improvement (from watchlist)
    let topKeywords: Array<{ keyword: string; current: number; previous: number; improvement: number }> = [];
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const { data: kwMetrics } = await supabase
        .from("seo_keyword_metrics")
        .select("*, watchlist:seo_keyword_watchlist!keyword_id(keyword)")
        .eq("period", "7d");

      if (kwMetrics) {
        topKeywords = kwMetrics
          .filter((m) => m.prev_position > 0 && m.avg_position < m.prev_position)
          .map((m) => ({
            keyword: (m.watchlist as { keyword: string })?.keyword || "",
            current: m.avg_position,
            previous: m.prev_position,
            improvement: m.prev_position - m.avg_position,
          }))
          .sort((a, b) => b.improvement - a.improvement)
          .slice(0, 3);
      }
    }

    const reportData = { metrics, topGrowing, declining, topKeywords };

    // Generate narrative with Claude
    let narrative = "";
    try {
      const claude = getClaudeClient();
      const res = await claude.messages.create({
        model: resolveModel("claude-sonnet-4-6"),
        max_tokens: 2048,
        system: [{
          type: "text",
          text: `You are an SEO analyst writing a concise weekly report for a B2B SaaS company (Sequel.io). Write in bullet points, not paragraphs. Be specific with numbers. Focus on actionable insights, not observations. Keep it under 300 words. Use plain text only (no markdown).`,
        }],
        messages: [{
          role: "user",
          content: `Generate a weekly SEO snapshot based on this data:\n\n${JSON.stringify(reportData, null, 2)}`,
        }],
      });

      for (const block of res.content) {
        if (block.type === "text") narrative += block.text;
      }
    } catch (err) {
      console.warn("Report: Claude narrative failed:", err);
      narrative = "Narrative generation failed. Review the raw metrics above.";
    }

    return Response.json({
      report: { ...reportData, narrative, generated_at: new Date().toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Report generation failed:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
