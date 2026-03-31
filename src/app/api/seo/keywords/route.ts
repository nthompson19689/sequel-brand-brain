import { NextRequest } from "next/server";
import { google } from "googleapis";
import { getGoogleAuth } from "@/lib/google-auth";
import { getSupabaseServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

// ─── Types ─────────────────────────────────────────────────────────────────

interface KeywordMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
  prev_position: number | null;
}

interface KeywordWithMetrics {
  keyword: string;
  added_at: string;
  metrics: {
    "7d": KeywordMetrics;
    "30d": KeywordMetrics;
    "90d": KeywordMetrics;
  };
}



const PERIODS = ["7d", "30d", "90d"] as const;
type Period = (typeof PERIODS)[number];

// ─── GSC keyword query ─────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getPeriodDates(period: Period): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  start.setDate(end.getDate() - days);
  return { startDate: fmt(start), endDate: fmt(end) };
}

async function queryGscKeyword(
  auth: InstanceType<typeof google.auth.JWT>,
  keyword: string,
  period: Period
): Promise<KeywordMetrics> {
  const siteUrl = process.env.GSC_SITE_URL || "sc-domain:sequel.io";
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const { startDate, endDate } = getPeriodDates(period);

  const res = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "query",
              operator: "equals",
              expression: keyword,
            },
          ],
        },
      ],
      rowLimit: 1,
    },
  });

  const row = res.data.rows?.[0];
  if (!row) {
    return { clicks: 0, impressions: 0, ctr: 0, avg_position: 0, prev_position: null };
  }

  return {
    clicks: row.clicks || 0,
    impressions: row.impressions || 0,
    ctr: Math.round((row.ctr || 0) * 10000) / 10000,
    avg_position: Math.round((row.position || 0) * 10) / 10,
    prev_position: null,
  };
}

async function queryAllPeriods(
  auth: InstanceType<typeof google.auth.JWT>,
  keyword: string
): Promise<Record<Period, KeywordMetrics>> {
  const [d7, d30, d90] = await Promise.all([
    queryGscKeyword(auth, keyword, "7d"),
    queryGscKeyword(auth, keyword, "30d"),
    queryGscKeyword(auth, keyword, "90d"),
  ]);

  return { "7d": d7, "30d": d30, "90d": d90 };
}

// ─── GET: list all keywords with metrics ───────────────────────────────────

export async function GET() {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Fetch watchlist
    const { data: watchlist, error: wErr } = await supabase
      .from("seo_keyword_watchlist")
      .select("id, keyword, added_at")
      .order("added_at", { ascending: false });

    if (wErr) {
      return Response.json({ error: wErr.message }, { status: 500 });
    }

    if (!watchlist || watchlist.length === 0) {
      return Response.json({ keywords: [] });
    }

    // Fetch all metrics
    const watchlistIds = watchlist.map((w) => w.id);
    const { data: metricsRows, error: mErr } = await supabase
      .from("seo_keyword_metrics")
      .select("keyword_id, period, clicks, impressions, ctr, avg_position, prev_position")
      .in("keyword_id", watchlistIds);

    if (mErr) {
      return Response.json({ error: mErr.message }, { status: 500 });
    }

    // Build metrics map: keyword_id -> period -> metrics
    const metricsMap = new Map<string, Record<string, KeywordMetrics>>();
    for (const row of metricsRows || []) {
      if (!metricsMap.has(row.keyword_id)) {
        metricsMap.set(row.keyword_id, {});
      }
      metricsMap.get(row.keyword_id)![row.period] = {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        avg_position: row.avg_position,
        prev_position: row.prev_position,
      };
    }

    const emptyMetrics: KeywordMetrics = {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      avg_position: 0,
      prev_position: null,
    };

    const keywords: KeywordWithMetrics[] = watchlist.map((w) => {
      const m = metricsMap.get(w.id) || {};
      return {
        keyword: w.keyword,
        added_at: w.added_at,
        metrics: {
          "7d": m["7d"] || emptyMetrics,
          "30d": m["30d"] || emptyMetrics,
          "90d": m["90d"] || emptyMetrics,
        },
      };
    });

    return Response.json({ keywords });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SEO Keywords GET error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// ─── POST: add keyword or refresh all ──────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const auth = getGoogleAuth();

    // ── Refresh all keywords ───────────────────────────────────────────
    if (body.action === "refresh") {
      const { data: watchlist, error: wErr } = await supabase
        .from("seo_keyword_watchlist")
        .select("id, keyword");

      if (wErr) {
        return Response.json({ error: wErr.message }, { status: 500 });
      }

      if (!watchlist || watchlist.length === 0) {
        return Response.json({ message: "No keywords to refresh", refreshed: 0 });
      }

      let refreshed = 0;

      for (const entry of watchlist) {
        // Fetch current metrics from DB to preserve prev_position
        const { data: existingMetrics } = await supabase
          .from("seo_keyword_metrics")
          .select("period, avg_position")
          .eq("keyword_id", entry.id);

        const existingPositions = new Map<string, number>();
        for (const m of existingMetrics || []) {
          existingPositions.set(m.period, m.avg_position);
        }

        const allMetrics = await queryAllPeriods(auth, entry.keyword);

        const upsertRows = PERIODS.map((period) => ({
          keyword_id: entry.id,
          period,
          clicks: allMetrics[period].clicks,
          impressions: allMetrics[period].impressions,
          ctr: allMetrics[period].ctr,
          avg_position: allMetrics[period].avg_position,
          prev_position: existingPositions.get(period) ?? null,
          updated_at: new Date().toISOString(),
        }));

        const { error: uErr } = await supabase
          .from("seo_keyword_metrics")
          .upsert(upsertRows, { onConflict: "keyword_id,period" });

        if (uErr) {
          console.error(`Failed to upsert metrics for "${entry.keyword}":`, uErr.message);
        } else {
          refreshed++;
        }
      }

      return Response.json({ message: "Refresh complete", refreshed });
    }

    // ── Add single keyword ─────────────────────────────────────────────
    const keyword = body.keyword?.trim();
    if (!keyword) {
      return Response.json({ error: "keyword is required" }, { status: 400 });
    }

    // Insert into watchlist (UNIQUE constraint handles duplicates)
    const { data: inserted, error: iErr } = await supabase
      .from("seo_keyword_watchlist")
      .upsert({ keyword }, { onConflict: "keyword" })
      .select("id, keyword, added_at")
      .single();

    if (iErr) {
      return Response.json({ error: iErr.message }, { status: 500 });
    }

    // Query GSC for all periods
    const allMetrics = await queryAllPeriods(auth, keyword);

    // Upsert metrics
    const upsertRows = PERIODS.map((period) => ({
      keyword_id: inserted.id,
      period,
      clicks: allMetrics[period].clicks,
      impressions: allMetrics[period].impressions,
      ctr: allMetrics[period].ctr,
      avg_position: allMetrics[period].avg_position,
      prev_position: null,
      updated_at: new Date().toISOString(),
    }));

    const { error: mErr } = await supabase
      .from("seo_keyword_metrics")
      .upsert(upsertRows, { onConflict: "keyword_id,period" });

    if (mErr) {
      console.error("Failed to upsert keyword metrics:", mErr.message);
    }

    const result: KeywordWithMetrics = {
      keyword: inserted.keyword,
      added_at: inserted.added_at,
      metrics: {
        "7d": allMetrics["7d"],
        "30d": allMetrics["30d"],
        "90d": allMetrics["90d"],
      },
    };

    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SEO Keywords POST error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// ─── DELETE: remove keyword from watchlist ──────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return Response.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const keyword = request.nextUrl.searchParams.get("keyword")?.trim();
    if (!keyword) {
      return Response.json({ error: "keyword query param is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("seo_keyword_watchlist")
      .delete()
      .eq("keyword", keyword);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SEO Keywords DELETE error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
