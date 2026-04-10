"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
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
