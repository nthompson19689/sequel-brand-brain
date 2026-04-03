"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { markdownToHtml } from "@/lib/markdown-to-html";
import type { RichTextEditorRef } from "@/components/editor/RichTextEditor";

const RichTextEditor = dynamic(() => import("@/components/editor/RichTextEditor"), { ssr: false });

interface Gate {
  name: string;
  passed: boolean;
  detail: string;
}

/** Read an SSE stream, calling onEvent for each parsed JSON event. */
async function readSSE(
  res: Response,
  onEvent: (data: Record<string, unknown>) => void,
) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
    }
  }
}

export default function ContentRefreshPage() {
  const searchParams = useSearchParams();

  const [url, setUrl] = useState(searchParams.get("url") || "");
  const [keyword, setKeyword] = useState(searchParams.get("keyword") || "");
  const [mode, setMode] = useState<"refresh" | "optimize" | "full">(
    (searchParams.get("mode") as "refresh" | "optimize" | "full") || "full"
  );
  const postId = searchParams.get("postId") || null;

  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [currentStep, setCurrentStep] = useState("");

  const [researchOutput, setResearchOutput] = useState("");
  const [auditOutput, setAuditOutput] = useState("");
  const [revisedOutput, setRevisedOutput] = useState("");
  const [editorHtml, setEditorHtml] = useState("");

  const [gates, setGates] = useState<Gate[]>([]);
  const [changeCount, setChangeCount] = useState(0);
  const [manualResearchCount, setManualResearchCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showResearch, setShowResearch] = useState(false);
  const [showAudit, setShowAudit] = useState(true);

  const editorRef = useRef<RichTextEditorRef>(null);
  const abortRef = useRef(false);

  useEffect(() => { return () => { abortRef.current = true; }; }, []);

  /** Call a single step of the refresh pipeline. Each gets its own 300s server window. */
  async function callStep(step: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const res = await fetch("/api/content/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, ...payload }),
    });
    if (!res.ok || !res.body) {
      setError(`Step "${step}" failed: ${res.status}`);
      return null;
    }

    let result: Record<string, unknown> | null = null;

    await readSSE(res, (data) => {
      if (abortRef.current) return;
      if (data.type === "status") {
        setStatusMessage(data.message as string);
        setCurrentStep(data.step as string);
      } else if (data.type === "delta") {
        if (data.step === "audit") setAuditOutput((prev) => prev + (data.text as string));
        else if (data.step === "revise") setRevisedOutput((prev) => prev + (data.text as string));
      } else if (data.type === "error") {
        setError(data.error as string);
      } else if (data.type === "complete") {
        result = data as Record<string, unknown>;
      }
    });

    return result;
  }

  async function runRefresh() {
    if (!url.trim()) return;
    abortRef.current = false;
    setIsRunning(true);
    setError(null);
    setResearchOutput("");
    setAuditOutput("");
    setRevisedOutput("");
    setEditorHtml("");
    setGates([]);
    setChangeCount(0);
    setManualResearchCount(0);
    setWordCount(0);
    setCurrentStep("fetch");
    setStatusMessage("Starting...");

    try {
      // ── Step 1: Research (own 300s window) ──
      const researchResult = await callStep("research", {
        url: url.trim(),
        mode,
        keyword: keyword.trim() || undefined,
      });
      if (!researchResult || abortRef.current) { setIsRunning(false); return; }

      const articleText = researchResult.articleText as string;
      const research = researchResult.research as string;
      setResearchOutput(research);

      // ── Step 2: Audit (own 300s window) ──
      const auditResult = await callStep("audit", {
        articleText,
        research,
        mode,
        keyword: keyword.trim() || undefined,
        url: url.trim(),
      });
      if (!auditResult || abortRef.current) { setIsRunning(false); return; }

      const audit = auditResult.audit as string;

      // ── Step 3: Revise (own 300s window) ──
      const reviseResult = await callStep("revise", {
        articleText,
        audit,
        postId: postId || undefined,
        mode,
      });
      if (!reviseResult || abortRef.current) { setIsRunning(false); return; }

      setGates((reviseResult.gates as Gate[]) || []);
      setChangeCount((reviseResult.changeCount as number) || 0);
      setManualResearchCount((reviseResult.manualResearchCount as number) || 0);
      setWordCount((reviseResult.wordCount as number) || 0);

      if (reviseResult.revisedArticle) {
        const html = await markdownToHtml(reviseResult.revisedArticle as string);
        setEditorHtml(html);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }

    setIsRunning(false);
    setCurrentStep("");
  }

  const gatesPassed = gates.filter((g) => g.passed).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">Content Refresh & Optimize</h1>
          <p className="text-sm text-gray-500 mt-1">Update outdated stats, fix SEO gaps, and optimize for current SERPs.</p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {/* Input Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Article URL</label>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sequel.io/post/your-article" disabled={isRunning} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Keyword <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. webinar presentation tips" disabled={isRunning} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Audit Mode</label>
              <div className="flex gap-3">
                {([
                  { value: "refresh" as const, label: "Refresh", desc: "Update stats, examples, and links" },
                  { value: "optimize" as const, label: "Optimize", desc: "SEO, AEO, and E-E-A-T improvements" },
                  { value: "full" as const, label: "Full", desc: "Both refresh and optimize" },
                ]).map((opt) => (
                  <button key={opt.value} onClick={() => setMode(opt.value)} disabled={isRunning} className={`flex-1 px-4 py-3 rounded-lg border text-left transition-colors ${mode === opt.value ? "border-blue-500 bg-blue-50 text-blue-900" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"} disabled:opacity-50`}>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={runRefresh} disabled={isRunning || !url.trim()} className="w-full py-2.5 px-4 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {statusMessage || "Running..."}
                </span>
              ) : (
                `Run ${mode.charAt(0).toUpperCase() + mode.slice(1)} Audit`
              )}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        {/* Progress */}
        {isRunning && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex gap-2">
              {["fetch", "research", "audit", "revise", "quality"].map((s) => {
                const steps = ["fetch", "research", "audit", "revise", "quality"];
                const currentIdx = steps.indexOf(currentStep);
                const thisIdx = steps.indexOf(s);
                return <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${thisIdx === currentIdx ? "bg-blue-500 animate-pulse" : thisIdx < currentIdx ? "bg-emerald-500" : "bg-gray-200"}`} />;
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">{statusMessage}</p>
          </div>
        )}

        {/* Research */}
        {researchOutput && (
          <div className="bg-white rounded-xl border border-gray-200">
            <button onClick={() => setShowResearch(!showResearch)} className="w-full px-6 py-3 flex items-center justify-between text-left">
              <span className="text-sm font-medium text-gray-700">Research Findings</span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showResearch ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showResearch && <div className="px-6 pb-4 text-sm text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-3 max-h-96 overflow-y-auto">{researchOutput}</div>}
          </div>
        )}

        {/* Audit */}
        {auditOutput && (
          <div className="bg-white rounded-xl border border-gray-200">
            <button onClick={() => setShowAudit(!showAudit)} className="w-full px-6 py-3 flex items-center justify-between text-left">
              <span className="text-sm font-medium text-gray-700">
                Audit Results
                {changeCount > 0 && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{changeCount} changes</span>}
                {manualResearchCount > 0 && <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{manualResearchCount} need research</span>}
              </span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${showAudit ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showAudit && <div className="px-6 pb-4 text-sm text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-3 max-h-[600px] overflow-y-auto">{auditOutput}</div>}
          </div>
        )}

        {/* Quality Gates */}
        {gates.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Quality Gates: {gatesPassed}/{gates.length} passed</h3>
            <div className="grid grid-cols-2 gap-2">
              {gates.map((g, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg ${g.passed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  <span>{g.passed ? "✓" : "✗"}</span>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-gray-500 ml-auto">{g.detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revised Article */}
        {(revisedOutput || editorHtml) && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700">
                Revised Article{wordCount > 0 && <span className="ml-2 text-xs text-gray-400">{wordCount} words</span>}
              </h3>
              <button onClick={() => navigator.clipboard.writeText(revisedOutput)} className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">Copy Markdown</button>
            </div>
            {editorHtml ? (
              <div className="border border-gray-200 rounded-lg"><RichTextEditor ref={editorRef} content={editorHtml} /></div>
            ) : (
              <div className="text-sm text-gray-600 whitespace-pre-wrap max-h-[600px] overflow-y-auto">{revisedOutput}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
