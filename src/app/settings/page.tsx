"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { MODULES } from "@/lib/modules";
import { useRouter } from "next/navigation";

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

interface ScrapedPost {
  text: string;
  id: string;
}

type FlowStep = "idle" | "scraping" | "selecting" | "analyzing" | "done";

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const { enabledModules, toggleModule, moduleRole } = usePreferences();
  const { currentWorkspace } = useWorkspace();

  // API key state
  const [apiKeyConfig, setApiKeyConfig] = useState<{
    has_key: boolean;
    masked_key: string | null;
    mcp_server_urls: string[];
  } | null>(null);
  const [newApiKey, setNewApiKey] = useState("");
  const [newMcpUrl, setNewMcpUrl] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);

  const loadApiKeys = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    try {
      const res = await fetch(`/api/preferences/api-keys?workspace_id=${currentWorkspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setApiKeyConfig(data.config || null);
      }
    } catch {
      // ignore
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  async function saveApiKey() {
    if (!newApiKey.trim() || !currentWorkspace?.id) return;
    setApiKeySaving(true);
    try {
      await fetch("/api/preferences/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          anthropic_api_key: newApiKey.trim(),
        }),
      });
      setNewApiKey("");
      await loadApiKeys();
    } catch {
      // ignore
    }
    setApiKeySaving(false);
  }

  async function removeApiKey() {
    if (!currentWorkspace?.id) return;
    try {
      await fetch(`/api/preferences/api-keys?workspace_id=${currentWorkspace.id}`, {
        method: "DELETE",
      });
      await loadApiKeys();
    } catch {
      // ignore
    }
  }

  async function addMcpUrl() {
    if (!newMcpUrl.trim() || !currentWorkspace?.id) return;
    const urls = [...(apiKeyConfig?.mcp_server_urls || []), newMcpUrl.trim()];
    try {
      await fetch("/api/preferences/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          mcp_server_urls: urls,
        }),
      });
      setNewMcpUrl("");
      await loadApiKeys();
    } catch {
      // ignore
    }
  }

  async function removeMcpUrl(idx: number) {
    if (!currentWorkspace?.id) return;
    const urls = (apiKeyConfig?.mcp_server_urls || []).filter((_, i) => i !== idx);
    try {
      await fetch("/api/preferences/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: currentWorkspace.id,
          mcp_server_urls: urls,
        }),
      });
      await loadApiKeys();
    } catch {
      // ignore
    }
  }

  // Module icon lookup — small inline SVGs
  const moduleIcons: Record<string, React.ReactNode> = {
    Chat: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.3 48.3 0 0 0 5.862-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>,
    Agents: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>,
    Content: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>,
    SEO: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>,
    Decks: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>,
    Competitors: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 0 0 3.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0 1 20.25 6v1.5m0 9V18A2.25 2.25 0 0 1 18 20.25h-1.5m-9 0H6A2.25 2.25 0 0 1 3.75 18v-1.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>,
    Dictate: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z" /></svg>,
    Refresh: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>,
    LinkedIn: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>,
    Outputs: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>,
    Skills: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.008-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.4.604-.4.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.96.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" /></svg>,
    Requests: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" /></svg>,
    Brain: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>,
  };

  // Voice profile state
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Post selection flow
  const [flowStep, setFlowStep] = useState<FlowStep>("idle");
  const [scrapedPosts, setScrapedPosts] = useState<ScrapedPost[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<string[]>([]);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Paste post
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Saved examples
  const [savedExamples, setSavedExamples] = useState<string[]>([]);
  const [showAddExample, setShowAddExample] = useState(false);
  const [newExample, setNewExample] = useState("");
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);

  // Update voice flow
  const [updatingVoice, setUpdatingVoice] = useState(false);

  useEffect(() => {
    if (profile?.linkedin_url) {
      setLinkedinUrl(profile.linkedin_url);
    }
    if (profile?.linkedin_voice) {
      setVoiceProfile(profile.linkedin_voice as unknown as VoiceProfile);
    }
    if (profile?.linkedin_samples) {
      setSavedExamples(profile.linkedin_samples);
    }
  }, [profile]);

  async function handleFindPosts() {
    if (!linkedinUrl.trim()) return;
    setFlowStep("scraping");
    setError(null);
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
        setError(data.error || "Failed to find posts");
        setFlowStep("idle");
        return;
      }

      // The API might return posts directly or a voice profile
      // If it returns a voice_profile directly (current API behavior), use it
      if (data.voice_profile) {
        setVoiceProfile(data.voice_profile);
        setFlowStep("done");
        setSuccessMsg("Voice profile analyzed and saved successfully.");
        setTimeout(() => setSuccessMsg(null), 4000);
        return;
      }

      // If it returns scraped posts for selection
      if (data.posts && data.posts.length > 0) {
        setScrapedPosts(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data.posts.map((p: any, i: number) => ({
            text: typeof p === "string" ? p : (p.text || p.preview || String(p)),
            id: `post-${i}`,
          }))
        );
        setFlowStep("selecting");
      } else {
        setError("No posts found. Try pasting posts manually below.");
        setFlowStep("idle");
      }
    } catch {
      setError("Failed to search for LinkedIn posts");
      setFlowStep("idle");
    }
  }

  function toggleSelectPost(postText: string) {
    setSelectedPosts((prev) =>
      prev.includes(postText)
        ? prev.filter((p) => p !== postText)
        : [...prev, postText]
    );
  }

  function skipPost(id: string) {
    setSkippedIds((prev) => { const next = new Set(Array.from(prev)); next.add(id); return next; });
  }

  function handlePastePost() {
    if (!pasteText.trim()) return;
    const newPost: ScrapedPost = {
      text: pasteText.trim(),
      id: `pasted-${Date.now()}`,
    };
    setScrapedPosts((prev) => [...prev, newPost]);
    setSelectedPosts((prev) => [...prev, newPost.text]);
    setPasteText("");
    setShowPasteArea(false);
    if (flowStep === "idle") {
      setFlowStep("selecting");
    }
  }

  async function handleAnalyzeSelected() {
    if (selectedPosts.length < 2) return;
    setFlowStep("analyzing");
    setError(null);

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
        setError(data.error || "Analysis failed");
        setFlowStep("selecting");
        return;
      }

      setVoiceProfile(data.voice_profile);
      setFlowStep("done");
      setSuccessMsg("Voice profile saved successfully.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch {
      setError("Failed to analyze voice from selected posts");
      setFlowStep("selecting");
    }
  }

  async function handleRemoveSample(idx: number) {
    setRemovingIdx(idx);
    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "remove_sample",
          sample_index: idx,
        }),
      });
      if (res.ok) {
        setSavedExamples((prev) => prev.filter((_, i) => i !== idx));
      }
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
        body: JSON.stringify({
          action: "add_sample",
          sample: newExample.trim(),
        }),
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
    setError(null);
    setSuccessMsg(null);
  }

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

  const hasVoice = voiceProfile && voiceProfile.voice_summary && !updatingVoice;
  const visiblePosts = scrapedPosts.filter((p) => !skippedIds.has(p.id));

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-gray-400 mt-1">Modules, API keys, and voice profile preferences</p>
        </div>

        {/* Success message */}
        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-green-900/30 border border-green-800/40 text-green-300 text-sm">
            {successMsg}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ======================== */}
        {/* Module Toggles           */}
        {/* ======================== */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold">Modules</h2>
            {moduleRole && (
              <span className="text-[10px] uppercase tracking-wider text-[#6B6680] px-2 py-0.5 rounded-full bg-[#0F0A1A] border border-[#2A2040]">
                {moduleRole} preset
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mb-5">
            Toggle which tools appear in your sidebar. Changes apply immediately.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MODULES.map((mod) => {
              const enabled = enabledModules.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  onClick={() => toggleModule(mod.id)}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                    enabled
                      ? "border-[#7C3AED]/40 bg-[#7C3AED]/5"
                      : "border-[#2A2040] bg-[#0F0A1A] opacity-60"
                  }`}
                >
                  <div className={`mt-0.5 shrink-0 ${enabled ? "text-[#9061F9]" : "text-[#6B6680]"}`}>
                    {moduleIcons[mod.iconKey] || moduleIcons.Chat}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{mod.displayName}</span>
                      <div
                        className={`w-8 h-4.5 rounded-full transition-colors relative ${
                          enabled ? "bg-[#7C3AED]" : "bg-[#2A2040]"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                            enabled ? "left-[18px]" : "left-0.5"
                          }`}
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-[#6B6680] mt-0.5 leading-tight">{mod.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ======================== */}
        {/* API Key Configuration    */}
        {/* ======================== */}
        {profile?.is_admin && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-1">API Configuration</h2>
            <p className="text-sm text-gray-400 mb-5">
              Bring your own Anthropic API key and MCP server URLs. Admin only.
            </p>

            {/* Anthropic API Key */}
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-300 block mb-1.5">
                Anthropic API Key
              </label>
              {apiKeyConfig?.has_key ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 px-4 py-2.5 rounded-lg bg-[#0F0A1A] border border-[#2A2040] text-sm text-gray-400 font-mono">
                    {apiKeyConfig.masked_key}
                  </div>
                  <button
                    onClick={removeApiKey}
                    className="px-3 py-2 text-xs font-medium text-red-400 border border-red-800/40 rounded-lg hover:bg-red-900/20 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="flex-1 rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                  />
                  <button
                    onClick={saveApiKey}
                    disabled={!newApiKey.trim() || apiKeySaving}
                    className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {apiKeySaving ? "..." : "Save"}
                  </button>
                </div>
              )}
              <p className="text-[10px] text-[#4A4560] mt-1.5">
                If set, this key is used instead of the platform default for all AI calls in this workspace.
              </p>
            </div>

            {/* MCP Server URLs */}
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1.5">
                MCP Server URLs
              </label>
              {(apiKeyConfig?.mcp_server_urls || []).length > 0 && (
                <div className="space-y-2 mb-3">
                  {apiKeyConfig!.mcp_server_urls.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 rounded-lg bg-[#0F0A1A] border border-[#2A2040] text-xs text-gray-400 font-mono truncate">
                        {url}
                      </div>
                      <button
                        onClick={() => removeMcpUrl(idx)}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3">
                <input
                  type="url"
                  value={newMcpUrl}
                  onChange={(e) => setNewMcpUrl(e.target.value)}
                  placeholder="https://mcp.example.com/sse"
                  className="flex-1 rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 font-mono"
                />
                <button
                  onClick={addMcpUrl}
                  disabled={!newMcpUrl.trim()}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ======================== */}
        {/* LinkedIn Voice Profile   */}
        {/* ======================== */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
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

          {/* ---- STATE 1: No voice profile ---- */}
          {!hasVoice && (
            <div className="space-y-4">
              {/* Paste Posts (PRIMARY method) */}
              {(flowStep === "idle" || flowStep === "scraping") && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-300 block mb-1.5">
                      LinkedIn Profile URL
                    </label>
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/yourprofile"
                      className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </div>

                  <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Paste Your Best LinkedIn Posts</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Go to your LinkedIn profile, copy 3-5 of your best posts, and paste them here one at a time. These will be used to analyze your writing voice.
                    </p>
                    <textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Paste a LinkedIn post here..."
                      rows={4}
                      className="w-full rounded-lg border border-[#2A2040] bg-[#1A1228] px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                    />
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={handlePastePost}
                        disabled={!pasteText.trim()}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Add Post ({selectedPosts.length} added)
                      </button>
                      {selectedPosts.length >= 2 && (
                        <button
                          onClick={() => setFlowStep("selecting")}
                          className="px-4 py-2 text-sm font-medium text-green-400 border border-green-800/40 rounded-lg hover:bg-green-900/20 transition-colors"
                        >
                          Review {selectedPosts.length} Posts →
                        </button>
                      )}
                    </div>
                    {selectedPosts.length > 0 && selectedPosts.length < 2 && (
                      <p className="text-xs text-yellow-400/80 mt-2">
                        Add at least {2 - selectedPosts.length} more post{2 - selectedPosts.length > 1 ? "s" : ""} to analyze your voice.
                      </p>
                    )}
                  </div>

                  {selectedPosts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-500">{selectedPosts.length} post{selectedPosts.length !== 1 ? "s" : ""} added:</p>
                      {selectedPosts.map((text, i) => (
                        <div key={i} className="flex items-start gap-2 bg-[#0F0A1A] border border-green-800/30 rounded-lg p-3">
                          <span className="text-green-400 mt-0.5 text-sm">✓</span>
                          <p className="text-xs text-gray-400 flex-1 line-clamp-2">{text}</p>
                          <button
                            onClick={() => setSelectedPosts(prev => prev.filter((_, j) => j !== i))}
                            className="text-gray-500 hover:text-red-400 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Optional: Auto-search (secondary) */}
                  <div className="border-t border-[#2A2040] pt-4">
                    <button
                      onClick={handleFindPosts}
                      disabled={!linkedinUrl.trim() || flowStep === "scraping"}
                      className="text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
                    >
                      {flowStep === "scraping" ? "Searching..." : "Or try auto-search (less reliable)"}
                    </button>
                    {flowStep === "scraping" && (
                      <p className="text-xs text-gray-600 mt-1">
                        LinkedIn limits what we can find automatically. Pasting posts directly is more reliable.
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Post Selection */}
              {flowStep === "selecting" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300">
                      Found {scrapedPosts.length} posts. Select the ones that best represent your voice.
                    </p>
                    <span className="text-xs text-gray-500">
                      {selectedPosts.length} selected
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {visiblePosts.map((post) => {
                      const isSelected = selectedPosts.includes(post.text);
                      const isExpanded = expandedIds.has(post.id);
                      const needsTruncation = post.text.length > 300;
                      const displayText = needsTruncation && !isExpanded
                        ? post.text.slice(0, 300) + "..."
                        : post.text;

                      return (
                        <div
                          key={post.id}
                          className={`rounded-lg border p-4 transition-colors ${
                            isSelected
                              ? "border-green-600/60 bg-green-900/10"
                              : "border-[#2A2040] bg-[#0F0A1A]"
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
                          onClick={() => {
                            setShowPasteArea(false);
                            setPasteText("");
                          }}
                          className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Analyze button */}
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

              {/* Done - shown briefly before hasVoice takes over */}
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

          {/* ---- STATE 2: Voice profile exists ---- */}
          {hasVoice && voiceProfile && (
            <div className="space-y-6">
              {/* URL display */}
              {linkedinUrl && (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-400">
                    <span className="text-gray-500">Profile:</span>{" "}
                    <a
                      href={linkedinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 underline"
                    >
                      {linkedinUrl}
                    </a>
                  </p>
                </div>
              )}

              {/* Voice Summary */}
              <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Voice Summary</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{voiceProfile.voice_summary}</p>
              </div>

              {/* Tags grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {voiceProfile.hook_styles?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Hook Styles</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.hook_styles.map((style, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/30">
                          {style}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {voiceProfile.tone?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Tone</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.tone.map((t, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/30">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {voiceProfile.common_topics?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Common Topics</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.common_topics.map((topic, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-800/30">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {voiceProfile.signature_phrases?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Signature Phrases</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.signature_phrases.map((phrase, i) => (
                        <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/30">
                          &ldquo;{phrase}&rdquo;
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="space-y-3">
                {voiceProfile.formatting_patterns?.length > 0 && (
                  <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Formatting Patterns</h3>
                    <ul className="space-y-1">
                      {voiceProfile.formatting_patterns.map((pattern, i) => (
                        <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                          <span className="text-purple-400 mt-0.5">-</span>
                          {pattern}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Closing Style</p>
                    <p className="text-sm text-gray-300">{voiceProfile.closing_style}</p>
                  </div>
                  <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Post Length</p>
                    <p className="text-sm text-gray-300">{voiceProfile.post_length}</p>
                  </div>
                  <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-0.5">Emoji Usage</p>
                    <p className="text-sm text-gray-300">{voiceProfile.emoji_usage}</p>
                  </div>
                </div>
              </div>

              {/* Saved Examples */}
              <div className="border-t border-[#2A2040] pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-200">Your Saved Examples</h3>
                  <button
                    onClick={() => setShowAddExample(true)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
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
                      <button
                        onClick={() => {
                          setShowAddExample(false);
                          setNewExample("");
                        }}
                        className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {savedExamples.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No saved examples yet. Add posts that represent your voice.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {savedExamples.map((sample, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg bg-[#0F0A1A] border border-[#2A2040]"
                      >
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

              {/* Update Voice button */}
              <button
                onClick={startUpdateVoice}
                className="px-5 py-2.5 text-sm font-medium text-purple-300 bg-purple-900/20 border border-purple-800/30 rounded-lg hover:bg-purple-900/40 transition-colors"
              >
                Update Voice
              </button>
            </div>
          )}
        </div>

        {/* ======================== */}
        {/* LinkedIn Publishing      */}
        {/* ======================== */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">LinkedIn Publishing</h2>
              <p className="text-sm text-gray-400 mt-0.5">Post directly to LinkedIn from here</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              disabled
              className="px-5 py-2.5 text-sm font-medium text-gray-500 bg-[#0F0A1A] border border-[#2A2040] rounded-lg cursor-not-allowed"
            >
              Connect LinkedIn Account
            </button>
            <p className="text-xs text-gray-500">
              Direct publishing coming soon. Use Quick Publish to copy and post.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
