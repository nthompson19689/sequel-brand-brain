// ── Shared types for the Deck builder ──

export interface SlideLayout {
  type: "title_slide" | "two_column" | "three_cards" | "comparison_table" | "stats_callout" | "bullets" | "image_left" | "image_right" | "quote" | "closing";
  label: string;
  icon: string;
}

export const SLIDE_LAYOUTS: SlideLayout[] = [
  { type: "title_slide", label: "Title Slide", icon: "🎯" },
  { type: "bullets", label: "Bullet Points", icon: "📋" },
  { type: "two_column", label: "Two Column", icon: "📰" },
  { type: "three_cards", label: "Three Cards", icon: "🃏" },
  { type: "comparison_table", label: "Comparison", icon: "⚔️" },
  { type: "stats_callout", label: "Stats / Numbers", icon: "📊" },
  { type: "image_left", label: "Image Left", icon: "🖼️" },
  { type: "image_right", label: "Image Right", icon: "🖼️" },
  { type: "quote", label: "Quote", icon: "💬" },
  { type: "closing", label: "Closing Slide", icon: "🏁" },
];

/** Position and size of a draggable element (percentages of slide, 0-100) */
export interface ElementPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Slide {
  id: string;
  layout: SlideLayout["type"];
  title: string;
  subtitle?: string;
  body: string;
  speakerNotes?: string;
  /** For three_cards layout */
  cards?: { icon: string; title: string; body: string }[];
  /** For comparison_table layout */
  columns?: { header: string; rows: string[] }[];
  /** For stats_callout layout */
  stats?: { value: string; label: string }[];
  /** Optional position overrides for each element (key = element name like "title", "body", "card-0") */
  positions?: Record<string, ElementPosition>;
}

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: "dark" | "light" | "mixed";
}

export interface ThemeFonts {
  header: string;
  body: string;
  sizePreset: "default" | "large" | "compact";
}

export interface PresentationTheme {
  id: string;
  name: string;
  is_default: boolean;
  colors: ThemeColors;
  fonts: ThemeFonts;
  logo_url: string | null;
  footer_text: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deck {
  id: string;
  title: string;
  slides: Slide[];
  theme_id: string | null;
  created_by: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_THEMES: Omit<PresentationTheme, "created_at" | "updated_at">[] = [
  {
    id: "00000000-0000-4000-b000-000000000001",
    name: "Sequel Brand",
    is_default: true,
    colors: { primary: "#7C3AED", secondary: "#6D28D9", accent: "#A78BFA", background: "mixed" },
    fonts: { header: "Georgia", body: "Calibri", sizePreset: "default" },
    logo_url: null,
    footer_text: "",
    created_by: null,
  },
  {
    id: "00000000-0000-4000-b000-000000000002",
    name: "Clean Light",
    is_default: false,
    colors: { primary: "#374151", secondary: "#6B7280", accent: "#3B82F6", background: "light" },
    fonts: { header: "Arial Black", body: "Calibri Light", sizePreset: "default" },
    logo_url: null,
    footer_text: "",
    created_by: null,
  },
  {
    id: "00000000-0000-4000-b000-000000000003",
    name: "Executive Dark",
    is_default: false,
    colors: { primary: "#1E3A5F", secondary: "#2C5282", accent: "#E2E8F0", background: "dark" },
    fonts: { header: "Palatino", body: "Arial", sizePreset: "default" },
    logo_url: null,
    footer_text: "",
    created_by: null,
  },
  {
    id: "00000000-0000-4000-b000-000000000004",
    name: "Bold Presentation",
    is_default: false,
    colors: { primary: "#DC2626", secondary: "#1F2937", accent: "#FCD34D", background: "dark" },
    fonts: { header: "Impact", body: "Arial", sizePreset: "large" },
    logo_url: null,
    footer_text: "",
    created_by: null,
  },
];

export function newSlide(layout: Slide["layout"] = "bullets"): Slide {
  return {
    id: crypto.randomUUID(),
    layout,
    title: "",
    subtitle: "",
    body: "",
    speakerNotes: "",
    cards: layout === "three_cards" ? [
      { icon: "💡", title: "Card 1", body: "" },
      { icon: "⚡", title: "Card 2", body: "" },
      { icon: "🎯", title: "Card 3", body: "" },
    ] : undefined,
    columns: layout === "comparison_table" ? [
      { header: "Us", rows: ["", "", ""] },
      { header: "Them", rows: ["", "", ""] },
    ] : undefined,
    stats: layout === "stats_callout" ? [
      { value: "0", label: "Metric 1" },
      { value: "0", label: "Metric 2" },
      { value: "0", label: "Metric 3" },
    ] : undefined,
  };
}
