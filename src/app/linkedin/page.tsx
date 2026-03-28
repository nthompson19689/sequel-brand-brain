"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

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
}

interface ContentArticle {
  id: string;
  title: string | null;
  primary_keyword: string;
  status: string;
}

export default function LinkedInPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();

  // Compose state
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Content ideas
  const [articles, setArticles] = useState<ContentArticle[]>([]);

  // History
  const [history, setHistory] = useState<HistoryPost[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const streamRef = useRef<AbortController | null>(null);

  const voice = profile?.linkedin_voice as Record<string, unknown> | null;
  const hasVoice = voice && voice.voice_summary;

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

    // Load recent articles for ideas
    fetch("/api/content?status=draft_generated")
      .then((r) => r.json())
      .then((d) => setArticles((d.posts || []).slice(0, 5)))
      .catch(() => {});

    // Load history
    loadHistory();
  }, [user, loadHistory]);

  async function handleGenerate(overrideTopic?: string) {
    const t = overrideTopic || topic;
    if (!t.trim()) return;

    setGenerating(true);
    setStreamText("");
    setVariants([]);
    setGenError(null);

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
    // Refresh history after generating
    loadHistory();
  }

  function copyToClipboard(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  function groupByDate(posts: HistoryPost[]) {
    const groups: Record<string, HistoryPost[]> = {};
    for (const post of posts) {
      const date = new Date(post.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(post);
    }
    return groups;
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

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">LinkedIn Ghostwriter</h1>
          <p className="text-sm text-gray-400 mt-1">
            Generate LinkedIn posts that match your authentic voice
          </p>
        </div>

        {/* Voice Profile Card */}
        {!hasVoice ? (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-8">
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-purple-900/30 border border-purple-800/30 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </div>
              <h3 className="text-sm font-medium mb-1">Voice Profile Not Set Up</h3>
              <p className="text-xs text-gray-500 mb-4">
                Analyze your LinkedIn profile to generate posts in your voice.
              </p>
              <button
                onClick={() => router.push("/settings")}
                className="px-5 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
              >
                Set Up Voice Profile
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4 mb-8">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-400" />
                  <h3 className="text-sm font-medium">Voice Profile Active</h3>
                </div>
                <p className="text-xs text-gray-400 line-clamp-2">
                  {voice.voice_summary as string}
                </p>
              </div>
              <button
                onClick={() => router.push("/settings")}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-4 shrink-0"
              >
                Edit
              </button>
            </div>
          </div>
        )}

        {/* Quick Compose */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-8">
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
              disabled={!topic.trim() || generating || !hasVoice}
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
              {variants.map((variant, idx) => (
                <div
                  key={idx}
                  className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-purple-300">
                      Variant {String.fromCharCode(65 + idx)}: {variant.label}
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {variant.content.length} chars
                      </span>
                      <button
                        onClick={() => copyToClipboard(variant.content, idx)}
                        className="text-xs text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1"
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
                    </div>
                  </div>
                  <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {variant.content}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Post Ideas from Content */}
        {articles.length > 0 && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-8">
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
                    disabled={!hasVoice}
                    className="ml-3 shrink-0 px-3 py-1.5 text-xs font-medium text-purple-300 bg-purple-900/20 border border-purple-800/30 rounded-lg hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Draft from this
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Post History</h2>

          {historyLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No posts generated yet. Start composing above.
            </p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupByDate(history)).map(([date, posts]) => (
                <div key={date}>
                  <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    {date}
                  </h3>
                  <div className="space-y-2">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className="p-3 rounded-lg bg-[#0F0A1A] border border-[#2A2040]"
                      >
                        <p className="text-sm text-gray-300 font-medium mb-1">{post.topic}</p>
                        <p className="text-xs text-gray-500">
                          {post.variants?.length || 0} variants generated
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
