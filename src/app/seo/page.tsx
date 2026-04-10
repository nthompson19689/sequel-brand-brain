"use client";

import { Fragment, useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { markdownToHtml } from "@/lib/markdown-to-html";
import SeoTabSwitcher, { type SeoTab } from "@/components/seo/SeoTabSwitcher";
import ExecutiveView from "@/components/seo/ExecutiveView";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PageMetrics {
  id: string;
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
  conversions: number;
  new_users: number;
  returning_users: number;
  status: "working" | "needs_push" | "not_working";
  synced_at: string;
  created_at: string;
  // MoM previous period fields (populated when timeFrame === 'mom')
  prev_clicks?: number;
  prev_impressions?: number;
  prev_ctr?: number;
  prev_avg_position?: number;
  prev_sessions?: number;
  prev_engagement_rate?: number;
  prev_conversions?: number;
}

interface Summary {
  total: number;
  working_count: number;
  needs_push_count: number;
  not_working_count: number;
  last_synced: string | null;
  total_visitors?: number;
  new_visitors_pct?: number;
  returning_visitors_pct?: number;
  new_sessions?: number;
  returning_sessions?: number;
  // MoM deltas for summary cards
  prev_total?: number;
  prev_working_count?: number;
  prev_needs_push_count?: number;
  prev_not_working_count?: number;
}

interface Keyword {
  keyword: string;
  avg_position: number;
  prev_position: number;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface WeeklyReport {
  metrics: {
    label: string;
    this_week: number;
    last_week: number;
    change_pct: number;
  }[];
  top_growing: { url: string; change: string }[];
  declining: { url: string; change: string }[];
  keyword_improvements: { keyword: string; change: string }[];
  narrative: string;
}

type StatusFilter = "all" | "working" | "needs_push" | "not_working" | "top_performers";
type SortKey = "url" | "clicks" | "avg_position" | "ctr" | "sessions" | "engagement_rate" | "url_rating" | "health_score" | "conversions" | "backlinks" | "referring_domains";
type TimeFrame = "7d" | "30d" | "90d" | "mom";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "working":
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-800/40">
          Working
        </span>
      );
    case "needs_push":
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-900/40 text-amber-400 border border-amber-800/40">
          Needs Push
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/40 text-red-400 border border-red-800/40">
          Not Working
        </span>
      );
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

function deltaIndicator(current: number, previous: number | undefined) {
  if (!previous || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return null;
  return pct > 0
    ? <span className="text-emerald-400 text-xs ml-1">+{pct.toFixed(1)}%</span>
    : <span className="text-red-400 text-xs ml-1">{pct.toFixed(1)}%</span>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SeoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Core dashboard state
  const [pages, setPages] = useState<PageMetrics[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, working_count: 0, needs_push_count: 0, not_working_count: 0, last_synced: null });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("health_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  // Feature 1: Time Frame Toggle
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("30d");

  // Feature 6: Keyword Watchlist
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  // Feature 7: Weekly Report
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  // Feature 8: AI Analysis
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState("");

  // View tab: Executive (default) or Tactical
  const [viewTab, setViewTab] = useState<SeoTab>("executive");

  // ─── Data fetching ─────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/seo/dashboard");
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
        setSummary(data.summary || { total: 0, working_count: 0, needs_push_count: 0, not_working_count: 0, last_synced: null });
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  const loadTimeFrameData = useCallback(async (tf: TimeFrame) => {
    if (tf === "30d") {
      await loadDashboard();
      return;
    }
    try {
      const days = tf === "7d" ? 7 : tf === "90d" ? 90 : 30;
      const endpoint = tf === "mom"
        ? "/api/seo/query?days=30&mom=true"
        : `/api/seo/query?days=${days}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.pages) setPages(data.pages);
        if (data.summary) setSummary((prev) => ({ ...prev, ...data.summary }));
      }
    } catch {
      // ignore
    }
  }, [loadDashboard]);

  const loadKeywords = useCallback(async () => {
    try {
      const res = await fetch("/api/seo/keywords");
      if (res.ok) {
        const data = await res.json();
        setKeywords(data.keywords || []);
      }
    } catch {
      // ignore
    }
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const res = await fetch("/api/seo/sync", { method: "POST" });
      let data;
      try {
        data = await res.json();
      } catch {
        setSyncError(`Sync returned HTTP ${res.status} with non-JSON response. The function may have timed out.`);
        setSyncing(false);
        return;
      }
      if (!res.ok) {
        setSyncError(data.error || `Sync failed with HTTP ${res.status}`);
      } else {
        const s = data.summary;
        const a = data.ahrefs;
        const ahrefsInfo = a
          ? ` | Ahrefs: ${a.api_key_set ? `DR ${a.domain_rating}, ${a.total_backlinks} backlinks, ${a.referring_domains} ref domains, ${a.pages_with_url_rating} pages with UR` : "API key not set"}`
          : "";
        const msg = s
          ? `Synced ${s.total} pages (${s.working} working, ${s.needs_push} needs push, ${s.not_working} not working)${ahrefsInfo}`
          : "Sync completed but returned no summary.";
        setSyncSuccess(msg);
      }
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setSyncError(`Sync request failed: ${msg}`);
    }
    setSyncing(false);
  }

  async function handleAddKeyword() {
    const kw = newKeyword.trim();
    if (!kw) return;
    try {
      const res = await fetch("/api/seo/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw }),
      });
      if (res.ok) {
        setNewKeyword("");
        await loadKeywords();
      }
    } catch {
      // ignore
    }
  }

  async function handleRemoveKeyword(keyword: string) {
    try {
      await fetch(`/api/seo/keywords?keyword=${encodeURIComponent(keyword)}`, {
        method: "DELETE",
      });
      await loadKeywords();
    } catch {
      // ignore
    }
  }

  async function handleWeeklyReport() {
    setReportLoading(true);
    try {
      const res = await fetch("/api/seo/report", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setWeeklyReport(data);
        setShowReport(true);
      }
    } catch {
      // ignore
    }
    setReportLoading(false);
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalysis("");
    try {
      const res = await fetch("/api/seo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: filtered }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data.analysis || "No analysis returned.");
      } else {
        setAnalysis("Analysis failed. Please try again.");
      }
    } catch {
      setAnalysis("Analysis request failed.");
    }
    setAnalyzing(false);
  }

  useEffect(() => {
    loadDashboard();
    loadKeywords();
  }, [loadDashboard, loadKeywords]);

  useEffect(() => {
    loadTimeFrameData(timeFrame);
  }, [timeFrame, loadTimeFrameData]);

  // ─── Filtering & sorting (must be before early returns for hooks rules) ───

  const filtered = useMemo(() => {
    let result = pages;
    if (activeFilter === "top_performers") {
      result = result.filter((p) => p.clicks > 10 && p.conversions > 0);
    } else if (activeFilter !== "all") {
      result = result.filter((p) => p.status === activeFilter);
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortDir === "asc" ? aNum - bNum : bNum - aNum;
    });
    return result;
  }, [pages, activeFilter, sortBy, sortDir]);

  // Conversion impact computed values
  const totalConversions = useMemo(() => pages.reduce((sum, p) => sum + (p.conversions || 0), 0), [pages]);
  const totalSessions = useMemo(() => pages.reduce((sum, p) => sum + (p.sessions || 0), 0), [pages]);
  const conversionRate = useMemo(() => totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0, [totalConversions, totalSessions]);
  const topConvertingPages = useMemo(() =>
    [...pages].filter((p) => p.conversions > 0).sort((a, b) => b.conversions - a.conversions).slice(0, 5),
    [pages]
  );

  // ─── Auth guard ────────────────────────────────────────────────────────────

  if (authLoading) return null;
  if (!user) {
    router.push("/login");
    return null;
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(key === "url" ? "asc" : "desc");
    }
  }

  function sortIcon(key: SortKey) {
    if (sortBy !== key) return null;
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">SEO Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">
              Track content performance across Search Console, GA4, and Ahrefs
            </p>
          </div>
          <div className="flex items-center gap-3">
            {summary.last_synced && (
              <span className="text-xs text-gray-500">
                Last synced {timeAgo(summary.last_synced)}
              </span>
            )}
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Analyzing...
                </span>
              ) : (
                "Analyze"
              )}
            </button>
            <button
              onClick={handleWeeklyReport}
              disabled={reportLoading}
              className="px-4 py-2 text-sm font-medium text-[#7C3AED] border border-[#7C3AED] rounded-lg hover:bg-[#7C3AED]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {reportLoading ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                "Weekly Report"
              )}
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {syncing ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Syncing...
                </span>
              ) : (
                "Sync Now"
              )}
            </button>
          </div>
        </div>

        {/* View toggle */}
        <div className="mb-6">
          <SeoTabSwitcher activeTab={viewTab} onTabChange={setViewTab} />
        </div>

        {/* Sync error */}
        {syncError && (
          <div className="mb-6 p-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
            {syncError}
          </div>
        )}

        {/* Sync success */}
        {syncSuccess && (
          <div className="mb-6 p-3 rounded-lg bg-green-900/30 border border-green-800/40 text-green-300 text-sm">
            {syncSuccess}
          </div>
        )}

        {/* ── Executive View ── */}
        {viewTab === "executive" && (
          <ExecutiveView
            pages={pages}
            summary={summary}
          />
        )}

        {/* ── Tactical View (existing content) ── */}
        {viewTab === "tactical" && <>
        {/* AI Analysis Results (Feature 8) */}
        {analysis && (
          <div className="mb-6 bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-purple-300">AI Analysis</h2>
              <button
                onClick={() => setAnalysis("")}
                className="text-gray-500 hover:text-gray-300 text-sm"
              >
                Dismiss
              </button>
            </div>
            <div
              className="text-sm text-gray-300 leading-relaxed prose prose-invert prose-sm max-w-none prose-headings:text-purple-300 prose-strong:text-white prose-li:text-gray-300 prose-p:text-gray-300"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(analysis) }}
            />
          </div>
        )}

        {/* Weekly Report (Feature 7) */}
        {showReport && weeklyReport && (
          <div className="mb-6 bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-purple-300">Weekly Report</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 text-xs font-medium text-gray-400 border border-[#2A2040] rounded-lg hover:text-white hover:border-gray-500 transition-colors"
                >
                  Print
                </button>
                <button
                  onClick={() => setShowReport(false)}
                  className="text-gray-500 hover:text-gray-300 text-sm"
                >
                  Dismiss
                </button>
              </div>
            </div>

            {/* Metrics comparison */}
            {weeklyReport.metrics && weeklyReport.metrics.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Metrics Comparison</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {weeklyReport.metrics.map((m) => (
                    <div key={m.label} className="bg-[#0F0A1A] rounded-lg p-3">
                      <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                      <p className="text-lg font-bold">{m.this_week.toLocaleString()}</p>
                      <p className="text-xs">
                        vs {m.last_week.toLocaleString()}
                        <span className={`ml-1 ${m.change_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {m.change_pct >= 0 ? "+" : ""}{m.change_pct.toFixed(1)}%
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top growing pages */}
            {weeklyReport.top_growing && weeklyReport.top_growing.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-emerald-400 mb-2">Top Growing Pages</h3>
                <div className="space-y-1">
                  {weeklyReport.top_growing.map((p) => (
                    <div key={p.url} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 truncate max-w-[70%]">{truncateUrl(p.url)}</span>
                      <span className="text-emerald-400 text-xs">{p.change}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Declining pages */}
            {weeklyReport.declining && weeklyReport.declining.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-red-400 mb-2">Declining Pages</h3>
                <div className="space-y-1">
                  {weeklyReport.declining.map((p) => (
                    <div key={p.url} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300 truncate max-w-[70%]">{truncateUrl(p.url)}</span>
                      <span className="text-red-400 text-xs">{p.change}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Keyword improvements */}
            {weeklyReport.keyword_improvements && weeklyReport.keyword_improvements.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-purple-300 mb-2">Keyword Improvements</h3>
                <div className="space-y-1">
                  {weeklyReport.keyword_improvements.map((k) => (
                    <div key={k.keyword} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{k.keyword}</span>
                      <span className="text-emerald-400 text-xs">{k.change}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Claude narrative */}
            {weeklyReport.narrative && (
              <div className="mt-4 pt-4 border-t border-[#2A2040]">
                <h3 className="text-sm font-medium text-gray-400 mb-2">Summary</h3>
                <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{weeklyReport.narrative}</p>
              </div>
            )}
          </div>
        )}

        {/* Time Frame Toggle (Feature 1) */}
        <div className="flex items-center gap-1 mb-6 bg-[#1A1228] border border-[#2A2040] rounded-lg p-1 w-fit">
          {([
            { key: "7d" as TimeFrame, label: "7 Days" },
            { key: "30d" as TimeFrame, label: "30 Days" },
            { key: "90d" as TimeFrame, label: "90 Days" },
            { key: "mom" as TimeFrame, label: "MoM" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTimeFrame(key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                timeFrame === key
                  ? "bg-[#7C3AED] text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#2A2040]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Summary Cards (5 cards, Feature 2) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Pages</p>
            <p className="text-2xl font-bold">
              {summary.total}
              {timeFrame === "mom" && deltaIndicator(summary.total, summary.prev_total)}
            </p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-emerald-400 uppercase tracking-wide mb-1">Working</p>
            <p className="text-2xl font-bold text-emerald-400">
              {summary.working_count}
              {timeFrame === "mom" && deltaIndicator(summary.working_count, summary.prev_working_count)}
            </p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-amber-400 uppercase tracking-wide mb-1">Needs Attention</p>
            <p className="text-2xl font-bold text-amber-400">
              {summary.needs_push_count}
              {timeFrame === "mom" && deltaIndicator(summary.needs_push_count, summary.prev_needs_push_count)}
            </p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-red-400 uppercase tracking-wide mb-1">Not Working</p>
            <p className="text-2xl font-bold text-red-400">
              {summary.not_working_count}
              {timeFrame === "mom" && deltaIndicator(summary.not_working_count, summary.prev_not_working_count)}
            </p>
          </div>
          {/* Feature 2: New vs Returning Visitors Card */}
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-purple-400 uppercase tracking-wide mb-1">Visitors</p>
            <p className="text-sm font-bold">
              <span className="text-emerald-400">New: {(summary.new_visitors_pct ?? 0).toFixed(1)}%</span>
              <span className="text-gray-500 mx-2">|</span>
              <span className="text-blue-400">Returning: {(summary.returning_visitors_pct ?? 0).toFixed(1)}%</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {(summary.new_sessions ?? 0).toLocaleString()} new / {(summary.returning_sessions ?? 0).toLocaleString()} returning
            </p>
          </div>
        </div>

        {/* Filter Tabs (updated with Top Performers) */}
        <div className="flex items-center gap-1 mb-6 bg-[#1A1228] border border-[#2A2040] rounded-lg p-1 w-fit">
          {([
            { key: "all" as StatusFilter, label: "All" },
            { key: "working" as StatusFilter, label: "Working" },
            { key: "needs_push" as StatusFilter, label: "Needs Push" },
            { key: "not_working" as StatusFilter, label: "Not Working" },
            { key: "top_performers" as StatusFilter, label: "Top Performers" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeFilter === key
                  ? "bg-[#7C3AED] text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#2A2040]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Data Table (Feature 3: added Conv column) */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <svg className="animate-spin h-6 w-6 text-purple-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : pages.length === 0 ? (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-900/30 border border-purple-800/30 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium mb-1">No data yet</h3>
            <p className="text-xs text-gray-500 mb-4">
              Click Sync Now to pull your first SEO report from Search Console, GA4, and Ahrefs.
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-5 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
            >
              {syncing ? "Syncing..." : "Sync Now"}
            </button>
            {syncError && (
              <p className="mt-3 text-xs text-red-400">{syncError}</p>
            )}
            {syncSuccess && (
              <p className="mt-3 text-xs text-green-400">{syncSuccess}</p>
            )}
          </div>
        ) : (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0F0A1A] border-b border-[#2A2040]">
                    {([
                      { key: "url" as SortKey, label: "URL", width: "w-[280px]" },
                      { key: "clicks" as SortKey, label: "Clicks", width: "" },
                      { key: "avg_position" as SortKey, label: "Avg Pos", width: "" },
                      { key: "ctr" as SortKey, label: "CTR", width: "" },
                      { key: "sessions" as SortKey, label: "Sessions", width: "" },
                      { key: "engagement_rate" as SortKey, label: "Eng Rate", width: "" },
                      { key: "conversions" as SortKey, label: "Conv", width: "" },
                      { key: "url_rating" as SortKey, label: "UR", width: "" },
                      { key: "backlinks" as SortKey, label: "BL", width: "" },
                      { key: "referring_domains" as SortKey, label: "RD", width: "" },
                      { key: "health_score" as SortKey, label: "Score", width: "" },
                    ]).map(({ key, label, width }) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className={`px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer hover:text-white select-none ${width}`}
                      >
                        {label}{sortIcon(key)}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((page) => (
                    <Fragment key={page.url}>
                      <tr
                        onClick={() => setExpandedUrl(expandedUrl === page.url ? null : page.url)}
                        className="border-b border-[#2A2040] hover:bg-[#2A2040]/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-300 max-w-[280px]">
                          <span className="truncate block" title={page.url}>
                            {truncateUrl(page.url)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">
                          {page.clicks.toLocaleString()}
                          {timeFrame === "mom" && deltaIndicator(page.clicks, page.prev_clicks)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">
                          {page.avg_position.toFixed(1)}
                          {timeFrame === "mom" && deltaIndicator(page.avg_position, page.prev_avg_position)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">
                          {(page.ctr * 100).toFixed(1)}%
                          {timeFrame === "mom" && deltaIndicator(page.ctr, page.prev_ctr)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">
                          {page.sessions.toLocaleString()}
                          {timeFrame === "mom" && deltaIndicator(page.sessions, page.prev_sessions)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">
                          {(page.engagement_rate * 100).toFixed(1)}%
                          {timeFrame === "mom" && deltaIndicator(page.engagement_rate, page.prev_engagement_rate)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">
                          {(page.conversions || 0).toLocaleString()}
                          {timeFrame === "mom" && deltaIndicator(page.conversions || 0, page.prev_conversions)}
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{page.url_rating}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{(page.backlinks || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{(page.referring_domains || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 tabular-nums">
                          <span className={`font-medium ${
                            page.health_score >= 70 ? "text-emerald-400" :
                            page.health_score >= 40 ? "text-amber-400" :
                            "text-red-400"
                          }`}>
                            {page.health_score}
                          </span>
                        </td>
                        <td className="px-4 py-3">{statusBadge(page.status)}</td>
                      </tr>

                      {/* Expanded detail row */}
                      {expandedUrl === page.url && (
                        <tr className="border-b border-[#2A2040]">
                          <td colSpan={12} className="px-6 py-4 bg-[#0F0A1A]">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <p className="text-gray-500 mb-0.5">Full URL</p>
                                <a href={page.url} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline break-all">
                                  {page.url}
                                </a>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-0.5">Impressions</p>
                                <p className="text-gray-300">{page.impressions.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-0.5">Referring Domains</p>
                                <p className="text-gray-300">{page.referring_domains}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-0.5">Synced At</p>
                                <p className="text-gray-300">{new Date(page.synced_at).toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-0.5">Conversions</p>
                                <p className="text-gray-300">{(page.conversions || 0).toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-0.5">New Users</p>
                                <p className="text-gray-300">{(page.new_users || 0).toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-gray-500 mb-0.5">Returning Users</p>
                                <p className="text-gray-300">{(page.returning_users || 0).toLocaleString()}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Filtered count footer */}
            <div className="px-4 py-3 border-t border-[#2A2040] text-xs text-gray-500">
              Showing {filtered.length} of {pages.length} pages
            </div>
          </div>
        )}

        {/* Feature 4: Conversion Impact Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Organic Demos</p>
            <p className="text-2xl font-bold text-purple-400">{totalConversions.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-1">Total conversions across all pages</p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Conversion Rate</p>
            <p className="text-2xl font-bold text-purple-400">{conversionRate.toFixed(2)}%</p>
            <p className="text-xs text-gray-500 mt-1">{totalConversions.toLocaleString()} conversions / {totalSessions.toLocaleString()} sessions</p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Top Converting Pages</p>
            {topConvertingPages.length === 0 ? (
              <p className="text-xs text-gray-500">No conversions recorded yet</p>
            ) : (
              <div className="space-y-2">
                {topConvertingPages.map((p) => (
                  <div key={p.url} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300 truncate max-w-[65%]" title={p.url}>{truncateUrl(p.url)}</span>
                    <span className="text-purple-400 font-medium">{p.conversions}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feature 5: AI Search Visibility Placeholder */}
        <div className="mt-8">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">AI Search Visibility</h2>
              <p className="text-sm text-gray-500 mt-1">AI citation tracking coming soon</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2A2040]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Query</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Mentioned</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Last Checked</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center">
                      <div className="border-2 border-dashed border-[#2A2040] rounded-lg py-8 px-4">
                        <p className="text-gray-500 text-sm">No AI search data available yet.</p>
                        <p className="text-gray-600 text-xs mt-1">This feature will track when your content is cited by AI search engines.</p>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Feature 6: Keyword Watchlist */}
        <div className="mt-8">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Keyword Watchlist</h2>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddKeyword(); }}
                  placeholder="Add keyword..."
                  className="px-3 py-1.5 text-sm bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#7C3AED] transition-colors"
                />
                <button
                  onClick={handleAddKeyword}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {keywords.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No keywords tracked yet. Add a keyword to start monitoring its position.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2A2040]">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Keyword</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Position</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Prev Pos</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Change</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Impressions</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Clicks</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">CTR</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {keywords.map((kw) => {
                      const change = kw.prev_position - kw.avg_position;
                      return (
                        <tr key={kw.keyword} className="border-b border-[#2A2040] hover:bg-[#2A2040]/50 transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-medium">{kw.keyword}</td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">{kw.avg_position.toFixed(1)}</td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">{kw.prev_position.toFixed(1)}</td>
                          <td className="px-4 py-3 tabular-nums">
                            {change > 0 ? (
                              <span className="text-emerald-400">
                                <span className="mr-0.5">&#9650;</span>{change.toFixed(1)}
                              </span>
                            ) : change < 0 ? (
                              <span className="text-red-400">
                                <span className="mr-0.5">&#9660;</span>{Math.abs(change).toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">{kw.impressions.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">{kw.clicks.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-300 tabular-nums">{(kw.ctr * 100).toFixed(1)}%</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRemoveKeyword(kw.keyword); }}
                              className="text-gray-500 hover:text-red-400 transition-colors text-xs"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        </>}
      </div>
    </div>
  );
}
