"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-800/40 text-gray-400",
  parsed: "bg-amber-900/40 text-amber-400",
  generating: "bg-blue-900/40 text-blue-400",
  ready: "bg-emerald-900/40 text-emerald-400",
  edited: "bg-purple-900/40 text-purple-300",
  approved: "bg-emerald-900/40 text-emerald-400",
  pending: "bg-gray-800/40 text-gray-400",
  failed: "bg-red-900/40 text-red-400",
  published: "bg-blue-900/40 text-blue-400",
};

const ASSET_TYPE_LABELS: Record<string, string> = {
  blog: "Blog Post",
  email: "Email",
  linkedin: "LinkedIn Post",
  sales_enablement: "Sales One-Pager",
  website: "Website Copy",
  faq: "FAQ",
  video_script: "Video Script",
  slack_internal: "Internal Slack",
  thought_leadership: "Thought Leadership",
  social: "Social Posts",
};

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [campaign, setCampaign] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docLabel, setDocLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingBrief, setEditingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  const [savingBrief, setSavingBrief] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLog, setGenLog] = useState<string[]>([]);

  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [assetEditBody, setAssetEditBody] = useState<string>("");
  const [savingAsset, setSavingAsset] = useState(false);
  const [regenAssetId, setRegenAssetId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, docsRes] = await Promise.all([
        fetch(`/api/campaigns/${id}`),
        fetch(`/api/campaigns/${id}/documents`),
      ]);
      if (res.ok) {
        const data = await res.json();
        setCampaign(data.campaign);
        setAssets(data.assets || []);
        setBriefDraft(data.campaign.brief || "");
      }
      if (docsRes.ok) {
        const data = await docsRes.json();
        setDocuments(data.documents || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function saveBrief() {
    setSavingBrief(true);
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: briefDraft }),
      });
      setEditingBrief(false);
      await load();
    } catch { /* ignore */ }
    setSavingBrief(false);
  }

  async function handleParse() {
    setParsing(true);
    setGenLog((l) => [...l, "Parsing brief…"]);
    try {
      const res = await fetch(`/api/campaigns/${id}/parse`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setGenLog((l) => [...l, `Parsed. ${data.assets?.length || 0} assets in manifest.`]);
        await load();
      } else {
        const err = await res.json().catch(() => ({}));
        setGenLog((l) => [...l, `Parse failed: ${err.error || res.statusText}`]);
      }
    } catch (err) {
      setGenLog((l) => [...l, `Parse error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setParsing(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenLog((l) => [...l, "Starting generation…"]);
    try {
      const res = await fetch(`/api/campaigns/${id}/generate`, { method: "POST" });
      if (!res.body) {
        setGenLog((l) => [...l, "No stream from server."]);
        setGenerating(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const ev of events) {
          const lines = ev.split("\n");
          const eName = (lines.find((l) => l.startsWith("event:")) || "").slice(6).trim();
          const dRaw = (lines.find((l) => l.startsWith("data:")) || "").slice(5).trim();
          let d: any = {};
          try { d = JSON.parse(dRaw); } catch { /* ignore */ }
          if (eName === "start") setGenLog((l) => [...l, `Generating ${d.total} assets…`]);
          else if (eName === "asset_start") setGenLog((l) => [...l, `→ ${ASSET_TYPE_LABELS[d.asset_type] || d.asset_type}: ${d.title || ""}`]);
          else if (eName === "asset_done") {
            setGenLog((l) => [...l, d.status === "failed" ? `   ✗ ${d.error}` : `   ✓ done`]);
            await load();
          } else if (eName === "done") setGenLog((l) => [...l, `Complete. ${d.generated} generated, ${d.failed} failed.`]);
        }
      }
      await load();
    } catch (err) {
      setGenLog((l) => [...l, `Generation error: ${err instanceof Error ? err.message : String(err)}`]);
    }
    setGenerating(false);
  }

  async function regenerateAsset(assetId: string) {
    setRegenAssetId(assetId);
    try {
      await fetch(`/api/campaigns/${id}/assets/${assetId}/regenerate`, { method: "POST" });
      await load();
    } catch { /* ignore */ }
    setRegenAssetId(null);
  }

  async function saveAssetEdits(assetId: string) {
    setSavingAsset(true);
    try {
      await fetch(`/api/campaigns/${id}/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: assetEditBody, status: "edited" }),
      });
      await load();
      setOpenAssetId(null);
    } catch { /* ignore */ }
    setSavingAsset(false);
  }

  async function approveAsset(assetId: string) {
    await fetch(`/api/campaigns/${id}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    await load();
  }

  async function patchAsset(assetId: string, fields: Record<string, unknown>) {
    await fetch(`/api/campaigns/${id}/assets/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    await load();
  }

  async function deleteAsset(assetId: string) {
    if (!confirm("Delete this asset?")) return;
    await fetch(`/api/campaigns/${id}/assets/${assetId}`, { method: "DELETE" });
    await load();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        if (docLabel.trim()) fd.append("label", docLabel.trim());
        const res = await fetch(`/api/campaigns/${id}/documents`, { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setUploadError(`${f.name}: ${err.error || res.statusText}`);
          break;
        }
      }
      setDocLabel("");
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    }
    setUploading(false);
    // Reset input so same file can be reuploaded
    e.target.value = "";
  }

  async function toggleDocWriters(docId: string, current: boolean) {
    await fetch(`/api/campaigns/${id}/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ include_in_writers: !current }),
    });
    await load();
  }

  async function deleteDoc(docId: string) {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/campaigns/${id}/documents/${docId}`, { method: "DELETE" });
    await load();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0A1A] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-[#0F0A1A] text-white p-10">
        <p className="text-sm text-gray-400">Campaign not found.</p>
      </div>
    );
  }

  const parsedCtx = campaign.parsed_context || {};
  const hasManifest = Array.isArray(campaign.asset_manifest) && campaign.asset_manifest.length > 0;
  const hasBrief = (campaign.brief || "").trim().length > 0;

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <button onClick={() => router.push("/campaigns")} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          All campaigns
        </button>

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">{campaign.name}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {campaign.launch_date ? `Launch ${new Date(campaign.launch_date).toLocaleDateString()}` : "No launch date"}
              {" · "}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[campaign.status] || ""}`}>{campaign.status}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleParse}
              disabled={parsing || (!hasBrief && documents.length === 0)}
              className="px-4 py-2 text-sm font-medium text-white bg-[#3F2A6E] rounded-lg hover:bg-[#4F3A7E] disabled:opacity-40 transition-colors"
            >
              {parsing ? "Parsing…" : hasManifest ? "Re-parse Brief" : "Parse Brief"}
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !hasManifest}
              className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
            >
              {generating ? "Generating…" : "Generate Assets"}
            </button>
          </div>
        </div>

        {/* Documents */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Reference Documents</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">PRDs, transcripts, FAQs, CSVs, research — fed into the orchestrator and writers.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Optional label"
                value={docLabel}
                onChange={(e) => setDocLabel(e.target.value)}
                className="rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-2 py-1 text-xs text-white focus:border-purple-500 focus:outline-none w-36"
              />
              <label className={`px-3 py-1.5 text-xs font-medium text-white bg-[#3F2A6E] rounded-lg cursor-pointer hover:bg-[#4F3A7E] transition-colors ${uploading ? "opacity-40 pointer-events-none" : ""}`}>
                {uploading ? "Uploading…" : "+ Upload"}
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.csv"
                  onChange={handleUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
          {uploadError && <p className="text-xs text-red-400 mb-2">{uploadError}</p>}
          {documents.length === 0 ? (
            <p className="text-xs text-gray-600 italic">No documents yet. Upload PDFs, Word docs, CSVs, or text files (≤ a few MB each).</p>
          ) : (
            <div className="space-y-1.5">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between bg-[#0F0A1A] border border-[#2A2040] rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white truncate">{d.label || d.filename}</span>
                      <span className="text-[10px] uppercase text-gray-500">{d.file_type}</span>
                    </div>
                    <p className="text-[10px] text-gray-600">
                      {d.label ? `${d.filename} · ` : ""}{d.word_count?.toLocaleString() || 0} words
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleDocWriters(d.id, d.include_in_writers)}
                      title="Include in writer prompts (orchestrator always sees it)"
                      className={`px-2 py-0.5 text-[10px] rounded-full transition-colors ${
                        d.include_in_writers
                          ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800/30"
                          : "bg-gray-800/40 text-gray-500 border border-[#2A2040]"
                      }`}
                    >
                      {d.include_in_writers ? "writers ✓" : "writers ✗"}
                    </button>
                    <button onClick={() => deleteDoc(d.id)} className="px-2 py-0.5 text-[10px] font-medium text-red-400/70 border border-red-900/30 rounded hover:bg-red-900/20 transition-colors">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Brief */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Launch Brief</h3>
            {!editingBrief ? (
              <button onClick={() => setEditingBrief(true)} className="text-xs text-purple-400 hover:text-purple-300">Edit</button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setEditingBrief(false); setBriefDraft(campaign.brief || ""); }} className="text-xs text-gray-400 hover:text-white">Cancel</button>
                <button onClick={saveBrief} disabled={savingBrief} className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-40">{savingBrief ? "Saving…" : "Save"}</button>
              </div>
            )}
          </div>
          {editingBrief ? (
            <textarea value={briefDraft} onChange={(e) => setBriefDraft(e.target.value)} rows={10} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none" />
          ) : (
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{campaign.brief || <span className="text-gray-600 italic">No brief yet — add one to get started.</span>}</p>
          )}
        </div>

        {/* Parsed context */}
        {Object.keys(parsedCtx).length > 0 && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Parsed Context</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {parsedCtx.product_name && <div><span className="text-gray-500 text-xs">Product</span><p className="text-white">{parsedCtx.product_name}</p></div>}
              {parsedCtx.tone && <div><span className="text-gray-500 text-xs">Tone</span><p className="text-white">{parsedCtx.tone}</p></div>}
              {parsedCtx.one_liner && <div className="col-span-2"><span className="text-gray-500 text-xs">One-liner</span><p className="text-white">{parsedCtx.one_liner}</p></div>}
              {Array.isArray(parsedCtx.value_props) && parsedCtx.value_props.length > 0 && (
                <div className="col-span-2"><span className="text-gray-500 text-xs">Value Props</span>
                  <ul className="list-disc list-inside text-gray-300 text-xs mt-1">{parsedCtx.value_props.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
                </div>
              )}
              {Array.isArray(parsedCtx.target_personas) && parsedCtx.target_personas.length > 0 && (
                <div><span className="text-gray-500 text-xs">Personas</span>
                  <ul className="list-disc list-inside text-gray-300 text-xs mt-1">{parsedCtx.target_personas.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
                </div>
              )}
              {Array.isArray(parsedCtx.differentiators) && parsedCtx.differentiators.length > 0 && (
                <div><span className="text-gray-500 text-xs">Differentiators</span>
                  <ul className="list-disc list-inside text-gray-300 text-xs mt-1">{parsedCtx.differentiators.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
                </div>
              )}
              {Array.isArray(parsedCtx.proof_points) && parsedCtx.proof_points.length > 0 && (
                <div className="col-span-2"><span className="text-gray-500 text-xs">Proof Points</span>
                  <ul className="list-disc list-inside text-gray-300 text-xs mt-1">{parsedCtx.proof_points.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generation log */}
        {genLog.length > 0 && (generating || parsing || true) && (
          <div className="bg-black/40 border border-[#2A2040] rounded-xl p-4 mb-6 max-h-48 overflow-y-auto font-mono text-[11px] text-gray-400">
            {genLog.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}

        {/* Assets */}
        {assets.length > 0 ? (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Assets ({assets.length})</h3>
            {assets.map((a) => (
              <div key={a.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-white">{ASSET_TYPE_LABELS[a.asset_type] || a.asset_type}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[a.status] || ""}`}>{a.status}</span>
                    </div>
                    {a.title && <p className="text-xs text-gray-400 truncate">{a.title}</p>}
                    {a.intent && <p className="text-[10px] text-gray-600 mt-0.5 truncate">{a.intent}</p>}
                    {a.error && <p className="text-[10px] text-red-400 mt-0.5">{a.error}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {a.body && (
                      <button onClick={() => { setOpenAssetId(openAssetId === a.id ? null : a.id); setAssetEditBody(a.body || ""); }} className="px-2 py-1 text-[10px] font-medium text-gray-300 border border-[#2A2040] rounded hover:bg-[#0F0A1A] transition-colors">
                        {openAssetId === a.id ? "Close" : "View"}
                      </button>
                    )}
                    {a.body && (
                      <button onClick={() => navigator.clipboard.writeText(a.body)} className="px-2 py-1 text-[10px] font-medium text-gray-400 border border-[#2A2040] rounded hover:bg-[#0F0A1A] transition-colors">Copy</button>
                    )}
                    <button
                      onClick={() => regenerateAsset(a.id)}
                      disabled={regenAssetId === a.id}
                      className="px-2 py-1 text-[10px] font-medium text-purple-400 border border-purple-800/30 rounded hover:bg-purple-900/20 transition-colors disabled:opacity-40"
                    >
                      {regenAssetId === a.id ? "…" : "Regen"}
                    </button>
                    {a.status === "ready" || a.status === "edited" ? (
                      <button onClick={() => approveAsset(a.id)} className="px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20 transition-colors">Approve</button>
                    ) : null}
                    <button onClick={() => deleteAsset(a.id)} className="px-2 py-1 text-[10px] font-medium text-red-400/70 border border-red-900/30 rounded hover:bg-red-900/20 transition-colors">×</button>
                  </div>
                </div>
                <div className="border-t border-[#2A2040] px-4 py-2 bg-black/20 flex flex-wrap items-center gap-2 text-[10px]">
                  <label className="text-gray-500">When</label>
                  <input
                    type="datetime-local"
                    value={a.scheduled_at ? new Date(a.scheduled_at).toISOString().slice(0, 16) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      patchAsset(a.id, { scheduled_at: v ? new Date(v).toISOString() : null });
                    }}
                    className="rounded border border-[#2A2040] bg-[#0F0A1A] px-2 py-1 text-[11px] text-white focus:border-purple-500 focus:outline-none"
                  />
                  <label className="text-gray-500 ml-2">Where</label>
                  <input
                    type="text"
                    defaultValue={a.channel || ""}
                    placeholder="e.g. Founder LinkedIn"
                    onBlur={(e) => {
                      if ((e.target.value || "") !== (a.channel || "")) patchAsset(a.id, { channel: e.target.value || null });
                    }}
                    className="rounded border border-[#2A2040] bg-[#0F0A1A] px-2 py-1 text-[11px] text-white focus:border-purple-500 focus:outline-none w-48"
                  />
                  <input
                    type="url"
                    defaultValue={a.channel_url || ""}
                    placeholder="URL (optional)"
                    onBlur={(e) => {
                      if ((e.target.value || "") !== (a.channel_url || "")) patchAsset(a.id, { channel_url: e.target.value || null });
                    }}
                    className="rounded border border-[#2A2040] bg-[#0F0A1A] px-2 py-1 text-[11px] text-white focus:border-purple-500 focus:outline-none flex-1 min-w-[140px]"
                  />
                  {a.status === "approved" && !a.posted_at && (
                    <button
                      onClick={() => patchAsset(a.id, { posted_at: new Date().toISOString(), status: "published" })}
                      className="px-2 py-1 text-[10px] font-medium text-blue-400 border border-blue-800/30 rounded hover:bg-blue-900/20"
                    >
                      Mark Posted
                    </button>
                  )}
                  {a.posted_at && (
                    <span className="text-emerald-400">Posted {new Date(a.posted_at).toLocaleDateString()}</span>
                  )}
                </div>
                {openAssetId === a.id && (
                  <div className="border-t border-[#2A2040] p-4 bg-black/30">
                    <textarea
                      value={assetEditBody}
                      onChange={(e) => setAssetEditBody(e.target.value)}
                      rows={18}
                      className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-xs text-gray-200 focus:border-purple-500 focus:outline-none resize-none font-mono"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setOpenAssetId(null)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white">Cancel</button>
                      <button onClick={() => saveAssetEdits(a.id)} disabled={savingAsset} className="px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded hover:bg-[#6D28D9] disabled:opacity-40">
                        {savingAsset ? "Saving…" : "Save Edits"}
                      </button>
                    </div>
                    {a.metadata && Object.keys(a.metadata).length > 0 && (
                      <details className="mt-3">
                        <summary className="text-[10px] text-gray-500 cursor-pointer">Metadata</summary>
                        <pre className="text-[10px] text-gray-400 mt-1 whitespace-pre-wrap">{JSON.stringify(a.metadata, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : hasManifest ? (
          <p className="text-sm text-gray-500 text-center py-8">Manifest is ready. Click <span className="text-purple-400">Generate Assets</span> to start.</p>
        ) : (
          <p className="text-sm text-gray-500 text-center py-8">Add a brief, then click <span className="text-purple-400">Parse Brief</span>.</p>
        )}
      </div>
    </div>
  );
}
