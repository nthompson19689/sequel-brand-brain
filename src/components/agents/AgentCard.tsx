"use client";

import { useRouter } from "next/navigation";
import { STEP_TYPE_META, type WorkflowStep } from "@/lib/agents";

interface AgentCardProps {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: WorkflowStep[];
  tools: string[];
  model?: string;
  runCount: number;
  isBuiltin?: boolean;
  feedbackCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

const MODEL_BADGES: Record<string, { label: string; badge: string; color: string }> = {
  "claude-sonnet-4-6": { label: "Sonnet", badge: "⚡", color: "bg-blue-50 text-blue-600" },
  "claude-opus-4-6": { label: "Opus", badge: "✨", color: "bg-purple-50 text-purple-600" },
};

const TOOL_LABELS: Record<string, string> = {
  articles: "Articles",
  battle_cards: "Battle Cards",
  call_insights: "Call Insights",
};

export default function AgentCard({
  id,
  name,
  description,
  icon,
  steps,
  tools,
  model,
  runCount,
  isBuiltin,
  feedbackCount,
  onEdit,
  onDelete,
}: AgentCardProps) {
  const router = useRouter();
  const modelInfo = MODEL_BADGES[model || "claude-sonnet-4-6"] || MODEL_BADGES["claude-sonnet-4-6"];
  // Check if any step uses a different model
  const hasStepOverrides = steps.some((s) => s.model && s.model !== model);
  return (
    <div
      onClick={() => router.push(`/agents/${id}`)}
      className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col hover:border-brand-300 hover:shadow-md transition-all cursor-pointer group"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 truncate">{name}</h3>
            {isBuiltin && (
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-brand-500 bg-brand-50 px-1.5 py-0.5 rounded">
                Built-in
              </span>
            )}
            <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${modelInfo.color}`}>
              {modelInfo.badge} {modelInfo.label}{hasStepOverrides ? "+" : ""}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500 line-clamp-2">
            {description}
          </p>
        </div>
      </div>

      {/* Pipeline steps mini-view */}
      {steps && steps.length > 0 && (
        <div className="mt-3 flex items-center gap-1">
          {steps.map((step, i) => {
            const meta = STEP_TYPE_META[step.type];
            const colorClass =
              meta.color === "indigo" ? "bg-brand-400" :
              meta.color === "emerald" ? "bg-emerald-400" :
              meta.color === "amber" ? "bg-amber-400" :
              "bg-violet-400";
            return (
              <div key={step.id} className="flex items-center gap-1">
                {i > 0 && <div className="w-3 h-px bg-gray-300" />}
                <div
                  className={`w-2 h-2 rounded-full ${colorClass}`}
                  title={`${step.name || `Step ${i + 1}`} (${meta.label})`}
                />
              </div>
            );
          })}
          <span className="ml-1.5 text-[10px] text-gray-400">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Tools */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tools.map((tool) => (
          <span
            key={tool}
            className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
          >
            {TOOL_LABELS[tool] || tool}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-xs text-gray-400 hover:text-brand-500 transition-colors"
              title="Edit agent"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Delete agent"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
          <span className="text-xs text-gray-400">
            {runCount > 0 ? `${runCount} run${runCount !== 1 ? "s" : ""}` : ""}
            {runCount > 0 && feedbackCount ? " · " : ""}
            {feedbackCount ? (
              <span className="text-amber-500">{feedbackCount} feedback</span>
            ) : null}
          </span>
        </div>
        <span className="text-xs text-brand-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          Open →
        </span>
      </div>
    </div>
  );
}
