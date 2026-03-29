"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* ───── Types ───── */

interface VoiceProfile {
  hook_styles: string[];
  tone: string[];
  formatting_patterns: string[];
  common_topics: string[];
  signature_phrases: string[];
  closing_style: string;
  post_length: string;
  emoji_usage: string;
  hashtag_usage: string;
  voice_summary: string;
}

interface Variant {
  label: string;
  content: string;
}

interface HistoryPost {
  id: string;
  topic: string;
  context: string | null;
  variants: Variant[];
  created_at: string;
  status?: string;
}

interface ContentArticle {
  id: string;
  title: string | null;
  primary_keyword: string;
  status: string;
}

interface ScrapedPost {
  text: string;
  id: string;
}

type Tab = "compose" | "voice" | "history";
type FlowStep = "idle" | "scraping" | "selecting" | "analyzing" | "done";
type HistoryFilter = "all" | "published" | "scheduled" | "drafts";

/* ───── Component ───── */

export default function LinkedInPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("compose");

  // === Compose state ===
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [editedVariants, setEditedVariants] = useState<Record<number, string>>({});
  const [genError, setGenError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [publishedIdxs, setPublishedIdxs] = useState<Set<number>>(new Set());
  const [savedDraftIdxs, setSavedDraftIdxs] = useState<Set<number>>(new Set());
  const [savedEditIdxs, setSavedEditIdxs] = useState<Set<number>>(new Set());
  const [savingEditIdx, setSavingEditIdx] = useState<number | null>(null);
  const [articles, setArticles] = useState<ContentArticle[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const streamRef = useRef<AbortController | null>(null);

  // === Voice Profile state ===
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceSuccess, setVoiceSuccess] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [scrapedPosts, setScrapedPosts] = useState<ScrapedPost[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [savedExamples, setSavedExamples] = useState<string[]>([]);
  const [showAddExample, setShowAddExample] = useState(false);
  const [newExample, setNewExample] = useState("");
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [updatingVoice, setUpdatingVoice] = useState(false);

  // === History state ===
  const [history, setHistory] = useState<HistoryPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());

  const voice = profile?.linkedin_voice as Record<string, unknown> | null;
  const hasVoice = Boolean((voiceProfile && voiceProfile.voice_summary && !updatingVoice) || (voice && voice.voice_summary && !updatingVoice));

  /* ───── Init ───── */

  useEffect(() => {
    if (profile?.linkedin_url) setLinkedinUrl(profile.linkedin_url);
    if (profile?.linkedin_voice) setVoiceProfile(profile.linkedin_voice as unknown as VoiceProfile);
    if (profile?.linkedin_samples) setSavedExamples(profile.linkedin_samples);
  }, [profile]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/linkedin/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.posts || []);
      }
    } catch {
      // ignore
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/content?status=draft_generated")
      .then((r) => r.json())
      .then((d) => setArticles((d.posts || []).slice(0, 5)))
      .catch(() => {});
    loadHistory();
  }, [user, loadHistory]);

  /* ───── Toast helper ───── */

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  /* ───── Compose handlers ───── */

  async function handleGenerate(overrideTopic?: string) {
    const t = overrideTopic || topic;
    if (!t.trim()) return;
    setGenerating(true);
    setStreamText("");
    setVariants([]);
    setEditedVariants({});
    setGenError(null);
    setPublishedIdxs(new Set());
    setSavedDraftIdxs(new Set());
    setSavedEditIdxs(new Set());

    const controller = new AbortController();
    streamRef.current = controller;

    try {
      const res = await fetch("/api/linkedin/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        setGenError(data.error || "Generation failed");
        setGenerating(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setGenError("No response stream");
        setGenerating(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

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
            if (event.type === "delta") {
              accumulated += event.text;
              setStreamText(accumulated);
            } else if (event.type === "complete") {
              setVariants(event.variants || []);
            } else if (event.type === "error") {
              setGenError(event.error);
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setGenError("Connection lost");
      }
    }

    setGenerating(false);
    streamRef.current = null;
    loadHistory();
  }

  function getVariantContent(idx: number): string {
    return editedVariants[idx] ?? variants[idx]?.content ?? "";
  }

  function copyToClipboard(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  async function handleQuickPublish(idx: number) {
    const content = getVariantContent(idx);
    try {
      await navigator.clipboard.writeText(content);
      window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank");
      showToast("Post copied! Paste it in LinkedIn and hit Post.");

      // Record the publish
      fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quick_publish", content }),
      }).catch(() => {});

      setPublishedIdxs((prev) => { const next = new Set(Array.from(prev)); next.add(idx); return next; });
    } catch {
      showToast("Failed to copy to clipboard.");
    }
  }

  async function handleSaveDraft(idx: number) {
    const content = getVariantContent(idx);
    try {
      await fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_draft", content }),
      });
      setSavedDraftIdxs((prev) => { const next = new Set(Array.from(prev)); next.add(idx); return next; });
      showToast("Draft saved.");
    } catch {
      showToast("Failed to save draft.");
    }
  }

  async function handleSaveEdit(idx: number) {
    const original = variants[idx]?.content ?? "";
    const edited = editedVariants[idx];
    if (!edited || original.trim() === edited.trim()) {
      showToast("No changes to save.");
      return;
    }
    setSavingEditIdx(idx);
    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_refinement", original, edited }),
      });
      if (res.ok) {
        setSavedEditIdxs((prev) => { const next = new Set(Array.from(prev)); next.add(idx); return next; });
        showToast("Edit saved — future posts will learn from this.");
      } else {
        showToast("Failed to save edit.");
      }
    } catch {
      showToast("Failed to save edit.");
    }
    setSavingEditIdx(null);
  }

  /* ───── Voice Profile handlers ───── */

  async function handleFindPosts() {
    if (!linkedinUrl.trim()) return;
    setFlowStep("scraping");
    setVoiceError(null);
    setScrapedPosts([]);
    setSelectedPosts([]);
    setSkippedIds(new Set());

    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scrape",
          linkedin_url: linkedinUrl.trim(),
          full_name: profile?.full_name || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setVoiceError(data.error || "Failed to find posts");
        setFlowStep("idle");
        return;
      }

      if (data.voice_profile) {
        setVoiceProfile(data.voice_profile);
        setFlowStep("done");
        setVoiceSuccess("Voice profile analyzed and saved.");
        setTimeout(() => setVoiceSuccess(null), 4000);
        return;
      }

      if (data.posts && data.posts.length > 0) {
        setScrapedPosts(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.posts.map((p: any, i: number) => ({ text: typeof p === "string" ? p : (p.text || p.preview || String(p)), id: `post-${i}` }))
        );
        setFlowStep("selecting");
      } else {
        setVoiceError("No posts found. Try pasting posts manually.");
        setFlowStep("idle");
      }
    } catch {
      setVoiceError("Failed to search for LinkedIn posts");
      setFlowStep("idle");
    }
  }

  function toggleSelectPost(postText: string) {
    setSelectedPosts((prev) =>
      prev.includes(postText) ? prev.filter((p) => p !== postText) : [...prev, postText]
    );
  }

  function skipPost(id: string) {
    setSkippedIds((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next; });
  }

  function handlePastePost() {
    if (!pasteText.trim()) return;
    const newPost: ScrapedPost = { text: pasteText.trim(), id: `pasted-${Date.now()}` };
    setScrapedPosts((prev) => [...prev, newPost]);
    setSelectedPosts((prev) => [...prev, newPost.text]);
    setPasteText("");
    setShowPasteArea(false);
    if (flowStep === "idle") setFlowStep("selecting");
  }

  async function handleAnalyzeSelected() {
    if (selectedPosts.length < 2) return;
    setFlowStep("analyzing");
    setVoiceError(null);

    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          samples: selectedPosts,
          linkedin_url: linkedinUrl.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setVoiceError(data.error || "Analysis failed");
        setFlowStep("selecting");
        return;
      }

      setVoiceProfile(data.voice_profile);
      setSavedExamples(selectedPosts);
      setUpdatingVoice(false);
      setFlowStep("done");
      setVoiceSuccess("Voice profile saved.");
      setTimeout(() => setVoiceSuccess(null), 4000);
    } catch {
      setVoiceError("Failed to analyze voice");
      setUpdatingVoice(false);
      setFlowStep("selecting");
    }
  }

  async function handleRemoveSample(idx: number) {
    setRemovingIdx(idx);
    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove_sample", sample_index: idx }),
      });
      if (res.ok) setSavedExamples((prev) => prev.filter((_, i) => i !== idx));
    } catch {
      // ignore
    }
    setRemovingIdx(null);
  }

  async function handleAddExample() {
    if (!newExample.trim()) return;
    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_sample", sample: newExample.trim() }),
      });
      if (res.ok) {
        setSavedExamples((prev) => [...prev, newExample.trim()]);
        setNewExample("");
        setShowAddExample(false);
      }
    } catch {
      // ignore
    }
  }

  function startUpdateVoice() {
    setUpdatingVoice(true);
    setVoiceProfile(null);
    setFlowStep("idle");
    setScrapedPosts([]);
    setSelectedPosts([]);
    setSkippedIds(new Set());
    setVoiceError(null);
    setVoiceSuccess(null);
  }

  /* ───── History helpers ───── */

  const filteredHistory = history.filter((post) => {
    if (historyFilter === "all") return true;
    const status = post.status || "generated";
    if (historyFilter === "published") return status === "published";
    if (historyFilter === "scheduled") return status === "scheduled";
    if (historyFilter === "drafts") return status === "draft";
    return true;
  });

  function getStatusBadge(status?: string) {
    switch (status) {
      case "published":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/40 text-green-400 border border-green-800/40">Published</span>;
      case "scheduled":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800/40">Scheduled</span>;
      case "draft":
        return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-800/40 text-gray-400 border border-gray-700/40">Draft</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/30">Generated</span>;
    }
  }

  async function handleDeletePost(postId: string) {
    try {
      await fetch(`/api/linkedin/history?id=${postId}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      // ignore
    }
  }

  async function handleHistoryPublish(content: string, postId: string) {
    try {
      await navigator.clipboard.writeText(content);
      window.open("https://www.linkedin.com/feed/?shareActive=true", "_blank");
      showToast("Post copied! Paste it in LinkedIn and hit Post.");
      fetch("/api/linkedin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quick_publish", content }),
      }).catch(() => {});
      setHistory((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, status: "published" } : p))
      );
    } catch {
      showToast("Failed to copy to clipboard.");
    }
  }

  /* ───── Guards ───── */

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0F0A1A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!user) {
    router.push("/login");
    return null;
  }

  const visiblePosts = scrapedPosts.filter((p) => !skippedIds.has(p.id));
  const voiceData = voiceProfile || (voice as unknown as VoiceProfile | null);

  /* ───── Render ───── */

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg bg-[#1A1228] border border-purple-800/40 text-sm text-purple-200 shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">LinkedIn Ghostwriter</h1>
          <p className="text-sm text-gray-400 mt-1">
            Generate LinkedIn posts that match your authentic voice
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-8 bg-[#1A1228] border border-[#2A2040] rounded-lg p-1">
          {(["compose", "voice", "history"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-[#7C3AED] text-white"
                  : "text-gray-400 hover:text-white hover:bg-[#2A2040]"
              }`}
            >
              {tab === "compose" ? "Compose" : tab === "voice" ? "Voice Profile" : "Post History"}
            </button>
          ))}
        </div>

        {/* ════════════════════════════ */}
        {/* TAB 1: COMPOSE              */}
        {/* ════════════════════════════ */}
        {activeTab === "compose" && (
          <div className="space-y-6">
            {/* No voice CTA */}
            {!hasVoice ? (
              <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-purple-900/30 border border-purple-800/30 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-medium mb-1">Set up your voice profile first</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    We need to analyze your LinkedIn posts to write in your voice.
                  </p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setActiveTab("voice")}
                      className="px-5 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
                    >
                      Set Up Voice Profile
                    </button>
                    <button
                      onClick={() => router.push("/settings")}
                      className="px-5 py-2 text-sm font-medium text-gray-400 border border-[#2A2040] rounded-lg hover:text-white hover:bg-[#2A2040] transition-colors"
                    >
                      Go to Settings
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Compact voice summary */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-400" />
                        <h3 className="text-sm font-medium">Voice Profile Active</h3>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-2">
                        {voiceData?.voice_summary || (voice?.voice_summary as string)}
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab("voice")}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-4 shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                </div>

                {/* Compose area */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Quick Compose</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-300 block mb-1.5">
                        What do you want to post about?
                      </label>
                      <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="e.g., Why most B2B content fails to convert, lessons from scaling our content team, hot take on AI-generated content..."
                        rows={3}
                        className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                      />
                    </div>
                    <button
                      onClick={() => handleGenerate()}
                      disabled={!topic.trim() || generating}
                      className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {generating ? (
                        <span className="inline-flex items-center gap-2">
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating...
                        </span>
                      ) : (
                        "Generate Posts"
                      )}
                    </button>
                  </div>

                  {/* Error */}
                  {genError && (
                    <div className="mt-4 p-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
                      {genError}
                    </div>
                  )}

                  {/* Streaming output */}
                  {generating && streamText && variants.length === 0 && (
                    <div className="mt-6 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-2">Generating...</p>
                      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
                        {streamText}
                      </pre>
                    </div>
                  )}

                  {/* Variant cards */}
                  {variants.length > 0 && (
                    <div className="mt-6 space-y-4">
                      {variants.map((variant, idx) => {
                        const isPublished = publishedIdxs.has(idx);
                        const isDraftSaved = savedDraftIdxs.has(idx);
                        return (
                          <div
                            key={idx}
                            className={`bg-[#0F0A1A] border rounded-lg p-5 ${
                              isPublished ? "border-green-600/40" : "border-[#2A2040]"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-purple-300">
                                  Variant {String.fromCharCode(65 + idx)}: {variant.label}
                                </h3>
                                {isPublished && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/40 text-green-400 border border-green-800/40">
                                    Published
                                  </span>
                                )}
                                {isDraftSaved && !isPublished && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-gray-800/40 text-gray-400 border border-gray-700/40">
                                    Draft Saved
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {getVariantContent(idx).length} chars
                              </span>
                            </div>

                            {/* Editable textarea */}
                            <textarea
                              value={getVariantContent(idx)}
                              onChange={(e) =>
                                setEditedVariants((prev) => ({
                                  ...prev,
                                  [idx]: e.target.value,
                                }))
                              }
                              rows={Math.max(6, getVariantContent(idx).split("\n").length + 1)}
                              className="w-full rounded-lg border border-[#2A2040] bg-[#1A1228] px-4 py-3 text-sm text-gray-300 leading-relaxed focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none mb-3"
                            />

                            {/* Action buttons */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => copyToClipboard(getVariantContent(idx), idx)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-[#2A2040] rounded-lg hover:bg-[#2A2040] transition-colors"
                              >
                                {copiedIdx === idx ? (
                                  <>
                                    <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                    </svg>
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                                    </svg>
                                    Copy
                                  </>
                                )}
                              </button>

                              <button
                                onClick={() => handleQuickPublish(idx)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                                </svg>
                                Post to LinkedIn
                              </button>

                              <button
                                onClick={() => handleSaveDraft(idx)}
                                disabled={isDraftSaved}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-[#2A2040] rounded-lg hover:bg-[#2A2040] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
                                </svg>
                                {isDraftSaved ? "Saved" : "Save as Draft"}
                              </button>

                              {/* Save Edit button — only shows when user has made edits */}
                              {editedVariants[idx] !== undefined && editedVariants[idx] !== variants[idx]?.content && (
                                <button
                                  onClick={() => handleSaveEdit(idx)}
                                  disabled={savedEditIdxs.has(idx) || savingEditIdx === idx}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-800/40 rounded-lg hover:bg-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                                  </svg>
                                  {savingEditIdx === idx ? "Saving..." : savedEditIdxs.has(idx) ? "Edit Saved" : "Save Edit to Refine Voice"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Post Ideas from Content */}
                {articles.length > 0 && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                    <h2 className="text-lg font-semibold mb-4">Post Ideas from Your Content</h2>
                    <div className="space-y-2">
                      {articles.map((article) => (
                        <div
                          key={article.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-[#0F0A1A] border border-[#2A2040] hover:border-purple-800/40 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-300 truncate">
                              {article.title || article.primary_keyword}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const title = article.title || article.primary_keyword;
                              setTopic(`Key insights from our article: "${title}"`);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="ml-3 shrink-0 px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-900/20 border border-purple-800/30 rounded-lg hover:bg-purple-900/40 transition-colors"
                          >
                            Draft from this
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════════════════════ */}
        {/* TAB 2: VOICE PROFILE        */}
        {/* ════════════════════════════ */}
        {activeTab === "voice" && (
          <div className="space-y-6">
            {/* Success / Error */}
            {voiceSuccess && (
              <div className="p-3 rounded-lg bg-green-900/30 border border-green-800/40 text-green-300 text-sm">
                {voiceSuccess}
              </div>
            )}
            {voiceError && (
              <div className="p-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
                {voiceError}
              </div>
            )}

            <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold">LinkedIn Voice Profile</h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {hasVoice
                      ? "Your LinkedIn writing style has been analyzed"
                      : "Analyze your LinkedIn posts to capture your writing voice"}
                  </p>
                </div>
                {hasVoice && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-900/40 text-green-400 border border-green-800/40">
                    Active
                  </span>
                )}
              </div>

              {/* No voice - setup flow */}
              {!hasVoice && (
                <div className="space-y-4">
                  {(flowStep === "idle" || flowStep === "scraping") && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-300 block mb-1.5">LinkedIn Profile URL</label>
                        <input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} placeholder="https://linkedin.com/in/yourprofile" className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                      </div>

                      <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Paste Your Best LinkedIn Posts</h3>
                        <p className="text-xs text-gray-500 mb-3">Copy 3-5 of your best posts from LinkedIn and paste them here one at a time.</p>
                        <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste a LinkedIn post here..." rows={4} className="w-full rounded-lg border border-[#2A2040] bg-[#1A1228] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none" />
                        <div className="flex items-center gap-3 mt-2">
                          <button onClick={handlePastePost} disabled={!pasteText.trim()} className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                            Add Post ({selectedPosts.length} added)
                          </button>
                          {selectedPosts.length >= 2 && (
                            <button onClick={() => setFlowStep("selecting")} className="px-4 py-2 text-sm font-medium text-green-400 border border-green-800/40 rounded-lg hover:bg-green-900/20 transition-colors">
                              Review {selectedPosts.length} Posts →
                            </button>
                          )}
                        </div>
                        {selectedPosts.length > 0 && selectedPosts.length < 2 && (
                          <p className="text-xs text-yellow-400/80 mt-2">Add at least {2 - selectedPosts.length} more post{2 - selectedPosts.length > 1 ? "s" : ""}.</p>
                        )}
                      </div>

                      {selectedPosts.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs text-gray-500">{selectedPosts.length} post{selectedPosts.length !== 1 ? "s" : ""} added:</p>
                          {selectedPosts.map((text, i) => (
                            <div key={i} className="flex items-start gap-2 bg-[#0F0A1A] border border-green-800/30 rounded-lg p-3">
                              <span className="text-green-400 mt-0.5 text-sm">✓</span>
                              <p className="text-xs text-gray-400 flex-1 line-clamp-2">{text}</p>
                              <button onClick={() => setSelectedPosts(prev => prev.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 text-xs">Remove</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="border-t border-[#2A2040] pt-4">
                        <button onClick={handleFindPosts} disabled={!linkedinUrl.trim() || flowStep === "scraping"} className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2">
                          {flowStep === "scraping" ? "Searching..." : "Or try auto-search (less reliable)"}
                        </button>
                      </div>
                    </>
                  )}

                  {/* Post Selection */}
                  {flowStep === "selecting" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-300">
                          Found {scrapedPosts.length} posts. Select the ones that represent your voice.
                        </p>
                        <span className="text-xs text-gray-500">{selectedPosts.length} selected</span>
                      </div>

                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {visiblePosts.map((post) => {
                          const isSelected = selectedPosts.includes(post.text);
                          const isExpanded = expandedIds.has(post.id);
                          const needsTruncation = post.text.length > 300;
                          const displayText = needsTruncation && !isExpanded ? post.text.slice(0, 300) + "..." : post.text;

                          return (
                            <div
                              key={post.id}
                              className={`rounded-lg border p-4 transition-colors ${
                                isSelected ? "border-green-600/60 bg-green-900/10" : "border-[#2A2040] bg-[#0F0A1A]"
                              }`}
                            >
                              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-3">
                                {displayText}
                              </p>
                              {needsTruncation && (
                                <button
                                  onClick={() =>
                                    setExpandedIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(post.id)) next.delete(post.id);
                                      else next.add(post.id);
                                      return next;
                                    })
                                  }
                                  className="text-xs text-purple-400 hover:text-purple-300 mb-3"
                                >
                                  {isExpanded ? "Show less" : "Show more"}
                                </button>
                              )}
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleSelectPost(post.text)}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                    isSelected
                                      ? "bg-green-900/40 text-green-300 border border-green-800/40"
                                      : "bg-purple-900/20 text-purple-300 border border-purple-800/30 hover:bg-purple-900/40"
                                  }`}
                                >
                                  {isSelected ? (
                                    <span className="inline-flex items-center gap-1">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                      </svg>
                                      Saved as Example
                                    </span>
                                  ) : (
                                    "Save as Example"
                                  )}
                                </button>
                                <button
                                  onClick={() => skipPost(post.id)}
                                  className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-300 border border-[#2A2040] rounded-lg hover:bg-[#1A1228] transition-colors"
                                >
                                  Skip
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Paste a Post */}
                      {!showPasteArea ? (
                        <button
                          onClick={() => setShowPasteArea(true)}
                          className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                        >
                          + Paste a Post
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                            placeholder="Paste a LinkedIn post here..."
                            rows={4}
                            className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handlePastePost}
                              disabled={!pasteText.trim()}
                              className="px-4 py-2 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              Add Post
                            </button>
                            <button
                              onClick={() => { setShowPasteArea(false); setPasteText(""); }}
                              className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleAnalyzeSelected}
                        disabled={selectedPosts.length < 2}
                        className="w-full px-5 py-3 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Analyze Voice from {selectedPosts.length} Selected Post{selectedPosts.length !== 1 ? "s" : ""}
                      </button>
                      {selectedPosts.length < 2 && (
                        <p className="text-xs text-gray-500">Select at least 2 posts to analyze your voice.</p>
                      )}
                    </div>
                  )}

                  {/* Analyzing */}
                  {flowStep === "analyzing" && (
                    <div className="flex items-center gap-3 py-8 justify-center">
                      <svg className="animate-spin h-5 w-5 text-purple-400" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <p className="text-sm text-gray-300">Analyzing your writing voice...</p>
                    </div>
                  )}

                  {flowStep === "done" && voiceProfile && (
                    <div className="text-center py-6">
                      <svg className="w-10 h-10 text-green-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      <p className="text-sm text-gray-300">Voice profile saved successfully.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Voice profile exists */}
              {hasVoice && voiceData && (
                <div className="space-y-6">
                  {linkedinUrl && (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-gray-400">
                        <span className="text-gray-500">Profile:</span>{" "}
                        <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline">
                          {linkedinUrl}
                        </a>
                      </p>
                    </div>
                  )}

                  {/* Voice Summary */}
                  <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Voice Summary</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{voiceData.voice_summary}</p>
                  </div>

                  {/* Tags */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {voiceData.hook_styles?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Hook Styles</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {voiceData.hook_styles.map((s, i) => (
                            <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/30">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceData.tone?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Tone</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {voiceData.tone.map((t, i) => (
                            <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/30">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceData.common_topics?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Common Topics</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {voiceData.common_topics.map((topic, i) => (
                            <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-800/30">{topic}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {voiceData.signature_phrases?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Signature Phrases</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {voiceData.signature_phrases.map((p, i) => (
                            <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/30">&ldquo;{p}&rdquo;</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-3">
                    {voiceData.formatting_patterns?.length > 0 && (
                      <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Formatting Patterns</h3>
                        <ul className="space-y-1">
                          {voiceData.formatting_patterns.map((pattern, i) => (
                            <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                              <span className="text-purple-400 mt-0.5">-</span>{pattern}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-0.5">Closing Style</p>
                        <p className="text-sm text-gray-300">{voiceData.closing_style}</p>
                      </div>
                      <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-0.5">Post Length</p>
                        <p className="text-sm text-gray-300">{voiceData.post_length}</p>
                      </div>
                      <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-0.5">Emoji Usage</p>
                        <p className="text-sm text-gray-300">{voiceData.emoji_usage}</p>
                      </div>
                    </div>
                  </div>

                  {/* Saved Examples */}
                  <div className="border-t border-[#2A2040] pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-200">Your Saved Examples</h3>
                      <button onClick={() => setShowAddExample(true)} className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                        + Add Example
                      </button>
                    </div>

                    {showAddExample && (
                      <div className="mb-4 space-y-2">
                        <textarea
                          value={newExample}
                          onChange={(e) => setNewExample(e.target.value)}
                          placeholder="Paste a LinkedIn post to add as a voice example..."
                          rows={4}
                          className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddExample}
                            disabled={!newExample.trim()}
                            className="px-4 py-2 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Add Example
                          </button>
                          <button onClick={() => { setShowAddExample(false); setNewExample(""); }} className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {savedExamples.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">No saved examples yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {savedExamples.map((sample, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-[#0F0A1A] border border-[#2A2040]">
                            <p className="flex-1 text-sm text-gray-400 line-clamp-3">{sample}</p>
                            <button
                              onClick={() => handleRemoveSample(idx)}
                              disabled={removingIdx === idx}
                              className="shrink-0 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                            >
                              {removingIdx === idx ? "..." : "Remove"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Update Voice */}
                  <button
                    onClick={startUpdateVoice}
                    className="px-5 py-2.5 text-sm font-medium text-purple-300 bg-purple-900/20 border border-purple-800/30 rounded-lg hover:bg-purple-900/40 transition-colors"
                  >
                    Update Voice
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════ */}
        {/* TAB 3: POST HISTORY         */}
        {/* ════════════════════════════ */}
        {activeTab === "history" && (
          <div className="space-y-6">
            <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Post History</h2>
                <button
                  onClick={loadHistory}
                  disabled={historyLoading}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {historyLoading ? "Loading..." : "Refresh"}
                </button>
              </div>

              {/* Filter tabs */}
              <div className="flex items-center gap-1 mb-4 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-1">
                {(["all", "published", "scheduled", "drafts"] as HistoryFilter[]).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHistoryFilter(filter)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                      historyFilter === filter
                        ? "bg-[#2A2040] text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
                </div>
              ) : filteredHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  {historyFilter === "all"
                    ? "No posts generated yet. Start composing to see your history."
                    : `No ${historyFilter} posts found.`}
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredHistory.map((post) => {
                    const isExpanded = expandedHistoryIds.has(post.id);
                    const firstVariant = post.variants?.[0]?.content || "";
                    const displayText = !isExpanded && firstVariant.length > 200
                      ? firstVariant.slice(0, 200) + "..."
                      : firstVariant;
                    const date = new Date(post.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    return (
                      <div key={post.id} className="rounded-lg bg-[#0F0A1A] border border-[#2A2040] p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium text-gray-300 truncate">{post.topic}</p>
                              {getStatusBadge(post.status)}
                            </div>
                            <p className="text-xs text-gray-500">{date}</p>
                          </div>
                        </div>

                        {firstVariant && (
                          <>
                            <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed mt-2">
                              {displayText}
                            </p>
                            {firstVariant.length > 200 && (
                              <button
                                onClick={() =>
                                  setExpandedHistoryIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(post.id)) next.delete(post.id);
                                    else next.add(post.id);
                                    return next;
                                  })
                                }
                                className="text-xs text-purple-400 hover:text-purple-300 mt-1"
                              >
                                {isExpanded ? "Show less" : "Show more"}
                              </button>
                            )}
                          </>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 mt-3 flex-wrap">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(firstVariant);
                              showToast("Copied to clipboard.");
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-white border border-[#2A2040] rounded-lg hover:bg-[#2A2040] transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                            </svg>
                            Copy
                          </button>

                          {(post.status === "draft" || post.status === "scheduled" || !post.status) && (
                            <button
                              onClick={() => handleHistoryPublish(firstVariant, post.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                              </svg>
                              Post to LinkedIn
                            </button>
                          )}

                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 border border-red-900/30 rounded-lg hover:bg-red-900/20 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
