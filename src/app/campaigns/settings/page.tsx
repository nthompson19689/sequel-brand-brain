"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ASSET_TYPES = [
  { id: "blog", label: "Blog Post" },
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn Post" },
  { id: "sales_enablement", label: "Sales One-Pager" },
  { id: "website", label: "Website Copy" },
  { id: "faq", label: "FAQ" },
  { id: "video_script", label: "Video Script" },
  { id: "slack_internal", label: "Internal Slack" },
  { id: "thought_leadership", label: "Thought Leadership" },
  { id: "social", label: "Social Posts" },
];

export default function WriterOverridesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [overrides, setOverrides] = useState<Record<string, { prompt: string; enabled: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<string>("blog");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns/writer-overrides");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, { prompt: string; enabled: boolean }> = {};
        for (const o of data.overrides || []) {
          map[o.asset_type] = { prompt: o.prompt || "", enabled: o.enabled !== false };
        }
        setOverrides(map);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  const current = overrides[activeType] || { prompt: "", enabled: true };

  function updateLocal(field: "prompt" | "enabled", value: any) {
    setOverrides((prev) => ({
      ...prev,
      [activeType]: { ...current, [field]: value },
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns/writer-overrides", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_type: activeType,
          prompt: current.prompt,
          enabled: current.enabled,
        }),
      });
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString());
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <button onClick={() => router.push("/campaigns")} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          Back to campaigns
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Writer Guidelines</h1>
          <p className="text-sm text-gray-400 mt-1">Sequel-specific instructions per asset type. These layer on top of the base agent prompt and Brand Brain on every generation.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading…</div>
        ) : (
          <div className="grid grid-cols-[220px_1fr] gap-6">
            {/* Sidebar */}
            <div className="space-y-1">
              {ASSET_TYPES.map((t) => {
                const has = overrides[t.id]?.prompt?.trim().length > 0;
                const enabled = overrides[t.id]?.enabled !== false;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setActiveType(t.id); setSavedAt(null); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                      activeType === t.id ? "bg-[#7C3AED] text-white" : "text-gray-300 hover:bg-[#1A1228]"
                    }`}
                  >
                    <span>{t.label}</span>
                    {has && (
                      <span
                        title={enabled ? "Active" : "Disabled"}
                        className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-gray-500"}`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Editor */}
            <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">{ASSET_TYPES.find((t) => t.id === activeType)?.label}</h2>
                  <p className="text-[11px] text-gray-500">
                    Appended after the base agent prompt. Brand Brain still applies on top of everything.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.enabled}
                    onChange={(e) => updateLocal("enabled", e.target.checked)}
                    className="rounded border-[#2A2040] bg-[#0F0A1A]"
                  />
                  Enabled
                </label>
              </div>
              <textarea
                value={current.prompt}
                onChange={(e) => updateLocal("prompt", e.target.value)}
                rows={28}
                placeholder="Paste your Sequel-specific instructions for this asset type. Role, structure, tone, banned words, etc. The base prompt already enforces JSON output and core voice rules — focus this on what's distinctly Sequel."
                className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-y font-mono"
              />
              <div className="flex items-center justify-between mt-3">
                <p className="text-[11px] text-gray-500">
                  {current.prompt.length.toLocaleString()} chars
                  {savedAt && <span className="text-emerald-400 ml-3">Saved at {savedAt}</span>}
                </p>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
