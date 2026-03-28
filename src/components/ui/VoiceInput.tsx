"use client";

import React, { useCallback } from "react";
import MicButton from "./MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

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
}

/**
 * Drop-in replacement for <textarea> or <input> with a built-in mic button.
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
}: VoiceInputProps) {
  const handleTranscript = useCallback(
    (text: string) => onChange(text),
    [onChange]
  );

  const { isListening, supported, toggle } = useSpeechToText({
    onTranscript: handleTranscript,
    currentValue: value,
  });

  const borderClass = isListening
    ? "border-red-400 focus-within:border-red-400 focus-within:ring-red-400"
    : "border-border focus-within:border-brand-400 focus-within:ring-brand-400";

  const inputCls = `w-full bg-white text-sm text-ink focus:outline-none resize-y ${
    micPosition === "inside" && supported ? "pr-12" : ""
  } ${className}`;

  return (
    <div className={`relative ${wrapperClassName}`}>
      {as === "textarea" ? (
        <textarea
          ref={inputRef as React.Ref<HTMLTextAreaElement>}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled || false}
          className={`rounded-xl border px-4 py-3 focus:ring-1 ${borderClass} ${inputCls}`}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          ref={inputRef as React.Ref<HTMLInputElement>}
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || false}
          className={`rounded-xl border px-4 py-2.5 focus:ring-1 ${borderClass} ${inputCls}`}
          onKeyDown={onKeyDown}
          autoFocus={autoFocus}
        />
      )}

      {supported && micPosition === "inside" && (
        <div className="absolute right-2 top-2">
          <MicButton
            isListening={isListening}
            supported={supported}
            onClick={toggle}
            disabled={disabled}
            size={micSize}
          />
        </div>
      )}

      {supported && micPosition === "outside" && (
        <MicButton
          isListening={isListening}
          supported={supported}
          onClick={toggle}
          disabled={disabled}
          size={micSize}
          className="ml-2 flex-shrink-0"
        />
      )}

      {isListening && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-red-500">
          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
          Listening...
        </div>
      )}
    </div>
  );
}
