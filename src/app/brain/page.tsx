"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────
interface BrandDoc {
  id: string;
  name: string;
  doc_type: string;
  content: string;
  is_active: boolean;
  created_at: string;
}

interface SitemapUrl {
  url: string;
  category: string;
}

interface Stats {
  brand_docs: { total: number; active: number; by_type: Record<string, number> };
  articles: { total: number; by_type: Record<string, number> };
  battle_cards: { total: number };
  call_insights: { total: number };
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  blog: "Blog Posts",
  case_study: "Case Studies",
  product_page: "Product Pages",
  other: "Other Pages",
};

const CONTENT_TYPE_ICONS: Record<string, string> = {
  blog: "📝",
  case_study: "📋",
  product_page: "🏷️",
  other: "📄",
};

const DOC_TYPES: Record<string, string> = {
  mission_vision_values: "Mission, Vision & Values",
  voice_and_tone: "Voice & Tone",
  editorial_longform: "Editorial — Longform",
  editorial_shortform: "Editorial — Shortform",
  content_examples: "Content Examples",
  positioning: "Positioning",
  icp: "ICP / Target Audience",
  other: "Other",
};

const DOC_TYPE_ICONS: Record<string, string> = {
  mission_vision_values: "🎯",
  voice_and_tone: "🗣️",
  editorial_longform: "📝",
  editorial_shortform: "✏️",
  content_examples: "📄",
  positioning: "🏔️",
  icp: "👤",
  other: "📎",
};

const CATEGORY_COLORS: Record<string, string> = {
  blog: "bg-blue-100 text-blue-700",
  case_study: "bg-green-100 text-green-700",
  product: "bg-purple-100 text-purple-700",
  resource: "bg-amber-100 text-amber-700",
  company: "bg-gray-100 text-gray-600",
  other: "bg-gray-100 text-gray-500",
};

// ── Main Page ──────────────────────────────────────
export default function BrainPage() {
  const [activeTab, setActiveTab] = useState<"docs" | "import" | "stats">("stats");

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Brand Brain</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your brand documents, import website content, and monitor your knowledge base.
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key: "stats" as const, label: "Overview", icon: "📊" },
          { key: "docs" as const, label: "Brand Documents", icon: "📚" },
          { key: "import" as const, label: "Content Importer", icon: "🌐" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "stats" && <StatsSection />}
      {activeTab === "docs" && <BrandDocsSection />}
      {activeTab === "import" && <ImporterSection />}
    </div>
  );
}

// ── Section 3: Knowledge Base Stats ────────────────
function StatsSection() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/brain/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
        <Spinner /> Loading stats...
      </div>
    );
  }

  if (!stats || stats.brand_docs === undefined) {
    return (
      <div className="text-center py-12 text-gray-400">
        Failed to load stats. Check your Supabase connection.
      </div>
    );
  }

  const statCards = [
    {
      label: "Brand Documents",
      value: stats.brand_docs.total,
      sub: `${stats.brand_docs.active} active`,
      icon: "📚",
      color: "bg-brand-50 border-brand-200",
    },
    {
      label: "Articles Imported",
      value: stats.articles.total,
      sub: "from website content",
      icon: "📰",
      color: "bg-blue-50 border-blue-200",
    },
    {
      label: "Battle Cards",
      value: stats.battle_cards.total,
      sub: "competitive intel",
      icon: "⚔️",
      color: "bg-amber-50 border-amber-200",
    },
    {
      label: "Call Insights",
      value: stats.call_insights.total,
      sub: "from sales calls",
      icon: "📞",
      color: "bg-emerald-50 border-emerald-200",
    },
  ];

  const isEmpty = statCards.every((s) => s.value === 0);

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border p-4 ${s.color} transition-colors`}
          >
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm font-medium text-gray-700">{s.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Brand docs breakdown */}
      {stats.brand_docs.total > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Brand Documents by Type
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.brand_docs.by_type).map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              >
                <span>{DOC_TYPE_ICONS[type] || "📄"}</span>
                <span className="text-gray-700">{DOC_TYPES[type] || type}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Articles breakdown by content type */}
      {stats.articles.total > 0 && stats.articles.by_type && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Imported Content by Type
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.articles.by_type).map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              >
                <span>{CONTENT_TYPE_ICONS[type] || "📄"}</span>
                <span className="text-gray-700">{CONTENT_TYPE_LABELS[type] || type}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Empty state / onboarding */}
      {isEmpty && (
        <div className="bg-gradient-to-br from-brand-50 to-white rounded-2xl border border-brand-100 p-8 text-center">
          <div className="text-4xl mb-4">🧠</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Set Up Your Brand Brain
          </h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            Start by adding your brand documents — voice guidelines, positioning,
            and content examples. Then import your website content to build the
            knowledge base.
          </p>
          <div className="flex justify-center gap-3">
            <StepPill number={1} label="Add brand docs" />
            <StepPill number={2} label="Import website" />
            <StepPill number={3} label="Start chatting" />
          </div>
        </div>
      )}
    </div>
  );
}

function StepPill({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200 shadow-sm">
      <span className="w-6 h-6 bg-brand-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
        {number}
      </span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </div>
  );
}

// ── Section 1: Brand Documents ─────────────────────
function BrandDocsSection() {
  const [docs, setDocs] = useState<BrandDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editingDoc, setEditingDoc] = useState<BrandDoc | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/brain/docs");
      const data = await res.json();
      setDocs(data.docs || []);
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this brand document?")) return;
    await fetch(`/api/brain/docs?id=${id}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleEdit(doc: BrandDoc) {
    setEditingDoc(doc);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setShowBulk(false);
    setEditingDoc(null);
    loadDocs();
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 py-12 justify-center">
        <Spinner /> Loading brand documents...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {docs.length} document{docs.length !== 1 ? "s" : ""} loaded into the brand brain
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingDoc(null);
              setShowBulk(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 004.5 9.75v7.5a2.25 2.25 0 002.25 2.25h7.5a2.25 2.25 0 002.25-2.25v-7.5a2.25 2.25 0 00-2.25-2.25h-.75m-6 3.75l3 3m0 0l3-3m-3 3V1.5m6 9h.75a2.25 2.25 0 012.25 2.25v7.5a2.25 2.25 0 01-2.25 2.25h-7.5a2.25 2.25 0 01-2.25-2.25v-.75" />
            </svg>
            Bulk Upload
          </button>
          <button
            onClick={() => {
              setEditingDoc(null);
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Document
          </button>
        </div>
      </div>

      {/* Document list */}
      {docs.length === 0 && !showForm && (
        <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <div className="text-3xl mb-3">📚</div>
          <p className="text-gray-500 text-sm mb-3">
            No brand documents yet. Add your voice guidelines, positioning, and brand rules.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-brand-500 font-medium hover:text-brand-600"
          >
            Add your first document →
          </button>
        </div>
      )}

      {docs.map((doc) => (
        <div
          key={doc.id}
          className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm"
        >
          <button
            onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-xl">
              {DOC_TYPE_ICONS[doc.doc_type] || "📄"}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 truncate">
                  {doc.name}
                </span>
                {!doc.is_active && (
                  <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {DOC_TYPES[doc.doc_type] || doc.doc_type} ·{" "}
                {doc.content.split(/\s+/).length.toLocaleString()} words
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(doc);
                }}
                className="p-1.5 text-gray-400 hover:text-brand-500 transition-colors rounded-lg hover:bg-gray-50"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(doc.id);
                }}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-50"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
              <svg
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  expandedId === doc.id ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </button>

          {/* Expanded content */}
          {expandedId === doc.id && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <pre className="mt-3 text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-4">
                {doc.content}
              </pre>
            </div>
          )}
        </div>
      ))}

      {/* Add/Edit form modal */}
      {showForm && (
        <BrandDocForm
          existingDoc={editingDoc}
          onClose={handleFormClose}
        />
      )}

      {/* Bulk upload modal */}
      {showBulk && (
        <BulkUploadForm onClose={handleFormClose} />
      )}
    </div>
  );
}

// ── Shared: classify text via Claude ───────────────
async function classifyText(
  text: string
): Promise<{ type: string; name: string }> {
  const res = await fetch("/api/brain/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Classification failed");
  }
  return res.json();
}

// ── Shared: upload a file and get text ─────────────
async function uploadFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/brain/upload", {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || "Upload failed");
  }
  const data = await res.json();
  return data.text;
}

// ── Brand Doc Form (single doc, auto-classify) ────
function BrandDocForm({
  existingDoc,
  onClose,
}: {
  existingDoc: BrandDoc | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(existingDoc?.name || "");
  const [docType, setDocType] = useState(existingDoc?.doc_type || "voice_and_tone");
  const [content, setContent] = useState(existingDoc?.content || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [classified, setClassified] = useState(!!existingDoc);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const classifyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-classify when content is set (debounced)
  function triggerClassify(text: string) {
    if (existingDoc) return; // Don't auto-classify when editing
    if (classifyTimeoutRef.current) clearTimeout(classifyTimeoutRef.current);
    if (text.split(/\s+/).length < 15) return; // Need enough text

    classifyTimeoutRef.current = setTimeout(async () => {
      setClassifying(true);
      try {
        const result = await classifyText(text);
        setDocType(result.type);
        if (!name.trim() || name === "Untitled Document") {
          setName(result.name);
        }
        setClassified(true);
      } catch {
        // Non-critical — user can still pick manually
      } finally {
        setClassifying(false);
      }
    }, 600);
  }

  async function handleFileUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const text = await uploadFile(file);
      setContent(text);
      triggerClassify(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    e.target.value = "";
  }

  function handleContentChange(text: string) {
    setContent(text);
    setClassified(false);
    triggerClassify(text);
  }

  async function handleSave() {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/brain/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: existingDoc?.id || undefined,
          name: name.trim(),
          doc_type: docType,
          content: content.trim(),
          is_active: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Save failed");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">
              {existingDoc ? "Edit Document" : "Add Brand Document"}
            </h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Step 1: Upload / Paste */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {existingDoc ? "Content" : "Upload a file or paste content"}
              </label>

              {/* Drop zone (hide when editing) */}
              {!existingDoc && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative mb-2 flex items-center justify-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                    dragOver ? "border-brand-400 bg-brand-50"
                      : uploading ? "border-gray-200 bg-gray-50"
                      : "border-gray-300 hover:border-brand-300 hover:bg-gray-50"
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".txt,.md,.docx,.doc,.pdf" onChange={handleFileInput} className="hidden" />
                  {uploading ? (
                    <><Spinner size="sm" /><span className="text-sm text-gray-500">Extracting text...</span></>
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <div className="text-center">
                        <span className="text-sm text-gray-600">Drop a file or <span className="text-brand-500 font-medium">browse</span></span>
                        <p className="text-[11px] text-gray-400 mt-0.5">.txt, .md, .pdf, .docx, .doc</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              <textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                onBlur={() => { if (content.trim() && !classified && !classifying) triggerClassify(content); }}
                rows={10}
                placeholder="Paste document text here — we'll auto-detect the type..."
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-mono leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
              />
              <p className="mt-1 text-xs text-gray-400">
                {content.split(/\s+/).filter(Boolean).length.toLocaleString()} words
              </p>
            </div>

            {/* Step 2: Auto-classification result */}
            {classifying && (
              <div className="flex items-center gap-2 px-4 py-3 bg-brand-50 rounded-xl border border-brand-100">
                <Spinner size="sm" />
                <span className="text-sm text-brand-500">Classifying document...</span>
              </div>
            )}

            {classified && !classifying && content.trim() && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">✓ Auto-classified</span>
                  <span className="text-xs text-gray-400">— edit below to override</span>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Document Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Document name"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Document Type</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                  >
                    {Object.entries(DOC_TYPES).map(([key, label]) => (
                      <option key={key} value={key}>{DOC_TYPE_ICONS[key]} {label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Manual name/type for editing existing or if not yet classified */}
            {existingDoc && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Document Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Document Type</label>
                  <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
                    {Object.entries(DOC_TYPES).map(([key, label]) => (
                      <option key={key} value={key}>{DOC_TYPE_ICONS[key]} {label}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!name.trim() || !content.trim() || saving || classifying}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
              >
                {saving ? (<><Spinner size="sm" />Saving...</>) : existingDoc ? "Update Document" : "Save Document"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Upload Form ───────────────────────────────
interface BulkDoc {
  id: string;
  content: string;
  name: string;
  type: string;
  classifying: boolean;
  classified: boolean;
  wordCount: number;
  saved: boolean;
}

function BulkUploadForm({ onClose }: { onClose: () => void }) {
  const [rawText, setRawText] = useState("");
  const [docs, setDocs] = useState<BulkDoc[]>([]);
  const [phase, setPhase] = useState<"input" | "review" | "saving">("input");
  const [error, setError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileDrop(file: File) {
    setUploading(true);
    setError(null);
    try {
      const text = await uploadFile(file);
      setRawText((prev) => (prev ? prev + "\n\n---\n\n" + text : text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleClassifyAll() {
    const sections = rawText
      .split(/\n---\n|\n—-—\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20);

    if (sections.length === 0) {
      setError("No documents found. Paste content or separate multiple docs with --- dividers.");
      return;
    }

    const bulkDocs: BulkDoc[] = sections.map((content, i) => ({
      id: `bulk-${i}`,
      content,
      name: "",
      type: "other",
      classifying: true,
      classified: false,
      wordCount: content.split(/\s+/).length,
      saved: false,
    }));

    setDocs(bulkDocs);
    setPhase("review");
    setError(null);

    // Classify each in parallel (max 4 concurrent)
    const batchSize = 4;
    for (let i = 0; i < bulkDocs.length; i += batchSize) {
      const batch = bulkDocs.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((d) => classifyText(d.content))
      );

      results.forEach((result, j) => {
        const idx = i + j;
        if (result.status === "fulfilled") {
          bulkDocs[idx].name = result.value.name;
          bulkDocs[idx].type = result.value.type;
          bulkDocs[idx].classified = true;
        } else {
          bulkDocs[idx].name = `Document ${idx + 1}`;
          bulkDocs[idx].type = "other";
          bulkDocs[idx].classified = true;
        }
        bulkDocs[idx].classifying = false;
      });

      setDocs([...bulkDocs]);
    }
  }

  function updateDoc(id: string, updates: Partial<BulkDoc>) {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  }

  function removeDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleSaveAll() {
    setPhase("saving");
    setSaveProgress({ current: 0, total: docs.length });

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      try {
        const res = await fetch("/api/brain/docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: doc.name.trim() || `Document ${i + 1}`,
            doc_type: doc.type,
            content: doc.content.trim(),
            is_active: true,
          }),
        });
        if (res.ok) {
          updateDoc(doc.id, { saved: true });
        }
      } catch {
        // continue with others
      }
      setSaveProgress({ current: i + 1, total: docs.length });
    }

    // Small delay then close
    setTimeout(onClose, 800);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">
              {phase === "input" ? "Bulk Upload" : phase === "review" ? "Review & Confirm" : "Saving..."}
            </h2>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Phase 1: Input */}
          {phase === "input" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Paste multiple documents separated by <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">---</code> dividers,
                or upload files. Each document will be auto-classified.
              </p>

              {/* File drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center justify-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  dragOver ? "border-brand-400 bg-brand-50"
                    : uploading ? "border-gray-200 bg-gray-50"
                    : "border-gray-300 hover:border-brand-300 hover:bg-gray-50"
                }`}
              >
                <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx,.doc" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); e.target.value = ""; }} className="hidden" />
                {uploading ? (
                  <><Spinner size="sm" /><span className="text-sm text-gray-500">Extracting text...</span></>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-sm text-gray-600">Drop files here or <span className="text-brand-500 font-medium">browse</span> <span className="text-gray-400">(.txt, .md, .pdf, .docx)</span></span>
                  </>
                )}
              </div>

              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={14}
                placeholder={`Paste one or more documents here.\n\nTo add multiple documents, separate them with --- on its own line:\n\nDocument 1 content here...\n\n---\n\nDocument 2 content here...\n\n---\n\nDocument 3 content here...`}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-mono leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y"
              />

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {rawText.split(/\n---\n/).filter((s) => s.trim().length > 20).length} document{rawText.split(/\n---\n/).filter((s) => s.trim().length > 20).length !== 1 ? "s" : ""} detected
                </p>
                <button
                  onClick={handleClassifyAll}
                  disabled={!rawText.trim() || uploading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  Classify Documents
                </button>
              </div>
            </div>
          )}

          {/* Phase 2: Review table */}
          {phase === "review" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Review the auto-classified documents. Edit names and types as needed, then save all.
              </p>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 w-8">#</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-20">Words</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {docs.map((doc, i) => (
                      <tr key={doc.id} className={doc.saved ? "bg-emerald-50" : ""}>
                        <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          {doc.classifying ? (
                            <div className="flex items-center gap-2 text-gray-400">
                              <Spinner size="sm" /> Classifying...
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={doc.name}
                              onChange={(e) => updateDoc(doc.id, { name: e.target.value })}
                              className="w-full bg-transparent border-none text-sm font-medium text-gray-900 focus:outline-none focus:ring-0 p-0"
                            />
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {doc.classifying ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <select
                              value={doc.type}
                              onChange={(e) => updateDoc(doc.id, { type: e.target.value })}
                              className="bg-transparent border-none text-xs font-medium focus:outline-none focus:ring-0 p-0 text-gray-600"
                            >
                              {Object.entries(DOC_TYPES).map(([key, label]) => (
                                <option key={key} value={key}>{DOC_TYPE_ICONS[key]} {label}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                          {doc.wordCount.toLocaleString()}
                        </td>
                        <td className="px-2 py-2.5">
                          {doc.saved ? (
                            <span className="text-emerald-500 text-xs">✓</span>
                          ) : (
                            <button
                              onClick={() => removeDoc(doc.id)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => { setPhase("input"); setDocs([]); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={docs.some((d) => d.classifying) || docs.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
                >
                  Save {docs.length} Document{docs.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          )}

          {/* Phase 3: Saving progress */}
          {phase === "saving" && (
            <div className="py-8 text-center space-y-4">
              <Spinner />
              <p className="text-sm text-gray-600">
                Saving {saveProgress.current} of {saveProgress.total} documents...
              </p>
              <div className="w-full max-w-xs mx-auto h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-300"
                  style={{ width: `${saveProgress.total > 0 ? (saveProgress.current / saveProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section 2: Website Content Importer ────────────
function ImporterSection() {
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [sitemapResults, setSitemapResults] = useState<SitemapUrl[] | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importLog, setImportLog] = useState<
    Array<{ type: string; url: string; message: string }>
  >([]);
  const [importSummary, setImportSummary] = useState<{
    imported: number;
    failed: number;
    skipped: number;
    categories: Record<string, number>;
  } | null>(null);

  async function handleScan() {
    if (!sitemapUrl.trim()) return;
    setScanning(true);
    setScanError(null);
    setSitemapResults(null);
    setImportSummary(null);

    try {
      const res = await fetch("/api/brain/sitemap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sitemapUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Scan failed");
      }

      const data = await res.json();
      setSitemapResults(data.urls || []);
      // Select all by default
      setSelectedUrls(new Set((data.urls || []).map((u: SitemapUrl) => u.url)));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function handleImport() {
    const urls = Array.from(selectedUrls);
    if (urls.length === 0) return;

    setImporting(true);
    setImportLog([]);
    setImportSummary(null);
    setImportProgress({ current: 0, total: urls.length });

    try {
      const res = await fetch("/api/brain/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "progress") {
              setImportProgress({ current: event.current, total: event.total });
            } else if (event.type === "imported") {
              setImportLog((prev) => [
                ...prev,
                { type: "success", url: event.url, message: `✓ ${event.title}` },
              ]);
            } else if (event.type === "skip") {
              setImportLog((prev) => [
                ...prev,
                { type: "skip", url: event.url, message: `⊘ Skipped: ${event.reason}` },
              ]);
            } else if (event.type === "fail") {
              setImportLog((prev) => [
                ...prev,
                { type: "error", url: event.url, message: `✗ ${event.reason}` },
              ]);
            } else if (event.type === "complete") {
              setImportSummary(event);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      setImportLog((prev) => [
        ...prev,
        { type: "error", url: "", message: msg },
      ]);
    } finally {
      setImporting(false);
    }
  }

  // Filtered URLs
  const filteredUrls = sitemapResults
    ? categoryFilter === "all"
      ? sitemapResults
      : sitemapResults.filter((u) => u.category === categoryFilter)
    : [];

  // Category counts
  const categoryCounts: Record<string, number> = {};
  for (const u of sitemapResults || []) {
    categoryCounts[u.category] = (categoryCounts[u.category] || 0) + 1;
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelectedUrls(new Set(filteredUrls.map((u) => u.url)));
    } else {
      const filtered = new Set(filteredUrls.map((u) => u.url));
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        filtered.forEach((url) => next.delete(url));
        return next;
      });
    }
  }

  // ── Quick Sync (all 3 sitemaps) ──
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; total: number; message: string } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleQuickSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const res = await fetch("/api/cron/sitemap-sync", { method: "GET" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Sync failed (${res.status})`);
      }
      const data = await res.json();
      const added = data.new_imported || 0;
      setSyncResult({
        added,
        total: data.total_found || 0,
        message: added > 0
          ? `Added ${added} new page${added === 1 ? "" : "s"} to the knowledge base.${data.failed ? ` (${data.failed} failed)` : ""}`
          : `No new pages found — your knowledge base is up to date. (${data.total_found || 0} pages checked)`,
      });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Sync — all 3 sitemaps */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-700">Quick Sync — Sequel.io</h3>
            <p className="text-xs text-gray-500 mt-1">
              Scans 3 sitemaps for new blog posts, product pages, and case studies. Only adds pages not already in the knowledge base.
            </p>
          </div>
          <button
            onClick={handleQuickSync}
            disabled={syncing || importing}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm shrink-0"
          >
            {syncing ? (
              <>
                <Spinner size="sm" />
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                </svg>
                Sync Now
              </>
            )}
          </button>
        </div>
        <div className="flex gap-3 mt-3">
          <span className="text-xs text-gray-400 bg-white px-2.5 py-1 rounded-md border border-gray-200">📝 post-sitemap.xml</span>
          <span className="text-xs text-gray-400 bg-white px-2.5 py-1 rounded-md border border-gray-200">📄 page-sitemap.xml</span>
          <span className="text-xs text-gray-400 bg-white px-2.5 py-1 rounded-md border border-gray-200">📖 story-sitemap.xml</span>
        </div>
        {syncResult && (
          <div className={`mt-3 text-sm px-3 py-2 rounded-lg ${syncResult.added > 0 ? "bg-green-50 text-green-700 border border-green-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
            {syncResult.message}
          </div>
        )}
        {syncError && (
          <div className="mt-3 text-sm px-3 py-2 rounded-lg bg-red-50 text-red-700 border border-red-200">
            {syncError}
          </div>
        )}
      </div>

      {/* Manual sitemap input */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Import from Custom Sitemap
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Or enter any sitemap URL to discover and import content from other sources.
        </p>
        <div className="flex gap-3">
          <input
            type="url"
            value={sitemapUrl}
            onChange={(e) => setSitemapUrl(e.target.value)}
            placeholder="https://example.com/sitemap.xml"
            disabled={scanning || importing}
            className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-50"
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
          />
          <button
            onClick={handleScan}
            disabled={!sitemapUrl.trim() || scanning || importing}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm shrink-0"
          >
            {scanning ? (
              <>
                <Spinner size="sm" />
                Scanning...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Scan Sitemap
              </>
            )}
          </button>
        </div>
        {scanError && (
          <p className="mt-2 text-sm text-red-500">{scanError}</p>
        )}
      </div>

      {/* Scan results */}
      {sitemapResults && !importSummary && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Results header */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Found {sitemapResults.length} pages
              </h3>
              <span className="text-xs text-gray-400">
                {selectedUrls.size} selected
              </span>
            </div>

            {/* Category filters */}
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategoryFilter("all")}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  categoryFilter === "all"
                    ? "bg-brand-100 text-brand-600"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                All ({sitemapResults.length})
              </button>
              {Object.entries(categoryCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      categoryFilter === cat
                        ? "bg-brand-100 text-brand-600"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {cat.replace("_", " ")} ({count})
                  </button>
                ))}
            </div>
          </div>

          {/* Select all checkbox */}
          <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50">
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={filteredUrls.every((u) => selectedUrls.has(u.url))}
                onChange={(e) => toggleAll(e.target.checked)}
                className="rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
              Select all {filteredUrls.length} in view
            </label>
          </div>

          {/* URL list */}
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {filteredUrls.map((item) => (
              <label
                key={item.url}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedUrls.has(item.url)}
                  onChange={(e) => {
                    const next = new Set(selectedUrls);
                    if (e.target.checked) next.add(item.url);
                    else next.delete(item.url);
                    setSelectedUrls(next);
                  }}
                  className="rounded border-gray-300 text-brand-500 focus:ring-brand-500 shrink-0"
                />
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${
                    CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other
                  }`}
                >
                  {item.category}
                </span>
                <span className="text-sm text-gray-600 truncate">
                  {new URL(item.url).pathname}
                </span>
              </label>
            ))}
          </div>

          {/* Import button */}
          <div className="p-4 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={handleImport}
              disabled={selectedUrls.size === 0 || importing}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm"
            >
              {importing ? (
                <>
                  <Spinner size="sm" />
                  Importing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Import {selectedUrls.size} Page{selectedUrls.size !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Import progress */}
      {importing && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Importing pages...
            </span>
            <span className="text-xs text-gray-400">
              {importProgress.current} / {importProgress.total}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{
                width: `${
                  importProgress.total > 0
                    ? (importProgress.current / importProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          {/* Live log */}
          <div className="mt-3 max-h-40 overflow-y-auto space-y-0.5">
            {importLog.slice(-15).map((entry, i) => (
              <div
                key={i}
                className={`text-xs truncate ${
                  entry.type === "success"
                    ? "text-emerald-600"
                    : entry.type === "skip"
                      ? "text-gray-400"
                      : "text-red-500"
                }`}
              >
                {entry.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import summary */}
      {importSummary && (
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">
              ✅
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Import Complete</h3>
              <p className="text-sm text-gray-500">
                {importSummary.imported} imported, {importSummary.skipped}{" "}
                skipped, {importSummary.failed} failed
              </p>
            </div>
          </div>
          {Object.keys(importSummary.categories).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(importSummary.categories).map(([cat, count]) => (
                <span
                  key={cat}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    CATEGORY_COLORS[cat] || CATEGORY_COLORS.other
                  }`}
                >
                  {count} {cat.replace("_", " ")}
                  {count !== 1 ? "s" : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared Components ──────────────────────────────
function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  return (
    <svg className={`${cls} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
