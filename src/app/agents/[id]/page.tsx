"use client";

import { useEffect, useState, useRef, useCallback, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  STEP_TYPE_META,
  type Agent,
  type StepType,
} from "@/lib/agents";
import { markdownToHtml } from "@/lib/markdown-to-html";
import Markdown from "@/components/ui/Markdown";
import MicButton from "@/components/ui/MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import type { RichTextEditorRef } from "@/components/editor/RichTextEditor";

const RichTextEditor = dynamic(
  () => import("@/components/editor/RichTextEditor"),
  { ssr: false }
);

interface StepState {
  status: "pending" | "running" | "complete" | "review" | "approved";
  output: string;
}

function StepIcon({ type, className }: { type: StepType; className?: string }) {
  const meta = STEP_TYPE_META[type];
  return (
    <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
    </svg>
  );
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-200 text-gray-500",
  running: "bg-brand-500 text-white animate-pulse",
  complete: "bg-emerald-500 text-white",
  review: "bg-violet-500 text-white animate-pulse",
  approved: "bg-emerald-500 text-white",
};

interface HistoryOutput {
  id: string;
  input_query: string | null;
  output_content: string;
  output_html: string | null;
  status: string;
  created_at: string;
}

export default function AgentRunnerPage() {
  const params = useParams();
  const router = useRouter();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  // Pipeline state
  const [input, setInput] = useState("");
  const { isListening: inputListening, supported: inputMicSupported, toggle: toggleInputMic } = useSpeechToText({
    onTranscript: (text) => setInput(text),
    currentValue: input,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [stepStates, setStepStates] = useState<StepState[]>([]);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [pausedAtStep, setPausedAtStep] = useState<number | null>(null);

  // Editable output state
  const [editorHtml, setEditorHtml] = useState("");
  const [refineInput, setRefineInput] = useState("");
  const { isListening: refineListening, supported: refineMicSupported, toggle: toggleRefineMic } = useSpeechToText({
    onTranscript: (text) => setRefineInput(text),
    currentValue: refineInput,
  });
  const [isRefining, setIsRefining] = useState(false);
  const [savedOutputId, setSavedOutputId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [copied, setCopied] = useState(false);

  // History tab
  const [activeTab, setActiveTab] = useState<"run" | "history" | "feedback">("run");
  const [history, setHistory] = useState<HistoryOutput[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Feedback tab
  interface FeedbackItem {
    id: string;
    feedback_type: string;
    explicit_feedback: string | null;
    patterns_detected: string[] | null;
    original_output: string | null;
    edited_output: string | null;
    applied: boolean;
    created_at: string;
  }
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyingFeedback, setApplyingFeedback] = useState(false);
  const [appliedPreview, setAppliedPreview] = useState<{ updatedPrompt: string; changes: string[] } | null>(null);

  // Feedback
  const [originalOutput, setOriginalOutput] = useState(""); // snapshot for diff tracking
  const [thumbsGiven, setThumbsGiven] = useState<"up" | "down" | null>(null);
  const [showTeachForm, setShowTeachForm] = useState(false);
  const [teachText, setTeachText] = useState("");
  const [teachSaving, setTeachSaving] = useState(false);
  const [showThumbsDownForm, setShowThumbsDownForm] = useState(false);
  const [thumbsDownReasons, setThumbsDownReasons] = useState<string[]>([]);
  const [thumbsDownOther, setThumbsDownOther] = useState("");
  const [feedbackSaved, setFeedbackSaved] = useState(false);

  const outputEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorRef>(null);

  const scrollToBottom = useCallback(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [stepStates, scrollToBottom]);

  // Load agent from Supabase
  useEffect(() => {
    const id = params.id as string;
    (async () => {
      try {
        const res = await fetch("/api/agents");
        if (res.ok) {
          const data = await res.json();
          const found = (data.agents || []).find((a: Agent) => a.id === id);
          if (found) {
            found.steps = found.steps || [];
            found.output_format = found.output_format || "";
            found.reference_examples = found.reference_examples || "";
            found.model = found.model || "claude-sonnet-4-6";
            setAgent(found);
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [params.id]);

  // Load output history for this agent
  const fetchHistory = useCallback(async () => {
    const id = params.id as string;
    if (!id) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/outputs?agent_id=${id}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.outputs || []);
      }
    } catch { /* ignore */ }
    setHistoryLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Load feedback for this agent
  const fetchFeedback = useCallback(async () => {
    const id = params.id as string;
    if (!id) return;
    setFeedbackLoading(true);
    try {
      const res = await fetch(`/api/feedback?agent_id=${id}`);
      if (res.ok) {
        const data = await res.json();
        setFeedbackItems(data.feedback || []);
      }
    } catch { /* ignore */ }
    setFeedbackLoading(false);
  }, [params.id]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  // Apply pending feedback to agent prompt
  async function handleApplyFeedback() {
    if (!agent) return;
    setApplyingFeedback(true);
    try {
      const res = await fetch("/api/feedback/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppliedPreview({
          updatedPrompt: data.updated_prompt || "",
          changes: data.changes || [],
        });
      }
    } catch { /* ignore */ }
    setApplyingFeedback(false);
  }

  // Save updated prompt after applying feedback
  async function handleSaveAppliedPrompt() {
    if (!agent || !appliedPreview) return;
    try {
      // Save the updated prompt to the agent
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...agent,
          system_prompt: appliedPreview.updatedPrompt,
        }),
      });

      // Mark all pending feedback as applied
      const pendingIds = feedbackItems.filter((f) => !f.applied).map((f) => f.id);
      if (pendingIds.length > 0) {
        await fetch("/api/feedback", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: pendingIds, applied: true }),
        });
      }

      // Update local agent state
      setAgent({ ...agent, system_prompt: appliedPreview.updatedPrompt });
      setShowApplyModal(false);
      setAppliedPreview(null);
      fetchFeedback();
    } catch { /* ignore */ }
  }

  const pendingFeedbackCount = feedbackItems.filter((f) => !f.applied).length;

  function toggleStep(index: number) {
    setExpandedSteps((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function runPipeline(resumeFrom?: number, prevOutputs?: Record<string, string>) {
    if (!agent || (!input.trim() && resumeFrom === undefined)) return;

    setIsRunning(true);
    setError(null);
    setPipelineComplete(false);
    setPausedAtStep(null);
    setEditorHtml("");
    setSavedOutputId(null);
    setSaveStatus("idle");

    if (resumeFrom === undefined) {
      setStepStates(agent.steps.map(() => ({ status: "pending", output: "" })));
      setExpandedSteps(new Set());
    }

    try {
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: input.trim(),
          systemPrompt: agent.system_prompt,
          steps: agent.steps,
          referenceExamples: agent.reference_examples || "",
          model: agent.model || "claude-sonnet-4-6",
          ...(resumeFrom !== undefined
            ? { resumeFromStep: resumeFrom, previousOutputs: prevOutputs }
            : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

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
            handleSSE(event);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pipeline failed");
    } finally {
      setIsRunning(false);
    }
  }

  function handleSSE(event: Record<string, unknown>) {
    const idx = event.stepIndex as number;

    switch (event.type) {
      case "step_start":
        setStepStates((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: "running", output: "" };
          return next;
        });
        setExpandedSteps((prev) => { const n = new Set(Array.from(prev)); n.add(idx); return n; });
        break;
      case "step_delta":
        setStepStates((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], output: next[idx].output + (event.text as string) };
          return next;
        });
        break;
      case "step_complete":
        setStepStates((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: "complete", output: event.output as string };
          return next;
        });
        break;
      case "human_review":
        setStepStates((prev) => {
          const next = [...prev];
          if (next[idx]) next[idx] = { ...next[idx], status: "review", output: event.prompt as string };
          return next;
        });
        setPausedAtStep(idx);
        break;
      case "pipeline_complete":
        setPipelineComplete(true);
        if (agent) {
          setExpandedSteps((prev) => { const n = new Set(Array.from(prev)); n.add(agent.steps.length - 1); return n; });
          // Convert markdown output to HTML for the Tiptap editor + auto-save
          setStepStates((prev) => {
            const finalOutput = prev[prev.length - 1]?.output || "";
            const html = markdownToHtml(finalOutput);
            setEditorHtml(html);
            setOriginalOutput(html); // snapshot for edit diff tracking
            setThumbsGiven(null);
            setFeedbackSaved(false);

            // Auto-save output to Supabase (fire and forget)
            fetch("/api/outputs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agent_id: agent.id,
                agent_name: agent.name,
                agent_icon: agent.icon,
                input_query: input,
                output_content: finalOutput,
                output_html: html,
                status: "draft",
              }),
            })
              .then((r) => r.json())
              .then((data) => {
                if (data.output?.id) {
                  setSavedOutputId(data.output.id);
                }
                fetchHistory(); // Refresh the history tab
              })
              .catch(() => { /* non-critical */ });

            return prev;
          });
        }
        break;
      case "error":
        setError(event.error as string);
        break;
    }
  }

  function handleApproveStep() {
    if (pausedAtStep === null || !agent) return;
    setStepStates((prev) => {
      const next = [...prev];
      if (next[pausedAtStep]) next[pausedAtStep] = { ...next[pausedAtStep], status: "approved" };
      return next;
    });
    const prevOutputs: Record<string, string> = {};
    stepStates.forEach((s, i) => {
      if (s.status === "complete" || s.status === "approved") {
        prevOutputs[String(i + 1)] = s.output;
      }
    });
    runPipeline(pausedAtStep + 1, prevOutputs);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runPipeline();
  }

  // ── Refine output via chat ──
  async function handleRefine(e: FormEvent) {
    e.preventDefault();
    // Get current content from the editor as plain text for Claude
    const currentText = editorRef.current?.getText() || "";
    if (!refineInput.trim() || !currentText || isRefining) return;

    setIsRefining(true);
    const instruction = refineInput.trim();
    setRefineInput("");

    try {
      const res = await fetch("/api/agent/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentOutput: currentText,
          instruction,
          systemPrompt: agent?.system_prompt || "",
        }),
      });

      if (!res.ok) throw new Error("Refine failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");

      const decoder = new TextDecoder();
      let buffer = "";
      let newMarkdown = "";

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
            if (event.type === "text") {
              newMarkdown += event.text;
            }
          } catch { /* skip */ }
        }
      }

      // Convert refined markdown to HTML and update editor
      const html = markdownToHtml(newMarkdown);
      setEditorHtml(html);
      setSaveStatus("idle");
    } catch {
      setError("Failed to refine output");
    } finally {
      setIsRefining(false);
    }
  }

  // ── Save output ──
  async function handleSave() {
    const html = editorRef.current?.getHTML() || editorHtml;
    if (!html || !agent) return;
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/outputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: savedOutputId || undefined,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_icon: agent.icon,
          input_query: input,
          output_content: html,
          output_html: html,
          status: "final",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedOutputId(data.output?.id || null);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
        fetchHistory();

        // Edit diff tracking — compare original to saved version
        if (originalOutput && html !== originalOutput) {
          fetch("/api/feedback/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ original: originalOutput, edited: html }),
          })
            .then((r) => r.json())
            .then((analysis) => {
              if (analysis.patterns && analysis.patterns.length > 0) {
                fetch("/api/feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    agent_id: agent.id,
                    feedback_type: "edit_diff",
                    original_output: originalOutput,
                    edited_output: html,
                    patterns_detected: analysis.patterns,
                  }),
                }).catch(() => {});
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      setSaveStatus("idle");
    }
  }

  // ── Copy to clipboard ──
  function handleCopy() {
    const text = editorRef.current?.getText() || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Export as .docx ──
  async function handleExport() {
    const html = editorRef.current?.getHTML() || editorHtml;
    try {
      const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

      // Parse HTML into docx paragraphs
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const children: InstanceType<typeof Paragraph>[] = [];

      const processNode = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) return;
        const el = node as HTMLElement;
        const tag = el.tagName?.toLowerCase();

        if (tag === "h1") {
          children.push(new Paragraph({ text: el.textContent || "", heading: HeadingLevel.HEADING_1 }));
        } else if (tag === "h2") {
          children.push(new Paragraph({ text: el.textContent || "", heading: HeadingLevel.HEADING_2 }));
        } else if (tag === "h3") {
          children.push(new Paragraph({ text: el.textContent || "", heading: HeadingLevel.HEADING_3 }));
        } else if (tag === "p") {
          const runs: InstanceType<typeof TextRun>[] = [];
          el.childNodes.forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
              runs.push(new TextRun({ text: child.textContent || "" }));
            } else {
              const childEl = child as HTMLElement;
              const childTag = childEl.tagName?.toLowerCase();
              runs.push(new TextRun({
                text: childEl.textContent || "",
                bold: childTag === "strong" || childTag === "b",
                italics: childTag === "em" || childTag === "i",
                underline: childTag === "u" ? {} : undefined,
              }));
            }
          });
          const align = el.style?.textAlign;
          children.push(new Paragraph({
            children: runs,
            alignment: align === "center" ? AlignmentType.CENTER : align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          }));
        } else if (tag === "ul" || tag === "ol") {
          el.querySelectorAll("li").forEach((li) => {
            children.push(new Paragraph({
              text: li.textContent || "",
              bullet: tag === "ul" ? { level: 0 } : undefined,
              numbering: tag === "ol" ? { reference: "default-numbering", level: 0 } : undefined,
            }));
          });
        } else if (tag === "blockquote") {
          children.push(new Paragraph({
            children: [new TextRun({ text: el.textContent || "", italics: true })],
            indent: { left: 720 },
          }));
        } else {
          // Recurse
          el.childNodes.forEach(processNode);
        }
      };

      doc.body.childNodes.forEach(processNode);

      if (children.length === 0) {
        children.push(new Paragraph({ text: doc.body.textContent || "" }));
      }

      const docx = new Document({
        sections: [{ children }],
      });

      const blob = await Packer.toBlob(docx);
      const { saveAs } = await import("file-saver");
      saveAs(blob, `${agent?.name || "output"} - ${new Date().toLocaleDateString()}.docx`);
    } catch (err) {
      console.error("Export failed:", err);
      // Fallback: export as text
      const text = editorRef.current?.getText() || "";
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agent?.name || "output"}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <p className="text-gray-500 mb-4">Agent not found.</p>
        <button onClick={() => router.push("/agents")} className="text-sm text-brand-500 hover:text-brand-600 font-medium">
          Back to Agents
        </button>
      </div>
    );
  }

  const hasRun = stepStates.length > 0;

  return (
    <div className="flex flex-col h-screen">
      {/* Agent header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/agents")} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl">{agent.icon}</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-gray-900">{agent.name}</h1>
            <p className="text-sm text-gray-500 truncate">{agent.description}</p>
          </div>
          <div className="text-xs text-gray-400">{agent.steps.length} steps</div>
          {pendingFeedbackCount > 0 && (
            <button
              onClick={() => { setShowApplyModal(true); handleApplyFeedback(); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-100 rounded-lg hover:bg-brand-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              Review &amp; Apply Feedback ({pendingFeedbackCount})
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6 shrink-0">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab("run")}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "run"
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Run Agent
          </button>
          <button
            onClick={() => { setActiveTab("history"); fetchHistory(); }}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "history"
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            History
            {history.length > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{history.length}</span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab("feedback"); fetchFeedback(); }}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "feedback"
                ? "border-brand-500 text-brand-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Feedback
            {feedbackItems.length > 0 && (
              <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5">{feedbackItems.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Apply Feedback Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowApplyModal(false); setAppliedPreview(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Review &amp; Apply Feedback</h2>
              <button onClick={() => { setShowApplyModal(false); setAppliedPreview(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              {applyingFeedback ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-3 text-sm text-gray-500">Analyzing feedback and generating updated prompt...</span>
                </div>
              ) : appliedPreview ? (
                <div className="space-y-4">
                  {appliedPreview.changes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">Changes to be applied:</h3>
                      <ul className="space-y-1">
                        {appliedPreview.changes.map((change, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Updated Prompt Preview:</h3>
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 max-h-[300px] overflow-y-auto">
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{appliedPreview.updatedPrompt}</pre>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleSaveAppliedPrompt}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors"
                    >
                      Save Updated Prompt
                    </button>
                    <button
                      onClick={() => { setShowApplyModal(false); setAppliedPreview(null); }}
                      className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No feedback to apply.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      {activeTab === "feedback" ? (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto">
            {feedbackLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : feedbackItems.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.3 48.3 0 0 0 5.862-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-heading">No feedback yet</h3>
                <p className="mt-1 text-xs text-body">Run this agent and provide feedback to improve it over time.</p>
              </div>
            ) : (
              <>
                {/* Stats line */}
                <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
                  <span>{feedbackItems.length} total feedback items</span>
                  <span>{pendingFeedbackCount} pending</span>
                  {feedbackItems.find((f) => f.applied) && (
                    <span>
                      Last applied: {new Date(
                        feedbackItems.filter((f) => f.applied).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.created_at
                      ).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Feedback items */}
                <div className="space-y-3">
                  {feedbackItems.map((f) => {
                    const date = new Date(f.created_at);
                    const typeBadge =
                      f.feedback_type === "thumbs_up" ? "bg-emerald-100 text-emerald-700" :
                      f.feedback_type === "thumbs_down" ? "bg-red-100 text-red-700" :
                      f.feedback_type === "edit_diff" ? "bg-blue-100 text-blue-700" :
                      "bg-purple-100 text-purple-700";
                    const typeLabel =
                      f.feedback_type === "thumbs_up" ? "Thumbs Up" :
                      f.feedback_type === "thumbs_down" ? "Thumbs Down" :
                      f.feedback_type === "edit_diff" ? "Edit Diff" :
                      "Explicit";

                    return (
                      <div
                        key={f.id}
                        className="p-4 bg-white rounded-xl border border-border hover:border-gray-300 transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${typeBadge}`}>
                              {typeLabel}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            f.applied ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {f.applied ? "Applied" : "Pending"}
                          </span>
                        </div>
                        {f.explicit_feedback && (
                          <p className="mt-2 text-sm text-gray-700">{f.explicit_feedback}</p>
                        )}
                        {f.patterns_detected && f.patterns_detected.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {f.patterns_detected.map((p, i) => (
                              <span key={i} className="text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{p}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : activeTab === "history" ? (
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto">
            {historyLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-brand-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-heading">No outputs yet</h3>
                <p className="mt-1 text-xs text-body">Run this agent to create your first output.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h) => {
                  const preview = (h.output_content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 250);
                  const date = new Date(h.created_at);
                  const statusBadge = h.status === "final"
                    ? "bg-emerald-100 text-emerald-700"
                    : h.status === "exported"
                    ? "bg-brand-100 text-brand-700"
                    : "bg-amber-100 text-amber-700";

                  return (
                    <div
                      key={h.id}
                      className="p-4 bg-white rounded-xl border border-border hover:border-brand-200 hover:shadow-sm transition-all cursor-pointer group"
                      onClick={() => {
                        setEditorHtml(h.output_html || h.output_content);
                        setSavedOutputId(h.id);
                        setInput(h.input_query || "");
                        setActiveTab("run");
                        setPipelineComplete(true);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {h.input_query && (
                            <p className="text-sm font-medium text-heading truncate">{h.input_query}</p>
                          )}
                          <p className="text-xs text-body mt-1 line-clamp-3">{preview || "No preview"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusBadge}`}>
                            {h.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-body/60 mt-2">
                        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Input form */}
          {!hasRun && (
            <div className="mb-8">
              {/* Step preview */}
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Pipeline</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {agent.steps.map((step, i) => {
                    const meta = STEP_TYPE_META[step.type];
                    return (
                      <div key={step.id} className="flex items-center gap-2">
                        {i > 0 && (
                          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                          </svg>
                        )}
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                          meta.color === "indigo" ? "bg-brand-100 text-brand-600" :
                          meta.color === "emerald" ? "bg-emerald-100 text-emerald-700" :
                          meta.color === "amber" ? "bg-amber-100 text-amber-700" :
                          meta.color === "cyan" ? "bg-cyan-100 text-cyan-700" :
                          "bg-violet-100 text-violet-700"
                        }`}>
                          <StepIcon type={step.type} className="w-3.5 h-3.5" />
                          {step.name || `Step ${i + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                <label className="block text-sm font-medium text-gray-700 mb-2">Input</label>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={agent.description}
                      className={`w-full rounded-xl border bg-white px-4 py-3 ${inputMicSupported ? "pr-11" : "pr-4"} text-sm focus:outline-none focus:ring-1 transition-colors ${
                        inputListening ? "border-red-400 focus:border-red-400 focus:ring-red-400" : "border-gray-300 focus:border-brand-400 focus:ring-brand-400"
                      }`}
                    />
                    <MicButton isListening={inputListening} supported={inputMicSupported} onClick={toggleInputMic} disabled={isRunning} size="sm" className="absolute right-2.5 top-2" />
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || isRunning}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                    </svg>
                    Run Pipeline
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Pipeline execution */}
          {hasRun && (
            <div className="space-y-3">
              {/* Input display */}
              <div className="bg-gray-100 rounded-xl px-4 py-3 text-sm text-gray-700">
                <span className="font-medium text-gray-500">Input:</span> {input}
              </div>

              {/* Steps */}
              {agent.steps.map((step, i) => {
                const state = stepStates[i];
                if (!state) return null;
                const meta = STEP_TYPE_META[step.type];
                const isExpanded = expandedSteps.has(i);
                const isFinalStep = i === agent.steps.length - 1;
                const isRunningStep = state.status === "running";
                const isReview = state.status === "review";

                return (
                  <div key={step.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleStep(i)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${STATUS_COLORS[state.status]}`}>
                        {state.status === "complete" || state.status === "approved" ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        ) : state.status === "running" ? (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        ) : <span>{i + 1}</span>}
                      </div>
                      <StepIcon type={step.type} className={`w-4 h-4 shrink-0 ${
                        meta.color === "indigo" ? "text-brand-500" :
                        meta.color === "emerald" ? "text-emerald-500" :
                        meta.color === "amber" ? "text-amber-500" :
                        meta.color === "cyan" ? "text-cyan-500" :
                        "text-violet-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900">{step.name || `Step ${i + 1}`}</span>
                        <span className="ml-2 text-xs text-gray-400">{meta.label}</span>
                      </div>
                      {(state.status === "complete" || state.status === "approved") && (
                        <span className="text-[10px] text-gray-400 shrink-0">{state.output.split(/\s+/).length} words</span>
                      )}
                      <svg className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className={`border-t border-gray-100 px-4 py-3 ${isFinalStep && pipelineComplete ? "bg-brand-50/50" : ""}`}>
                        {state.output ? (
                          <div className="text-sm text-gray-700 leading-relaxed max-h-[400px] overflow-y-auto">
                            {isRunningStep ? (
                              <div className="whitespace-pre-wrap">
                                {state.output}
                                <span className="inline-block w-0.5 h-4 bg-brand-500 animate-pulse ml-0.5 align-text-bottom" />
                              </div>
                            ) : (
                              <Markdown content={state.output} />
                            )}
                          </div>
                        ) : state.status === "pending" ? (
                          <p className="text-xs text-gray-400">Waiting...</p>
                        ) : isRunningStep ? (
                          <div className="flex items-center gap-2 text-xs text-brand-500">
                            <div className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                            Running...
                          </div>
                        ) : null}

                        {isReview && (
                          <div className="mt-4 pt-3 border-t border-violet-200 flex items-center gap-3">
                            <button
                              onClick={handleApproveStep}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              Approve &amp; Continue
                            </button>
                            <span className="text-xs text-violet-500">Pipeline is paused. Review the output above.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <span className="font-medium">Error:</span> {error}
                </div>
              )}

              {/* ═══ Rich Text Editor Output Panel ═══ */}
              {pipelineComplete && editorHtml && (
                <div className="rounded-2xl border-2 border-brand-200 bg-white overflow-hidden shadow-sm mt-4">
                  {/* Output header bar */}
                  <div className="flex items-center justify-between px-5 py-2.5 bg-brand-50 border-b border-brand-100">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <h3 className="font-semibold text-brand-900 text-sm">Output</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleCopy}
                        className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {copied ? "✓ Copied" : "Copy"}
                      </button>
                      <button
                        onClick={handleExport}
                        className="px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Export .docx
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saveStatus === "saving"}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                          saveStatus === "saved"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-brand-500 text-white hover:bg-brand-600"
                        }`}
                      >
                        {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "✓ Saved" : "Save"}
                      </button>
                    </div>
                  </div>

                  {/* Tiptap rich text editor */}
                  <RichTextEditor
                    ref={editorRef}
                    content={editorHtml}
                    onChange={(html) => {
                      setEditorHtml(html);
                      setSaveStatus("idle");
                    }}
                    placeholder="Your output will appear here..."
                  />

                  {/* ═══ Feedback Bar ═══ */}
                  <div className="flex items-center justify-between px-5 py-2 bg-white border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      {/* Thumbs */}
                      <div className="flex items-center gap-1 mr-2">
                        <button
                          onClick={() => {
                            setThumbsGiven("up");
                            fetch("/api/feedback", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ agent_id: agent?.id, feedback_type: "thumbs_up" }),
                            }).catch(() => {});
                            setFeedbackSaved(true);
                            setTimeout(() => setFeedbackSaved(false), 2000);
                          }}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                            thumbsGiven === "up" ? "bg-emerald-100 text-emerald-600" : "text-gray-400 hover:bg-gray-100 hover:text-emerald-500"
                          }`}
                          title="Good output"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m7.72-5.022H5.904M14.25 6h.008v.008h-.008V6Z" /></svg>
                        </button>
                        <button
                          onClick={() => {
                            setThumbsGiven("down");
                            setShowThumbsDownForm(true);
                          }}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
                            thumbsGiven === "down" ? "bg-red-100 text-red-500" : "text-gray-400 hover:bg-gray-100 hover:text-red-500"
                          }`}
                          title="Needs improvement"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 0 1 2.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384" /></svg>
                        </button>
                      </div>

                      {/* Teach button */}
                      <button
                        onClick={() => setShowTeachForm(!showTeachForm)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                          showTeachForm ? "bg-brand-100 text-brand-700" : "text-gray-500 hover:bg-gray-100 hover:text-brand-600"
                        }`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" /></svg>
                        Teach This Agent
                      </button>

                      {feedbackSaved && <span className="text-[10px] text-emerald-600">✓ Feedback saved</span>}
                    </div>
                    <span className="text-[10px] text-gray-400">Edits are tracked automatically on save</span>
                  </div>

                  {/* Thumbs Down Form */}
                  {showThumbsDownForm && (
                    <div className="px-5 py-3 bg-red-50 border-t border-red-100">
                      <p className="text-xs font-medium text-red-700 mb-2">What was wrong?</p>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {["Too long", "Too short", "Wrong tone", "Missing data/sources", "Not relevant", "Didn't follow brand voice"].map((r) => (
                          <button
                            key={r}
                            onClick={() => setThumbsDownReasons((p) => p.includes(r) ? p.filter((x) => x !== r) : [...p, r])}
                            className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                              thumbsDownReasons.includes(r) ? "bg-red-200 border-red-300 text-red-800" : "bg-white border-gray-200 text-gray-600 hover:border-red-200"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={thumbsDownOther}
                          onChange={(e) => setThumbsDownOther(e.target.value)}
                          placeholder="Other feedback..."
                          className="flex-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-red-300"
                        />
                        <button
                          onClick={() => {
                            const reasons = [...thumbsDownReasons, thumbsDownOther].filter(Boolean).join("; ");
                            fetch("/api/feedback", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ agent_id: agent?.id, feedback_type: "thumbs_down", explicit_feedback: reasons }),
                            }).catch(() => {});
                            setShowThumbsDownForm(false);
                            setThumbsDownReasons([]);
                            setThumbsDownOther("");
                            setFeedbackSaved(true);
                            setTimeout(() => setFeedbackSaved(false), 2000);
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                        >
                          Submit
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Teach Form */}
                  {showTeachForm && (
                    <div className="px-5 py-3 bg-brand-50 border-t border-brand-100">
                      <p className="text-xs font-medium text-brand-700 mb-2">What should this agent do differently?</p>
                      <div className="flex gap-2">
                        <textarea
                          value={teachText}
                          onChange={(e) => setTeachText(e.target.value)}
                          rows={2}
                          placeholder='e.g., "Stop using emojis", "Always include 3+ data points with sources", "Keep intros under 2 sentences"'
                          className="flex-1 rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-brand-300 resize-none"
                        />
                        <button
                          disabled={!teachText.trim() || teachSaving}
                          onClick={async () => {
                            setTeachSaving(true);
                            await fetch("/api/feedback", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ agent_id: agent?.id, feedback_type: "explicit", explicit_feedback: teachText.trim() }),
                            }).catch(() => {});
                            setTeachText("");
                            setShowTeachForm(false);
                            setTeachSaving(false);
                            setFeedbackSaved(true);
                            setTimeout(() => setFeedbackSaved(false), 2000);
                          }}
                          className="px-3 py-2 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-40 transition-colors self-end"
                        >
                          {teachSaving ? "..." : "Save"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Refine chat input */}
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-200">
                    <form onSubmit={handleRefine} className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={refineInput}
                          onChange={(e) => setRefineInput(e.target.value)}
                          placeholder='Refine: "Make it shorter", "Add pricing section", "More formal"...'
                          disabled={isRefining}
                          className={`w-full rounded-xl border bg-white px-4 py-2.5 ${refineMicSupported ? "pr-10" : "pr-4"} text-sm focus:outline-none focus:ring-1 disabled:opacity-50 transition-colors ${
                            refineListening ? "border-red-400 focus:border-red-400 focus:ring-red-400" : "border-gray-300 focus:border-brand-400 focus:ring-brand-400"
                          }`}
                        />
                        <MicButton isListening={refineListening} supported={refineMicSupported} onClick={toggleRefineMic} disabled={isRefining} size="sm" className="absolute right-2 top-1.5" />
                      </div>
                      <button
                        type="submit"
                        disabled={!refineInput.trim() || isRefining}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0"
                      >
                        {isRefining ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                          </svg>
                        )}
                        Refine
                      </button>
                    </form>
                  </div>
                </div>
              )}

              {/* Run again */}
              {pipelineComplete && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => {
                      setStepStates([]);
                      setPipelineComplete(false);
                      setInput("");
                      setExpandedSteps(new Set());
                      setEditorHtml("");
                      setSavedOutputId(null);
                    }}
                    className="text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
                  >
                    ← Run again with new input
                  </button>
                </div>
              )}

              <div ref={outputEndRef} />
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
