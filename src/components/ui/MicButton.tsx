"use client";

import React from "react";

interface MicButtonProps {
  isListening: boolean;
  supported: boolean;
  onClick: () => void;
  disabled?: boolean;
  /** "sm" = 7x7, "md" = 9x9 (default) */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Reusable mic button for voice-to-text input.
 * Shows a mic icon when idle, a stop square when recording.
 * Pulses red while listening.
 */
export default function MicButton({
  isListening,
  supported,
  onClick,
  disabled = false,
  size = "md",
  className = "",
}: MicButtonProps) {
  if (!supported) return null;

  const dim = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const iconDim = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${dim} rounded-lg flex items-center justify-center transition-all ${
        isListening
          ? "bg-red-500 text-white shadow-lg shadow-red-200 scale-110"
          : "bg-brand-50 text-brand-400 hover:bg-brand-100 hover:text-brand-600"
      } disabled:opacity-40 ${className}`}
      title={isListening ? "Stop recording" : "Click to speak"}
    >
      {isListening ? (
        <svg
          className={`${iconDim} animate-pulse`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg
          className={iconDim}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
          />
        </svg>
      )}
    </button>
  );
}
