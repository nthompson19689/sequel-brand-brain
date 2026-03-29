"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { SLIDE_LAYOUTS, newSlide, type Slide, type Deck, type PresentationTheme, type ThemeColors, type ThemeFonts } from "@/lib/decks";
import MicButton from "@/components/ui/MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

// ─── Theme Helpers ───────────────────────────────────────────────────────────

function getThemeColors(theme: PresentationTheme | null): ThemeColors {
  return theme?.colors || { primary: "#7C3AED", secondary: "#6D28D9", accent: "#A78BFA", background: "mixed" };
}

function getThemeFonts(theme: PresentationTheme | null): ThemeFonts {
  return theme?.fonts || { header: "Georgia", body: "Calibri", sizePreset: "default" };
}

function fontScale(preset: string) {
  return preset === "large" ? 1.2 : preset === "compact" ? 0.85 : 1;
}

function isDark(colors: ThemeColors, index: number, total: number) {
  if (colors.background === "dark") return true;
  if (colors.background === "light") return false;
  return index === 0 || index === total - 1;
}

function lightenHex(hex: string, amount: number) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ─── Editable Text Component ─────────────────────────────────────────────────

function EditableText({
  value,
  onChange,
  className,
  style,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  const handleBlur = useCallback(() => {
    setFocused(false);
    if (ref.current) {
      const text = multiline
        ? ref.current.innerText
        : ref.current.innerText.replace(/\n/g, " ");
      if (text !== value) onChange(text);
    }
  }, [value, onChange, multiline]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      ref.current?.blur();
    }
  }, [multiline]);

  useEffect(() => {
    if (ref.current && !focused) {
      ref.current.innerText = value || "";
    }
  }, [value, focused]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      data-placeholder={placeholder}
      className={`outline-none cursor-text transition-all ${focused ? "ring-2 ring-blue-400/50 rounded" : "hover:ring-1 hover:ring-white/20 rounded"} ${!value && !focused ? "text-opacity-40" : ""} ${className || ""}`}
      style={{
        minHeight: "1.2em",
        ...style,
        ...((!value && !focused) ? { opacity: 0.4 } : {}),
      }}
    />
  );
}

// ─── Slide Canvas Renderer ───────────────────────────────────────────────────

function SlideCanvas({
  slide,
  onChange,
  colors,
  fonts,
  dark,
  interactive,
  scale,
}: {
  slide: Slide;
  onChange?: (s: Slide) => void;
  colors: ThemeColors;
  fonts: ThemeFonts;
  dark: boolean;
  interactive?: boolean;
  scale?: number;
}) {
  const s = fontScale(fonts.sizePreset);
  const sc = scale || 1;
  const bg = dark ? colors.primary : "#ffffff";
  const fg = dark ? "#ffffff" : "#1a1a2e";
  const fgSub = dark ? lightenHex(colors.accent, 40) : "#6b7280";
  const headerFont = fonts.header;
  const bodyFont = fonts.body;
  const editable = interactive && onChange;

  const edit = (field: string, val: string) => {
    if (onChange) onChange({ ...slide, [field]: val });
  };

  const editCard = (ci: number, field: string, val: string) => {
    if (!onChange) return;
    const cards = [...(slide.cards || [])];
    cards[ci] = { ...cards[ci], [field]: val };
    onChange({ ...slide, cards });
  };

  const editStat = (si: number, field: string, val: string) => {
    if (!onChange) return;
    const stats = [...(slide.stats || [])];
    stats[si] = { ...stats[si], [field]: val };
    onChange({ ...slide, stats });
  };

  const editColumn = (ci: number, field: string, val: string, ri?: number) => {
    if (!onChange) return;
    const columns = [...(slide.columns || [])];
    if (field === "header") {
      columns[ci] = { ...columns[ci], header: val };
    } else if (ri !== undefined) {
      const rows = [...columns[ci].rows];
      rows[ri] = val;
      columns[ci] = { ...columns[ci], rows };
    }
    onChange({ ...slide, columns });
  };

  // Base canvas style (16:9 aspect ratio)
  const canvasStyle: React.CSSProperties = {
    width: `${960 * sc}px`,
    height: `${540 * sc}px`,
    background: bg,
    position: "relative",
    overflow: "hidden",
    borderRadius: `${4 * sc}px`,
    fontFamily: bodyFont,
    fontSize: `${14 * s * sc}px`,
    color: fg,
  };

  // ── Title Slide ──
  if (slide.layout === "title_slide") {
    return (
      <div style={canvasStyle} className="flex flex-col items-center justify-center">
        {/* Accent line */}
        <div style={{ width: `${120 * sc}px`, height: `${4 * sc}px`, background: colors.accent, marginBottom: `${24 * sc}px`, borderRadius: 2 }} />
        {editable ? (
          <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Slide Title"
            style={{ fontSize: `${40 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, color: fg, textAlign: "center", padding: `0 ${40 * sc}px`, width: "100%" }} />
        ) : (
          <div style={{ fontSize: `${40 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, color: fg, textAlign: "center", padding: `0 ${40 * sc}px` }}>{slide.title || "Slide Title"}</div>
        )}
        <div style={{ height: `${12 * sc}px` }} />
        {editable ? (
          <EditableText value={slide.subtitle || ""} onChange={(v) => edit("subtitle", v)} placeholder="Subtitle"
            style={{ fontSize: `${18 * s * sc}px`, color: fgSub, textAlign: "center", padding: `0 ${60 * sc}px`, width: "100%" }} />
        ) : (
          <div style={{ fontSize: `${18 * s * sc}px`, color: fgSub, textAlign: "center", padding: `0 ${60 * sc}px` }}>{slide.subtitle || ""}</div>
        )}
      </div>
    );
  }

  // ── Bullets ──
  if (slide.layout === "bullets") {
    const lines = (slide.body || "").split("\n").filter(Boolean);
    return (
      <div style={canvasStyle}>
        {/* Top accent bar */}
        <div style={{ height: `${6 * sc}px`, background: colors.primary }} />
        <div style={{ padding: `${32 * sc}px ${48 * sc}px` }}>
          {editable ? (
            <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Slide Title"
              style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${24 * sc}px` }} />
          ) : (
            <div style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${24 * sc}px` }}>{slide.title || "Slide Title"}</div>
          )}
          {editable ? (
            <EditableText value={slide.body || ""} onChange={(v) => edit("body", v)} placeholder="• Point 1\n• Point 2\n• Point 3" multiline
              style={{ fontSize: `${16 * s * sc}px`, lineHeight: 1.8, whiteSpace: "pre-wrap" }} />
          ) : (
            <div style={{ fontSize: `${16 * s * sc}px`, lineHeight: 1.8 }}>
              {lines.map((line, i) => (
                <div key={i} style={{ display: "flex", gap: `${8 * sc}px`, marginBottom: `${4 * sc}px` }}>
                  <span style={{ color: colors.accent }}>•</span>
                  <span>{line.replace(/^[•\-]\s*/, "")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Two Column ──
  if (slide.layout === "two_column") {
    return (
      <div style={canvasStyle} className="flex">
        {/* Left */}
        <div style={{ flex: 1, padding: `${40 * sc}px ${32 * sc}px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {editable ? (
            <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Title"
              style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${16 * sc}px` }} />
          ) : (
            <div style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${16 * sc}px` }}>{slide.title}</div>
          )}
          {editable ? (
            <EditableText value={slide.body || ""} onChange={(v) => edit("body", v)} placeholder="Content..." multiline
              style={{ fontSize: `${14 * s * sc}px`, lineHeight: 1.7, whiteSpace: "pre-wrap" }} />
          ) : (
            <div style={{ fontSize: `${14 * s * sc}px`, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{slide.body}</div>
          )}
        </div>
        {/* Right accent panel */}
        <div style={{ width: "38%", background: lightenHex(colors.primary, 180), display: "flex", alignItems: "center", justifyContent: "center", padding: `${32 * sc}px` }}>
          {editable ? (
            <EditableText value={slide.subtitle || ""} onChange={(v) => edit("subtitle", v)} placeholder="Right column..."
              style={{ fontSize: `${16 * s * sc}px`, color: colors.primary, textAlign: "center", fontWeight: 600 }} multiline />
          ) : (
            <div style={{ fontSize: `${16 * s * sc}px`, color: colors.primary, textAlign: "center", fontWeight: 600 }}>{slide.subtitle}</div>
          )}
        </div>
      </div>
    );
  }

  // ── Three Cards ──
  if (slide.layout === "three_cards") {
    const cards = slide.cards || [{ icon: "🎯", title: "Card 1", body: "Description" }, { icon: "📊", title: "Card 2", body: "Description" }, { icon: "🚀", title: "Card 3", body: "Description" }];
    return (
      <div style={canvasStyle}>
        <div style={{ padding: `${32 * sc}px ${48 * sc}px` }}>
          {editable ? (
            <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Section Title"
              style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${32 * sc}px`, textAlign: "center" }} />
          ) : (
            <div style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${32 * sc}px`, textAlign: "center" }}>{slide.title}</div>
          )}
          <div style={{ display: "flex", gap: `${20 * sc}px` }}>
            {cards.map((card, ci) => (
              <div key={ci} style={{
                flex: 1, background: dark ? "rgba(255,255,255,0.08)" : "#f9fafb",
                borderRadius: `${12 * sc}px`, padding: `${24 * sc}px ${20 * sc}px`,
                borderTop: `${3 * sc}px solid ${colors.accent}`,
              }}>
                {editable ? (
                  <>
                    <EditableText value={card.icon} onChange={(v) => editCard(ci, "icon", v)}
                      style={{ fontSize: `${28 * sc}px`, marginBottom: `${10 * sc}px` }} />
                    <EditableText value={card.title} onChange={(v) => editCard(ci, "title", v)} placeholder="Card Title"
                      style={{ fontSize: `${14 * s * sc}px`, fontWeight: 700, marginBottom: `${8 * sc}px` }} />
                    <EditableText value={card.body} onChange={(v) => editCard(ci, "body", v)} placeholder="Description" multiline
                      style={{ fontSize: `${12 * s * sc}px`, color: fgSub, lineHeight: 1.5 }} />
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: `${28 * sc}px`, marginBottom: `${10 * sc}px` }}>{card.icon}</div>
                    <div style={{ fontSize: `${14 * s * sc}px`, fontWeight: 700, marginBottom: `${8 * sc}px` }}>{card.title}</div>
                    <div style={{ fontSize: `${12 * s * sc}px`, color: fgSub, lineHeight: 1.5 }}>{card.body}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Stats Callout ──
  if (slide.layout === "stats_callout") {
    const stats = slide.stats || [{ value: "100+", label: "Metric" }];
    return (
      <div style={canvasStyle} className="flex flex-col items-center justify-center">
        {editable ? (
          <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Stats Title"
            style={{ fontSize: `${24 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${40 * sc}px`, textAlign: "center" }} />
        ) : (
          <div style={{ fontSize: `${24 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${40 * sc}px`, textAlign: "center" }}>{slide.title}</div>
        )}
        <div style={{ display: "flex", gap: `${60 * sc}px` }}>
          {stats.map((stat, si) => (
            <div key={si} style={{ textAlign: "center" }}>
              {editable ? (
                <>
                  <EditableText value={stat.value} onChange={(v) => editStat(si, "value", v)} placeholder="0"
                    style={{ fontSize: `${48 * s * sc}px`, fontWeight: 700, color: colors.accent }} />
                  <EditableText value={stat.label} onChange={(v) => editStat(si, "label", v)} placeholder="Label"
                    style={{ fontSize: `${14 * s * sc}px`, color: fgSub, marginTop: `${8 * sc}px` }} />
                </>
              ) : (
                <>
                  <div style={{ fontSize: `${48 * s * sc}px`, fontWeight: 700, color: colors.accent }}>{stat.value}</div>
                  <div style={{ fontSize: `${14 * s * sc}px`, color: fgSub, marginTop: `${8 * sc}px` }}>{stat.label}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Comparison Table ──
  if (slide.layout === "comparison_table") {
    const columns = slide.columns || [{ header: "Us", rows: ["Feature 1"] }, { header: "Them", rows: ["Feature 1"] }];
    const maxRows = Math.max(...columns.map((c) => c.rows.length));
    return (
      <div style={canvasStyle}>
        <div style={{ padding: `${32 * sc}px ${48 * sc}px` }}>
          {editable ? (
            <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Comparison"
              style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${24 * sc}px`, textAlign: "center" }} />
          ) : (
            <div style={{ fontSize: `${28 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${24 * sc}px`, textAlign: "center" }}>{slide.title}</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns.length}, 1fr)`, gap: 0, borderRadius: `${8 * sc}px`, overflow: "hidden", border: `1px solid ${dark ? "rgba(255,255,255,0.15)" : "#e5e7eb"}` }}>
            {/* Headers */}
            {columns.map((col, ci) => (
              <div key={`h-${ci}`} style={{
                background: ci === 0 ? colors.primary : colors.secondary,
                padding: `${12 * sc}px ${16 * sc}px`, color: "#fff", fontWeight: 700,
                fontSize: `${14 * s * sc}px`, textAlign: "center",
              }}>
                {editable ? (
                  <EditableText value={col.header} onChange={(v) => editColumn(ci, "header", v)}
                    style={{ color: "#fff" }} />
                ) : col.header}
              </div>
            ))}
            {/* Rows */}
            {Array.from({ length: maxRows }).map((_, ri) =>
              columns.map((col, ci) => (
                <div key={`${ci}-${ri}`} style={{
                  padding: `${10 * sc}px ${16 * sc}px`,
                  background: ri % 2 === 0 ? (dark ? "rgba(255,255,255,0.04)" : "#f9fafb") : (dark ? "rgba(255,255,255,0.08)" : "#ffffff"),
                  fontSize: `${13 * s * sc}px`, textAlign: "center",
                  borderTop: `1px solid ${dark ? "rgba(255,255,255,0.1)" : "#e5e7eb"}`,
                }}>
                  {editable ? (
                    <EditableText value={col.rows[ri] || ""} onChange={(v) => editColumn(ci, "row", v, ri)}
                      placeholder="..." />
                  ) : (col.rows[ri] || "")}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Quote ──
  if (slide.layout === "quote") {
    const qbg = dark ? colors.secondary : lightenHex(colors.primary, 200);
    return (
      <div style={{ ...canvasStyle, background: qbg }} className="flex flex-col items-center justify-center">
        <div style={{ width: `${60 * sc}px`, height: `${3 * sc}px`, background: colors.accent, marginBottom: `${32 * sc}px` }} />
        {editable ? (
          <EditableText value={slide.body || slide.title} onChange={(v) => edit("body", v)} placeholder="Your quote here..." multiline
            style={{ fontSize: `${26 * s * sc}px`, fontStyle: "italic", textAlign: "center", padding: `0 ${80 * sc}px`, lineHeight: 1.6, maxWidth: "100%", width: "100%", color: fg }} />
        ) : (
          <div style={{ fontSize: `${26 * s * sc}px`, fontStyle: "italic", textAlign: "center", padding: `0 ${80 * sc}px`, lineHeight: 1.6, color: fg }}>{slide.body || slide.title}</div>
        )}
        <div style={{ width: `${40 * sc}px`, height: `${2 * sc}px`, background: colors.accent, margin: `${24 * sc}px 0 ${16 * sc}px` }} />
        {editable ? (
          <EditableText value={slide.subtitle || ""} onChange={(v) => edit("subtitle", v)} placeholder="— Attribution"
            style={{ fontSize: `${14 * s * sc}px`, color: fgSub }} />
        ) : (
          <div style={{ fontSize: `${14 * s * sc}px`, color: fgSub }}>{slide.subtitle}</div>
        )}
      </div>
    );
  }

  // ── Closing ──
  if (slide.layout === "closing") {
    return (
      <div style={{ ...canvasStyle, background: colors.primary }} className="flex flex-col items-center justify-center">
        {editable ? (
          <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Thank You"
            style={{ fontSize: `${36 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, color: "#fff", textAlign: "center" }} />
        ) : (
          <div style={{ fontSize: `${36 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, color: "#fff", textAlign: "center" }}>{slide.title}</div>
        )}
        <div style={{ height: `${16 * sc}px` }} />
        {editable ? (
          <EditableText value={slide.subtitle || ""} onChange={(v) => edit("subtitle", v)} placeholder="Contact info or CTA"
            style={{ fontSize: `${16 * s * sc}px`, color: "rgba(255,255,255,0.7)", textAlign: "center" }} />
        ) : (
          <div style={{ fontSize: `${16 * s * sc}px`, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>{slide.subtitle}</div>
        )}
      </div>
    );
  }

  // ── Image Left / Image Right ──
  if (slide.layout === "image_left" || slide.layout === "image_right") {
    const isLeft = slide.layout === "image_left";
    const placeholder = (
      <div style={{
        width: "42%", background: dark ? "rgba(255,255,255,0.06)" : "#f3f4f6",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <div style={{ textAlign: "center", color: fgSub, fontSize: `${13 * sc}px` }}>
          <div style={{ fontSize: `${32 * sc}px`, marginBottom: `${8 * sc}px`, opacity: 0.5 }}>🖼️</div>
          Image
        </div>
      </div>
    );
    const textPanel = (
      <div style={{ flex: 1, padding: `${40 * sc}px ${32 * sc}px`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {editable ? (
          <>
            <EditableText value={slide.title} onChange={(v) => edit("title", v)} placeholder="Title"
              style={{ fontSize: `${26 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${16 * sc}px` }} />
            <EditableText value={slide.body || ""} onChange={(v) => edit("body", v)} placeholder="Content..." multiline
              style={{ fontSize: `${14 * s * sc}px`, lineHeight: 1.7, color: fgSub }} />
          </>
        ) : (
          <>
            <div style={{ fontSize: `${26 * s * sc}px`, fontFamily: headerFont, fontWeight: 700, marginBottom: `${16 * sc}px` }}>{slide.title}</div>
            <div style={{ fontSize: `${14 * s * sc}px`, lineHeight: 1.7, color: fgSub, whiteSpace: "pre-wrap" }}>{slide.body}</div>
          </>
        )}
      </div>
    );
    return (
      <div style={canvasStyle} className="flex">
        {isLeft ? <>{placeholder}{textPanel}</> : <>{textPanel}{placeholder}</>}
      </div>
    );
  }

  // Fallback
  return (
    <div style={canvasStyle} className="flex items-center justify-center">
      <div style={{ fontSize: `${18 * sc}px`, color: fgSub }}>Unsupported layout: {slide.layout}</div>
    </div>
  );
}

// ─── Visual Slide Thumbnail ──────────────────────────────────────────────────

function SlideThumbnail({
  slide, index, isActive, onClick, colors, fonts, dark,
}: {
  slide: Slide; index: number; isActive: boolean; onClick: () => void;
  colors: ThemeColors; fonts: ThemeFonts; dark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-lg border-2 transition-all overflow-hidden ${
        isActive ? "border-blue-500 shadow-md" : "border-transparent hover:border-gray-300"
      }`}
    >
      <div className="relative">
        <div className="text-[9px] absolute top-0.5 left-1 z-10 bg-black/50 text-white rounded px-1">
          {index + 1}
        </div>
        <div style={{ transform: "scale(0.16)", transformOrigin: "top left", width: 960, height: 540, pointerEvents: "none" }}>
          <SlideCanvas slide={slide} colors={colors} fonts={fonts} dark={dark} />
        </div>
        <div style={{ width: `${960 * 0.16}px`, height: `${540 * 0.16}px` }} />
      </div>
    </button>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

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
  const [showNotes, setShowNotes] = useState(false);
  const [showLayoutPicker, setShowLayoutPicker] = useState(false);

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
  const currentTheme = themes.find((t) => t.id === selectedTheme) || null;
  const colors = getThemeColors(currentTheme);
  const fonts = getThemeFonts(currentTheme);

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
      <div className="flex items-center justify-center h-screen bg-[#1e1e2e]">
        <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1e1e2e]">
        <p className="text-gray-400">Deck not found.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#1e1e2e] text-white">
      {/* ── Top bar ── */}
      <div className="border-b border-[#2a2a3e] bg-[#252536] px-4 py-2 flex items-center gap-3 shrink-0">
        <button onClick={() => router.push("/decks")} className="text-gray-400 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <input
          type="text"
          value={deck.title}
          onChange={(e) => setDeck({ ...deck, title: e.target.value })}
          className="flex-1 text-sm font-semibold text-white bg-transparent border-none focus:outline-none"
        />
        <span className="text-xs text-gray-500">{slides.length} slides</span>

        {/* Layout picker */}
        <div className="relative">
          <button
            onClick={() => setShowLayoutPicker(!showLayoutPicker)}
            className="px-3 py-1.5 text-xs font-medium text-gray-300 border border-[#3a3a4e] rounded-lg hover:bg-[#3a3a4e] transition-colors"
          >
            📐 Layout
          </button>
          {showLayoutPicker && currentSlide && (
            <div className="absolute top-full mt-1 right-0 bg-[#2a2a3e] border border-[#3a3a4e] rounded-lg shadow-xl p-2 z-50 w-48">
              {SLIDE_LAYOUTS.map((l) => (
                <button
                  key={l.type}
                  onClick={() => { updateSlide(activeSlide, { ...currentSlide, layout: l.type }); setShowLayoutPicker(false); }}
                  className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                    currentSlide.layout === l.type ? "bg-purple-600 text-white" : "text-gray-300 hover:bg-[#3a3a4e]"
                  }`}
                >
                  {l.icon} {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowNotes(!showNotes)}
          className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
            showNotes ? "text-purple-300 border-purple-500 bg-purple-500/10" : "text-gray-300 border-[#3a3a4e] hover:bg-[#3a3a4e]"
          }`}
        >
          📝 Notes
        </button>
        <button onClick={() => setShowThemePanel(!showThemePanel)} className="px-3 py-1.5 text-xs font-medium text-gray-300 border border-[#3a3a4e] rounded-lg hover:bg-[#3a3a4e] transition-colors">
          🎨 Theme
        </button>
        <button onClick={() => addSlide()} className="px-3 py-1.5 text-xs font-medium text-gray-300 border border-[#3a3a4e] rounded-lg hover:bg-[#3a3a4e] transition-colors">
          + Slide
        </button>
        {currentSlide && slides.length > 1 && (
          <button onClick={() => deleteSlide(activeSlide)} className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-800/40 rounded-lg hover:bg-red-900/20 transition-colors">
            🗑
          </button>
        )}
        <button onClick={handleExport} className="px-3 py-1.5 text-xs font-medium text-gray-300 border border-[#3a3a4e] rounded-lg hover:bg-[#3a3a4e] transition-colors">
          ⬇ .pptx
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {saving ? "Saving..." : saved ? "✓ Saved" : "Save"}
        </button>
      </div>

      {/* Theme panel */}
      {showThemePanel && (
        <div className="border-b border-[#2a2a3e] bg-[#252536] px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-gray-400">Theme:</span>
            {themes.map((t) => (
              <button key={t.id} onClick={() => setSelectedTheme(t.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                  selectedTheme === t.id ? "border-purple-500 bg-purple-500/15 text-purple-300" : "border-[#3a3a4e] bg-[#2a2a3e] text-gray-300 hover:border-purple-400"
                }`}>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: (t.colors as { primary?: string })?.primary || "#7C3AED" }} />
                {t.name}
              </button>
            ))}
            <button onClick={() => router.push("/decks/themes")} className="text-xs text-purple-400 hover:text-purple-300">
              Manage themes →
            </button>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Slide sorter */}
        <div className="w-40 bg-[#1a1a2a] border-r border-[#2a2a3e] overflow-y-auto p-2 space-y-2 shrink-0">
          {slides.map((s, i) => (
            <div key={s.id || i} className="relative group">
              <SlideThumbnail
                slide={s} index={i} isActive={i === activeSlide} onClick={() => setActiveSlide(i)}
                colors={colors} fonts={fonts} dark={isDark(colors, i, slides.length)}
              />
              <div className="absolute right-1 top-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {i > 0 && (
                  <button onClick={() => moveSlide(i, i - 1)} className="w-5 h-5 flex items-center justify-center bg-black/60 text-white rounded text-[10px] hover:bg-black/80">▲</button>
                )}
                {i < slides.length - 1 && (
                  <button onClick={() => moveSlide(i, i + 1)} className="w-5 h-5 flex items-center justify-center bg-black/60 text-white rounded text-[10px] hover:bg-black/80">▼</button>
                )}
              </div>
            </div>
          ))}
          <button onClick={() => addSlide()}
            className="w-full py-2 text-xs font-medium text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors text-center border border-dashed border-[#3a3a4e]">
            + Add Slide
          </button>
        </div>

        {/* Center: Slide Canvas */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#2a2a3e]">
          <div className="flex-1 flex items-center justify-center overflow-auto p-8">
            {currentSlide ? (
              <div className="shadow-2xl rounded-lg overflow-hidden" style={{ width: 960, flexShrink: 0 }}>
                <SlideCanvas
                  slide={currentSlide}
                  onChange={(s) => updateSlide(activeSlide, s)}
                  colors={colors}
                  fonts={fonts}
                  dark={isDark(colors, activeSlide, slides.length)}
                  interactive
                />
              </div>
            ) : (
              <p className="text-gray-500">No slides yet. Click + Add Slide to start.</p>
            )}
          </div>

          {/* Speaker notes */}
          {showNotes && currentSlide && (
            <div className="border-t border-[#3a3a4e] bg-[#252536] px-6 py-3">
              <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Speaker Notes</div>
              <textarea
                value={currentSlide.speakerNotes || ""}
                onChange={(e) => updateSlide(activeSlide, { ...currentSlide, speakerNotes: e.target.value })}
                rows={3}
                className="w-full bg-transparent text-gray-300 text-xs border-none focus:outline-none resize-none placeholder-gray-600"
                placeholder="Add speaker notes for this slide..."
              />
            </div>
          )}
        </div>

        {/* Right: AI Chat */}
        <div className="w-72 border-l border-[#2a2a3e] bg-[#1a1a2a] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#2a2a3e]">
            <h3 className="text-sm font-semibold text-white">AI Assistant</h3>
            <p className="text-[10px] text-gray-500">Ask me to modify slides or add content.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chatMessages.length === 0 && (
              <div className="py-6 space-y-1.5">
                <p className="text-[10px] text-gray-500 text-center mb-2">Try:</p>
                {["Add a slide about pricing", "Make slide 1 more concise", "Add speaker notes to all slides", "Change tone to be executive-friendly"].map((s) => (
                  <button key={s} onClick={() => setChatInput(s)}
                    className="block w-full text-left px-3 py-2 text-[11px] text-gray-400 bg-[#252536] rounded-lg border border-[#2a2a3e] hover:border-purple-500/40 transition-colors">
                    &ldquo;{s}&rdquo;
                  </button>
                ))}
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`px-3 py-2 rounded-xl text-xs ${
                m.role === "user" ? "bg-purple-600 text-white ml-6" : "bg-[#252536] border border-[#3a3a4e] text-gray-300 mr-4"
              }`}>
                {m.text}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-2 text-xs text-gray-500 px-3 py-2">
                <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                Thinking...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleChat} className="p-3 border-t border-[#2a2a3e]">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Edit the deck..." disabled={chatLoading}
                  className={`w-full rounded-xl border bg-[#252536] px-3 py-2.5 ${supported ? "pr-10" : "pr-3"} text-xs text-white placeholder-gray-600 focus:outline-none focus:ring-1 disabled:opacity-50 transition-colors ${
                    isListening ? "border-red-400 focus:ring-red-400" : "border-[#3a3a4e] focus:border-purple-500 focus:ring-purple-500"
                  }`}
                />
                <MicButton isListening={isListening} supported={supported} onClick={toggle} disabled={chatLoading} size="sm" className="absolute right-1.5 top-1.5" />
              </div>
              <button type="submit" disabled={!chatInput.trim() || chatLoading}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors shrink-0">
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
