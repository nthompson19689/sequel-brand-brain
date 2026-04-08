"use client";

import { useEffect, useState, useRef, useCallback, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { markdownToHtml } from "@/lib/markdown-to-html";
import type { RichTextEditorRef } from "@/components/editor/RichTextEditor";
import VoiceProcessor from "@/components/ui/VoiceProcessor";

const RichTextEditor = dynamic(() => import("@/components/editor/RichTextEditor"), { ssr: false });

interface Post {
  id: string;
  title: string | null;
  primary_keyword: string;
  post_type: string | null;
  search_intent: string | null;
  status: string;
  brief: string | null;
  draft: string | null;
  edited_draft: string | null;
  editor_notes: { call1?: string; violations?: unknown[]; gates?: Gate[]; gatesPassed?: number; gatesTotal?: number } | null;
  word_count: number | null;
}

interface Gate { name: string; passed: boolean; detail: string }

const STAGES = [
  { key: "queued", label: "Queued", idx: 0 },
  { key: "brief_generated", label: "Brief", idx: 1 },
  { key: "brief_approved", label: "Brief Approved", idx: 2 },
  { key: "draft_complete", label: "Draft", idx: 3 },
  { key: "edited", label: "Edited", idx: 4 },
  { key: "approved", label: "Review", idx: 5 },
  { key: "published", label: "Complete", idx: 6 },
];

function stageIndex(status: string) {
  return STAGES.find((s) => s.key === status)?.idx ?? 0;
}

export default function ContentPostPage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  // Pipeline state
  const [streamOutput, setStreamOutput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editor
  const [editorHtml, setEditorHtml] = useState("");
  const editorRef = useRef<RichTextEditorRef>(null);
  const [refineInput, setRefineInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [copied, setCopied] = useState(false);

  // Editor notes sidebar
  const [showNotes, setShowNotes] = useState(false);

  const loadPost = useCallback(async () => {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) return;
      const data = await res.json();
      const found = (data.posts || []).find((p: Post) => p.id === params.id);
      if (found) setPost(found);
    } catch { /* ok */ }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadPost(); }, [loadPost]);

  // Helper: stream from an SSE endpoint
  async function streamSSE(
    url: string,
    body: Record<string, unknown>,
    onDelta: (text: string) => void,
    onStatus: (msg: string) => void
  ): Promise<string> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Request failed");

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No body");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let completeDraft = ""; // Fallback: the editedDraft from the "complete" event

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "delta") { fullText += event.text; onDelta(event.text); }
          else if (event.type === "status") { onStatus(event.message); }
          else if (event.type === "complete" && event.editedDraft) { completeDraft = event.editedDraft; }
          else if (event.type === "error") throw new Error(event.error);
        } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
      }
    }
    // Use streamed text if we got it, otherwise fall back to the complete event's editedDraft
    return fullText || completeDraft;
  }

  // ── Stage 1: Generate Brief ──
  async function handleGenerateBrief() {
    if (!post) return;
    setIsRunning(true); setError(null); setStreamOutput(""); setStatusMessage("Starting research...");
    try {
      const text = await streamSSE("/api/content/brief", {
        postId: post.id,
        keyword: post.primary_keyword,
        postType: post.post_type,
        searchIntent: post.search_intent,
        wordCount: post.word_count || 1800,
      }, (delta) => setStreamOutput((p) => p + delta), setStatusMessage);
      setEditorHtml(markdownToHtml(text));
      await loadPost();
    } catch (err) { setError(err instanceof Error ? err.message : "Brief failed"); }
    setIsRunning(false); setStatusMessage("");
  }

  // ── Approve Brief ──
  async function handleApproveBrief() {
    if (!post) return;
    const currentBrief = editorRef.current?.getText() || post.brief;
    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, status: "brief_approved", brief: currentBrief }),
    });
    await loadPost();
    setEditorHtml("");
  }

  // ── Stage 2: Generate Draft ──
  async function handleGenerateDraft() {
    if (!post) return;
    setIsRunning(true); setError(null); setStreamOutput(""); setStatusMessage("Loading brand context...");
    try {
      const text = await streamSSE("/api/content/write", {
        postId: post.id,
        brief: post.brief,
        keyword: post.primary_keyword,
        wordCount: post.word_count || 1800,
      }, (delta) => setStreamOutput((p) => p + delta), setStatusMessage);
      setEditorHtml(markdownToHtml(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Writing failed");
    } finally {
      // Always refetch — the pipeline may have updated the DB even if the
      // stream threw after the fact, and we never want the UI to revert
      // to a stale status.
      await loadPost();
      setIsRunning(false);
      setStatusMessage("");
    }
  }

  // ── Stage 3: Run Editor ──
  async function handleRunEditor() {
    if (!post) return;
    const draftToEdit = editorRef.current?.getText() || post.draft;
    setIsRunning(true); setError(null); setStreamOutput(""); setStatusMessage("Scanning for violations...");
    try {
      const text = await streamSSE("/api/content/edit", {
        postId: post.id,
        draft: draftToEdit,
        wordCount: post.word_count || 1800,
      }, (delta) => setStreamOutput((p) => p + delta), setStatusMessage);
      setEditorHtml(markdownToHtml(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Editing failed");
    } finally {
      await loadPost();
      setIsRunning(false);
      setStatusMessage("");
    }
  }

  // ── Stage 4: Mark Complete ──
  async function handleMarkComplete() {
    if (!post) return;
    const finalContent = editorRef.current?.getText() || post.edited_draft || post.draft;
    await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: post.id, status: "published", edited_draft: finalContent }),
    });
    await loadPost();
  }

  // ── BATCH: Run Full Pipeline (Brief → Write → Edit) ──
  const [batchStage, setBatchStage] = useState<string>("");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [batchDraft, setBatchDraft] = useState("");

  async function handleRunFullPipeline() {
    if (!post) return;
    setIsRunning(true); setError(null); setStreamOutput(""); setStatusMessage("Starting full pipeline...");
    setBatchStage("brief"); setBatchDraft("");

    try {
      const res = await fetch("/api/content/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          keyword: post.primary_keyword,
          postType: post.post_type,
          searchIntent: post.search_intent,
          wordCount: post.word_count || 1800,
        }),
      });
      if (!res.ok) throw new Error("Batch request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullEdit = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            switch (event.type) {
              case "stage":
                setBatchStage(event.stage);
                setStatusMessage(event.message);
                if (event.stage === "edit") {
                  // Clear stream for the edit stage output
                  setStreamOutput("");
                }
                break;
              case "status":
                setStatusMessage(event.message);
                break;
              case "brief_complete":
                setStatusMessage("Brief complete. Starting draft...");
                break;
              case "write_complete":
                setBatchDraft(event.draft);
                setStatusMessage(`Draft complete (${event.wordCount} words). Starting editor...`);
                setStreamOutput("");
                break;
              case "delta":
                if (event.stage === "edit") {
                  fullEdit += event.text;
                  setStreamOutput((p) => p + event.text);
                } else if (event.stage === "write") {
                  setBatchDraft((p) => p + event.text);
                  // Show write progress in status
                }
                break;
              case "violations":
                setStatusMessage(`Found ${event.count} pattern violations, ${event.dupeLinks || 0} duplicate links. Fixing...`);
                break;
              case "complete":
                setEditorHtml(markdownToHtml(event.editedDraft || fullEdit));
                setBatchStage("complete");
                setStatusMessage(`Pipeline complete! ${event.wordCount} words, ${event.gatesPassed}/${event.gatesTotal} quality gates passed.`);
                break;
              case "error":
                throw new Error(event.error);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      // Always refetch — the batch may have completed its DB writes even
      // if the stream errored after the final save, and we never want
      // the UI to revert to a stale status.
      await loadPost();
      setIsRunning(false);
    }
  }

  // ── Refine via chat ──
  async function handleRefine(e: FormEvent) {
    e.preventDefault();
    const currentText = editorRef.current?.getText() || "";
    if (!refineInput.trim() || !currentText) return;
    setIsRefining(true);
    const instruction = refineInput.trim();
    setRefineInput("");
    try {
      const res = await fetch("/api/agent/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentOutput: currentText, instruction }),
      });
      if (!res.ok) throw new Error("Refine failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");
      const decoder = new TextDecoder();
      let buffer = ""; let newMd = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const ev = JSON.parse(line.slice(6)); if (ev.type === "text") newMd += ev.text; } catch { /* skip */ }
        }
      }
      setEditorHtml(markdownToHtml(newMd));
    } catch { setError("Refine failed"); }
    setIsRefining(false);
  }

  function handleCopy() {
    const text = editorRef.current?.getText() || "";
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function handleExport() {
    const html = editorRef.current?.getHTML() || editorHtml;
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const children: InstanceType<typeof Paragraph>[] = [];
      doc.body.childNodes.forEach((node) => {
        const el = node as HTMLElement;
        const tag = el.tagName?.toLowerCase();
        if (tag === "h1") children.push(new Paragraph({ text: el.textContent || "", heading: HeadingLevel.HEADING_1 }));
        else if (tag === "h2") children.push(new Paragraph({ text: el.textContent || "", heading: HeadingLevel.HEADING_2 }));
        else if (tag === "h3") children.push(new Paragraph({ text: el.textContent || "", heading: HeadingLevel.HEADING_3 }));
        else if (tag === "p") children.push(new Paragraph({ children: [new TextRun({ text: el.textContent || "" })] }));
        else if (el.textContent?.trim()) children.push(new Paragraph({ text: el.textContent }));
      });
      const docx = new Document({ sections: [{ children }] });
      const blob = await Packer.toBlob(docx);
      const { saveAs } = await import("file-saver");
      saveAs(blob, `${post?.title || post?.primary_keyword || "article"}.docx`);
    } catch {
      const text = editorRef.current?.getText() || "";
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `${post?.primary_keyword || "article"}.txt`; a.click();
    }
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!post) return <div className="flex flex-col items-center justify-center h-screen"><p className="text-gray-500 mb-4">Post not found.</p><button onClick={() => router.push("/content")} className="text-sm text-brand-500 font-medium">Back to Pipeline</button></div>;

  const currentStage = stageIndex(post.status);
  const currentContent = post.edited_draft || post.draft || post.brief;
  const gates = post.editor_notes?.gates as Gate[] | undefined;

  // Load editor with current content when post changes
  if (!editorHtml && currentContent && !isRunning) {
    // Defer to avoid render loop
    setTimeout(() => setEditorHtml(markdownToHtml(currentContent)), 0);
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center gap-4 mb-3">
          <button onClick={() => router.push("/content")} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">{post.title || post.primary_keyword}</h1>
            <p className="text-xs text-gray-400">{post.primary_keyword} · {post.post_type} · {post.word_count || "—"}w target</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${i <= currentStage ? "bg-brand-500" : "bg-gray-200"}`} />
              {i < STAGES.length - 1 && <div className="w-0.5" />}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {STAGES.map((s, i) => (
            <span key={s.key} className={`text-[10px] ${i <= currentStage ? "text-brand-500 font-medium" : "text-gray-400"}`}>
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex max-w-6xl mx-auto">
          {/* Main panel */}
          <div className="flex-1 px-6 py-6 min-w-0">
            {/* Status message during processing */}
            {isRunning && (
              <div className="mb-4">
                {/* Batch pipeline progress */}
                {batchStage && (
                  <div className="mb-3 flex items-center gap-2">
                    {["brief", "write", "edit"].map((s, i) => {
                      const stages = ["brief", "write", "edit"];
                      const currentIdx = stages.indexOf(batchStage);
                      const isActive = s === batchStage;
                      const isDone = currentIdx > i || batchStage === "complete";
                      return (
                        <div key={s} className="flex items-center gap-2 flex-1">
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-1 justify-center ${
                            isActive ? "bg-brand-500 text-white" : isDone ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
                          }`}>
                            {isDone && !isActive ? "✓" : isActive ? (
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : null}
                            {s === "brief" ? "Research & Brief" : s === "write" ? "Writing" : "Editing"}
                          </div>
                          {i < 2 && <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3 bg-brand-50 rounded-xl border border-brand-100">
                  <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin shrink-0" />
                  <span className="text-sm text-brand-600">{statusMessage || "Processing..."}</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 px-4 py-3 bg-red-50 rounded-xl border border-red-200 text-sm text-red-700">{error}</div>
            )}

            {/* Stage-specific actions */}
            {!isRunning && post.status === "queued" && (
              <div className="mb-6 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 p-6 text-center">
                <div className="text-3xl mb-3">🔍</div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Stage 1: Research & Brief</h2>
                <p className="text-sm text-gray-500 mb-4">Claude will research top-ranking articles, analyze content gaps, and generate a detailed brief.</p>
                <div className="flex items-center justify-center gap-3">
                  <button onClick={handleGenerateBrief} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm">
                    <span>⚡</span> Generate Brief
                  </button>
                  <span className="text-xs text-gray-400">or</span>
                  <button onClick={handleRunFullPipeline} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-brand-500 to-indigo-600 rounded-xl hover:from-brand-600 hover:to-indigo-700 transition-all shadow-sm">
                    <span>🚀</span> Run Full Pipeline
                    <span className="text-[10px] bg-white/20 rounded-md px-1.5 py-0.5">Brief → Write → Edit</span>
                  </button>
                </div>
              </div>
            )}

            {!isRunning && post.status === "brief_generated" && !editorHtml && (
              <div className="mb-6 bg-gradient-to-br from-blue-50 to-white rounded-2xl border border-blue-100 p-6 text-center">
                <div className="text-3xl mb-3">📋</div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Brief Ready for Review</h2>
                <p className="text-sm text-gray-500 mb-4">Review the brief below, make any edits, then approve to move to writing.</p>
              </div>
            )}

            {!isRunning && post.status === "brief_approved" && (
              <div className="mb-6 bg-gradient-to-br from-amber-50 to-white rounded-2xl border border-amber-100 p-6 text-center">
                <div className="text-3xl mb-3">✍️</div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Stage 2: Write Draft</h2>
                <p className="text-sm text-gray-500 mb-4">Claude Opus will write the full article using your brand voice and approved brief.</p>
                <button onClick={handleGenerateDraft} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm">
                  <span>✨</span> Generate Draft (Opus 4.6)
                </button>
              </div>
            )}

            {!isRunning && post.status === "draft_complete" && (
              <div className="mb-6 bg-gradient-to-br from-purple-50 to-white rounded-2xl border border-purple-100 p-6 text-center">
                <div className="text-3xl mb-3">🔧</div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">Stage 3: Editorial Pipeline</h2>
                <p className="text-sm text-gray-500 mb-4">3-call editorial pipeline: violation scan → annotated version → clean final version.</p>
                <button onClick={handleRunEditor} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm">
                  <span>⚡</span> Run Editor (3 Passes)
                </button>
              </div>
            )}

            {/* Streaming output during generation */}
            {isRunning && streamOutput && (
              <div className="mb-4 bg-white rounded-xl border border-gray-200 p-4 max-h-[500px] overflow-y-auto">
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {streamOutput}
                  <span className="inline-block w-0.5 h-4 bg-brand-500 animate-pulse ml-0.5 align-text-bottom" />
                </div>
              </div>
            )}

            {/* Rich text editor for completed stages */}
            {!isRunning && editorHtml && (
              <div className="rounded-2xl border-2 border-gray-200 bg-white overflow-hidden shadow-sm mb-4">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-medium text-gray-500">
                    {post.status === "brief_generated" ? "Brief" : post.status === "edited" ? "Edited Draft" : "Draft"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {gates && (
                      <button onClick={() => setShowNotes(!showNotes)} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">
                        {showNotes ? "Hide Notes" : "Editor Notes"}
                      </button>
                    )}
                    <button onClick={handleCopy} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">
                      {copied ? "✓ Copied" : "Copy"}
                    </button>
                    <button onClick={handleExport} className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100">
                      Export .docx
                    </button>
                  </div>
                </div>

                <RichTextEditor ref={editorRef} content={editorHtml} onChange={setEditorHtml} />

                {/* Refine input */}
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <form onSubmit={handleRefine} className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <input type="text" value={refineInput} onChange={(e) => setRefineInput(e.target.value)} placeholder='Refine: "Make it shorter", "Add examples", "More data"...'
                        disabled={isRefining} className="w-full rounded-xl border bg-white px-4 py-2.5 pr-28 text-sm focus:outline-none focus:ring-1 disabled:opacity-50 transition-colors border-gray-300 focus:border-brand-400 focus:ring-brand-400" />
                      <div className="absolute right-2 top-1.5">
                        <VoiceProcessor value={refineInput} onChange={setRefineInput} context="content" disabled={isRefining} micSize="sm" />
                      </div>
                    </div>
                    <button type="submit" disabled={!refineInput.trim() || isRefining}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0">
                      {isRefining ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Refine"}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Stage action buttons */}
            {!isRunning && editorHtml && (
              <div className="flex gap-3">
                {post.status === "brief_generated" && (
                  <button onClick={handleApproveBrief} className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
                    ✓ Approve Brief
                  </button>
                )}
                {post.status === "edited" && (
                  <>
                    <button onClick={handleRunEditor} className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors">
                      ↻ Re-run Editor
                    </button>
                    <button onClick={handleMarkComplete} className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
                      ✓ Mark Complete
                    </button>
                  </>
                )}
                {post.status === "draft_complete" && (
                  <button onClick={handleRunEditor} className="px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-xl hover:bg-purple-700 transition-colors shadow-sm">
                    Run Editor (3 Passes)
                  </button>
                )}
                {(post.status === "published" || post.status === "approved") && (
                  <button
                    onClick={() => router.push(`/refresh?postId=${post.id}&url=${encodeURIComponent(post.primary_keyword ? `https://sequel.io/post/${post.primary_keyword.replace(/\s+/g, "-").toLowerCase()}` : "")}&keyword=${encodeURIComponent(post.primary_keyword)}`)}
                    className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    Refresh & Optimize
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar: editor notes & quality gates */}
          {showNotes && post.editor_notes && (
            <div className="w-80 border-l border-gray-200 bg-gray-50 p-4 overflow-y-auto shrink-0">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quality Gates</h3>
              {gates && (
                <div className="space-y-1.5 mb-6">
                  {gates.map((g, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${g.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      <span>{g.passed ? "✓" : "✗"}</span>
                      <span className="font-medium">{g.name}</span>
                      <span className="ml-auto text-[10px] opacity-75">{g.detail}</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 mt-2">
                    {post.editor_notes.gatesPassed}/{post.editor_notes.gatesTotal} gates passed
                  </p>
                </div>
              )}

              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Editor Notes</h3>
              {post.editor_notes.call1 && (
                <div className="bg-white rounded-lg border border-gray-200 p-3 text-xs text-gray-600 whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                  {post.editor_notes.call1}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
