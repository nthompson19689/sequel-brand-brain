"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ASSET_TYPE_LABELS: Record<string, string> = {
  blog: "Blog Post",
  email: "Email",
  linkedin: "LinkedIn Post",
  sales_enablement: "Sales One-Pager",
  website: "Website Copy",
  faq: "FAQ",
  video_script: "Video Script",
  slack_internal: "Internal Slack",
  thought_leadership: "Thought Leadership",
  social: "Social Posts",
};

function bucket(dateStr: string | null): string {
  if (!dateStr) return "Unscheduled";
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((dDay.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return "This week";
  if (diff <= 30) return "This month";
  return "Later";
}

const BUCKET_ORDER = ["Overdue", "Today", "Tomorrow", "This week", "This month", "Later", "Unscheduled"];

export default function CampaignTodoPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPosted, setShowPosted] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/schedule?status=approved`);
    if (res.ok) {
      const data = await res.json();
      setAssets(data.assets || []);
    }
    // also include published if showPosted
    if (showPosted) {
      const r2 = await fetch(`/api/campaigns/schedule?status=published`);
      if (r2.ok) {
        const d2 = await r2.json();
        setAssets((prev) => [...prev, ...(d2.assets || [])]);
      }
    }
    setLoading(false);
  }, [showPosted]);

  useEffect(() => { load(); }, [load]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function markPosted(asset: any) {
    await fetch(`/api/campaigns/${asset.campaign_id}/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posted_at: new Date().toISOString(), status: "published" }),
    });
    await load();
  }

  const grouped: Record<string, any[]> = {};
  for (const a of assets) {
    const key = bucket(a.scheduled_at);
    (grouped[key] ||= []).push(a);
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Posting To-Do</h1>
            <p className="text-sm text-gray-400 mt-1">Approved assets across all campaigns, sorted by when they need to go live.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-gray-400">
              <input type="checkbox" checked={showPosted} onChange={(e) => { setShowPosted(e.target.checked); setLoading(true); }} />
              Show posted
            </label>
            <Link href="/campaigns" className="text-xs text-purple-400 hover:text-purple-300">All campaigns →</Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : assets.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-12">No approved assets yet. Approve assets in a campaign to add them here.</p>
        ) : (
          <div className="space-y-6">
            {BUCKET_ORDER.filter((k) => grouped[k]?.length).map((k) => (
              <div key={k}>
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{k} <span className="text-gray-600">({grouped[k].length})</span></h2>
                <div className="space-y-2">
                  {grouped[k].map((a) => (
                    <div key={a.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4 flex items-center gap-4">
                      <div className="text-center w-16 shrink-0">
                        <div className="text-[10px] text-gray-500 uppercase">{a.scheduled_at ? new Date(a.scheduled_at).toLocaleDateString(undefined, { month: "short" }) : "—"}</div>
                        <div className="text-lg font-semibold text-white">{a.scheduled_at ? new Date(a.scheduled_at).getDate() : "—"}</div>
                        <div className="text-[10px] text-gray-500">{a.scheduled_at ? new Date(a.scheduled_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-semibold text-white">{ASSET_TYPE_LABELS[a.asset_type] || a.asset_type}</span>
                          {a.posted_at && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-400">posted</span>}
                        </div>
                        {a.title && <p className="text-xs text-gray-300 truncate">{a.title}</p>}
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                          {a.campaigns?.name ? `${a.campaigns.name} · ` : ""}
                          {a.channel || <span className="text-amber-500">No channel set</span>}
                          {a.channel_url ? <> · <a href={a.channel_url} target="_blank" rel="noreferrer" className="text-purple-400 hover:underline">link</a></> : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {a.body && <button onClick={() => navigator.clipboard.writeText(a.body)} className="px-2 py-1 text-[10px] font-medium text-gray-400 border border-[#2A2040] rounded hover:bg-[#0F0A1A]">Copy</button>}
                        <Link href={`/campaigns/${a.campaign_id}`} className="px-2 py-1 text-[10px] font-medium text-gray-300 border border-[#2A2040] rounded hover:bg-[#0F0A1A]">Open</Link>
                        {!a.posted_at && (
                          <button onClick={() => markPosted(a)} className="px-2 py-1 text-[10px] font-medium text-blue-400 border border-blue-800/30 rounded hover:bg-blue-900/20">Mark Posted</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
