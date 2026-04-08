"use client";

/**
 * /dictate — Whispr-Flow voice studio.
 *
 * A dedicated surface for all Whispr capabilities in one place: Dictate
 * mode (clean up speech into written text) and Command mode (speak an
 * instruction to transform the text in the working area). Every run
 * also inherits the Sequel brand context from the shared voice API.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import MicButton from "@/components/ui/MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

type Mode = "dictate" | "command";
type VoiceContext = "chat" | "content" | "email" | "generic";

interface HistoryEntry {
  id: string;
  ts: number;
  mode: Mode;
  context: VoiceContext;
  transcript: string;
  before: string;
  after: string;
}

const CONTEXTS: { key: VoiceContext; label: string; hint: string }[] = [
  { key: "generic", label: "Generic", hint: "Plain written English, match speaker's register." },
  { key: "chat", label: "Chat", hint: "Conversational, Slack-style. Short paragraphs, contractions." },
  { key: "content", label: "Content", hint: "Polished blog copy, editorial voice, third-person plural." },
  { key: "email", label: "Email", hint: "Professional warm, greeting and sign-off, executive tone." },
];

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DictatePage() {
  const [mode, setMode] = useState<Mode>("dictate");
  const [context, setContext] = useState<VoiceContext>("generic");
  const [text, setText] = useState("");
  const [rawTranscript, setRawTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastUndo, setLastUndo] = useState<HistoryEntry | null>(null);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRecordValueRef = useRef("");

  const runProcessing = useCallback(
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
            context,
            transcript: rawSpeech,
            before: preValue,
            after: nextValue,
          };
          setHistory((h) => [entry, ...h].slice(0, 20));
          setLastUndo(entry);
          setText(nextValue);
        } else {
          // Command mode: the subject is the current textarea contents
          // (or its selection if one exists). The transcript is the
          // instruction.
          const el = textareaRef.current;
          let subject = preValue.trim();
          if (el) {
            const s = el.selectionStart ?? 0;
            const e = el.selectionEnd ?? 0;
            if (s !== e) subject = preValue.slice(s, e).trim();
          }
          if (!subject) {
            setError(
              "Command mode needs subject text. Type or paste something into the box first, then speak your command.",
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
            context,
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
        // Restore pre-record value so interim STT doesn't linger.
        setText(preValue);
      } finally {
        setIsProcessing(false);
        setRawTranscript("");
      }
    },
    [mode, context],
  );

  const handleSessionEnd = useCallback(
    (raw: string) => {
      if (!raw.trim()) {
        setRawTranscript("");
        return;
      }
      runProcessing(raw);
    },
    [runProcessing],
  );

  const { isListening, supported, toggle } = useSpeechToText({
    // In Dictate mode we pipe interim text into the working textarea so
    // the user sees their words as they speak. In Command mode the
    // transcript is an instruction, not content, so we show it in a
    // separate preview strip and leave the textarea untouched.
    onTranscript: (live) => {
      if (mode === "dictate") {
        setText(live);
      } else {
        // In command mode, live text is the instruction preview only.
        setRawTranscript(
          live.slice(preRecordValueRef.current.length).trim(),
        );
      }
    },
    currentValue: text,
    onSessionEnd: handleSessionEnd,
  });

  const handleMicToggle = useCallback(() => {
    if (!isListening) {
      preRecordValueRef.current = text;
      setError(null);
      setRawTranscript("");
    }
    toggle();
  }, [isListening, text, toggle]);

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
  }, []);

  const restoreEntry = useCallback((entry: HistoryEntry) => {
    setText(entry.after);
    setLastUndo({ ...entry, before: entry.after, after: entry.after });
  }, []);

  // Keyboard shortcut: spacebar (when textarea not focused) toggles mic
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

  const status = isListening
    ? "Listening..."
    : isProcessing
    ? mode === "dictate"
      ? "Cleaning with Claude..."
      : "Executing command..."
    : "Ready";

  return (
    <div className="min-h-screen px-8 py-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-heading">Dictate</h1>
        <p className="text-sm text-ink-soft mt-1">
          Speak into the mic. Dictate mode cleans up your speech into written
          prose. Command mode transforms the text in the working area based
          on what you say. All output inherits the Sequel brand voice.
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
            : "Speak instruction → transforms text (or selection) in working area"}
        </span>
      </div>

      {/* Context selector */}
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

      {/* Working area */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {mode === "dictate" ? "Working area" : "Subject text (target to transform)"}
          </label>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={`w-2 h-2 rounded-full ${
              isListening
                ? "bg-red-500 animate-pulse"
                : isProcessing
                ? "bg-amber-500 animate-pulse"
                : "bg-emerald-500"
            }`} />
            <span className="text-ink-soft">{status}</span>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === "dictate"
              ? "Press the mic and start talking. Your speech will be cleaned up and placed here."
              : "Paste or type the text you want to transform, then press the mic and speak your instruction (e.g., 'make this more formal', 'turn into bullet points')."
          }
          rows={12}
          disabled={isProcessing}
          className="w-full rounded-xl border border-border px-4 py-3 text-sm text-ink font-sans resize-y focus:outline-none focus:ring-1 focus:border-brand-400 focus:ring-brand-400 disabled:bg-ink-bg/40"
        />

        {/* Live transcript strip in command mode */}
        {mode === "command" && (isListening || rawTranscript) && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <span className="font-semibold uppercase tracking-wide text-[10px] mr-2">
              Instruction
            </span>
            {rawTranscript || <span className="italic text-amber-700">Speak your command...</span>}
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
            {history.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-border bg-white px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-1.5 text-[11px]">
                  <span
                    className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${
                      entry.mode === "dictate"
                        ? "bg-brand-50 text-brand-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {entry.mode}
                  </span>
                  <span className="text-ink-soft">{entry.context}</span>
                  <span className="text-ink-soft">•</span>
                  <span className="text-ink-soft">{fmtTime(entry.ts)}</span>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
