"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ViewTab = "sources" | "add";

const OUTPUT_TYPES = [
  { id: "blog_post", label: "Long-form Blog Post", default: true },
  { id: "newsletter", label: "Newsletter Edition", default: false },
  { id: "linkedin_blog_promo", label: "LinkedIn Blog Promo", default: false },
  { id: "linkedin_newsletter_promo", label: "LinkedIn Newsletter Promo", default: false },
];

const STATUS_COLORS: Record<string, string> = {
  processing: "bg-amber-900/40 text-amber-400",
  ready: "bg-emerald-900/40 text-emerald-400",
  published: "bg-blue-900/40 text-blue-400",
  draft: "bg-gray-800/40 text-gray-400",
  edited: "bg-purple-900/40 text-purple-400",
  approved: "bg-emerald-900/40 text-emerald-400",
};

export default function StudioPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>("sources");

  // Add source form
  const [title, setTitle] = useState("");
  const [speakerName, setSpeakerName] = useState("");
  const [speakerTitle, setSpeakerTitle] = useState("");
  const [speakerCompany, setSpeakerCompany] = useState("");
  const [transcript, setTranscript] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Selected source for detail/generation
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<any>(null);
  const [selectedOutputs, setSelectedOutputs] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genToggles, setGenToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(OUTPUT_TYPES.map((t) => [t.id, t.default]))
  );

  const loadSources = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/sources");
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSources(); }, [loadSources]);

  // Load detail when selected
  useEffect(() => {
    if (!selectedId) { setSelectedSource(null); setSelectedOutputs([]); return; }
    setDetailLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/studio/sources/${selectedId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedSource(data.source);
          setSelectedOutputs(data.outputs || []);
        }
      } catch { /* ignore */ }
      setDetailLoading(false);
    })();
  }, [selectedId]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function handleSubmitSource() {
    if (!title.trim() || !transcript.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/studio/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          source_type: "transcript_upload",
          speaker_name: speakerName.trim() || null,
          speaker_title: speakerTitle.trim() || null,
          speaker_company: speakerCompany.trim() || null,
          raw_transcript: transcript.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Auto-analyze
        await fetch("/api/studio/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_id: data.source.id }),
        });
        setTitle(""); setSpeakerName(""); setSpeakerTitle(""); setSpeakerCompany(""); setTranscript("");
        setViewTab("sources");
        await loadSources();
      }
    } catch { /* ignore */ }
    setSubmitting(false);
  }

  async function handleGenerate() {
    if (!selectedId) return;
    const types = Object.entries(genToggles).filter(([, v]) => v).map(([k]) => k);
    if (types.length === 0) return;
    setGenerating(true);
    try {
      await fetch("/api/studio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: selectedId, output_types: types }),
      });
      // Refresh outputs
      const res = await fetch(`/api/studio/sources/${selectedId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedOutputs(data.outputs || []);
      }
    } catch { /* ignore */ }
    setGenerating(false);
  }

  async function handleOutputAction(outputId: string, action: string, body?: string) {
    await fetch("/api/studio/outputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: outputId, status: action, ...(body !== undefined ? { body } : {}) }),
    });
    // Refresh
    if (selectedId) {
      const res = await fetch(`/api/studio/sources/${selectedId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedOutputs(data.outputs || []);
      }
    }
  }

  // Metrics
  const totalSources = sources.length;
  const totalOutputs = sources.reduce((s, src) => s + (src.studio_outputs?.length || 0), 0);
  const publishedThisMonth = sources.reduce((s, src) =>
    s + (src.studio_outputs || []).filter((o: any) => o.status === "published").length, 0
  );

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Thought Leadership Studio</h1>
            <p className="text-sm text-gray-400 mt-1">Turn transcripts into multi-format content</p>
          </div>
          <button
            onClick={() => setViewTab(viewTab === "add" ? "sources" : "add")}
            className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors inline-flex items-center gap-2"
          >
            {viewTab === "add" ? "← Back" : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                New Source
              </>
            )}
          </button>
        </div>

        {/* Metrics bar */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Sources", value: totalSources },
            { label: "Outputs", value: totalOutputs },
            { label: "Published (month)", value: publishedThisMonth },
          ].map((m) => (
            <div key={m.label} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{m.label}</p>
              <p className="text-lg font-bold text-white">{m.value}</p>
            </div>
          ))}
        </div>

        {/* ── Add Source View ── */}
        {viewTab === "add" && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Add Source</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1">Title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" placeholder="e.g. Podcast Ep 42 — Future of Content Marketing" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Speaker Name</label><input value={speakerName} onChange={(e) => setSpeakerName(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Speaker Title</label><input value={speakerTitle} onChange={(e) => setSpeakerTitle(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Speaker Company</label><input value={speakerCompany} onChange={(e) => setSpeakerCompany(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1">Transcript *</label>
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={12} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none font-mono" placeholder="Paste your transcript here (txt, vtt, srt, or plain text)..." />
              </div>
              <button onClick={handleSubmitSource} disabled={!title.trim() || !transcript.trim() || submitting} className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">
                {submitting ? "Processing..." : "Upload & Analyze"}
              </button>
            </div>
          </div>
        )}

        {/* ── Sources List ── */}
        {viewTab === "sources" && !selectedId && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-gray-500 text-sm">Loading sources...</div>
            ) : sources.length === 0 ? (
              <div className="text-center py-16 bg-[#1A1228] border border-[#2A2040] rounded-xl">
                <p className="text-sm text-gray-500 mb-4">No sources yet. Upload a transcript to get started.</p>
                <button onClick={() => setViewTab("add")} className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors">New Source</button>
              </div>
            ) : sources.map((src) => (
              <button
                key={src.id}
                onClick={() => setSelectedId(src.id)}
                className="w-full text-left bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 hover:border-[#7C3AED]/40 transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{src.title}</h3>
                    <p className="text-xs text-gray-500">{src.speaker_name}{src.speaker_title ? ` · ${src.speaker_title}` : ""}{src.speaker_company ? ` at ${src.speaker_company}` : ""}</p>
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[src.status] || ""}`}>{src.status}</span>
                </div>
                {src.topic_summary && <p className="text-xs text-gray-400 line-clamp-2 mb-2">{src.topic_summary}</p>}
                <div className="flex items-center gap-3 text-[10px] text-gray-600">
                  <span>{(src.key_quotes || []).length} quotes</span>
                  <span>{(src.key_themes || []).length} themes</span>
                  <span>{(src.studio_outputs || []).length} outputs</span>
                  <span>{new Date(src.created_at).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Source Detail ── */}
        {viewTab === "sources" && selectedId && (
          <div>
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              Back to sources
            </button>

            {detailLoading ? (
              <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto" /></div>
            ) : selectedSource && (
              <div className="space-y-6">
                {/* Source header */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                  <h2 className="text-lg font-semibold text-white mb-1">{selectedSource.title}</h2>
                  <p className="text-xs text-gray-400 mb-3">{selectedSource.speaker_name} · {selectedSource.speaker_title} at {selectedSource.speaker_company}</p>
                  {selectedSource.topic_summary && <p className="text-sm text-gray-300 leading-relaxed mb-3">{selectedSource.topic_summary}</p>}
                  {selectedSource.key_themes?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSource.key_themes.map((t: string, i: number) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/30">{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Key quotes */}
                {selectedSource.key_quotes?.length > 0 && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Key Quotes ({selectedSource.key_quotes.length})</h3>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                      {selectedSource.key_quotes.map((q: any, i: number) => (
                        <div key={i} className="border-l-2 border-purple-800/40 pl-3">
                          <p className="text-sm text-gray-200 italic leading-relaxed">&ldquo;{q.quote}&rdquo;</p>
                          <p className="text-[10px] text-gray-600 mt-1">{q.topic_tag} · {q.strength || "medium"}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate section */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Generate Content</h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {OUTPUT_TYPES.map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setGenToggles((prev) => ({ ...prev, [type.id]: !prev[type.id] }))}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                          genToggles[type.id] ? "border-[#7C3AED]/40 bg-[#7C3AED]/5" : "border-[#2A2040] bg-[#0F0A1A] opacity-60"
                        }`}
                      >
                        <div className={`w-8 h-[18px] rounded-full transition-colors relative shrink-0 ${genToggles[type.id] ? "bg-[#7C3AED]" : "bg-[#2A2040]"}`}>
                          <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform shadow-sm ${genToggles[type.id] ? "left-[18px]" : "left-[2px]"}`} />
                        </div>
                        <span className="text-xs font-medium text-white">{type.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !Object.values(genToggles).some(Boolean)}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
                  >
                    {generating ? "Generating..." : `Generate ${Object.values(genToggles).filter(Boolean).length} Output${Object.values(genToggles).filter(Boolean).length > 1 ? "s" : ""}`}
                  </button>
                </div>

                {/* Generated outputs */}
                {selectedOutputs.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Generated Outputs ({selectedOutputs.length})</h3>
                    {selectedOutputs.map((output: any) => (
                      <div key={output.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-[#2A2040]">
                          <div>
                            <span className="text-xs font-semibold text-white capitalize">{output.output_type.replace(/_/g, " ")}</span>
                            {output.title && <span className="text-xs text-gray-500 ml-2">— {output.title}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[output.status] || ""}`}>{output.status}</span>
                            <button onClick={() => navigator.clipboard.writeText(output.body)} className="px-2 py-1 text-[10px] font-medium text-gray-400 border border-[#2A2040] rounded hover:bg-[#0F0A1A] transition-colors">Copy</button>
                            {output.status === "draft" && (
                              <button onClick={() => handleOutputAction(output.id, "approved")} className="px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20 transition-colors">Approve</button>
                            )}
                            {output.status === "approved" && (
                              <button onClick={() => handleOutputAction(output.id, "published")} className="px-2 py-1 text-[10px] font-medium text-blue-400 border border-blue-800/30 rounded hover:bg-blue-900/20 transition-colors">Published</button>
                            )}
                          </div>
                        </div>
                        <div className="p-4 max-h-[300px] overflow-y-auto">
                          <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{output.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
