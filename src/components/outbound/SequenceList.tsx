"use client";

import { useState, useEffect, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-900/40 text-emerald-400",
  draft: "bg-gray-800/40 text-gray-400",
  paused: "bg-amber-900/40 text-amber-400",
  completed: "bg-blue-900/40 text-blue-400",
};

export default function SequenceList() {
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/outbound/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences(data.sequences || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function seedTemplates() {
    await fetch("/api/outbound/sequences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed_templates: true }),
    });
    await load();
  }

  if (loading) return <div className="text-center py-12 text-gray-500 text-sm">Loading sequences...</div>;

  return (
    <div>
      {sequences.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500 mb-4">No sequences yet.</p>
          <button onClick={seedTemplates} className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors">
            Load Pre-built Templates
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sequences.map((seq: any) => (
          <div key={seq.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl overflow-hidden">
            <button
              onClick={() => setExpandedId(expandedId === seq.id ? null : seq.id)}
              className="w-full text-left p-4 hover:bg-[#241C34] transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-white">{seq.sequence_name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[seq.status] || ""}`}>{seq.status}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{seq.description}</p>
              <div className="flex items-center gap-4 text-[10px] text-gray-600">
                <span>{(seq.steps || []).length} steps</span>
                <span>Persona: {seq.target_persona || "Any"}</span>
                {seq.total_prospects_enrolled > 0 && <span>{seq.total_prospects_enrolled} enrolled</span>}
                {seq.reply_rate > 0 && <span>{seq.reply_rate}% reply rate</span>}
                {seq.booking_rate > 0 && <span>{seq.booking_rate}% booking rate</span>}
              </div>
            </button>

            {/* Expanded step view */}
            {expandedId === seq.id && (
              <div className="border-t border-[#2A2040] p-4 bg-[#0F0A1A]/50">
                <h4 className="text-xs font-semibold text-gray-400 uppercase mb-3">Sequence Steps</h4>
                <div className="space-y-3">
                  {(seq.steps || []).map((step: any, i: number) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#7C3AED]/20 text-purple-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {step.step_number || i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-white capitalize">{(step.channel || "").replace(/_/g, " ")}</span>
                          <span className="text-[10px] text-gray-600">Day {step.delay_days}</span>
                        </div>
                        <p className="text-[10px] text-gray-400">{step.purpose}</p>
                        {step.subject_line && <p className="text-[10px] text-gray-500 mt-0.5">Subject: {step.subject_line}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
