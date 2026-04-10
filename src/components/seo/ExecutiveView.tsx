"use client";

import { useState, useEffect } from "react";
import MetricCard from "./MetricCard";
import TrafficChart from "./TrafficChart";
import SourceBreakdownChart from "./SourceBreakdownChart";
import ActionPlan from "./ActionPlan";

interface AhrefsTrend {
  domain_rating: number;
  total_backlinks: number;
  referring_domains: number;
}

interface ExecutiveViewProps {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  pages: any[];
  summary: any;
  /** Incremented after each sync to trigger re-fetch */
  refreshKey?: number;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

export default function ExecutiveView({ pages, summary, refreshKey }: ExecutiveViewProps) {
  // Traffic trend (from timeseries endpoint)
  const [trafficTrend, setTrafficTrend] = useState<{ current: number; previous: number } | null>(null);
  // Ahrefs domain metrics
  const [ahrefsCurrent, setAhrefsCurrent] = useState<AhrefsTrend | null>(null);
  const [ahrefsPrevious, setAhrefsPrevious] = useState<AhrefsTrend | null>(null);

  useEffect(() => {
    // Load traffic trend
    (async () => {
      try {
        const res = await fetch("/api/seo/traffic-timeseries?days=30");
        if (res.ok) {
          const data = await res.json();
          setTrafficTrend({
            current: data.currentTotal || 0,
            previous: data.previousTotal || 0,
          });
        }
      } catch { /* ignore */ }
    })();

    // Load Ahrefs trends
    (async () => {
      try {
        const res = await fetch("/api/seo/ahrefs-trends");
        if (res.ok) {
          const data = await res.json();
          setAhrefsCurrent(data.current || null);
          setAhrefsPrevious(data.previous || null);
        }
      } catch { /* ignore */ }
    })();
  }, [refreshKey]);

  const totalSessions = pages.reduce((s, p) => s + (p.sessions || 0), 0);
  const totalConversions = pages.reduce((s, p) => s + (p.conversions || 0), 0);

  const sessionsTrend = trafficTrend
    ? pctChange(trafficTrend.current, trafficTrend.previous)
    : null;

  // We don't have conversion trend from a separate endpoint, so use what we have
  const conversionsTrend = null; // Would need a previous-period conversions query

  const drTrend =
    ahrefsCurrent && ahrefsPrevious
      ? pctChange(ahrefsCurrent.domain_rating, ahrefsPrevious.domain_rating)
      : null;
  const blTrend =
    ahrefsCurrent && ahrefsPrevious
      ? pctChange(ahrefsCurrent.total_backlinks, ahrefsPrevious.total_backlinks)
      : null;
  const rdTrend =
    ahrefsCurrent && ahrefsPrevious
      ? pctChange(ahrefsCurrent.referring_domains, ahrefsPrevious.referring_domains)
      : null;

  return (
    <div className="space-y-6">
      {/* Row 1: Key metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Organic Sessions"
          value={trafficTrend?.current ?? totalSessions}
          trend={sessionsTrend}
          trendLabel="vs prior period"
        />
        <MetricCard
          label="AI Search Citations"
          value="—"
          placeholder
        />
        <MetricCard
          label="Demos from Organic"
          value={totalConversions}
          trend={conversionsTrend}
          trendLabel="vs prior period"
        />
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <TrafficChart />
        </div>
        <div className="lg:col-span-2">
          <SourceBreakdownChart />
        </div>
      </div>

      {/* Row 3: Ahrefs domain metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Domain Rating"
          value={ahrefsCurrent?.domain_rating ?? "—"}
          trend={drTrend}
          trendLabel="vs last sync"
        />
        <MetricCard
          label="Total Backlinks"
          value={ahrefsCurrent?.total_backlinks ?? "—"}
          trend={blTrend}
          trendLabel="vs last sync"
        />
        <MetricCard
          label="Referring Domains"
          value={ahrefsCurrent?.referring_domains ?? "—"}
          trend={rdTrend}
          trendLabel="vs last sync"
        />
      </div>

      {/* Row 4: Action plan */}
      <ActionPlan pages={pages} />

      {/* Last synced */}
      {summary.last_synced && (
        <p className="text-[10px] text-gray-600 text-right">
          Last synced: {new Date(summary.last_synced).toLocaleString()}
        </p>
      )}
    </div>
  );
}
