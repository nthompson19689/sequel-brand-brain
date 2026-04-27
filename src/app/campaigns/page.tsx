"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-800/40 text-gray-400",
  parsed: "bg-amber-900/40 text-amber-400",
  generating: "bg-blue-900/40 text-blue-400",
  ready: "bg-emerald-900/40 text-emerald-400",
  published: "bg-purple-900/40 text-purple-300",
  archived: "bg-gray-900/60 text-gray-500",
};

export default function CampaignsListPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const [name, setName] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [brief, setBrief] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function handleCreate() {
    if (!name.trim()) return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brief: brief.trim(),
          launch_date: launchDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCreateError(err.error || "Failed to create campaign");
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      const campaignId = data.campaign.id;

      // Upload any staged files in parallel
      if (pendingFiles.length > 0) {
        const uploads = pendingFiles.map((f) => {
          const fd = new FormData();
          fd.append("file", f);
          return fetch(`/api/campaigns/${campaignId}/documents`, { method: "POST", body: fd });
        });
        const results = await Promise.all(uploads);
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          // Still navigate, but warn — user can re-upload from detail page
          console.warn(`${failed.length} doc upload(s) failed`);
        }
      }

      router.push(`/campaigns/${campaignId}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create campaign");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Product Launch Campaigns</h1>
            <p className="text-sm text-gray-400 mt-1">Turn a launch brief into a full multi-channel campaign</p>
          </div>
          <button
            onClick={() => setShowNew(!showNew)}
            className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors inline-flex items-center gap-2"
          >
            {showNew ? "← Cancel" : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New Campaign
              </>
            )}
          </button>
        </div>

        {showNew && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">New Campaign</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-400 block mb-1">Campaign Name *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" placeholder="e.g. Sequel Studio launch — Q2" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 block mb-1">Launch Date</label>
                  <input type="date" value={launchDate} onChange={(e) => setLaunchDate(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1">Launch Brief</label>
                <p className="text-[11px] text-gray-500 mb-2">Paste anything: PRD, narrative doc, bullet points, internal Slack thread. The orchestrator will extract product context and propose an asset manifest.</p>
                <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={10} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none" placeholder="What is launching? Who is it for? What are the value props? What proof points do you have?" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1">Reference Documents</label>
                <p className="text-[11px] text-gray-500 mb-2">Optional. PDFs, Word docs, txt, md, or CSVs. Fed into the orchestrator and writers alongside the brief.</p>
                <label className="inline-block px-3 py-1.5 text-xs font-medium text-white bg-[#3F2A6E] rounded-lg cursor-pointer hover:bg-[#4F3A7E] transition-colors">
                  + Add Files
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.md,.csv"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setPendingFiles((prev) => [...prev, ...files]);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
                {pendingFiles.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between bg-[#0F0A1A] border border-[#2A2040] rounded-lg px-3 py-1.5">
                        <span className="text-xs text-white truncate">{f.name} <span className="text-gray-500">({Math.round(f.size / 1024)} KB)</span></span>
                        <button
                          onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-[10px] text-red-400/70 hover:text-red-400"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {createError && <p className="text-xs text-red-400">{createError}</p>}
              <button onClick={handleCreate} disabled={!name.trim() || submitting} className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">
                {submitting ? (pendingFiles.length > 0 ? `Creating & uploading ${pendingFiles.length} doc${pendingFiles.length > 1 ? "s" : ""}…` : "Creating…") : "Create Campaign"}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16 bg-[#1A1228] border border-[#2A2040] rounded-xl">
            <p className="text-sm text-gray-500 mb-4">No campaigns yet. Create one to get started.</p>
            <button onClick={() => setShowNew(true)} className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors">New Campaign</button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const assets = c.campaign_assets || [];
              const ready = assets.filter((a: any) => a.status === "ready" || a.status === "approved").length;
              return (
                <button
                  key={c.id}
                  onClick={() => router.push(`/campaigns/${c.id}`)}
                  className="w-full text-left bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 hover:border-[#7C3AED]/40 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">{c.name}</h3>
                      <p className="text-xs text-gray-500">
                        {c.launch_date ? `Launch ${new Date(c.launch_date).toLocaleDateString()}` : "No launch date"}
                        {" · "}
                        Created {new Date(c.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[c.status] || ""}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-gray-600">
                    <span>{assets.length} assets</span>
                    <span>{ready} ready</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
