"use client";

import { useEffect, useState } from "react";
import ChatInterface from "@/components/chat/ChatInterface";
import SkillIcon from "./SkillIcon";
import type { Skill } from "@/lib/skills";

interface SkillChatProps {
  skill: Skill;
  onBack: () => void;
  onUninstall: () => void;
}

export default function SkillChat({ skill, onBack, onUninstall }: SkillChatProps) {
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/skills/system-prompt?skill_name=${skill.name}`);
        if (!res.ok) throw new Error("Failed to load skill instructions");
        const j = await res.json();
        if (!cancelled) setSystemPrompt(j.systemPrompt || "");
      } catch (err) {
        console.error(err);
        if (!cancelled) setSystemPrompt("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [skill.name]);

  const welcomeDescription =
    `Connected to your Brand Brain. Available workflows:\n` +
    skill.workflows.map((w, i) => `${i + 1}. ${w}`).join("\n");

  return (
    <div className="flex flex-col h-screen">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-surface-card">
        <button
          onClick={onBack}
          className="p-1.5 rounded-md text-body hover:bg-surface-raised hover:text-heading transition-colors"
          title="Back to Skills"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
          <SkillIcon name={skill.icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-heading truncate">{skill.displayName}</h2>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-muted">Connected to Brand Brain</span>
          </div>
        </div>
        <button
          onClick={onUninstall}
          className="text-xs text-body hover:text-red-600 transition-colors"
        >
          Uninstall
        </button>
      </div>

      {/* Chat area */}
      <div className="flex-1 min-h-0">
        {loading || systemPrompt === null ? (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            Loading skill...
          </div>
        ) : (
          <ChatInterface
            systemPrompt={systemPrompt}
            placeholder={`Ask ${skill.displayName}...`}
            emptyTitle={skill.displayName}
            emptyDescription={welcomeDescription}
            assistantLabel={skill.displayName}
            suggestions={skill.workflows.slice(0, 3)}
          />
        )}
      </div>
    </div>
  );
}
