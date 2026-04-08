"use client";

/**
 * VoiceProcessor — Whispr-Flow-style AI processing layer on top of the
 * existing browser speech recognition. Sits next to a mic button and:
 *
 *   1. Catches the raw transcript when the user stops recording.
 *   2. Sends it to /api/voice/process with the current mode + context.
 *   3. Swaps the cleaned (Dictate) or transformed (Command) text back
 *      into the caller's input via the onProcessed callback.
 *   4. Keeps an undo stack so the user can revert to the pre-voice
 *      state.
 *
 * The raw browser transcription still flows through onInterim while the
 * user is speaking so they see live feedback — the AI processing
 * replaces that interim text the moment recording stops.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import MicButton from "./MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

export type VoiceMode = "dictate" | "command";
export type VoiceContext = "chat" | "content" | "email" | "generic";

interface VoiceProcessorProps {
  /** Current value of the input the user is dictating into. */
  value: string;
  /** Called with the final value after either live typing, interim STT, or AI processing. */
  onChange: (next: string) => void;
  /**
   * Destination context — drives how the AI cleans / formats the output.
   * "chat" = conversational, "content" = editorial prose, "email" = business msg,
   * "generic" = plain written English.
   */
  context?: VoiceContext;
  /**
   * Command mode requires a subject — the currently selected text in
   * the input the user wants to transform. If not provided, the
   * component falls back to the full `value`.
   */
  getSelectedText?: () => string;
  /** Show the mode toggle next to the mic button. Default true. */
  showModeToggle?: boolean;
  /** Size of the mic button. */
  micSize?: "sm" | "md";
  /** Layout direction for the control cluster. */
  layout?: "row" | "column";
  disabled?: boolean;
  className?: string;
}

interface UndoEntry {
  before: string;
  after: string;
  mode: VoiceMode;
  ts: number;
}

export default function VoiceProcessor({
  value,
  onChange,
  context = "generic",
  getSelectedText,
  showModeToggle = true,
  micSize = "sm",
  layout = "row",
  disabled = false,
  className = "",
}: VoiceProcessorProps) {
  const [mode, setMode] = useState<VoiceMode>("dictate");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUndo, setLastUndo] = useState<UndoEntry | null>(null);
  const [showUndo, setShowUndo] = useState(false);

  // We snapshot the value at the moment recording starts so dictate
  // mode can restore it if the AI processing fails.
  const preRecordValueRef = useRef<string>("");

  // Clear the undo toast after 10 seconds.
  useEffect(() => {
    if (!showUndo) return;
    const t = setTimeout(() => setShowUndo(false), 10000);
    return () => clearTimeout(t);
  }, [showUndo]);

  const handleInterim = useCallback(
    (text: string) => {
      // Live feedback from the browser STT — just pipe it into the input
      // so the user sees their words appearing as they speak.
      onChange(text);
    },
    [onChange]
  );

  const handleSessionEnd = useCallback(
    async (rawTranscript: string) => {
      if (!rawTranscript.trim()) return;
      setError(null);
      setIsProcessing(true);

      const preValue = preRecordValueRef.current;

      try {
        if (mode === "dictate") {
          // Dictate: clean up the raw transcript and append (or replace)
          // into the input. We default to appending onto whatever was
          // already in the input before the user started speaking.
          const res = await fetch("/api/voice/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "dictate",
              transcript: rawTranscript,
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
            preValue && !preValue.endsWith(" ") && !preValue.endsWith("\n")
              ? " "
              : "";
          const nextValue = (preValue + sep + cleaned).trim();

          setLastUndo({
            before: preValue,
            after: nextValue,
            mode: "dictate",
            ts: Date.now(),
          });
          setShowUndo(true);
          onChange(nextValue);
        } else {
          // Command mode: the raw transcript is an instruction. The
          // subject is whatever text the user had selected in the
          // input, falling back to the full value if nothing is
          // selected.
          const selected =
            (getSelectedText && getSelectedText().trim()) || preValue.trim();

          if (!selected) {
            setError(
              "Command mode needs a subject — select text or type something first."
            );
            onChange(preValue);
            return;
          }

          const res = await fetch("/api/voice/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "command",
              transcript: rawTranscript,
              context,
              selectedText: selected,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          const data = (await res.json()) as { text: string };
          const transformed = data.text.trim();

          // If the user had selected a substring, swap just that
          // substring. Otherwise replace the whole value.
          let nextValue: string;
          if (selected !== preValue && preValue.includes(selected)) {
            nextValue = preValue.replace(selected, transformed);
          } else {
            nextValue = transformed;
          }

          setLastUndo({
            before: preValue,
            after: nextValue,
            mode: "command",
            ts: Date.now(),
          });
          setShowUndo(true);
          onChange(nextValue);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Voice processing failed"
        );
        // Restore the pre-recording value so the unprocessed interim
        // STT output doesn't get left in the input.
        onChange(preValue);
      } finally {
        setIsProcessing(false);
      }
    },
    [mode, context, getSelectedText, onChange]
  );

  const { isListening, supported, toggle } = useSpeechToText({
    onTranscript: handleInterim,
    currentValue: value,
    onSessionEnd: handleSessionEnd,
  });

  const handleToggle = useCallback(() => {
    if (!isListening) {
      // Starting a new session — snapshot the current value.
      preRecordValueRef.current = value;
      setError(null);
    }
    toggle();
  }, [isListening, value, toggle]);

  const undo = useCallback(() => {
    if (!lastUndo) return;
    onChange(lastUndo.before);
    setLastUndo(null);
    setShowUndo(false);
  }, [lastUndo, onChange]);

  if (!supported) return null;

  const wrapperCls =
    layout === "row"
      ? "flex items-center gap-1.5"
      : "flex flex-col items-start gap-1.5";

  return (
    <div className={`${wrapperCls} ${className}`}>
      <div className="flex items-center gap-1.5">
        <MicButton
          isListening={isListening}
          supported={supported}
          onClick={handleToggle}
          disabled={disabled || isProcessing}
          size={micSize}
        />

        {showModeToggle && (
          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === "dictate" ? "command" : "dictate"))
            }
            disabled={isListening || isProcessing || disabled}
            title={
              mode === "dictate"
                ? "Dictate mode — click to switch to Command mode"
                : "Command mode — click to switch to Dictate mode"
            }
            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-colors disabled:opacity-50 ${
              mode === "dictate"
                ? "bg-brand-50 text-brand-600 hover:bg-brand-100"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            {mode === "dictate" ? "Dictate" : "Command"}
          </button>
        )}

        {isProcessing && (
          <span className="inline-flex items-center gap-1 text-[11px] text-brand-600">
            <span className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            {mode === "dictate" ? "Cleaning..." : "Executing..."}
          </span>
        )}

        {showUndo && lastUndo && !isProcessing && (
          <button
            type="button"
            onClick={undo}
            className="text-[11px] font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2"
          >
            Undo
          </button>
        )}
      </div>

      {error && (
        <span className="text-[11px] text-red-600" title={error}>
          {error.length > 60 ? error.slice(0, 60) + "…" : error}
        </span>
      )}
    </div>
  );
}
