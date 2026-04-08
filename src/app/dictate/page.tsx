"use client";

/**
 * /dictate — Whispr-Flow voice studio.
 *
 * A dedicated surface for all Whispr capabilities in one place.
 *
 * Modes:
 *   - DICTATE: clean up raw speech into written prose (via /api/voice/process).
 *   - COMMAND: speak a short instruction that either:
 *       * transforms the text in the working area (default "Transform selection"), OR
 *       * generates a finished piece of content in a specific content type
 *         (External Email, Internal Memo, Slack Message, Newsletter, Press
 *         Release, Campaign Brief, Thought Leadership Post, SEO Blog Post).
 *
 * Short-form content types hit /api/voice/generate (single-shot).
 * Long-form content types (Thought Leadership, SEO Blog) hit
 * /api/voice/generate-longform which runs the full three-agent writer
 * + editor pipeline, creates a content_posts record, and streams
 * progress events back via SSE.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import MicButton from "@/components/ui/MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

type Mode = "dictate" | "command";
type VoiceContext = "chat" | "content" | "email" | "generic";
type ShortFormType =
  | "external_email"
  | "internal_memo"
  | "slack_message"
  | "newsletter"
  | "press_release"
  | "campaign_brief";
type LongFormType = "thought_leadership_post" | "seo_blog_post";
type ContentType = ShortFormType | LongFormType;

interface HistoryEntry {
  id: string;
  ts: number;
  mode: Mode;
  kind: "transform" | "content"; // "content" for content-type runs
  context: VoiceContext;
  contentType: ContentType | null;
  transcript: string;
  before: string;
  after: string;
  postId?: string | null;
  postLabel?: string | null;
}

const CONTEXTS: { key: VoiceContext; label: string; hint: string }[] = [
  { key: "generic", label: "Generic", hint: "Plain written English, match speaker's register." },
  { key: "chat", label: "Chat", hint: "Conversational, Slack-style. Short paragraphs, contractions." },
  { key: "content", label: "Content", hint: "Polished blog copy, editorial voice, third-person plural." },
  { key: "email", label: "Email", hint: "Professional warm, greeting and sign-off, executive tone." },
];

interface ContentTypeDef {
  key: ContentType;
  label: string;
  desc: string;
  group: "short" | "long";
}

const CONTENT_TYPES: ContentTypeDef[] = [
  {
    key: "external_email",
    label: "External Email",
    desc: "Outbound email to customer, partner, or prospect.",
    group: "short",
  },
  {
    key: "internal_memo",
    label: "Internal Memo",
    desc: "FYI message to teammates, no fluff, bullets OK.",
    group: "short",
  },
  {
    key: "slack_message",
    label: "Slack Message",
    desc: "Short Slack post, casual, Slack markdown.",
    group: "short",
  },
  {
    key: "newsletter",
    label: "Newsletter",
    desc: "Newsletter section: headline, hook, body, close.",
    group: "short",
  },
  {
    key: "press_release",
    label: "Press Release",
    desc: "Standard PR format: headline, dateline, body, boilerplate.",
    group: "short",
  },
  {
    key: "campaign_brief",
    label: "Campaign Brief",
    desc: "Structured brief: objective, audience, channels, metrics.",
    group: "short",
  },
  {
    key: "thought_leadership_post",
    label: "Thought Leadership Post",
    desc: "Opinion-driven editorial post. Runs writer + editor pipeline.",
    group: "long",
  },
  {
    key: "seo_blog_post",
    label: "SEO-Friendly Blog Post",
    desc: "Keyword-targeted post. Runs writer + editor pipeline.",
    group: "long",
  },
];

const LONG_FORM_KEYS = new Set<ContentType>([
  "thought_leadership_post",
  "seo_blog_post",
]);

function isLongForm(ct: ContentType | null): ct is LongFormType {
  return ct != null && LONG_FORM_KEYS.has(ct);
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* skip malformed */
      }
    }
  }
}

export default function DictatePage() {
  const [mode, setMode] = useState<Mode>("dictate");
  const [context, setContext] = useState<VoiceContext>("generic");
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [keyword, setKeyword] = useState("");
  const [text, setText] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [createdPost, setCreatedPost] = useState<{
    postId: string;
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastUndo, setLastUndo] = useState<HistoryEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRecordValueRef = useRef("");

  const selectedContentTypeDef =
    contentType != null
      ? CONTENT_TYPES.find((c) => c.key === contentType) || null
      : null;

  // When the user switches mode, clear content type selection so the
  // Command content types don't leak into Dictate mode.
  useEffect(() => {
    if (mode === "dictate" && contentType != null) {
      setContentType(null);
    }
  }, [mode, contentType]);

  // --- Content type generators -------------------------------------------

  const runShortFormGeneration = useCallback(
    async (rawSpeech: string, ctype: ShortFormType) => {
      const preValue = preRecordValueRef.current;
      setError(null);
      setIsProcessing(true);
      setProgressLog([]);
      setCreatedPost(null);

      try {
        const res = await fetch("/api/voice/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: ctype,
            transcript: rawSpeech,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { text: string; label: string };
        const generated = data.text.trim();

        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          mode: "command",
          kind: "content",
          context,
          contentType: ctype,
          transcript: rawSpeech,
          before: preValue,
          after: generated,
        };
        setHistory((h) => [entry, ...h].slice(0, 20));
        setLastUndo(entry);
        setText(generated);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Content generation failed",
        );
        setText(preValue);
      } finally {
        setIsProcessing(false);
        setRawTranscript("");
      }
    },
    [context],
  );

  const runLongFormGeneration = useCallback(
    async (rawSpeech: string, ctype: LongFormType, kw: string) => {
      const preValue = preRecordValueRef.current;
      setError(null);
      setIsProcessing(true);
      setProgressLog([
        `Starting ${
          ctype === "seo_blog_post"
            ? "SEO Blog Post"
            : "Thought Leadership Post"
        } pipeline...`,
      ]);
      setCreatedPost(null);

      // Holder object — TS tracks object property mutations through
      // closures, but does not track `let` reassignments the same way,
      // so we can't use plain locals for the event callback to write to.
      const collected: {
        finalDraft: string | null;
        postInfo: { postId: string; label: string } | null;
      } = { finalDraft: null, postInfo: null };

      try {
        const res = await fetch("/api/voice/generate-longform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: ctype,
            transcript: rawSpeech,
            keyword: kw || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        await readSSE(res, (event) => {
          const type = event.type as string | undefined;
          if (type === "status") {
            const msg =
              (event.message as string) ||
              `${event.step || "status"}...`;
            setProgressLog((p) => [...p, msg]);
          } else if (type === "post_created") {
            const next = {
              postId: String(event.postId),
              label: String(event.label || "Long-form post"),
            };
            collected.postInfo = next;
            setCreatedPost(next);
            setProgressLog((p) => [
              ...p,
              `Content pipeline post created (${next.postId.slice(0, 8)})`,
            ]);
          } else if (type === "draft_complete") {
            setProgressLog((p) => [
              ...p,
              "Draft complete — running editor pipeline next",
            ]);
          } else if (type === "complete") {
            collected.finalDraft =
              (event.editedDraft as string) ||
              (event.draft as string) ||
              null;
            setProgressLog((p) => [...p, "Editor pipeline complete"]);
          } else if (type === "error") {
            throw new Error(
              (event.error as string) || "Long-form pipeline failed",
            );
          }
          // Other event types (delta, etc.) are ignored on this surface to
          // keep the progress log readable. The writer/editor pipelines
          // emit a lot of fine-grained events.
        });

        if (!collected.finalDraft) {
          throw new Error(
            "Pipeline finished without returning a final draft",
          );
        }

        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          mode: "command",
          kind: "content",
          context,
          contentType: ctype,
          transcript: rawSpeech,
          before: preValue,
          after: collected.finalDraft,
          postId: collected.postInfo?.postId || null,
          postLabel: collected.postInfo?.label || null,
        };
        setHistory((h) => [entry, ...h].slice(0, 20));
        setLastUndo(entry);
        setText(collected.finalDraft);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Long-form generation failed",
        );
        setText(preValue);
      } finally {
        setIsProcessing(false);
        setRawTranscript("");
      }
    },
    [context],
  );

  // --- Original Dictate / Transform-selection Command flows ---------------

  const runVoiceProcess = useCallback(
    async (rawSpeech: string) => {
      const preValue = preRecordValueRef.current;
      setError(null);
      setIsProcessing(true);

      try {
        if (mode === "dictate") {
          const res = await fetch("/api/voice/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "dictate",
              transcript: rawSpeech,
              context,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          const data = (await res.json()) as { text: string };
          const cleaned = data.text.trim();
          const sep =
            preValue && !preValue.endsWith(" ") && !preValue.endsWith("\n\n")
              ? preValue.endsWith("\n")
                ? ""
                : " "
              : "";
          const nextValue = (preValue + sep + cleaned).trim();
          const entry: HistoryEntry = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            mode: "dictate",
            kind: "transform",
            context,
            contentType: null,
            transcript: rawSpeech,
            before: preValue,
            after: nextValue,
          };
          setHistory((h) => [entry, ...h].slice(0, 20));
          setLastUndo(entry);
          setText(nextValue);
        } else {
          // Command mode, no content type → transform selection (legacy).
          const el = textareaRef.current;
          let subject = preValue.trim();
          if (el) {
            const s = el.selectionStart ?? 0;
            const e = el.selectionEnd ?? 0;
            if (s !== e) subject = preValue.slice(s, e).trim();
          }
          if (!subject) {
            setError(
              "Command mode with 'Transform selection' needs subject text. Type or paste something first, then speak your command — or pick a content type above.",
            );
            return;
          }

          const res = await fetch("/api/voice/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "command",
              transcript: rawSpeech,
              context,
              selectedText: subject,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          const data = (await res.json()) as { text: string };
          const transformed = data.text.trim();

          let nextValue: string;
          if (subject !== preValue && preValue.includes(subject)) {
            nextValue = preValue.replace(subject, transformed);
          } else {
            nextValue = transformed;
          }

          const entry: HistoryEntry = {
            id: crypto.randomUUID(),
            ts: Date.now(),
            mode: "command",
            kind: "transform",
            context,
            contentType: null,
            transcript: rawSpeech,
            before: preValue,
            after: nextValue,
          };
          setHistory((h) => [entry, ...h].slice(0, 20));
          setLastUndo(entry);
          setText(nextValue);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Voice processing failed");
        setText(preValue);
      } finally {
        setIsProcessing(false);
        setRawTranscript("");
      }
    },
    [mode, context],
  );

  // --- Session end dispatcher --------------------------------------------

  const handleSessionEnd = useCallback(
    (raw: string) => {
      if (!raw.trim()) {
        setRawTranscript("");
        return;
      }
      if (mode === "command" && contentType != null) {
        if (isLongForm(contentType)) {
          // SEO blog needs a keyword; UI should block mic start if missing,
          // but double-check here.
          if (contentType === "seo_blog_post" && !keyword.trim()) {
            setError("SEO Blog Post needs a target keyword.");
            setRawTranscript("");
            return;
          }
          runLongFormGeneration(raw, contentType, keyword.trim());
        } else {
          runShortFormGeneration(raw, contentType);
        }
      } else {
        runVoiceProcess(raw);
      }
    },
    [
      mode,
      contentType,
      keyword,
      runLongFormGeneration,
      runShortFormGeneration,
      runVoiceProcess,
    ],
  );

  const { isListening, supported, toggle } = useSpeechToText({
    onTranscript: (live) => {
      // Dictate mode: interim text feeds the working area.
      if (mode === "dictate") {
        setText(live);
        return;
      }
      // Command mode, no content type: interim is an instruction preview.
      // Command mode with a content type: interim is the raw source
      // material — same preview strip, different label (handled in JSX).
      setRawTranscript(live.slice(preRecordValueRef.current.length).trim());
    },
    currentValue: text,
    onSessionEnd: handleSessionEnd,
  });

  const handleMicToggle = useCallback(() => {
    if (!isListening) {
      if (
        mode === "command" &&
        contentType === "seo_blog_post" &&
        !keyword.trim()
      ) {
        setError("SEO Blog Post needs a target keyword before recording.");
        return;
      }
      preRecordValueRef.current = text;
      setError(null);
      setRawTranscript("");
      setProgressLog([]);
      setCreatedPost(null);
    }
    toggle();
  }, [isListening, text, toggle, mode, contentType, keyword]);

  const undo = useCallback(() => {
    if (!lastUndo) return;
    setText(lastUndo.before);
    setLastUndo(null);
  }, [lastUndo]);

  const copy = useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard copy failed");
    }
  }, [text]);

  const clearAll = useCallback(() => {
    setText("");
    setLastUndo(null);
    setRawTranscript("");
    setError(null);
    setProgressLog([]);
    setCreatedPost(null);
  }, []);

  const restoreEntry = useCallback((entry: HistoryEntry) => {
    setText(entry.after);
    setLastUndo({ ...entry, before: entry.after, after: entry.after });
  }, []);

  // Keyboard shortcut: spacebar (when not in input) toggles mic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      e.preventDefault();
      handleMicToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMicToggle]);

  // --- Derived UI bits ----------------------------------------------------

  const isContentTypeRun = mode === "command" && contentType != null;

  const status = isListening
    ? "Listening..."
    : isProcessing
    ? mode === "dictate"
      ? "Cleaning with Claude..."
      : contentType != null
      ? isLongForm(contentType)
        ? "Running writer + editor pipeline..."
        : `Generating ${selectedContentTypeDef?.label}...`
      : "Executing command..."
    : "Ready";

  const workingAreaLabel =
    mode === "dictate"
      ? "Working area"
      : contentType != null
      ? `${selectedContentTypeDef?.label} — output`
      : "Subject text (target to transform)";

  const workingAreaPlaceholder =
    mode === "dictate"
      ? "Press the mic and start talking. Your speech will be cleaned up and placed here."
      : contentType != null
      ? `Press the mic and describe what you want to say. Claude will turn it into a finished ${selectedContentTypeDef?.label}. The result appears here.`
      : "Paste or type the text you want to transform, then press the mic and speak your instruction (e.g., 'make this more formal', 'turn into bullet points').";

  const instructionStripLabel =
    contentType != null ? "Source material" : "Instruction";

  return (
    <div className="min-h-screen px-8 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-heading">Dictate</h1>
        <p className="text-sm text-ink-soft mt-1">
          Speak into the mic. Dictate mode cleans up your speech into written
          prose. Command mode either transforms the text in the working area
          or turns your spoken notes into a finished piece of content in the
          format you pick. All output inherits the Sequel brand voice.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="inline-flex rounded-xl border border-border bg-white p-1">
          <button
            type="button"
            onClick={() => setMode("dictate")}
            disabled={isListening || isProcessing}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              mode === "dictate"
                ? "bg-brand-500 text-white"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            Dictate
          </button>
          <button
            type="button"
            onClick={() => setMode("command")}
            disabled={isListening || isProcessing}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              mode === "command"
                ? "bg-amber-500 text-white"
                : "text-ink-soft hover:text-ink"
            }`}
          >
            Command
          </button>
        </div>

        <span className="text-xs text-ink-soft ml-2">
          {mode === "dictate"
            ? "Speak → cleaned text appended to working area"
            : contentType != null
            ? `Speak raw notes → Claude writes a finished ${selectedContentTypeDef?.label}`
            : "Speak instruction → transforms text (or selection) in working area"}
        </span>
      </div>

      {/* Content type selector — Command mode only */}
      {mode === "command" && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-2">
            Content type
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setContentType(null)}
              disabled={isListening || isProcessing}
              title="Default Command behavior: speak an instruction to transform the working area or selection."
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                contentType == null
                  ? "bg-amber-50 border-amber-400 text-amber-800"
                  : "bg-white border-border text-ink-soft hover:text-ink hover:border-amber-300"
              }`}
            >
              Transform selection
            </button>
            {CONTENT_TYPES.filter((c) => c.group === "short").map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setContentType(c.key)}
                disabled={isListening || isProcessing}
                title={c.desc}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  contentType === c.key
                    ? "bg-amber-50 border-amber-400 text-amber-800"
                    : "bg-white border-border text-ink-soft hover:text-ink hover:border-amber-300"
                }`}
              >
                {c.label}
              </button>
            ))}
            {CONTENT_TYPES.filter((c) => c.group === "long").map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setContentType(c.key)}
                disabled={isListening || isProcessing}
                title={c.desc}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  contentType === c.key
                    ? "bg-violet-50 border-violet-400 text-violet-800"
                    : "bg-white border-border text-ink-soft hover:text-ink hover:border-violet-300"
                }`}
              >
                {c.label}
                <span className="ml-1.5 text-[9px] font-bold tracking-wider text-violet-500">
                  LONG
                </span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-soft mt-2 italic">
            {contentType != null
              ? selectedContentTypeDef?.desc
              : "Default Command mode transforms whatever text (or selection) is in the working area."}
          </p>

          {/* SEO keyword input */}
          {contentType === "seo_blog_post" && (
            <div className="mt-3 flex items-center gap-2">
              <label
                htmlFor="seo-keyword"
                className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft"
              >
                Target keyword
              </label>
              <input
                id="seo-keyword"
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                disabled={isListening || isProcessing}
                placeholder="e.g. voice AI for enterprise content teams"
                className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:border-brand-400 focus:ring-brand-400"
              />
            </div>
          )}
        </div>
      )}

      {/* Context selector — only meaningful when not in a content-type run */}
      {!isContentTypeRun && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft mb-2">
            Output tone
          </p>
          <div className="flex flex-wrap gap-2">
            {CONTEXTS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setContext(c.key)}
                disabled={isListening || isProcessing}
                title={c.hint}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  context === c.key
                    ? "bg-brand-50 border-brand-400 text-brand-700"
                    : "bg-white border-border text-ink-soft hover:text-ink hover:border-brand-300"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-soft mt-2 italic">
            {CONTEXTS.find((c) => c.key === context)?.hint}
          </p>
        </div>
      )}

      {/* Working area */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {workingAreaLabel}
          </label>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? "bg-red-500 animate-pulse"
                  : isProcessing
                  ? "bg-amber-500 animate-pulse"
                  : "bg-emerald-500"
              }`}
            />
            <span className="text-ink-soft">{status}</span>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={workingAreaPlaceholder}
          rows={isContentTypeRun && isLongForm(contentType) ? 18 : 12}
          disabled={isProcessing}
          className="w-full rounded-xl border border-border px-4 py-3 text-sm text-ink font-sans resize-y focus:outline-none focus:ring-1 focus:border-brand-400 focus:ring-brand-400 disabled:bg-ink-bg/40"
        />

        {/* Live transcript strip in command mode */}
        {mode === "command" && (isListening || rawTranscript) && (
          <div
            className={`mt-2 px-3 py-2 rounded-lg border text-xs ${
              contentType != null
                ? "bg-violet-50 border-violet-200 text-violet-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            <span className="font-semibold uppercase tracking-wide text-[10px] mr-2">
              {instructionStripLabel}
            </span>
            {rawTranscript || (
              <span className="italic opacity-70">
                {contentType != null
                  ? "Start describing what you want to say..."
                  : "Speak your command..."}
              </span>
            )}
          </div>
        )}

        {/* Long-form progress log */}
        {progressLog.length > 0 && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-900 space-y-0.5 max-h-32 overflow-y-auto">
            <p className="font-semibold uppercase tracking-wide text-[10px] mb-1">
              Pipeline progress
            </p>
            {progressLog.map((line, i) => (
              <p key={i} className="font-mono">
                · {line}
              </p>
            ))}
          </div>
        )}

        {/* Created post link */}
        {createdPost && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
            <span>Saved to content pipeline:</span>
            <Link
              href={`/content/${createdPost.postId}`}
              className="font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
            >
              Open {createdPost.label} →
            </Link>
          </div>
        )}

        {/* Controls */}
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <MicButton
              isListening={isListening}
              supported={supported}
              onClick={handleMicToggle}
              disabled={isProcessing}
              size="md"
            />
            <span className="text-[11px] text-ink-soft">
              {supported
                ? "Click or press space"
                : "Speech recognition not supported in this browser"}
            </span>
          </div>

          <div className="flex-1" />

          {lastUndo && !isProcessing && (
            <button
              type="button"
              onClick={undo}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 transition-colors"
            >
              Undo last run
            </button>
          )}

          <button
            type="button"
            onClick={copy}
            disabled={!text}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink bg-white hover:bg-ink-bg border border-border transition-colors disabled:opacity-40"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={!text && !rawTranscript}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-soft bg-white hover:bg-ink-bg border border-border transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Session history */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-soft mb-3">
            Session history ({history.length})
          </h2>
          <div className="space-y-2">
            {history.map((entry) => {
              const label =
                entry.contentType != null
                  ? CONTENT_TYPES.find((c) => c.key === entry.contentType)
                      ?.label || entry.contentType
                  : entry.mode;
              return (
                <div
                  key={entry.id}
                  className="rounded-xl border border-border bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-2 mb-1.5 text-[11px]">
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
                        entry.kind === "content"
                          ? entry.contentType != null &&
                            isLongForm(entry.contentType)
                            ? "bg-violet-50 text-violet-700"
                            : "bg-amber-50 text-amber-700"
                          : entry.mode === "dictate"
                          ? "bg-brand-50 text-brand-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-ink-soft">{entry.context}</span>
                    <span className="text-ink-soft">•</span>
                    <span className="text-ink-soft">{fmtTime(entry.ts)}</span>
                    {entry.postId && (
                      <>
                        <span className="text-ink-soft">•</span>
                        <Link
                          href={`/content/${entry.postId}`}
                          className="text-violet-600 hover:text-violet-700 font-semibold"
                        >
                          Open in pipeline
                        </Link>
                      </>
                    )}
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => restoreEntry(entry)}
                      className="text-brand-600 hover:text-brand-700 font-semibold"
                    >
                      Restore
                    </button>
                  </div>
                  <p className="text-[11px] text-ink-soft italic truncate">
                    &ldquo;{entry.transcript}&rdquo;
                  </p>
                  <p className="text-xs text-ink mt-1 line-clamp-2">
                    {entry.after}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
