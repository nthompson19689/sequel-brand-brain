"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
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

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);

  useEffect(() => {
    if (profile?.linkedin_url) {
      setLinkedinUrl(profile.linkedin_url);
    }
    if (profile?.linkedin_voice) {
      setVoiceProfile(profile.linkedin_voice as unknown as VoiceProfile);
    }
  }, [profile]);

  async function handleAnalyze() {
    if (!linkedinUrl.trim()) return;
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/linkedin/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedin_url: linkedinUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Analysis failed");
        return;
      }

      setVoiceProfile(data.voice_profile);
      setEditingUrl(false);
    } catch {
      setError("Failed to analyze LinkedIn profile");
    } finally {
      setAnalyzing(false);
    }
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

  const hasVoice = voiceProfile && voiceProfile.voice_summary;

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
          <p className="text-sm text-gray-400 mt-1">Manage your LinkedIn voice profile and preferences</p>
        </div>

        {/* LinkedIn Voice Profile Section */}
        <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">LinkedIn Voice Profile</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                {hasVoice
                  ? "Your LinkedIn writing style has been analyzed"
                  : "Analyze your LinkedIn profile to capture your writing voice"}
              </p>
            </div>
            {hasVoice && (
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-900/40 text-green-400 border border-green-800/40">
                Active
              </span>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-800/40 text-red-300 text-sm">
              {error}
            </div>
          )}

          {!hasVoice ? (
            /* No voice profile yet */
            <div className="space-y-4">
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
              <button
                onClick={handleAnalyze}
                disabled={!linkedinUrl.trim() || analyzing}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {analyzing ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Analyzing your LinkedIn voice...
                  </span>
                ) : (
                  "Analyze My Voice"
                )}
              </button>
              {analyzing && (
                <p className="text-xs text-gray-500">
                  This may take 30-60 seconds while we search and analyze your posts.
                </p>
              )}
            </div>
          ) : (
            /* Voice profile exists */
            <div className="space-y-6">
              {/* URL display */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  {editingUrl ? (
                    <input
                      type="url"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  ) : (
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
                  )}
                </div>
                <button
                  onClick={() => {
                    if (editingUrl) {
                      setEditingUrl(false);
                    } else {
                      setEditingUrl(true);
                    }
                  }}
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  {editingUrl ? "Cancel" : "Edit"}
                </button>
              </div>

              {/* Voice Summary */}
              <div className="bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-300 mb-2">Voice Summary</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{voiceProfile.voice_summary}</p>
              </div>

              {/* Tags grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Hook Styles */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Hook Styles</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {voiceProfile.hook_styles.map((style, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 text-xs rounded-full bg-purple-900/30 text-purple-300 border border-purple-800/30"
                      >
                        {style}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Tone */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Tone</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {voiceProfile.tone.map((t, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 text-xs rounded-full bg-blue-900/30 text-blue-300 border border-blue-800/30"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Common Topics */}
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Common Topics</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {voiceProfile.common_topics.map((topic, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 text-xs rounded-full bg-emerald-900/30 text-emerald-300 border border-emerald-800/30"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Signature Phrases */}
                {voiceProfile.signature_phrases.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">Signature Phrases</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceProfile.signature_phrases.map((phrase, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 text-xs rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/30"
                        >
                          &ldquo;{phrase}&rdquo;
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Details list */}
              <div className="space-y-3">
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

              {/* Re-analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="px-5 py-2.5 text-sm font-medium text-purple-300 bg-purple-900/20 border border-purple-800/30 rounded-lg hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {analyzing ? (
                  <span className="inline-flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Re-analyzing...
                  </span>
                ) : (
                  "Re-analyze Voice"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
