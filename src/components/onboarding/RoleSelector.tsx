"use client";

import { useState } from "react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { getDefaultModules, MODULES, type UserRole } from "@/lib/modules";

const ROLES: { id: UserRole; label: string; emoji: string; description: string }[] = [
  {
    id: "marketing",
    label: "Marketing",
    emoji: "📣",
    description: "Content, SEO, brand voice, competitive intel, editorial workflows",
  },
  {
    id: "sales",
    label: "Sales",
    emoji: "🎯",
    description: "Competitive battlecards, deck builder, call analysis, prospecting",
  },
  {
    id: "leadership",
    label: "Leadership",
    emoji: "📊",
    description: "SEO dashboard, call insights, competitive intel, reporting",
  },
  {
    id: "custom",
    label: "Custom",
    emoji: "⚙️",
    description: "Start with everything enabled — customize in settings later",
  },
];

export default function RoleSelector() {
  const { completeOnboarding } = usePreferences();
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selected || saving) return;
    setSaving(true);
    await completeOnboarding(selected);
    setSaving(false);
  }

  const previewModules = selected ? getDefaultModules(selected) : [];

  return (
    <div className="fixed inset-0 z-[100] bg-[#0F0A1A] flex items-center justify-center">
      <div className="w-full max-w-2xl px-6">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Welcome to Brand Brain</h1>
          <p className="text-[#A09CB0] text-sm">
            What&apos;s your primary role? We&apos;ll set up the right tools for you.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {ROLES.map((role) => (
            <button
              key={role.id}
              onClick={() => setSelected(role.id)}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                selected === role.id
                  ? "border-[#7C3AED] bg-[#1A1228]"
                  : "border-[#2A2040] bg-[#1A1228]/50 hover:border-[#3A3050]"
              }`}
            >
              <div className="text-2xl mb-2">{role.emoji}</div>
              <h3 className="text-white font-semibold text-sm mb-1">{role.label}</h3>
              <p className="text-[#6B6680] text-xs leading-relaxed">{role.description}</p>
            </button>
          ))}
        </div>

        {/* Preview of enabled modules */}
        {selected && (
          <div className="mb-8 p-4 rounded-xl bg-[#1A1228] border border-[#2A2040]">
            <p className="text-xs font-semibold text-[#6B6680] uppercase tracking-wider mb-2">
              Modules enabled for {ROLES.find((r) => r.id === selected)?.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {MODULES.filter((m) => previewModules.includes(m.id)).map((m) => (
                <span
                  key={m.id}
                  className="px-2.5 py-1 text-xs rounded-full bg-[#7C3AED]/15 text-[#B197FC] border border-[#7C3AED]/20"
                >
                  {m.displayName}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-[#6B6680] mt-2">
              You can customize these anytime in Settings.
            </p>
          </div>
        )}

        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={!selected || saving}
          className="w-full py-3 text-sm font-semibold text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Setting up..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
