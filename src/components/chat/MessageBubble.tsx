"use client";

import { useState } from "react";
import SourceCard from "./SourceCard";
import Markdown from "@/components/ui/Markdown";

interface Source {
  type: "brand_doc" | "article";
  id: string;
  name: string;
  doc_type?: string;
  url?: string | null;
  similarity?: number;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  assistantLabel?: string;
}

export default function MessageBubble({
  role,
  content,
  sources,
  isStreaming,
  assistantLabel,
}: MessageBubbleProps) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const isUser = role === "user";
  const hasSources = sources && sources.length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[720px] ${isUser ? "items-end" : "items-start"}`}>
        {/* Avatar + name */}
        <div className={`flex items-center gap-2 mb-1.5 ${isUser ? "justify-end" : ""}`}>
          {!isUser && (
            <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </div>
          )}
          <span className="text-xs font-medium text-gray-400">
            {isUser ? "You" : assistantLabel || "Brand Brain"}
          </span>
        </div>

        {/* Message bubble */}
        <div
          className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
            isUser
              ? "bg-brand-500 text-white rounded-br-md"
              : "bg-white text-gray-800 border border-gray-200 rounded-bl-md shadow-sm"
          }`}
        >
          {content ? (
            isUser ? (
              <div className="whitespace-pre-wrap">{content}</div>
            ) : (
              <div className="prose-sm"><Markdown content={content} /></div>
            )
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : null}

          {/* Streaming cursor */}
          {isStreaming && content && (
            <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>

        {/* Sources (only for assistant messages, after streaming is done) */}
        {!isUser && hasSources && !isStreaming && (
          <div className="mt-2">
            <button
              onClick={() => setSourcesExpanded(!sourcesExpanded)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${sourcesExpanded ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
              {sources.length} source{sources.length !== 1 ? "s" : ""} used
            </button>
            {sourcesExpanded && (
              <div className="mt-2 flex flex-wrap gap-2">
                {sources.map((source) => (
                  <SourceCard key={source.id} source={source} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
