"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

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
  health_score: number;
  status: "working" | "needs_push" | "not_working";
  synced_at: string;
  created_at: string;
}

interface Summary {
  total: number;
  working_count: number;
  needs_push_count: number;
  not_working_count: number;
  last_synced: string | null;
}

type StatusFilter = "all" | "working" | "needs_push" | "not_working";
type SortKey = "url" | "clicks" | "avg_position" | "ctr" | "sessions" | "engagement_rate" | "url_rating" | "health_score";

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function SeoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [pages, setPages] = useState<PageMetrics[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, working_count: 0, needs_push_count: 0, not_working_count: 0, last_synced: null });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortKey>("health_score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  // ─── Data fetching ─────────────────────────────────────────────────────────

  async function loadDashboard() {
    try {
      const res = await fetch("/api/seo/dashboard");
      if (res.ok) {
        const data = await res.json();
        setPages(data.pages || []);
        setSummary(data.summary || summary);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/seo/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Sync failed");
      }
      // Reload dashboard data
      await loadDashboard();
    } catch {
      setSyncError("Sync request failed");
    }
    setSyncing(false);
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Filtering & sorting (must be before early returns for hooks rules) ───

  const filtered = useMemo(() => {
    let result = pages;
    if (activeFilter !== "all") {
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

        {/* Sync error */}
        {syncError && (
          <div className="mb-6 p-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
            {syncError}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Pages</p>
            <p className="text-2xl font-bold">{summary.total}</p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-emerald-400 uppercase tracking-wide mb-1">Working</p>
            <p className="text-2xl font-bold text-emerald-400">{summary.working_count}</p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-amber-400 uppercase tracking-wide mb-1">Needs Attention</p>
            <p className="text-2xl font-bold text-amber-400">{summary.needs_push_count}</p>
          </div>
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
            <p className="text-xs text-red-400 uppercase tracking-wide mb-1">Not Working</p>
            <p className="text-2xl font-bold text-red-400">{summary.not_working_count}</p>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-[#1A1228] border border-[#2A2040] rounded-lg p-1 w-fit">
          {([
            { key: "all" as StatusFilter, label: "All" },
            { key: "working" as StatusFilter, label: "Working" },
            { key: "needs_push" as StatusFilter, label: "Needs Push" },
            { key: "not_working" as StatusFilter, label: "Not Working" },
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

        {/* Data Table */}
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
                      { key: "url_rating" as SortKey, label: "UR", width: "" },
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
                    <>
                      <tr
                        key={page.url}
                        onClick={() => setExpandedUrl(expandedUrl === page.url ? null : page.url)}
                        className="border-b border-[#2A2040] hover:bg-[#2A2040]/50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-300 max-w-[280px]">
                          <span className="truncate block" title={page.url}>
                            {truncateUrl(page.url)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{page.clicks.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{page.avg_position.toFixed(1)}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{(page.ctr * 100).toFixed(1)}%</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{page.sessions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{(page.engagement_rate * 100).toFixed(1)}%</td>
                        <td className="px-4 py-3 text-gray-300 tabular-nums">{page.url_rating}</td>
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
                        <tr key={`${page.url}-detail`} className="border-b border-[#2A2040]">
                          <td colSpan={9} className="px-6 py-4 bg-[#0F0A1A]">
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
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
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
      </div>
    </div>
  );
}
