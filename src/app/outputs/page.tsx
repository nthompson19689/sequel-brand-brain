"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { RichTextEditorRef } from "@/components/editor/RichTextEditor";
import { useRef } from "react";

const RichTextEditor = dynamic(() => import("@/components/editor/RichTextEditor"), { ssr: false });

interface Output {
  id: string;
  agent_id: string;
  agent_name: string | null;
  agent_icon: string | null;
  input_query: string | null;
  output_content: string;
  output_html: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function stripHtml(html: string): string {
  if (typeof document === "undefined") return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-amber-100 text-amber-700" },
  final: { label: "Final", cls: "bg-emerald-100 text-emerald-700" },
  exported: { label: "Exported", cls: "bg-brand-100 text-brand-700" },
};

export default function OutputsPage() {
  const router = useRouter();
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOutput, setSelectedOutput] = useState<Output | null>(null);
  const [editorHtml, setEditorHtml] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<RichTextEditorRef>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchOutputs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/outputs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOutputs(data.outputs || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  // Debounce search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Group by agent name
  const grouped = outputs.reduce<Record<string, Output[]>>((acc, o) => {
    const key = o.agent_name || "Unknown Agent";
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  async function handleDelete(id: string) {
    if (!confirm("Delete this output? This cannot be undone.")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/outputs?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setOutputs((prev) => prev.filter((o) => o.id !== id));
        if (selectedOutput?.id === id) {
          setSelectedOutput(null);
          setEditorHtml("");
        }
      }
    } catch {
      // ignore
    }
    setDeleting(null);
  }

  async function handleSave() {
    if (!selectedOutput) return;
    const html = editorRef.current?.getHTML() || editorHtml;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/outputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedOutput.id,
          agent_id: selectedOutput.agent_id,
          agent_name: selectedOutput.agent_name,
          agent_icon: selectedOutput.agent_icon,
          input_query: selectedOutput.input_query,
          output_content: html,
          output_html: html,
          status: "final",
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
        fetchOutputs();
      }
    } catch {
      setSaveStatus("idle");
    }
  }

  function handleCopy() {
    const text = editorRef.current?.getText() || stripHtml(editorHtml);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function openOutput(o: Output) {
    setSelectedOutput(o);
    setEditorHtml(o.output_html || o.output_content);
  }

  return (
    <div className="flex h-screen">
      {/* Left panel: output list */}
      <div className={`${selectedOutput ? "w-[420px] border-r border-border" : "flex-1"} flex flex-col bg-white overflow-hidden`}>
        <div className="p-6 pb-4 border-b border-border">
          <h1 className="text-2xl font-semibold text-heading">Outputs</h1>
          <p className="mt-1 text-sm text-body">All saved agent outputs in one place.</p>

          {/* Search */}
          <div className="mt-4 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search outputs..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : outputs.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                </svg>
              </div>
              <h3 className="text-sm font-medium text-heading">No outputs yet</h3>
              <p className="mt-1 text-xs text-body">Run an agent to generate your first output.</p>
              <button
                onClick={() => router.push("/agents")}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors"
              >
                Go to Agents
              </button>
            </div>
          ) : (
            Object.entries(grouped).map(([agentName, items]) => (
              <div key={agentName}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-base">{items[0]?.agent_icon || "🤖"}</span>
                  <h2 className="text-sm font-semibold text-heading">{agentName}</h2>
                  <span className="text-xs text-body bg-gray-100 rounded-full px-2 py-0.5">{items.length}</span>
                </div>

                <div className="space-y-2">
                  {items.map((o) => {
                    const badge = STATUS_BADGES[o.status] || STATUS_BADGES.draft;
                    const preview = stripHtml(o.output_content).substring(0, 200);
                    const isSelected = selectedOutput?.id === o.id;

                    return (
                      <button
                        key={o.id}
                        onClick={() => openOutput(o)}
                        className={`w-full text-left p-4 rounded-xl border transition-all group ${
                          isSelected
                            ? "border-brand-400 bg-brand-50/50 shadow-sm"
                            : "border-border bg-white hover:border-brand-200 hover:shadow-sm"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {o.input_query && (
                              <p className="text-sm font-medium text-heading truncate">{o.input_query}</p>
                            )}
                            <p className="text-xs text-body mt-1 line-clamp-2">{preview || "No preview"}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
                              {badge.label}
                            </span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(o.id); }}
                              disabled={deleting === o.id}
                              className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-body/60 mt-2">{timeAgo(o.created_at)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: editor */}
      {selectedOutput && (
        <div className="flex-1 flex flex-col bg-surface overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 bg-white border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl">{selectedOutput.agent_icon || "🤖"}</span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-heading truncate">{selectedOutput.agent_name || "Agent"}</h2>
                {selectedOutput.input_query && (
                  <p className="text-xs text-body truncate">{selectedOutput.input_query}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium text-body bg-white border border-border rounded-lg hover:bg-gray-50 transition-colors"
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
              <button
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Save"}
              </button>
              <button
                onClick={() => { setSelectedOutput(null); setEditorHtml(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto py-6 px-6">
              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <RichTextEditor
                  ref={editorRef}
                  content={editorHtml}
                  onChange={setEditorHtml}
                  placeholder="Output content..."
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
