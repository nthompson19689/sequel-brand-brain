"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PresentationTheme, ThemeColors, ThemeFonts } from "@/lib/decks";

const HEADER_FONTS = ["Georgia", "Arial Black", "Trebuchet MS", "Palatino", "Cambria", "Impact"];
const BODY_FONTS = ["Calibri", "Arial", "Calibri Light", "Garamond"];

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg border border-border cursor-pointer"
      />
      <div>
        <p className="text-xs font-medium text-heading">{label}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs text-body w-20 bg-transparent border-none focus:outline-none"
        />
      </div>
    </div>
  );
}

export default function ThemesPage() {
  const router = useRouter();
  const [themes, setThemes] = useState<PresentationTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PresentationTheme | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [name, setName] = useState("");
  const [colors, setColors] = useState<ThemeColors>({ primary: "#7C3AED", secondary: "#6D28D9", accent: "#A78BFA", background: "mixed" });
  const [fonts, setFonts] = useState<ThemeFonts>({ header: "Georgia", body: "Calibri", sizePreset: "default" });
  const [footerText, setFooterText] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/decks/themes");
      if (res.ok) {
        const data = await res.json();
        setThemes(data.themes || []);
      }
      setLoading(false);
    })();
  }, []);

  function openEditor(theme?: PresentationTheme) {
    if (theme) {
      setEditing(theme);
      setName(theme.name);
      setColors(theme.colors as ThemeColors);
      setFonts(theme.fonts as ThemeFonts);
      setFooterText(theme.footer_text || "");
    } else {
      setEditing({ id: "", name: "" } as PresentationTheme);
      setName("");
      setColors({ primary: "#7C3AED", secondary: "#6D28D9", accent: "#A78BFA", background: "mixed" });
      setFonts({ header: "Georgia", body: "Calibri", sizePreset: "default" });
      setFooterText("");
    }
  }

  async function handleSave() {
    setSaving(true);
    const body: Record<string, unknown> = {
      name, colors, fonts, footer_text: footerText,
    };
    if (editing?.id) body.id = editing.id;

    const res = await fetch("/api/decks/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      if (editing?.id) {
        setThemes((prev) => prev.map((t) => t.id === data.theme.id ? data.theme : t));
      } else {
        setThemes((prev) => [...prev, data.theme]);
      }
      setEditing(null);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this theme?")) return;
    await fetch(`/api/decks/themes?id=${id}`, { method: "DELETE" });
    setThemes((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleSetDefault(id: string) {
    await fetch("/api/decks/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_default: true }),
    });
    setThemes((prev) => prev.map((t) => ({ ...t, is_default: t.id === id })));
  }

  return (
    <div className="p-8 max-w-4xl">
      <button
        onClick={() => router.push("/decks")}
        className="inline-flex items-center gap-1.5 text-sm text-body hover:text-heading mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Decks
      </button>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Presentation Themes</h1>
          <p className="mt-1 text-sm text-body">Manage colors, fonts, and styling for your decks.</p>
        </div>
        <button
          onClick={() => openEditor()}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
        >
          + New Theme
        </button>
      </div>

      {/* Theme editor modal */}
      {editing && (
        <div className="mb-8 p-6 bg-white rounded-2xl border border-border shadow-sm">
          <h2 className="text-lg font-semibold text-heading mb-4">
            {editing.id ? "Edit Theme" : "New Theme"}
          </h2>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Theme Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  placeholder="My Theme"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-body">Colors</label>
                <ColorInput label="Primary" value={colors.primary} onChange={(v) => setColors({ ...colors, primary: v })} />
                <ColorInput label="Secondary" value={colors.secondary} onChange={(v) => setColors({ ...colors, secondary: v })} />
                <ColorInput label="Accent" value={colors.accent} onChange={(v) => setColors({ ...colors, accent: v })} />
              </div>

              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Background Mode</label>
                <div className="flex gap-2">
                  {(["dark", "light", "mixed"] as const).map((bg) => (
                    <button
                      key={bg}
                      onClick={() => setColors({ ...colors, background: bg })}
                      className={`px-3 py-1.5 text-xs rounded-lg border capitalize transition-colors ${
                        colors.background === bg ? "border-brand-400 bg-brand-50 text-brand-700" : "border-border text-body hover:border-brand-200"
                      }`}
                    >
                      {bg}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Header Font</label>
                <select
                  value={fonts.header}
                  onChange={(e) => setFonts({ ...fonts, header: e.target.value })}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
                >
                  {HEADER_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Body Font</label>
                <select
                  value={fonts.body}
                  onChange={(e) => setFonts({ ...fonts, body: e.target.value })}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
                >
                  {BODY_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Font Size Preset</label>
                <div className="flex gap-2">
                  {(["default", "large", "compact"] as const).map((sz) => (
                    <button
                      key={sz}
                      onClick={() => setFonts({ ...fonts, sizePreset: sz })}
                      className={`px-3 py-1.5 text-xs rounded-lg border capitalize transition-colors ${
                        fonts.sizePreset === sz ? "border-brand-400 bg-brand-50 text-brand-700" : "border-border text-body hover:border-brand-200"
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Footer Text</label>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  placeholder="Confidential — Sequel.io"
                />
              </div>

              {/* Preview swatch */}
              <div>
                <label className="text-xs font-medium text-body mb-1.5 block">Preview</label>
                <div className="rounded-xl overflow-hidden border border-border h-24">
                  <div className="h-12 flex items-center px-4" style={{ backgroundColor: colors.primary }}>
                    <span className="text-white text-sm font-semibold" style={{ fontFamily: fonts.header }}>
                      Title Text
                    </span>
                  </div>
                  <div className="h-12 flex items-center px-4 bg-white">
                    <span className="text-sm" style={{ fontFamily: fonts.body, color: colors.secondary }}>
                      Body text · <span style={{ color: colors.accent }}>Accent link</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving}
              className="px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving..." : "Save Theme"}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="px-5 py-2.5 text-sm font-medium text-body hover:text-heading transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Theme list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {themes.map((t) => {
            const tc = t.colors as ThemeColors;
            const tf = t.fonts as ThemeFonts;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-border p-4 group hover:shadow-md transition-all">
                {/* Swatch */}
                <div className="rounded-lg overflow-hidden border border-border mb-3 h-16">
                  <div className="h-8 flex items-center px-3" style={{ backgroundColor: tc.primary }}>
                    <span className="text-white text-xs font-semibold" style={{ fontFamily: tf.header }}>{t.name}</span>
                  </div>
                  <div className="h-8 flex items-center px-3 bg-white">
                    <div className="flex gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tc.primary }} />
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tc.secondary }} />
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tc.accent }} />
                    </div>
                    <span className="ml-2 text-[10px] text-body">{tf.header} / {tf.body}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-heading">{t.name}</h3>
                    {t.is_default && (
                      <span className="text-[10px] font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">Default</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!t.is_default && (
                      <button
                        onClick={() => handleSetDefault(t.id)}
                        className="px-2 py-1 text-[10px] text-body hover:text-heading transition-colors"
                      >
                        Set default
                      </button>
                    )}
                    <button
                      onClick={() => openEditor(t)}
                      className="px-2 py-1 text-[10px] text-brand-500 hover:text-brand-600"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="px-2 py-1 text-[10px] text-red-500 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
