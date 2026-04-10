"use client";

import { useState, useEffect, useMemo } from "react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { MODULES } from "@/lib/modules";

/**
 * Inline icon SVGs keyed by module iconKey.
 */
const ICONS: Record<string, React.ReactNode> = {
  Chat: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.3 48.3 0 0 0 5.862-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>,
  Agents: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>,
  Content: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
  SEO: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
  Decks: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3" /></svg>,
  Competitors: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
  Dictate: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>,
  LinkedIn: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>,
  Skills: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959" /></svg>,
  Outputs: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>,
  Refresh: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>,
  Requests: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" /></svg>,
  Brain: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375" /></svg>,
  Todos: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>,
  Modules: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 0 1 0 3m0-3a1.5 1.5 0 0 0 0 3m0 9.75V10.5" /></svg>,
};

export default function ModulesPage() {
  const { enabledModules, setModules, moduleRole } = usePreferences();

  // Local draft state — toggles update this, NOT the context directly
  const [draft, setDraft] = useState<string[]>(enabledModules);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync draft when enabledModules loads from Supabase
  useEffect(() => {
    setDraft(enabledModules);
  }, [enabledModules]);

  // Check if draft differs from saved state
  const hasChanges = useMemo(() => {
    if (draft.length !== enabledModules.length) return true;
    const sorted1 = [...draft].sort();
    const sorted2 = [...enabledModules].sort();
    return sorted1.some((v, i) => v !== sorted2[i]);
  }, [draft, enabledModules]);

  function toggleDraft(moduleId: string) {
    setDraft((prev) =>
      prev.includes(moduleId)
        ? prev.filter((m) => m !== moduleId)
        : [...prev, moduleId]
    );
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    // Ensure core modules are always included
    const coreIds = MODULES.filter((m) => m.core).map((m) => m.id);
    const withCores = [...new Set([...draft, ...coreIds])];
    await setModules(withCores);
    setDraft(withCores);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const workspaceModules = MODULES.filter((m) => m.section === "workspace" && !m.core);
  const sharedModules = MODULES.filter((m) => m.section === "shared" && m.id !== "modules");

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header with Save button */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Modules</h1>
          <p className="mt-1 text-sm text-body">
            Choose which tools appear in your sidebar. Core modules are always available.
          </p>
          {moduleRole && (
            <p className="text-xs text-muted mt-1">
              Current preset: <span className="capitalize font-medium">{moduleRole}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-green-600 font-medium flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className={`px-5 py-2.5 text-sm font-medium rounded-xl transition-colors shadow-sm ${
              hasChanges
                ? "text-white bg-brand-500 hover:bg-brand-600"
                : "text-muted bg-surface-raised cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <div className="mb-6 p-3 rounded-card border border-brand-200 bg-brand-50/50 flex items-center justify-between">
          <p className="text-sm text-brand-700">You have unsaved changes to your modules.</p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Save now
          </button>
        </div>
      )}

      {/* Core modules — always on */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Core (always on)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODULES.filter((m) => m.core).map((mod) => (
            <div
              key={mod.id}
              className="flex items-start gap-3 p-4 rounded-card border border-brand-200 bg-brand-50/30"
            >
              <div className="mt-0.5 shrink-0 text-brand-500">
                {ICONS[mod.iconKey] || ICONS.Chat}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-heading">{mod.displayName}</span>
                  <span className="text-[10px] text-brand-600 font-medium">Core</span>
                </div>
                <p className="text-xs text-body mt-0.5">{mod.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workspace modules */}
      {workspaceModules.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Workspace
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workspaceModules.map((mod) => {
              const enabled = draft.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  onClick={() => toggleDraft(mod.id)}
                  className={`flex items-start gap-3 p-4 rounded-card border text-left transition-all ${
                    enabled
                      ? "border-brand-200 bg-surface-card shadow-card"
                      : "border-border bg-surface opacity-60"
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${enabled ? "text-brand-500" : "text-muted"}`}>
                    {ICONS[mod.iconKey] || ICONS.Chat}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-heading">{mod.displayName}</span>
                      <div
                        className={`w-8 h-[18px] rounded-full transition-colors relative ${
                          enabled ? "bg-brand-500" : "bg-border"
                        }`}
                      >
                        <div
                          className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${
                            enabled ? "left-[18px]" : "left-[2px]"
                          }`}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-body mt-0.5">{mod.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Shared modules */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          Shared
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sharedModules.map((mod) => {
            const enabled = draft.includes(mod.id);
            return (
              <button
                key={mod.id}
                onClick={() => toggleDraft(mod.id)}
                className={`flex items-start gap-3 p-4 rounded-card border text-left transition-all ${
                  enabled
                    ? "border-brand-200 bg-surface-card shadow-card"
                    : "border-border bg-surface opacity-60"
                }`}
              >
                <div className={`mt-0.5 shrink-0 ${enabled ? "text-brand-500" : "text-muted"}`}>
                  {ICONS[mod.iconKey] || ICONS.Chat}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-heading">{mod.displayName}</span>
                    <div
                      className={`w-8 h-[18px] rounded-full transition-colors relative ${
                        enabled ? "bg-brand-500" : "bg-border"
                      }`}
                    >
                      <div
                        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${
                          enabled ? "left-[18px]" : "left-[2px]"
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-body mt-0.5">{mod.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
