"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { SLIDE_LAYOUTS, newSlide, type Slide, type Deck, type PresentationTheme } from "@/lib/decks";
import MicButton from "@/components/ui/MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

// ── Slide Editor Component ──
function SlideEditor({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  return (
    <div className="space-y-4">
      {/* Layout selector */}
      <div>
        <label className="text-xs font-medium text-body mb-1.5 block">Layout</label>
        <div className="flex flex-wrap gap-1.5">
          {SLIDE_LAYOUTS.map((l) => (
            <button
              key={l.type}
              onClick={() => onChange({ ...slide, layout: l.type })}
              className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                slide.layout === l.type
                  ? "border-brand-400 bg-brand-50 text-brand-700 font-medium"
                  : "border-border bg-white text-body hover:border-brand-200"
              }`}
            >
              {l.icon} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-xs font-medium text-body mb-1.5 block">Title</label>
        <input
          type="text"
          value={slide.title}
          onChange={(e) => onChange({ ...slide, title: e.target.value })}
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          placeholder="Slide title..."
        />
      </div>

      {/* Subtitle */}
      {(slide.layout === "title_slide" || slide.layout === "closing" || slide.layout === "two_column" || slide.layout === "quote") && (
        <div>
          <label className="text-xs font-medium text-body mb-1.5 block">
            {slide.layout === "two_column" ? "Right Column" : slide.layout === "quote" ? "Attribution" : "Subtitle"}
          </label>
          <input
            type="text"
            value={slide.subtitle || ""}
            onChange={(e) => onChange({ ...slide, subtitle: e.target.value })}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
      )}

      {/* Body */}
      {slide.layout !== "three_cards" && slide.layout !== "comparison_table" && slide.layout !== "stats_callout" && (
        <div>
          <label className="text-xs font-medium text-body mb-1.5 block">
            {slide.layout === "two_column" ? "Left Column" : "Content"}
          </label>
          <textarea
            value={slide.body || ""}
            onChange={(e) => onChange({ ...slide, body: e.target.value })}
            rows={4}
            className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
            placeholder="• Point 1&#10;• Point 2&#10;• Point 3"
          />
        </div>
      )}

      {/* Three Cards */}
      {slide.layout === "three_cards" && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-body">Cards</label>
          {(slide.cards || []).map((card, ci) => (
            <div key={ci} className="flex gap-2 p-3 bg-gray-50 rounded-xl">
              <input
                type="text"
                value={card.icon}
                onChange={(e) => {
                  const cards = [...(slide.cards || [])];
                  cards[ci] = { ...cards[ci], icon: e.target.value };
                  onChange({ ...slide, cards });
                }}
                className="w-12 text-center rounded-lg border border-border bg-white px-1 py-2 text-lg"
              />
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  value={card.title}
                  onChange={(e) => {
                    const cards = [...(slide.cards || [])];
                    cards[ci] = { ...cards[ci], title: e.target.value };
                    onChange({ ...slide, cards });
                  }}
                  className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium"
                  placeholder="Card title"
                />
                <textarea
                  value={card.body}
                  onChange={(e) => {
                    const cards = [...(slide.cards || [])];
                    cards[ci] = { ...cards[ci], body: e.target.value };
                    onChange({ ...slide, cards });
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs resize-none"
                  placeholder="Card content"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {slide.layout === "stats_callout" && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-body">Stats</label>
          {(slide.stats || []).map((stat, si) => (
            <div key={si} className="flex gap-2">
              <input
                type="text"
                value={stat.value}
                onChange={(e) => {
                  const stats = [...(slide.stats || [])];
                  stats[si] = { ...stats[si], value: e.target.value };
                  onChange({ ...slide, stats });
                }}
                className="w-24 rounded-lg border border-border bg-white px-3 py-2 text-lg font-bold text-center"
                placeholder="47%"
              />
              <input
                type="text"
                value={stat.label}
                onChange={(e) => {
                  const stats = [...(slide.stats || [])];
                  stats[si] = { ...stats[si], label: e.target.value };
                  onChange({ ...slide, stats });
                }}
                className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
                placeholder="Metric label"
              />
            </div>
          ))}
        </div>
      )}

      {/* Comparison Table */}
      {slide.layout === "comparison_table" && (
        <div className="space-y-3">
          <label className="text-xs font-medium text-body">Columns</label>
          <div className="grid grid-cols-2 gap-3">
            {(slide.columns || []).map((col, ci) => (
              <div key={ci} className="space-y-2">
                <input
                  type="text"
                  value={col.header}
                  onChange={(e) => {
                    const columns = [...(slide.columns || [])];
                    columns[ci] = { ...columns[ci], header: e.target.value };
                    onChange({ ...slide, columns });
                  }}
                  className="w-full rounded-lg border border-border bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700"
                  placeholder="Column header"
                />
                {col.rows.map((row, ri) => (
                  <input
                    key={ri}
                    type="text"
                    value={row}
                    onChange={(e) => {
                      const columns = [...(slide.columns || [])];
                      const rows = [...columns[ci].rows];
                      rows[ri] = e.target.value;
                      columns[ci] = { ...columns[ci], rows };
                      onChange({ ...slide, columns });
                    }}
                    className="w-full rounded-lg border border-border bg-white px-3 py-1.5 text-xs"
                    placeholder={`Row ${ri + 1}`}
                  />
                ))}
                <button
                  onClick={() => {
                    const columns = [...(slide.columns || [])];
                    columns[ci] = { ...columns[ci], rows: [...columns[ci].rows, ""] };
                    onChange({ ...slide, columns });
                  }}
                  className="text-xs text-brand-500 hover:text-brand-600"
                >
                  + Add row
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Speaker notes */}
      <div>
        <label className="text-xs font-medium text-body mb-1.5 block">Speaker Notes</label>
        <textarea
          value={slide.speakerNotes || ""}
          onChange={(e) => onChange({ ...slide, speakerNotes: e.target.value })}
          rows={2}
          className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y text-body"
          placeholder="Notes for the presenter..."
        />
      </div>
    </div>
  );
}

// ── Slide Thumbnail ──
function SlideThumbnail({ slide, index, isActive, onClick }: { slide: Slide; index: number; isActive: boolean; onClick: () => void }) {
  const layout = SLIDE_LAYOUTS.find((l) => l.type === slide.layout);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
        isActive ? "border-brand-400 bg-brand-50 shadow-sm" : "border-border bg-white hover:border-brand-200"
      }`}
    >
      <div className="text-[10px] text-body mb-1 flex items-center justify-between">
        <span>{index + 1}</span>
        <span>{layout?.icon}</span>
      </div>
      <p className="text-xs font-medium text-heading truncate">{slide.title || "Untitled"}</p>
    </button>
  );
}

// ── Main Page ──
export default function DeckEditorPage() {
  const params = useParams();
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSlide, setActiveSlide] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [themes, setThemes] = useState<PresentationTheme[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [showThemePanel, setShowThemePanel] = useState(false);

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { isListening, supported, toggle } = useSpeechToText({
    onTranscript: (t) => setChatInput(t),
    currentValue: chatInput,
  });

  // Load deck
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks");
        if (res.ok) {
          const data = await res.json();
          const found = (data.decks || []).find((d: Deck) => d.id === params.id);
          if (found) {
            found.slides = Array.isArray(found.slides) ? found.slides : [];
            setDeck(found);
            setSelectedTheme(found.theme_id);
          }
        }
      } catch { /* */ }
      setLoading(false);
    })();
  }, [params.id]);

  // Load themes
  useEffect(() => {
    fetch("/api/decks/themes").then((r) => r.json()).then((d) => setThemes(d.themes || [])).catch(() => {});
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const slides = deck?.slides || [];
  const currentSlide = slides[activeSlide] || null;

  function updateSlide(index: number, updated: Slide) {
    if (!deck) return;
    const newSlides = [...deck.slides];
    newSlides[index] = updated;
    setDeck({ ...deck, slides: newSlides });
  }

  function addSlide(layout: Slide["layout"] = "bullets") {
    if (!deck) return;
    const s = newSlide(layout);
    const idx = activeSlide + 1;
    const newSlides = [...deck.slides];
    newSlides.splice(idx, 0, s);
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(idx);
  }

  function deleteSlide(index: number) {
    if (!deck || deck.slides.length <= 1) return;
    const newSlides = deck.slides.filter((_, i) => i !== index);
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(Math.min(activeSlide, newSlides.length - 1));
  }

  function moveSlide(from: number, to: number) {
    if (!deck || to < 0 || to >= deck.slides.length) return;
    const newSlides = [...deck.slides];
    const [moved] = newSlides.splice(from, 1);
    newSlides.splice(to, 0, moved);
    setDeck({ ...deck, slides: newSlides });
    setActiveSlide(to);
  }

  async function handleSave() {
    if (!deck) return;
    setSaving(true);
    try {
      await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deck.id, title: deck.title, slides: deck.slides, theme_id: selectedTheme }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* */ }
    setSaving(false);
  }

  async function handleExport() {
    if (!deck) return;
    const res = await fetch("/api/decks/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides: deck.slides, theme_id: selectedTheme, title: deck.title }),
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${deck.title || "deck"}.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function handleChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim() || !deck) return;
    if (isListening) toggle();

    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/decks/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, slides: deck.slides }),
      });

      const data = await res.json();
      if (data.slides) {
        // Ensure IDs exist
        const updatedSlides = data.slides.map((s: Slide) => ({ ...s, id: s.id || crypto.randomUUID() }));
        setDeck({ ...deck, slides: updatedSlides });
        setChatMessages((prev) => [...prev, { role: "assistant", text: `Updated ${updatedSlides.length} slides.` }]);
        setActiveSlide(0);
      } else if (data.message) {
        setChatMessages((prev) => [...prev, { role: "assistant", text: data.message }]);
      }
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Sorry, something went wrong." }]);
    }
    setChatLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-body">Deck not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="border-b border-border bg-white px-4 py-2.5 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/decks")} className="text-body hover:text-heading transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <input
          type="text"
          value={deck.title}
          onChange={(e) => setDeck({ ...deck, title: e.target.value })}
          className="flex-1 text-sm font-semibold text-heading bg-transparent border-none focus:outline-none"
        />
        <span className="text-xs text-body">{slides.length} slides</span>

        <button
          onClick={() => setShowThemePanel(!showThemePanel)}
          className="px-3 py-1.5 text-xs font-medium text-body border border-border rounded-lg hover:bg-gray-50 transition-colors"
        >
          🎨 Theme
        </button>
        <button
          onClick={handleExport}
          className="px-3 py-1.5 text-xs font-medium text-body border border-border rounded-lg hover:bg-gray-50 transition-colors"
        >
          ⬇ .pptx
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
        </button>
      </div>

      {/* Theme panel */}
      {showThemePanel && (
        <div className="border-b border-border bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-body">Theme:</span>
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTheme(t.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  selectedTheme === t.id ? "border-brand-400 bg-brand-50 text-brand-700" : "border-border bg-white text-body hover:border-brand-200"
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: (t.colors as { primary?: string })?.primary || "#7C3AED" }}
                />
                {t.name}
              </button>
            ))}
            <button
              onClick={() => router.push("/decks/themes")}
              className="text-xs text-brand-500 hover:text-brand-600"
            >
              Manage themes →
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Slide sorter */}
        <div className="w-28 bg-gray-50 border-r border-border overflow-y-auto p-2 space-y-1.5 shrink-0">
          {slides.map((s, i) => (
            <div key={s.id || i} className="relative group">
              <SlideThumbnail slide={s} index={i} isActive={i === activeSlide} onClick={() => setActiveSlide(i)} />
              {/* Move buttons */}
              <div className="absolute right-0 top-0 flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                {i > 0 && (
                  <button onClick={() => moveSlide(i, i - 1)} className="w-5 h-5 flex items-center justify-center text-body hover:text-heading text-[10px]">▲</button>
                )}
                {i < slides.length - 1 && (
                  <button onClick={() => moveSlide(i, i + 1)} className="w-5 h-5 flex items-center justify-center text-body hover:text-heading text-[10px]">▼</button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => addSlide()}
            className="w-full py-2 text-xs font-medium text-brand-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors text-center"
          >
            + Add
          </button>
        </div>

        {/* Left: Slide editor */}
        <div className="flex-[6] overflow-y-auto bg-white p-6">
          {currentSlide ? (
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-heading">
                  Slide {activeSlide + 1} of {slides.length}
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => deleteSlide(activeSlide)}
                    disabled={slides.length <= 1}
                    className="px-2.5 py-1 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-40 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <SlideEditor
                slide={currentSlide}
                onChange={(s) => updateSlide(activeSlide, s)}
              />
            </div>
          ) : (
            <p className="text-center text-body py-16">No slides yet. Click + Add to start.</p>
          )}
        </div>

        {/* Right: AI Chat */}
        <div className="flex-[4] border-l border-border bg-surface flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-white">
            <h3 className="text-sm font-semibold text-heading">AI Assistant</h3>
            <p className="text-xs text-body">Ask me to modify slides, add content, or change the deck.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-body">Try:</p>
                <div className="mt-2 space-y-1.5">
                  {["Add a slide about pricing", "Make slide 1 more concise", "Add speaker notes to all slides", "Change tone to be executive-friendly"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setChatInput(s)}
                      className="block w-full text-left px-3 py-2 text-xs text-body bg-white rounded-lg border border-border hover:border-brand-200 transition-colors"
                    >
                      &ldquo;{s}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-xl text-xs ${
                  m.role === "user"
                    ? "bg-brand-500 text-white ml-8"
                    : "bg-white border border-border text-heading mr-8"
                }`}
              >
                {m.text}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-body px-3 py-2">
                <div className="w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleChat} className="p-3 border-t border-border bg-white">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Edit the deck..."
                  disabled={chatLoading}
                  className={`w-full rounded-xl border bg-surface px-3 py-2.5 ${supported ? "pr-10" : "pr-3"} text-xs focus:outline-none focus:ring-1 disabled:opacity-50 transition-colors ${
                    isListening ? "border-red-400 focus:ring-red-400" : "border-border focus:border-brand-400 focus:ring-brand-400"
                  }`}
                />
                <MicButton isListening={isListening} supported={supported} onClick={toggle} disabled={chatLoading} size="sm" className="absolute right-1.5 top-1.5" />
              </div>
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40 transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
