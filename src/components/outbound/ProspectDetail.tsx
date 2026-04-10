"use client";

import { useState, useEffect } from "react";

interface ProspectDetailProps {
  prospectId: string;
  onClose: () => void;
  onResearch: (id: string) => void;
  onGenerate: (id: string, sequenceId: string) => void;
  sequences: Array<{ id: string; sequence_name: string }>;
}

const STATUS_OPTIONS = ["researching", "sequenced", "replied", "interested", "booked", "disqualified", "nurture"];

export default function ProspectDetail({ prospectId, onClose, onResearch, onGenerate, sequences }: ProspectDetailProps) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [prospect, setProspect] = useState<any>(null);
  const [research, setResearch] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"research" | "messages" | "engagement">("research");
  const [selectedSequence, setSelectedSequence] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/outbound/prospects/${prospectId}`);
        if (res.ok) {
          const data = await res.json();
          setProspect(data.prospect);
          setResearch(data.research);
          setMessages(data.messages || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [prospectId]);

  async function updateStatus(newStatus: string) {
    await fetch(`/api/outbound/prospects/${prospectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_status: newStatus }),
    });
    setProspect((prev: any) => prev ? { ...prev, prospect_status: newStatus } : prev);
  }

  async function handleMessageAction(messageId: string, action: string, editedBody?: string) {
    await fetch("/api/outbound/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: messageId, action, edited_body: editedBody }),
    });
    // Refresh messages
    const res = await fetch(`/api/outbound/prospects/${prospectId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages || []);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
        <div className="bg-[#1A1228] rounded-2xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      </div>
    );
  }

  if (!prospect) return null;

  const CHANNEL_ICONS: Record<string, string> = {
    email: "📧", linkedin_connect: "🔗", linkedin_inmail: "💬", sms: "📱", call: "📞",
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#0F0A1A] h-full overflow-y-auto border-l border-[#2A2040]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0F0A1A] border-b border-[#2A2040] px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{prospect.first_name} {prospect.last_name}</h2>
              <p className="text-xs text-gray-400">{prospect.title} · {prospect.company_name}</p>
              {prospect.company_domain && (
                <a href={`https://${prospect.company_domain}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-400 hover:underline">{prospect.company_domain}</a>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={prospect.prospect_status}
                onChange={(e) => updateStatus(e.target.value)}
                className="text-xs bg-[#1A1228] border border-[#2A2040] text-white rounded-lg px-2 py-1.5"
              >
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => onResearch(prospect.id)} className="px-3 py-1.5 text-xs font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 transition-colors">
              Research
            </button>
            <select
              value={selectedSequence}
              onChange={(e) => setSelectedSequence(e.target.value)}
              className="text-xs bg-[#1A1228] border border-[#2A2040] text-gray-400 rounded-lg px-2 py-1.5"
            >
              <option value="">Select sequence...</option>
              {sequences.map((s) => <option key={s.id} value={s.id}>{s.sequence_name}</option>)}
            </select>
            <button
              onClick={() => selectedSequence && onGenerate(prospect.id, selectedSequence)}
              disabled={!selectedSequence}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
            >
              Generate Messages
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 border-b border-[#2A2040] -mb-px">
            {(["research", "messages", "engagement"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${tab === t ? "border-[#7C3AED] text-white" : "border-transparent text-gray-500 hover:text-white"}`}>
                {t} {t === "messages" && messages.length > 0 ? `(${messages.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {tab === "research" && (
            <div className="space-y-4">
              {research ? (
                <>
                  {research.recommended_opening && (
                    <div className="bg-purple-900/10 border border-purple-800/30 rounded-xl p-4">
                      <h4 className="text-xs font-semibold text-purple-400 uppercase mb-1">Recommended Opening</h4>
                      <p className="text-sm text-gray-200 italic">&ldquo;{research.recommended_opening}&rdquo;</p>
                    </div>
                  )}
                  {research.company_summary && (
                    <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Company</h4><p className="text-xs text-gray-300 leading-relaxed">{research.company_summary}</p></div>
                  )}
                  {research.role_analysis && (
                    <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Role Analysis</h4><p className="text-xs text-gray-300 leading-relaxed">{research.role_analysis}</p></div>
                  )}
                  {research.personal_hooks?.length > 0 && (
                    <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Personal Hooks</h4>
                      <ul className="space-y-1">{research.personal_hooks.map((h: string, i: number) => <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-purple-400">-</span>{h}</li>)}</ul>
                    </div>
                  )}
                  {research.pain_points?.length > 0 && (
                    <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Pain Points</h4>
                      <ul className="space-y-1">{research.pain_points.map((p: string, i: number) => <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-red-400">-</span>{p}</li>)}</ul>
                    </div>
                  )}
                  {research.timing_triggers?.length > 0 && (
                    <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Timing Triggers</h4>
                      <ul className="space-y-1">{research.timing_triggers.map((t: string, i: number) => <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-amber-400">⚡</span>{t}</li>)}</ul>
                    </div>
                  )}
                  {research.recommended_product_angle && (
                    <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Product Angle</h4><p className="text-xs text-gray-300">{research.recommended_product_angle}</p></div>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No research yet. Click &quot;Research&quot; to generate a prospect brief.</p>
              )}
            </div>
          )}

          {tab === "messages" && (
            <div className="space-y-3">
              {messages.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No messages yet. Select a sequence and click &quot;Generate Messages&quot;.</p>
              ) : messages.map((m: any) => (
                <div key={m.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{CHANNEL_ICONS[m.channel] || "📧"}</span>
                      <span className="text-xs font-semibold text-white">Step {m.step_number}</span>
                      <span className="text-[10px] text-gray-500 capitalize">{m.channel.replace(/_/g, " ")}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      m.status === "sent" ? "bg-blue-900/40 text-blue-400" :
                      m.status === "approved" ? "bg-emerald-900/40 text-emerald-400" :
                      m.status === "replied" || m.status === "positive_reply" ? "bg-amber-900/40 text-amber-400" :
                      m.status === "booked" ? "bg-emerald-900/40 text-emerald-400" :
                      "bg-gray-800/40 text-gray-400"
                    }`}>{m.status}</span>
                  </div>
                  {m.subject_line && <p className="text-xs text-gray-400 mb-1">Subject: {m.subject_line}</p>}
                  <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed mb-3">{m.edited_body || m.body}</p>
                  <div className="flex items-center gap-2">
                    {m.status === "draft" && (
                      <button onClick={() => handleMessageAction(m.id, "approve")} className="px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20 transition-colors">Approve</button>
                    )}
                    {(m.status === "approved" || m.status === "edited") && (
                      <button onClick={() => handleMessageAction(m.id, "send")} className="px-2 py-1 text-[10px] font-medium text-white bg-[#7C3AED] rounded hover:bg-[#6D28D9] transition-colors">Mark Sent</button>
                    )}
                    {m.status === "sent" && (
                      <>
                        <button onClick={() => handleMessageAction(m.id, "replied")} className="px-2 py-1 text-[10px] font-medium text-amber-400 border border-amber-800/30 rounded hover:bg-amber-900/20 transition-colors">Replied</button>
                        <button onClick={() => handleMessageAction(m.id, "booked")} className="px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20 transition-colors">Booked</button>
                      </>
                    )}
                    <button
                      onClick={() => navigator.clipboard.writeText(m.edited_body || m.body)}
                      className="px-2 py-1 text-[10px] font-medium text-gray-400 border border-[#2A2040] rounded hover:bg-[#1A1228] transition-colors"
                    >Copy</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "engagement" && (
            <p className="text-sm text-gray-500 text-center py-8">Engagement tracking coming soon.</p>
          )}
        </div>
      </div>
    </div>
  );
}
