"use client";

import { useState, useEffect } from "react";

const CHANNEL_ICONS: Record<string, string> = {
  email: "📧", linkedin_connect: "🔗", linkedin_inmail: "💬", sms: "📱", call: "📞",
};

export default function TodayView() {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [data, setData] = useState<{ send: any[]; research: any[]; follow_up: any[]; review: any[] }>({
    send: [], research: [], follow_up: [], review: [],
  });
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/outbound/today");
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const totalActions = data.send.length + data.research.length + data.follow_up.length + data.review.length;

  async function handleAction(messageId: string, action: string) {
    await fetch("/api/outbound/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId, action }),
    });
    setCompletedCount((c) => c + 1);
  }

  if (loading) return <div className="text-center py-12 text-gray-500 text-sm">Loading today&apos;s actions...</div>;

  const sections = [
    { title: "Send These", emoji: "📤", items: data.send, color: "text-purple-400", type: "send" as const },
    { title: "Research These", emoji: "🔍", items: data.research, color: "text-blue-400", type: "research" as const },
    { title: "Follow Up On These", emoji: "💬", items: data.follow_up, color: "text-amber-400", type: "follow_up" as const },
    { title: "Review These", emoji: "📋", items: data.review, color: "text-cyan-400", type: "review" as const },
  ];

  return (
    <div>
      {/* Progress bar */}
      {totalActions > 0 && (
        <div className="mb-6 bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">Today&apos;s Progress</span>
            <span className="text-xs text-gray-400">{completedCount} of {totalActions} done</span>
          </div>
          <div className="h-2 bg-[#0F0A1A] rounded-full overflow-hidden">
            <div className="h-full bg-[#7C3AED] transition-all duration-300 rounded-full" style={{ width: `${totalActions > 0 ? (completedCount / totalActions) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {totalActions === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-sm">Nothing due today. Add prospects and generate sequences to get started.</p>
        </div>
      )}

      {sections.map((section) => section.items.length > 0 && (
        <div key={section.type} className="mb-6">
          <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${section.color}`}>
            {section.emoji} {section.title} ({section.items.length})
          </h3>
          <div className="space-y-2">
            {section.items.map((item: any) => {
              const prospect = item.prospects || item;
              const name = prospect.first_name
                ? `${prospect.first_name} ${prospect.last_name}`
                : `${item.first_name || ""} ${item.last_name || ""}`.trim();

              return (
                <div key={item.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium text-white">{name}</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {prospect.company_name || item.company_name || ""}
                      </span>
                    </div>
                    {item.channel && (
                      <span className="text-xs text-gray-500">
                        {CHANNEL_ICONS[item.channel] || ""} {item.channel.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {/* Message preview for send/review items */}
                  {(section.type === "send" || section.type === "review") && item.body && (
                    <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3 mb-3">
                      {item.subject_line && <p className="text-[10px] text-gray-500 mb-1">Subject: {item.subject_line}</p>}
                      <p className="text-xs text-gray-300 line-clamp-3">{item.edited_body || item.body}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {section.type === "review" && (
                      <button onClick={() => handleAction(item.id, "approve")} className="px-2.5 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20 transition-colors">Approve</button>
                    )}
                    {section.type === "send" && (
                      <button onClick={() => handleAction(item.id, "send")} className="px-2.5 py-1 text-[10px] font-medium text-white bg-[#7C3AED] rounded hover:bg-[#6D28D9] transition-colors">Mark Sent</button>
                    )}
                    {item.body && (
                      <button onClick={() => navigator.clipboard.writeText(item.edited_body || item.body)} className="px-2.5 py-1 text-[10px] font-medium text-gray-400 border border-[#2A2040] rounded hover:bg-[#1A1228] transition-colors">Copy</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
