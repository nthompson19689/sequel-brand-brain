"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

// ── Types ──────────────────────────────────────────
interface Competitor {
  id: string;
  name: string;
  domain: string;
  website_url: string;
  pricing_url?: string;
  careers_url?: string;
  g2_url?: string;
  changelog_url?: string;
  events_url?: string;
  last_scanned_at?: string;
  created_at: string;
}

interface ScanResult {
  id: string;
  competitor_id: string;
  scan_type: string;
  title: string;
  summary: string;
  details?: string;
  url?: string;
  significance: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
  created_at: string;
}

type TabKey = "overview" | "content" | "hiring" | "reviews" | "news" | "pricing";

const TABS: { key: TabKey; label: string; scanType?: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "content", label: "Content", scanType: "sitemap" },
  { key: "hiring", label: "Hiring", scanType: "careers" },
  { key: "reviews", label: "Reviews", scanType: "g2_reviews" },
  { key: "news", label: "News", scanType: "news" },
  { key: "pricing", label: "Pricing", scanType: "pricing" },
];

// ── Significance Badge ──────────────────────────────
function SignificanceBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    high: "bg-red-500/20 text-red-400 border-red-500/30",
    medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    low: "bg-green-500/20 text-green-400 border-green-500/30",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${colors[level] || colors.low}`}>
      {level}
    </span>
  );
}

// ── Result Card ──────────────────────────────────────
function ResultCard({ result }: { result: ScanResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4 hover:border-[#3A3050] transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white">{result.title}</h4>
          {result.url && (
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#7C3AED] hover:underline mt-0.5 inline-block truncate max-w-xs"
            >
              {result.url}
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SignificanceBadge level={result.significance} />
          <span className="text-[10px] text-[#4A4560]">
            {new Date(result.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <p className="text-sm text-[#A09CB0] leading-relaxed">{result.summary}</p>
      {result.details && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
          >
            {expanded ? "Show less" : "Show more"}
          </button>
          {expanded && (
            <div className="mt-2 p-3 bg-[#0F0A1A] rounded-lg text-xs text-[#A09CB0] leading-relaxed whitespace-pre-wrap">
              {result.details}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────
export default function CompetitorDetailPage() {
  const params = useParams();
  const competitorId = params.id as string;

  const [competitor, setCompetitor] = useState<Competitor | null>(null);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  // ── Load competitor ──
  const loadCompetitor = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/competitors?id=${competitorId}`);
      if (!res.ok) throw new Error("Failed to fetch competitor");
      const data = await res.json();
      setCompetitor(data.competitor || null);
      setError(null);
    } catch (err) {
      console.error("Failed to load competitor:", err);
      setError("Failed to load competitor details.");
    } finally {
      setLoading(false);
    }
  }, [competitorId]);

  // ── Load results for active tab ──
  const loadResults = useCallback(async () => {
    try {
      setResultsLoading(true);
      const tabDef = TABS.find((t) => t.key === activeTab);
      const scanTypeParam = tabDef?.scanType ? `&scan_type=${tabDef.scanType}` : "";
      const res = await fetch(
        `/api/competitors/results?competitor_id=${competitorId}${scanTypeParam}&limit=50`
      );
      if (!res.ok) throw new Error("Failed to fetch results");
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Failed to load results:", err);
    } finally {
      setResultsLoading(false);
    }
  }, [competitorId, activeTab]);

  useEffect(() => {
    loadCompetitor();
    return () => {
      // cleanup
    };
  }, [loadCompetitor]);

  useEffect(() => {
    if (competitor) loadResults();
  }, [competitor, loadResults]);

  // ── Scan ──
  async function runScan() {
    setScanning(true);
    try {
      const res = await fetch("/api/competitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitor_id: competitorId }),
      });
      if (!res.ok) throw new Error("Failed to start scan");

      // The API returns an SSE stream directly — read it
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "scan_complete" || event.type === "error") {
              break;
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setScanning(false);
      loadCompetitor();
      loadResults();
    } catch (err) {
      console.error("Scan failed:", err);
      alert("Failed to start scan.");
      setScanning(false);
    }
  }

  // ── Group results by scan type for overview ──
  const resultsByScanType = results.reduce<Record<string, ScanResult[]>>((acc, r) => {
    if (!acc[r.scan_type]) acc[r.scan_type] = [];
    acc[r.scan_type].push(r);
    return acc;
  }, {});

  const SCAN_TYPE_LABELS: Record<string, string> = {
    sitemap: "Content & Sitemap",
    careers: "Hiring & Careers",
    g2_reviews: "G2 Reviews",
    news: "News & Announcements",
    pricing: "Pricing Changes",
    changelog: "Changelog",
    events: "Events",
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0A1A] flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#A09CB0]">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading competitor...
        </div>
      </div>
    );
  }

  if (error || !competitor) {
    return (
      <div className="min-h-screen bg-[#0F0A1A] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error || "Competitor not found."}</p>
          <Link href="/competitors" className="text-sm text-[#7C3AED] hover:text-[#6D28D9]">
            Back to Competitors
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] p-8">
      {/* Breadcrumb + Header */}
      <div className="mb-6">
        <Link
          href="/competitors"
          className="inline-flex items-center gap-1.5 text-xs text-[#6B6680] hover:text-[#A09CB0] transition-colors mb-3"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Competitors
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">{competitor.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-sm text-[#6B6680]">{competitor.domain}</span>
              {competitor.last_scanned_at && (
                <span className="text-xs text-[#4A4560]">
                  Last scanned {new Date(competitor.last_scanned_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
          >
            <svg className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            {scanning ? "Scanning..." : "Scan Now"}
          </button>
        </div>
      </div>

      {/* URL Links */}
      <div className="flex flex-wrap gap-2 mb-6">
        {competitor.website_url && (
          <a href={competitor.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] transition-colors">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>
            Website
          </a>
        )}
        {competitor.pricing_url && (
          <a href={competitor.pricing_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] transition-colors">
            Pricing
          </a>
        )}
        {competitor.careers_url && (
          <a href={competitor.careers_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] transition-colors">
            Careers
          </a>
        )}
        {competitor.g2_url && (
          <a href={competitor.g2_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] transition-colors">
            G2
          </a>
        )}
        {competitor.changelog_url && (
          <a href={competitor.changelog_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] transition-colors">
            Changelog
          </a>
        )}
        {competitor.events_url && (
          <a href={competitor.events_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] transition-colors">
            Events
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 border-b border-[#2A2040]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab.key
                ? "text-white"
                : "text-[#6B6680] hover:text-[#A09CB0]"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#7C3AED] rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {resultsLoading ? (
        <div className="flex items-center gap-3 py-12 justify-center text-[#A09CB0]">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading results...
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#6B6680] text-sm">
            No {activeTab === "overview" ? "" : activeTab + " "}results yet. Run a scan to gather intelligence.
          </p>
        </div>
      ) : activeTab === "overview" ? (
        /* Overview: grouped by scan type */
        <div className="space-y-8">
          {Object.entries(resultsByScanType).map(([scanType, items]) => (
            <div key={scanType}>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                {SCAN_TYPE_LABELS[scanType] || scanType}
              </h3>
              <div className="space-y-3">
                {items.slice(0, 5).map((r) => (
                  <ResultCard key={r.id} result={r} />
                ))}
                {items.length > 5 && (
                  <button
                    onClick={() => {
                      const tab = TABS.find((t) => t.scanType === scanType);
                      if (tab) setActiveTab(tab.key);
                    }}
                    className="text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
                  >
                    View all {items.length} results
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Filtered tab: show all results */
        <div className="space-y-3">
          {results.map((r) => (
            <ResultCard key={r.id} result={r} />
          ))}
        </div>
      )}
    </div>
  );
}
