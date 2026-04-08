"use client";

import React, { useCallback, useRef } from "react";
import VoiceProcessor, {
  type VoiceContext,
} from "./VoiceProcessor";

interface VoiceInputProps {
  /** "textarea" or "input" */
  as?: "textarea" | "input";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  /** Extra classes on the outer wrapper */
  wrapperClassName?: string;
  /** Position of mic: "inside" overlays on input, "outside" puts it after */
  micPosition?: "inside" | "outside";
  micSize?: "sm" | "md";
  id?: string;
  onKeyDown?: React.KeyboardEventHandler;
  autoFocus?: boolean;
  /** If provided, ref is forwarded to the underlying element */
  inputRef?: React.Ref<HTMLTextAreaElement | HTMLInputElement>;
  /**
   * Destination context for the AI voice cleanup layer. Tells the
   * processing layer how to format the output (chat, content, email,
   * generic). Defaults to "generic".
   */
  voiceContext?: VoiceContext;
  /** Show the Dictate/Command mode toggle next to the mic. Default true. */
  showVoiceModeToggle?: boolean;
}

/**
 * Drop-in replacement for <textarea> or <input> with a built-in mic button
 * AND a Whispr-Flow-style AI processing layer (Dictate + Command modes).
 *
 * When the user stops recording, the raw transcript is piped through
 * /api/voice/process for brand-aligned cleanup (Dictate) or transformation
 * of the selected/full text (Command).
 */
export default function VoiceInput({
  as = "textarea",
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  className = "",
  wrapperClassName = "",
  micPosition = "inside",
  micSize = "md",
  id,
  onKeyDown,
  autoFocus,
  inputRef,
  voiceContext = "generic",
  showVoiceModeToggle = true,
}: VoiceInputProps) {
  // Internal ref so we can read the current selection for Command mode
  // even when the caller doesn't pass their own ref.
  const internalRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(
    null
  );

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | HTMLInputElement | null) => {
      internalRef.current = el;
      if (typeof inputRef === "function") {
        (inputRef as (el: HTMLElement | null) => void)(el);
      } else if (inputRef && "current" in inputRef) {
        (inputRef as React.MutableRefObject<
          HTMLTextAreaElement | HTMLInputElement | null
        >).current = el;
      }
    },
    [inputRef]
  );

  const getSelectedText = useCallback((): string => {
    const el = internalRef.current;
    if (!el) return "";
    const start = (el as HTMLTextAreaElement).selectionStart ?? 0;
    const end = (el as HTMLTextAreaElement).selectionEnd ?? 0;
    if (start === end) return "";
    return value.slice(start, end);
  }, [value]);

  const baseInputCls = `w-full bg-white text-sm text-ink focus:outline-none ${
    as === "textarea" ? "resize-y" : ""
  } ${micPosition === "inside" ? "pr-28" : ""} ${className}`;

  return (
    <div className={`relative ${wrapperClassName}`}>
      {as === "textarea" ? (
        <textarea
          ref={setRefs as React.Ref<HTMLTextAreaElement>}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled || false}
          className={`rounded-xl border border-border px-4 py-3 focus:ring-1 focus:border-brand-400 focus:ring-brand-400 ${baseInputCls}`}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          ref={setRefs as React.Ref<HTMLInputElement>}
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || false}
          className={`rounded-xl border border-border px-4 py-2.5 focus:ring-1 focus:border-brand-400 focus:ring-brand-400 ${baseInputCls}`}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
        />
      )}

      {micPosition === "inside" && (
        <div className="absolute right-2 top-2">
          <VoiceProcessor
            value={value}
            onChange={onChange}
            context={voiceContext}
            getSelectedText={getSelectedText}
            showModeToggle={showVoiceModeToggle}
            micSize={micSize}
            disabled={disabled}
          />
        </div>
      )}

      {micPosition === "outside" && (
        <VoiceProcessor
          value={value}
          onChange={onChange}
          context={voiceContext}
          getSelectedText={getSelectedText}
          showModeToggle={showVoiceModeToggle}
          micSize={micSize}
          disabled={disabled}
          className="mt-2"
        />
      )}
    </div>
  );
}
