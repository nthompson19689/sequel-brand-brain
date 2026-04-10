"use client";

import { useState, useEffect } from "react";

interface FeedItem {
  id: string;
  type: "trigger" | "engagement";
  company_name: string;
  detail: string;
  timestamp: string;
  relevance_score?: number;
  trigger_type?: string;
  channel?: string;
  action?: string;
}

const TRIGGER_ICONS: Record<string, string> = {
  funding: "💰",
  leadership_change: "👤",
  job_posting: "📋",
  competitor_mention: "⚔️",
  product_launch: "🚀",
  content_published: "📝",
  event_attendance: "🎤",
};

interface ActivityFeedProps {
  filter?: "all" | "triggers" | "engagement" | "high_priority";
}

export default function ActivityFeed({ filter: initialFilter }: ActivityFeedProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(initialFilter || "all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [triggersRes, engagementRes] = await Promise.all([
          fetch("/api/abm/triggers"),
          fetch("/api/abm/engagement"),
        ]);

        const feed: FeedItem[] = [];

        if (triggersRes.ok) {
          const data = await triggersRes.json();
          for (const t of data.triggers || []) {
            feed.push({
              id: t.id,
              type: "trigger",
              company_name: t.target_accounts?.company_name || "Unknown",
              detail: t.trigger_detail,
              timestamp: t.detected_at,
              relevance_score: t.relevance_score,
              trigger_type: t.trigger_type,
            });
          }
        }

        if (engagementRes.ok) {
          const data = await engagementRes.json();
          for (const e of data.engagement || []) {
            feed.push({
              id: e.id,
              type: "engagement",
              company_name: e.target_accounts?.company_name || "Unknown",
              detail: e.detail || `${e.action} via ${e.channel}`,
              timestamp: e.occurred_at,
              channel: e.channel,
              action: e.action,
            });
          }
        }

        feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setItems(feed);
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  const filtered = items.filter((item) => {
    if (filter === "triggers") return item.type === "trigger";
    if (filter === "engagement") return item.type === "engagement";
    if (filter === "high_priority") return item.type === "trigger" && (item.relevance_score || 0) >= 7;
    return true;
  });

  return (
    <div>
      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-4">
        {(["all", "triggers", "engagement", "high_priority"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === f
                ? "bg-[#7C3AED] text-white"
                : "bg-[#0F0A1A] text-gray-400 border border-[#2A2040] hover:text-white"
            }`}
          >
            {f === "all" ? "All" : f === "triggers" ? "Triggers" : f === "engagement" ? "Engagement" : "High Priority (7+)"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm text-center py-8">Loading activity...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No activity yet.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 bg-[#1A1228] border border-[#2A2040] rounded-lg"
            >
              <span className="text-base mt-0.5">
                {item.type === "trigger"
                  ? TRIGGER_ICONS[item.trigger_type || ""] || "🔔"
                  : item.action === "booked" ? "📅" : item.action === "replied" ? "💬" : "📧"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-white">{item.company_name}</span>
                  {item.relevance_score && item.relevance_score >= 7 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-800/40">
                      Score {item.relevance_score}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{item.detail}</p>
                <p className="text-[10px] text-gray-600 mt-1">
                  {new Date(item.timestamp).toLocaleDateString()} {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
