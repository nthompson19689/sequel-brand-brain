"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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
  new_content_count?: number;
  review_rating?: number;
  recent_hiring_count?: number;
  created_at: string;
}

interface Digest {
  id: string;
  content: string;
  created_at: string;
}

interface Finding {
  id: string;
  competitor_id: string;
  competitor_name: string;
  title: string;
  significance: "high" | "medium" | "low";
  scan_type: string;
  created_at: string;
}

interface ScanProgress {
  competitor_id: string;
  competitor_name: string;
  method: string;
  status: "pending" | "running" | "done" | "error";
  message?: string;
}

// ── Add Competitor Modal ──────────────────────────
function AddCompetitorModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [pricingUrl, setPricingUrl] = useState("");
  const [careersUrl, setCareersUrl] = useState("");
  const [g2Url, setG2Url] = useState("");
  const [changelogUrl, setChangelogUrl] = useState("");
  const [eventsUrl, setEventsUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const derivedDomain = (() => {
    try {
      if (!websiteUrl) return "";
      const url = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return "";
    }
  })();

  async function handleSave() {
    if (!name || !websiteUrl) return;
    setSaving(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          website_url: websiteUrl,
          domain: derivedDomain,
          pricing_url: pricingUrl || undefined,
          careers_url: careersUrl || undefined,
          g2_url: g2Url || undefined,
          changelog_url: changelogUrl || undefined,
          events_url: eventsUrl || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save competitor");
      setName("");
      setWebsiteUrl("");
      setPricingUrl("");
      setCareersUrl("");
      setG2Url("");
      setChangelogUrl("");
      setEventsUrl("");
      onSaved();
      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save competitor. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1A1228] border border-[#2A2040] rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Competitor</h2>
          <button onClick={onClose} className="text-[#6B6680] hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[#A09CB0] mb-1.5">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-[#A09CB0] mb-1.5">Website URL *</label>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://acme.com"
              className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
            />
            {derivedDomain && (
              <p className="text-xs text-[#6B6680] mt-1">Domain: {derivedDomain}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-[#A09CB0] mb-1.5">Pricing URL</label>
              <input
                value={pricingUrl}
                onChange={(e) => setPricingUrl(e.target.value)}
                placeholder="https://acme.com/pricing"
                className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#A09CB0] mb-1.5">Careers URL</label>
              <input
                value={careersUrl}
                onChange={(e) => setCareersUrl(e.target.value)}
                placeholder="https://acme.com/careers"
                className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#A09CB0] mb-1.5">G2 URL</label>
              <input
                value={g2Url}
                onChange={(e) => setG2Url(e.target.value)}
                placeholder="https://g2.com/products/acme"
                className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm text-[#A09CB0] mb-1.5">Changelog URL</label>
              <input
                value={changelogUrl}
                onChange={(e) => setChangelogUrl(e.target.value)}
                placeholder="https://acme.com/changelog"
                className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-[#A09CB0] mb-1.5">Events URL</label>
              <input
                value={eventsUrl}
                onChange={(e) => setEventsUrl(e.target.value)}
                placeholder="https://acme.com/events"
                className="w-full px-3 py-2.5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg text-white text-sm placeholder:text-[#4A4560] focus:outline-none focus:border-[#7C3AED] transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#A09CB0] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name || !websiteUrl}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save Competitor"}
          </button>
        </div>
      </div>
    </div>
  );
}

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

// ── Main Page ──────────────────────────────────────
export default function CompetitorsPage() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress[]>([]);
  const [scanning, setScanning] = useState(false);
  const [generatingDigest, setGeneratingDigest] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Load all data ──
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [compRes, digestRes, findingsRes] = await Promise.all([
        fetch("/api/competitors"),
        fetch("/api/competitors/digests?limit=1"),
        fetch("/api/competitors/results?significance=high&limit=10"),
      ]);

      if (compRes.ok) {
        const data = await compRes.json();
        setCompetitors(data.competitors || []);
      }
      if (digestRes.ok) {
        const data = await digestRes.json();
        setDigest(data.digests?.[0] || null);
      }
      if (findingsRes.ok) {
        const data = await findingsRes.json();
        setFindings(data.results || []);
      }
      setError(null);
    } catch (err) {
      console.error("Failed to load competitors data:", err);
      setError("Failed to load competitor intelligence data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [loadData]);

  // ── Scan actions ──
  async function runScan(competitorId?: string) {
    setScanning(true);
    setScanProgress([]);

    try {
      const body = competitorId
        ? { competitor_id: competitorId }
        : { scan_all: true };

      const res = await fetch("/api/competitors/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to start scan");
      }

      // The API returns an SSE stream directly — read it from the response body
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "scan_complete") {
              // Scan finished
              continue;
            }

            if (event.type === "error") {
              console.error("Scan error:", event.error);
              continue;
            }

            // Treat as progress update
            if (event.competitor_id || event.competitor_name || event.method) {
              const progress: ScanProgress = {
                competitor_id: event.competitor_id || "",
                competitor_name: event.competitor_name || event.name || event.competitor || "",
                method: event.method || "",
                status: event.status || event.type || "running",
                message: event.message || "",
              };
              setScanProgress((prev) => {
                const idx = prev.findIndex(
                  (p) => p.competitor_id === progress.competitor_id && p.method === progress.method
                );
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = progress;
                  return next;
                }
                return [...prev, progress];
              });
            }
          } catch {
            // Ignore unparseable lines
          }
        }
      }

      // Stream finished — reload data
      setScanning(false);
      loadData();
    } catch (err) {
      console.error("Scan failed:", err);
      alert("Failed to start scan. Try again.");
      setScanning(false);
    }
  }

  async function generateDigest() {
    setGeneratingDigest(true);
    try {
      const res = await fetch("/api/competitors/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to generate digest");
      loadData();
    } catch (err) {
      console.error("Digest generation failed:", err);
      alert("Failed to generate digest. Try again.");
    } finally {
      setGeneratingDigest(false);
    }
  }

  async function deleteCompetitor(id: string) {
    if (!confirm("Delete this competitor and all its data?")) return;
    try {
      const res = await fetch(`/api/competitors?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setCompetitors((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete competitor.");
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] p-8">
      {/* Add Competitor Modal */}
      <AddCompetitorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={loadData}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Competitor Intelligence</h1>
          <p className="mt-1 text-sm text-[#A09CB0]">
            Track competitors, scan for changes, and generate strategic digests.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={generateDigest}
            disabled={generatingDigest || competitors.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-xl hover:text-white hover:border-[#3A3050] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            {generatingDigest ? "Generating..." : "Generate Digest"}
          </button>
          <button
            onClick={() => runScan()}
            disabled={scanning || competitors.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#A09CB0] bg-[#1A1228] border border-[#2A2040] rounded-xl hover:text-white hover:border-[#3A3050] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            {scanning ? "Scanning..." : "Run All Scans"}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Competitor
          </button>
        </div>
      </div>

      {/* Scan Progress Panel */}
      {scanning && scanProgress.length > 0 && (
        <div className="mb-6 bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-[#7C3AED] animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            <h3 className="text-sm font-semibold text-white">Scan in Progress</h3>
          </div>
          <div className="space-y-2">
            {scanProgress.map((p, i) => (
              <div key={`${p.competitor_id}-${p.method}-${i}`} className="flex items-center gap-3 text-sm">
                <span className="text-[#A09CB0] w-32 truncate">{p.competitor_name}</span>
                <span className="text-[#6B6680] w-24 truncate">{p.method}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    p.status === "done"
                      ? "bg-green-500/20 text-green-400"
                      : p.status === "running"
                      ? "bg-[#7C3AED]/20 text-[#7C3AED]"
                      : p.status === "error"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-[#2A2040] text-[#6B6680]"
                  }`}
                >
                  {p.status}
                </span>
                {p.message && <span className="text-[#6B6680] text-xs truncate">{p.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-3 py-16 justify-center text-[#A09CB0]">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading competitor data...
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="text-center py-16">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button onClick={loadData} className="text-sm text-[#7C3AED] hover:text-[#6D28D9]">
            Retry
          </button>
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {/* Competitor Cards Grid */}
          {competitors.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#1A1228] border border-[#2A2040] flex items-center justify-center">
                <svg className="w-8 h-8 text-[#4A4560]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </div>
              <p className="text-[#A09CB0] text-sm mb-2">No competitors tracked yet.</p>
              <p className="text-[#6B6680] text-xs mb-4">Add your first competitor to start gathering intelligence.</p>
              <button
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Competitor
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {competitors.map((comp) => (
                <div
                  key={comp.id}
                  className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 hover:border-[#3A3050] transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-white font-semibold text-sm">{comp.name}</h3>
                      <p className="text-[#6B6680] text-xs mt-0.5">{comp.domain}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => deleteCompetitor(comp.id)}
                        className="p-1.5 rounded-md text-[#6B6680] hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="flex items-center gap-4 mb-4 text-xs">
                    {comp.new_content_count !== undefined && (
                      <div className="flex items-center gap-1 text-[#A09CB0]">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        {comp.new_content_count} new
                      </div>
                    )}
                    {comp.review_rating !== undefined && (
                      <div className="flex items-center gap-1 text-[#A09CB0]">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                        </svg>
                        {comp.review_rating.toFixed(1)}
                      </div>
                    )}
                    {comp.recent_hiring_count !== undefined && (
                      <div className="flex items-center gap-1 text-[#A09CB0]">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                        </svg>
                        {comp.recent_hiring_count} roles
                      </div>
                    )}
                  </div>

                  {comp.last_scanned_at && (
                    <p className="text-[10px] text-[#4A4560] mb-3">
                      Last scanned {new Date(comp.last_scanned_at).toLocaleDateString()}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => runScan(comp.id)}
                      disabled={scanning}
                      className="flex-1 px-3 py-2 text-xs font-medium text-[#A09CB0] bg-[#0F0A1A] border border-[#2A2040] rounded-lg hover:text-white hover:border-[#3A3050] disabled:opacity-50 transition-colors"
                    >
                      Scan Now
                    </button>
                    <a
                      href={`/competitors/${comp.id}`}
                      className="flex-1 px-3 py-2 text-xs font-medium text-center text-[#7C3AED] bg-[#7C3AED]/10 border border-[#7C3AED]/20 rounded-lg hover:bg-[#7C3AED]/20 transition-colors"
                    >
                      View Details
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Latest Digest */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">Latest Digest</h2>
            {digest ? (
              <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                <p className="text-[10px] text-[#4A4560] mb-3">
                  Generated {new Date(digest.created_at).toLocaleDateString()}
                </p>
                <div className="text-sm text-[#A09CB0] leading-relaxed whitespace-pre-wrap">
                  {digest.content}
                </div>
              </div>
            ) : (
              <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 text-center">
                <p className="text-sm text-[#6B6680]">
                  No digests yet &mdash; run scans first, then generate a digest.
                </p>
              </div>
            )}
          </div>

          {/* Recent High-Significance Findings */}
          {findings.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-3">
                Recent High-Significance Findings
              </h2>
              <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl divide-y divide-[#2A2040]">
                {findings.map((f) => (
                  <div key={f.id} className="px-5 py-3.5 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{f.title}</p>
                      <p className="text-xs text-[#6B6680] mt-0.5">{f.competitor_name} &middot; {f.scan_type}</p>
                    </div>
                    <SignificanceBadge level={f.significance} />
                    <span className="text-[10px] text-[#4A4560] shrink-0">
                      {new Date(f.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
