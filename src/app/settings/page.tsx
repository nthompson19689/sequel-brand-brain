"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { currentWorkspace } = useWorkspace();

  // API usage state
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [apiUsage, setApiUsage] = useState<any>(null);

  useEffect(() => {
    fetch("/api/outbound/usage").then(r => r.ok ? r.json() : { usage: null }).then(d => setApiUsage(d.usage));
  }, []);

  // API key state
  const [apiKeyConfig, setApiKeyConfig] = useState<{
    has_key: boolean;
    masked_key: string | null;
    mcp_server_urls: string[];
  } | null>(null);
  const [newApiKey, setNewApiKey] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);

  const loadApiKeys = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    try {
      const res = await fetch(`/api/preferences/api-keys?workspace_id=${currentWorkspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setApiKeyConfig(data.config || null);
      }
    } catch {
      // ignore
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  async function saveApiKey() {
    if (!newApiKey.trim() || !currentWorkspace?.id) return;
    setApiKeySaving(true);
    try {
      await fetch("/api/preferences/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          anthropic_api_key: newApiKey.trim(),
        }),
      });
      setNewApiKey("");
      await loadApiKeys();
    } catch {
      // ignore
    }
    setApiKeySaving(false);
  }

  async function removeApiKey() {
    if (!currentWorkspace?.id) return;
    try {
      await fetch(`/api/preferences/api-keys?workspace_id=${currentWorkspace.id}`, {
        method: "DELETE",
      });
      await loadApiKeys();
    } catch {
      // ignore
    }
  }

  async function addMcpUrl() {
    if (!newMcpUrl.trim() || !currentWorkspace?.id) return;
    const urls = [...(apiKeyConfig?.mcp_server_urls || []), newMcpUrl.trim()];
    try {
      await fetch("/api/preferences/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          mcp_server_urls: urls,
        }),
      });
      setNewMcpUrl("");
      await loadApiKeys();
    } catch {
      // ignore
    }
  }

  async function removeMcpUrl(idx: number) {
    if (!currentWorkspace?.id) return;
    const urls = (apiKeyConfig?.mcp_server_urls || []).filter((_, i) => i !== idx);
    try {
      await fetch("/api/preferences/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          mcp_server_urls: urls,
        }),
      });
      await loadApiKeys();
    } catch {
      // ignore
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0F0A1A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">API keys and workspace configuration</p>
        </div>

        {/* ======================== */}
        {/* API Key Configuration    */}
        {/* ======================== */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">API Configuration</h2>
          <p className="text-sm text-gray-400 mb-5">
            Bring your own Anthropic API key and MCP server URLs for this workspace.
          </p>

          {/* Anthropic API Key */}
          <div className="mb-5">
            <label className="text-sm font-medium text-gray-300 block mb-1.5">
              Anthropic API Key
            </label>
            {apiKeyConfig?.has_key ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 px-4 py-2.5 rounded-lg bg-[#0F0A1A] border border-[#2A2040] text-sm text-gray-400 font-mono">
                  {apiKeyConfig.masked_key}
                </div>
                <button
                  onClick={removeApiKey}
                  className="px-3 py-2 text-xs font-medium text-red-400 border border-red-800/40 rounded-lg hover:bg-red-900/20 transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                />
                <button
                  onClick={saveApiKey}
                  disabled={!newApiKey.trim() || apiKeySaving}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {apiKeySaving ? "..." : "Save"}
                </button>
              </div>
            )}
            <p className="text-[10px] text-[#4A4560] mt-1.5">
              If set, this key is used instead of the platform default for all AI calls in this workspace.
            </p>
          </div>

          {/* MCP Server URLs */}
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-1.5">
              MCP Server URLs
            </label>
            {(apiKeyConfig?.mcp_server_urls || []).length > 0 && (
              <div className="space-y-2 mb-3">
                {apiKeyConfig!.mcp_server_urls.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 rounded-lg bg-[#0F0A1A] border border-[#2A2040] text-xs text-gray-400 font-mono truncate">
                      {url}
                    </div>
                    <button
                      onClick={() => removeMcpUrl(idx)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                type="url"
                value={newMcpUrl}
                onChange={(e) => setNewMcpUrl(e.target.value)}
                placeholder="https://mcp.example.com/sse"
                className="flex-1 rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
              />
              <button
                onClick={addMcpUrl}
                disabled={!newMcpUrl.trim()}
                className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* ======================== */}
        {/* API Usage This Month     */}
        {/* ======================== */}
        {apiUsage && apiUsage.total_calls > 0 && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-1">API Usage</h2>
            <p className="text-sm text-gray-400 mb-4">
              Research API costs this month ({apiUsage.month})
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#0F0A1A] rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase">Total Calls</p>
                <p className="text-lg font-bold text-white">{apiUsage.total_calls}</p>
              </div>
              <div className="bg-[#0F0A1A] rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase">Est. Cost</p>
                <p className="text-lg font-bold text-white">${apiUsage.total_cost.toFixed(3)}</p>
              </div>
              <div className="bg-[#0F0A1A] rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase">Services</p>
                <p className="text-lg font-bold text-white">{Object.keys(apiUsage.by_service || {}).length}</p>
              </div>
            </div>
            {Object.entries(apiUsage.by_service || {}).map(([service, stats]: [string, any]) => (
              <div key={service} className="flex items-center justify-between py-2 border-t border-[#2A2040] text-xs">
                <span className="text-gray-300 capitalize">{service}</span>
                <span className="text-gray-500">{stats.calls} calls · ${stats.cost.toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
