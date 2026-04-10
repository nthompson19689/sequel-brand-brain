"use client";

import { useState } from "react";

interface ActionPlanData {
  doThisWeek: string[];
  doThisMonth: string[];
  monitor: string[];
}

interface ActionPlanProps {
  pages: Array<{ [key: string]: unknown }>;
}

export default function ActionPlan({ pages }: ActionPlanProps) {
  const [plan, setPlan] = useState<ActionPlanData | null>(null);
  const [rawAnalysis, setRawAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function analyze() {
    if (pages.length === 0) return;
    setLoading(true);
    setPlan(null);
    setRawAnalysis(null);
    try {
      const res = await fetch("/api/seo/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.structured) {
          setPlan(data.structured);
        } else if (data.analysis) {
          setRawAnalysis(data.analysis);
        }
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }

  if (!plan && !rawAnalysis && !loading) {
    return (
      <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">AI Action Plan</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Analyze your pages to get prioritized recommendations
            </p>
          </div>
          <button
            onClick={analyze}
            disabled={pages.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
          >
            Analyze
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-8 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto mb-3" />
        <p className="text-sm text-gray-400">Analyzing {pages.length} pages...</p>
      </div>
    );
  }

  // Structured 3-column view
  if (plan) {
    const sections = [
      { title: "Do This Week", items: plan.doThisWeek, color: "text-red-400", border: "border-red-800/30", bg: "bg-red-900/10" },
      { title: "Do This Month", items: plan.doThisMonth, color: "text-amber-400", border: "border-amber-800/30", bg: "bg-amber-900/10" },
      { title: "Monitor", items: plan.monitor, color: "text-emerald-400", border: "border-emerald-800/30", bg: "bg-emerald-900/10" },
    ];

    return (
      <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">AI Action Plan</h3>
          <button
            onClick={analyze}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Re-analyze
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {sections.map((section) => (
            <div key={section.title} className={`rounded-lg border ${section.border} ${section.bg} p-4`}>
              <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${section.color}`}>
                {section.title}
              </h4>
              {section.items.length === 0 ? (
                <p className="text-xs text-gray-600">No actions</p>
              ) : (
                <ul className="space-y-2">
                  {section.items.map((item, i) => (
                    <li key={i} className="text-xs text-gray-300 leading-relaxed flex gap-2">
                      <span className="text-gray-600 shrink-0">{i + 1}.</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback: raw markdown
  if (rawAnalysis) {
    return (
      <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">AI Action Plan</h3>
          <button
            onClick={analyze}
            className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            Re-analyze
          </button>
        </div>
        <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
          {rawAnalysis}
        </div>
      </div>
    );
  }

  return null;
}
