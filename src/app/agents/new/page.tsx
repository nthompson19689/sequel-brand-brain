"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Agent } from "@/lib/agents";

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  STEP_TYPE_META,
  makeStepId,
  type StepType,
  type WorkflowStep,
} from "@/lib/agents";
import { MODEL_OPTIONS } from "@/lib/claude";
import { useWorkspace } from "@/contexts/WorkspaceContext";

const STEP_TYPES: StepType[] = [
  "ai_generation",
  "search_knowledge_base",
  "web_research",
  "deep_research",
  "human_review",
];

function StepTypeIcon({ type, className }: { type: StepType; className?: string }) {
  const meta = STEP_TYPE_META[type];
  return (
    <svg className={className || "w-4 h-4"} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
    </svg>
  );
}

const STEP_COLOR_MAP: Record<string, string> = {
  indigo: "border-brand-300 bg-brand-50",
  emerald: "border-emerald-300 bg-emerald-50",
  amber: "border-amber-300 bg-amber-50",
  violet: "border-violet-300 bg-violet-50",
};

const STEP_BADGE_MAP: Record<string, string> = {
  indigo: "bg-brand-100 text-brand-600",
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  violet: "bg-violet-100 text-violet-700",
};

export default function NewAgentPageWrapper() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading...</div>}>
      <NewAgentPage />
    </Suspense>
  );
}

function NewAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { currentWorkspace } = useWorkspace();

  // Phase 1: Description
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Voice input
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const w = window as any;
    setSpeechSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  // Phase 2: Generated workflow (editable)
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [tools, setTools] = useState<string[]>([]);
  const [outputFormat, setOutputFormat] = useState("");
  const [referenceExamples, setReferenceExamples] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [hasGenerated, setHasGenerated] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  // Load existing agent for editing — fetch from Supabase API
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const res = await fetch("/api/agents");
        if (!res.ok) return;
        const data = await res.json();
        const agent = (data.agents || []).find((a: Agent) => a.id === editId);
        if (agent) {
          setDescription(agent.description || "");
          setName(agent.name);
          setIcon(agent.icon);
          setSystemPrompt(agent.system_prompt);
          setSteps(agent.steps || []);
          setTools(agent.tools || []);
          setOutputFormat(agent.output_format || "");
          setReferenceExamples(agent.reference_examples || "");
          setModel(agent.model || "claude-sonnet-4-6");
          setHasGenerated(true);
        }
      } catch { /* ignore */ }
    })();
  }, [editId]);

  function toggleListening() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Capture the description at the time recording starts
    const baseText = description;

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      const separator = baseText && !baseText.endsWith(" ") ? " " : "";
      setDescription(baseText + separator + final + interim);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }

  async function handleGenerate() {
    if (!description.trim()) return;
    // Stop speech if active
    if (isListening) {
      recognitionRef.current?.stop();
    }
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch("/api/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const workflow = await res.json();

      setName(workflow.name || "");
      setIcon(workflow.icon || "\uD83E\uDD16");
      setSystemPrompt(workflow.system_prompt || "");
      setSteps(
        (workflow.steps || []).map((s: WorkflowStep & { id?: string }) => ({
          ...s,
          id: s.id || makeStepId(),
        }))
      );
      setTools(workflow.tools || []);
      setOutputFormat(workflow.output_format || "");
      setHasGenerated(true);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Failed to generate"
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      { id: makeStepId(), name: "", type: "ai_generation", prompt: "" },
    ]);
  }

  function updateStep(index: number, updates: Partial<WorkflowStep>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    setSteps((prev) => {
      const arr = [...prev];
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  }

  async function handleSave() {
    if (!name.trim() || !systemPrompt.trim() || steps.length === 0) return;
    setIsSaving(true);

    const agentData: Record<string, unknown> = {
      id: editId || crypto.randomUUID(),
      name: name.trim(),
      description: description.trim(),
      icon: icon || "\uD83E\uDD16",
      system_prompt: systemPrompt.trim(),
      steps: steps.map((s, i) => ({
        ...s,
        name: s.name.trim() || `Step ${i + 1}`,
        prompt: s.prompt.trim(),
      })),
      tools,
      output_format: outputFormat.trim(),
      reference_examples: referenceExamples.trim(),
      model,
      is_shared: false,
      run_count: 0,
      workspace_id: currentWorkspace?.id || null,
    };

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(err.error || "Save failed");
      }

      router.push("/agents");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save agent");
      setIsSaving(false);
    }
  }

  const isValid =
    name.trim().length > 0 &&
    systemPrompt.trim().length > 0 &&
    steps.length > 0 &&
    steps.every((s) => s.prompt.trim().length > 0);

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back to Agents
        </button>
        <h1 className="text-2xl font-semibold text-gray-900">{editId ? "Edit Agent" : "Create Agent"}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {editId ? "Modify the workflow below and save." : "Describe what you want and we\u2019ll build the workflow for you."}
        </p>
      </div>

      {/* === Phase 1: Describe === */}
      <section className="mb-8">
        <label htmlFor="desc" className="block text-sm font-medium text-gray-700 mb-2">
          What should this agent do?
        </label>
        <div className="relative">
          <textarea
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={speechSupported
              ? `Type or click the mic to describe your agent...

Examples:
• "Research a competitor and write a competitive brief"
• "Prep me for a sales call with everything we know about the company"
• "Find content gaps for a keyword and write a brief"`
              : `Examples:
• "Research a competitor and write a competitive brief with pricing, strengths, weaknesses, and win strategy"
• "Take a keyword, check what's ranking on Google, compare with our content, and write a content brief for the gap"
• "Prep me for a sales call — find everything we know about the company and compile talking points"`}
            className={`w-full rounded-xl border bg-white px-4 py-3 pr-14 text-sm focus:outline-none focus:ring-1 resize-y transition-colors ${
              isListening
                ? "border-red-400 focus:border-red-400 focus:ring-red-400"
                : "border-gray-300 focus:border-brand-400 focus:ring-brand-400"
            }`}
            disabled={isGenerating}
          />
          {speechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              disabled={isGenerating}
              className={`absolute right-3 top-3 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                isListening
                  ? "bg-red-500 text-white shadow-lg shadow-red-200 scale-110"
                  : "bg-gray-100 text-gray-500 hover:bg-brand-100 hover:text-brand-500"
              } disabled:opacity-40`}
              title={isListening ? "Stop recording" : "Speak to describe your agent"}
            >
              {isListening ? (
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" />
                </svg>
              )}
            </button>
          )}
        </div>
        {isListening && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-500">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            Listening... speak naturally, then click stop or Build Workflow when done.
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={!description.trim() || isGenerating}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
          >
            {isGenerating ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Building workflow...
              </>
            ) : hasGenerated ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Regenerate
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Build Workflow
              </>
            )}
          </button>
          {generateError && (
            <p className="text-sm text-red-500">{generateError}</p>
          )}
        </div>
      </section>

      {/* === Phase 2: Generated workflow (editable) === */}
      {hasGenerated && (
        <div className="space-y-6 border-t border-gray-200 pt-8">
          {/* Identity row */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Agent Identity</h2>
            <div className="flex gap-3 items-start">
              <button
                type="button"
                onClick={() => {
                  const emojis = ["\uD83E\uDD16", "\uD83C\uDFAF", "\u2694\uFE0F", "\uD83D\uDD0D", "\uD83D\uDCDD", "\uD83D\uDCA1", "\uD83D\uDCCA", "\uD83D\uDE80", "\uD83D\uDD25", "\uD83E\uDDE0", "\uD83C\uDFA8", "\uD83D\uDCCB", "\u26A1", "\uD83C\uDF0E"];
                  const idx = emojis.indexOf(icon);
                  setIcon(emojis[(idx + 1) % emojis.length]);
                }}
                className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl hover:bg-gray-200 transition-colors shrink-0"
                title="Click to change icon"
              >
                {icon || "\uD83E\uDD16"}
              </button>
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent name"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={2}
                  placeholder="Agent role and identity"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y text-gray-600"
                />
              </div>
            </div>
          </section>

          {/* Default model */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Default Model</h2>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setModel(opt.value)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                    model === opt.value
                      ? "border-brand-400 bg-brand-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <span className="text-lg">{opt.badge}</span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{opt.label}</div>
                    <div className="text-[11px] text-gray-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">Each step can override this with its own model</p>
          </section>

          {/* Workflow steps */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Workflow ({steps.length} steps)
              </h2>
              <p className="text-[10px] text-gray-400">
                {"{{input}}"} = user input, {"{{step_N}}"} = output of step N
              </p>
            </div>

            <div className="space-y-2">
              {steps.map((step, i) => {
                const meta = STEP_TYPE_META[step.type];
                return (
                  <div
                    key={step.id}
                    className={`rounded-xl border-2 p-3 transition-colors ${STEP_COLOR_MAP[meta.color] || "border-gray-200 bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-gray-400 w-5 text-center">{i + 1}</span>
                      <input
                        type="text"
                        value={step.name}
                        onChange={(e) => updateStep(i, { name: e.target.value })}
                        placeholder={`Step ${i + 1}`}
                        className="flex-1 bg-transparent border-none text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none"
                      />
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => moveStep(i, "up")} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                        </button>
                        <button type="button" onClick={() => moveStep(i, "down")} disabled={i === steps.length - 1} className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                        </button>
                        <button type="button" onClick={() => removeStep(i)} className="p-1 text-gray-400 hover:text-red-500 ml-0.5">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>

                    {/* Type picker */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {STEP_TYPES.map((t) => {
                        const m = STEP_TYPE_META[t];
                        const isSelected = step.type === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => updateStep(i, { type: t })}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                              isSelected
                                ? STEP_BADGE_MAP[m.color]
                                : "bg-white/70 text-gray-400 hover:text-gray-600"
                            }`}
                          >
                            <StepTypeIcon type={t} className="w-3 h-3" />
                            {m.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Per-step model override */}
                    {(step.type === "ai_generation" || step.type === "web_research") && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] text-gray-400">Model:</span>
                        <select
                          value={step.model || ""}
                          onChange={(e) => updateStep(i, { model: e.target.value || undefined })}
                          className="text-[11px] bg-transparent border-none text-gray-600 focus:outline-none focus:ring-0 p-0 pr-4 cursor-pointer"
                        >
                          <option value="">Default ({MODEL_OPTIONS.find(m => m.value === model)?.label || "Sonnet"})</option>
                          {MODEL_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>{m.badge} {m.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Step prompt */}
                    <textarea
                      value={step.prompt}
                      onChange={(e) => updateStep(i, { prompt: e.target.value })}
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-mono leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
                    />
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addStep}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-brand-400 hover:text-brand-500 hover:bg-brand-50 transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Step
              </button>
            </div>
          </section>

          {/* Output format */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Output</h2>
            <input
              type="text"
              value={outputFormat}
              onChange={(e) => setOutputFormat(e.target.value)}
              placeholder="What the final output looks like"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </section>

          {/* Reference examples */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Reference Examples <span className="text-gray-300 normal-case font-normal">(optional)</span></h2>
            <p className="text-[11px] text-gray-400 mb-2">Paste an example of what great output looks like. The agent will match this structure, voice, and length. Separate multiple examples with ---</p>
            <textarea
              value={referenceExamples}
              onChange={(e) => setReferenceExamples(e.target.value)}
              rows={5}
              placeholder={"Paste an example of ideal output here...\n\n---\n\nPaste another example here (optional)..."}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
            />
          </section>

          {/* ═══ Review & Apply Feedback ═══ */}
          {editId && <FeedbackReview agentId={editId} currentPrompt={systemPrompt} onApply={(newPrompt) => setSystemPrompt(newPrompt)} />}

          {/* Save */}
          <div className="pt-4 border-t border-gray-200 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!isValid || isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving...
                </>
              ) : editId ? "Update Agent" : "Save Agent"}
            </button>
            {!isValid && (
              <p className="text-xs text-gray-400">
                {!name.trim()
                  ? "Name is required"
                  : !systemPrompt.trim()
                    ? "Agent role is required"
                    : steps.length === 0
                      ? "Add at least one step"
                      : "All steps need a prompt"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Feedback Review Component ──
function FeedbackReview({ agentId, currentPrompt, onApply }: { agentId: string; currentPrompt: string; onApply: (prompt: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ updated_prompt: string; changes_made: string[]; feedback_ids_addressed: string[]; total_feedback: number } | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [applied, setApplied] = useState(false);

  // Check if there's pending feedback
  useEffect(() => {
    fetch(`/api/feedback?agent_id=${agentId}&pending=true`)
      .then((r) => r.json())
      .then((d) => setPendingCount((d.feedback || []).length))
      .catch(() => {});
  }, [agentId]);

  async function handleReview() {
    setLoading(true);
    try {
      const res = await fetch("/api/feedback/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, current_prompt: currentPrompt }),
      });
      const data = await res.json();
      if (data.updated_prompt) setResult(data);
    } catch { /* */ }
    setLoading(false);
  }

  async function handleAccept() {
    if (!result) return;
    onApply(result.updated_prompt);
    // Mark feedback as applied
    await fetch("/api/feedback/apply", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback_ids: result.feedback_ids_addressed }),
    }).catch(() => {});
    setApplied(true);
    setPendingCount(0);
  }

  if (!pendingCount || pendingCount === 0) return null;

  return (
    <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <h3 className="text-sm font-semibold text-amber-800">
            {pendingCount} feedback item{pendingCount !== 1 ? "s" : ""} pending
          </h3>
        </div>
        {!result && (
          <button
            onClick={handleReview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
            )}
            Review & Apply Feedback
          </button>
        )}
      </div>
      <p className="text-xs text-amber-600">Users have provided feedback from edits and ratings. Review and apply to improve this agent.</p>

      {result && !applied && (
        <div className="mt-3 p-3 bg-white rounded-lg border border-amber-100">
          <p className="text-xs font-medium text-gray-700 mb-2">
            Based on {result.total_feedback} feedback items, here are the suggested improvements:
          </p>
          <ul className="space-y-1 mb-3">
            {result.changes_made.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                <span className="text-emerald-500 mt-0.5">✓</span>
                {c}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              Accept All Changes
            </button>
            <button
              onClick={() => setResult(null)}
              className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {applied && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
          Changes applied to prompt. Save the agent to persist.
        </div>
      )}
    </div>
  );
}
