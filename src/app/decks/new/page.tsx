"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import VoiceProcessor from "@/components/ui/VoiceProcessor";
import { newSlide } from "@/lib/decks";

const STARTING_POINTS = [
  { id: "prompt", icon: "✨", label: "From Prompt", desc: "Describe what you want and AI generates the full deck" },
  { id: "battle_card", icon: "⚔️", label: "Battle Card", desc: "Enter a competitor name — AI builds a competitive deck" },
  { id: "sales_deck", icon: "📈", label: "Sales Deck", desc: "Enter a prospect/topic — AI builds a pitch deck" },
  { id: "scratch", icon: "📝", label: "From Scratch", desc: "Blank deck — add slides manually" },
];

export default function NewDeckPage() {
  const router = useRouter();
  const [step, setStep] = useState<"choose" | "prompt">("choose");
  const [mode, setMode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/decks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), mode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const { deck } = await res.json();

      // Save to Supabase
      const saveRes = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: deck.title || prompt.trim().slice(0, 60), slides: deck.slides }),
      });

      if (saveRes.ok) {
        const { deck: saved } = await saveRes.json();
        router.push(`/decks/${saved.id}`);
      }
    } catch (err) {
      setError(String(err));
    }
    setIsGenerating(false);
  }

  async function handleScratch() {
    const slides = [
      { ...newSlide("title_slide"), title: "Untitled Deck", subtitle: "Add your subtitle" },
      { ...newSlide("bullets"), title: "First Slide", body: "• Point 1\n• Point 2\n• Point 3" },
      { ...newSlide("closing"), title: "Thank You", subtitle: "" },
    ];

    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Deck", slides }),
    });

    if (res.ok) {
      const { deck } = await res.json();
      router.push(`/decks/${deck.id}`);
    }
  }

  function handleSelect(id: string) {
    if (id === "scratch") {
      handleScratch();
      return;
    }
    setMode(id);
    setStep("prompt");
  }

  const placeholders: Record<string, string> = {
    prompt: 'e.g., "A 10-slide deck about our Q1 product roadmap for the board meeting, covering key milestones, risks, and budget allocation"',
    battle_card: 'e.g., "Hopin" or "Compare us to Zoom Events — focus on pricing, features, and enterprise support"',
    sales_deck: 'e.g., "Enterprise SaaS pitch for Fortune 500 companies, focusing on ROI and security compliance"',
  };

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => step === "prompt" ? setStep("choose") : router.push("/decks")}
        className="inline-flex items-center gap-1.5 text-sm text-body hover:text-heading mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back
      </button>

      {step === "choose" ? (
        <>
          <h1 className="text-2xl font-semibold text-heading mb-2">New Deck</h1>
          <p className="text-sm text-body mb-8">Choose how to start your presentation.</p>

          <div className="grid grid-cols-2 gap-4">
            {STARTING_POINTS.map((sp) => (
              <button
                key={sp.id}
                onClick={() => handleSelect(sp.id)}
                className="text-left p-5 bg-white rounded-xl border border-border hover:border-brand-300 hover:shadow-md transition-all group"
              >
                <div className="text-2xl mb-3">{sp.icon}</div>
                <h3 className="text-sm font-semibold text-heading group-hover:text-brand-600">{sp.label}</h3>
                <p className="text-xs text-body mt-1">{sp.desc}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-heading mb-2">
            {mode === "battle_card" ? "Build a Battle Card Deck" : mode === "sales_deck" ? "Build a Sales Deck" : "Generate a Deck"}
          </h1>
          <p className="text-sm text-body mb-6">Describe what you want and AI will build the full presentation.</p>

          <div className="relative mb-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={placeholders[mode] || placeholders.prompt}
              disabled={isGenerating}
              className="w-full rounded-xl border bg-white px-4 py-3 pr-32 text-sm focus:outline-none focus:ring-1 resize-y transition-colors border-border focus:border-brand-400 focus:ring-brand-400"
            />
            <div className="absolute right-3 top-3">
              <VoiceProcessor value={prompt} onChange={setPrompt} context="content" disabled={isGenerating} micSize="sm" />
            </div>
          </div>

          {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
            className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating deck...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Generate Deck
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
