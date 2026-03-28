"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AgentCard from "@/components/agents/AgentCard";
import type { Agent, AgentCategory } from "@/lib/agents";
import { AGENT_CATEGORIES, BUILTIN_AGENTS } from "@/lib/agents";
import { useWorkspace } from "@/contexts/WorkspaceContext";

// Map agent IDs to their categories from the code (fallback when DB doesn't have category column)
const CATEGORY_BY_ID: Record<string, AgentCategory> = {};
for (const a of BUILTIN_AGENTS) {
  if (a.category) CATEGORY_BY_ID[a.id] = a.category;
}

export default function AgentsPage() {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const wsParam = currentWorkspace?.id ? `?workspace_id=${currentWorkspace.id}` : "";
      const res = await fetch(`/api/agents${wsParam}`);
      if (!res.ok) throw new Error("Failed to fetch agents");
      const data = await res.json();
      setAgents(data.agents || []);
      setError(null);
    } catch (err) {
      console.error("Failed to load agents:", err);
      setError("Failed to load agents. Check your Supabase connection.");
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  async function deleteAgent(id: string) {
    if (!confirm("Delete this agent?")) return;
    try {
      const res = await fetch(`/api/agents?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setAgents((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Failed to delete agent:", err);
      alert("Failed to delete agent. Try again.");
    }
  }

  function editAgent(id: string) {
    router.push(`/agents/new?edit=${id}`);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-heading">
            {currentWorkspace ? `${currentWorkspace.name} Agents` : "Agents"}
          </h1>
          <p className="mt-1 text-sm text-body">
            AI agents that inherit your brand brain. Run them or create your own.
          </p>
        </div>
        <Link
          href="/agents/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Agent
        </Link>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 py-16 justify-center text-gray-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading agents...
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="text-center py-16">
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button
            onClick={loadAgents}
            className="text-sm text-brand-500 hover:text-brand-600"
          >
            Retry
          </button>
        </div>
      )}

      {/* Agents grouped by category */}
      {!loading && !error && (() => {
        // Separate custom agents from built-in
        const customAgents = agents.filter((a) => !a.is_builtin);
        const builtinAgents = agents.filter((a) => a.is_builtin);

        // Group builtins by category (use code fallback if DB doesn't have category column)
        const grouped: Record<string, Agent[]> = {};
        for (const a of builtinAgents) {
          const cat = (a as Agent & { category?: string }).category || CATEGORY_BY_ID[a.id] || "other";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(a);
        }

        const categoryOrder: AgentCategory[] = ["content_marketing", "product_marketing", "event_marketing", "sales_enablement"];

        return (
          <>
            {/* Custom agents first */}
            {customAgents.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-base">🛠️</span>
                  <h2 className="text-sm font-semibold text-heading uppercase tracking-wider">Custom Agents</h2>
                  <span className="text-xs text-body bg-gray-100 rounded-full px-2 py-0.5">{customAgents.length}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {customAgents.map((a) => (
                    <AgentCard
                      key={a.id}
                      id={a.id}
                      name={a.name}
                      description={a.description}
                      icon={a.icon}
                      steps={a.steps || []}
                      tools={a.tools || []}
                      model={a.model}
                      runCount={a.run_count}
                      isBuiltin={false}
                      onEdit={() => editAgent(a.id)}
                      onDelete={() => deleteAgent(a.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Built-in agents by category */}
            {categoryOrder.map((cat) => {
              const catAgents = grouped[cat];
              if (!catAgents || catAgents.length === 0) return null;
              const catMeta = AGENT_CATEGORIES[cat];
              return (
                <div key={cat} className="mb-8">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">{catMeta.icon}</span>
                    <h2 className="text-sm font-semibold text-heading uppercase tracking-wider">{catMeta.label}</h2>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${catMeta.color}`}>{catAgents.length}</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catAgents.map((a) => (
                      <AgentCard
                        key={a.id}
                        id={a.id}
                        name={a.name}
                        description={a.description}
                        icon={a.icon}
                        steps={a.steps || []}
                        tools={a.tools || []}
                        model={a.model}
                        runCount={a.run_count}
                        isBuiltin={true}
                        onEdit={() => editAgent(a.id)}
                        onDelete={() => deleteAgent(a.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {agents.length === 0 && (
              <div className="text-center py-16">
                <p className="text-body">No agents yet. Create your first one.</p>
              </div>
            )}
          </>
        );
      })()}
    </div>
  );
}
