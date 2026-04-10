"use client";

import { useState, useEffect } from "react";

interface AccountDetailProps {
  accountId: string;
  onClose: () => void;
  onResearch: (accountId: string, domain: string) => void;
  onOutreach: (accountId: string) => void;
}

const STATUS_OPTIONS = ["researching", "monitoring", "engaging", "opportunity", "customer"];

export default function AccountDetail({ accountId, onClose, onResearch, onOutreach }: AccountDetailProps) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [account, setAccount] = useState<any>(null);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [content, setContent] = useState<any[]>([]);
  const [engagement, setEngagement] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"brief" | "contacts" | "triggers" | "content" | "engagement">("brief");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/abm/accounts/${accountId}`);
        if (res.ok) {
          const data = await res.json();
          setAccount(data.account);
          setTriggers(data.triggers || []);
          setContent(data.content || []);
          setEngagement(data.engagement || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [accountId]);

  async function updateStatus(newStatus: string) {
    await fetch(`/api/abm/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_status: newStatus }),
    });
    setAccount((prev: any) => prev ? { ...prev, account_status: newStatus } : prev);
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

  if (!account) return null;

  const contacts = Array.isArray(account.key_contacts) ? account.key_contacts : [];
  const accountTriggers = account.triggers || {};

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[#0F0A1A] h-full overflow-y-auto border-l border-[#2A2040]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#0F0A1A] border-b border-[#2A2040] px-6 py-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">{account.company_name}</h2>
              <a href={`https://${account.domain}`} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:underline">
                {account.domain}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={account.account_status}
                onChange={(e) => updateStatus(e.target.value)}
                className="text-xs bg-[#1A1228] border border-[#2A2040] text-white rounded-lg px-2 py-1.5"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
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
            <button
              onClick={() => onResearch(account.id, account.domain)}
              className="px-3 py-1.5 text-xs font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 transition-colors"
            >
              Research
            </button>
            <button
              onClick={() => onOutreach(account.id)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
            >
              Generate Outreach
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 border-b border-[#2A2040] -mb-px">
            {(["brief", "contacts", "triggers", "content", "engagement"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors capitalize ${
                  tab === t ? "border-[#7C3AED] text-white" : "border-transparent text-gray-500 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === "brief" && (
            <div className="space-y-4">
              {account.account_brief ? (
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                  <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {account.account_brief}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">
                  No brief yet. Click &quot;Research&quot; to generate one.
                </p>
              )}
              {accountTriggers.pain_points && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Pain Points</h4>
                  <ul className="space-y-1">
                    {accountTriggers.pain_points.map((p: string, i: number) => (
                      <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-gray-600">-</span>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {accountTriggers.outreach_angles && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Outreach Angles</h4>
                  <ul className="space-y-1">
                    {accountTriggers.outreach_angles.map((a: string, i: number) => (
                      <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-purple-400">-</span>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {account.tech_stack && Array.isArray(account.tech_stack) && account.tech_stack.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Tech Stack</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {account.tech_stack.map((t: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[#2A2040] text-gray-300">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "contacts" && (
            <div className="space-y-3">
              {contacts.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No contacts found. Run research to discover decision makers.</p>
              ) : contacts.map((c: any, i: number) => (
                <div key={i} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                  <p className="text-sm font-medium text-white">{c.name || "Unknown"}</p>
                  <p className="text-xs text-gray-400">{c.title || ""}</p>
                  {c.email && <p className="text-xs text-purple-400 mt-1">{c.email}</p>}
                  {c.linkedin && (
                    <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:underline">LinkedIn</a>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === "triggers" && (
            <div className="space-y-2">
              {triggers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No triggers detected yet.</p>
              ) : triggers.map((t: any) => (
                <div key={t.id} className="flex items-start gap-3 p-3 bg-[#1A1228] border border-[#2A2040] rounded-lg">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${
                    t.relevance_score >= 7 ? "bg-red-900/40 text-red-400" : "bg-gray-800/40 text-gray-400"
                  }`}>{t.relevance_score}</span>
                  <div>
                    <p className="text-xs text-gray-300">{t.trigger_detail}</p>
                    <p className="text-[10px] text-gray-600 mt-0.5">{t.trigger_type} · {new Date(t.detected_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "content" && (
            <div className="space-y-3">
              {content.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No outreach content yet. Click &quot;Generate Outreach&quot; to create some.</p>
              ) : content.map((c: any) => (
                <div key={c.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white capitalize">{c.content_type.replace(/_/g, " ")}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      c.status === "approved" ? "bg-emerald-900/40 text-emerald-400" :
                      c.status === "sent" ? "bg-blue-900/40 text-blue-400" :
                      "bg-gray-800/40 text-gray-400"
                    }`}>{c.status}</span>
                  </div>
                  <pre className="text-xs text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {typeof c.content === "string" ? c.content : JSON.stringify(c.content, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {tab === "engagement" && (
            <div className="space-y-2">
              {engagement.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No engagement tracked yet.</p>
              ) : engagement.map((e: any) => (
                <div key={e.id} className="flex items-center gap-3 p-3 bg-[#1A1228] border border-[#2A2040] rounded-lg">
                  <span className="text-xs text-gray-500 capitalize">{e.channel}</span>
                  <span className="text-xs text-white font-medium capitalize">{e.action}</span>
                  {e.detail && <span className="text-xs text-gray-400 truncate flex-1">{e.detail}</span>}
                  <span className="text-[10px] text-gray-600 shrink-0">{new Date(e.occurred_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
