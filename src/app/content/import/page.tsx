"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import MicButton from "@/components/ui/MicButton";
import { useSpeechToText } from "@/hooks/useSpeechToText";

const POST_TYPES = [
  { value: "pillar", label: "Pillar", desc: "Comprehensive, 2500+ words" },
  { value: "supporting", label: "Supporting", desc: "Focused, 1500-2000 words" },
  { value: "question", label: "Question", desc: "Direct answer, 800-1200 words" },
  { value: "comparison", label: "Comparison", desc: "X vs Y format" },
];

export default function ImportPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"single" | "csv">("single");

  // Single mode
  const [keyword, setKeyword] = useState("");
  const { isListening: kwListening, supported: kwMicSupported, toggle: toggleKwMic } = useSpeechToText({
    onTranscript: useCallback((text: string) => setKeyword(text), []),
    currentValue: keyword,
  });
  const [postType, setPostType] = useState("supporting");
  const [searchIntent, setSearchIntent] = useState("informational");
  const [wordCount, setWordCount] = useState("1800");

  // CSV mode
  const [csvText, setCsvText] = useState("");
  const [parsedRows, setParsedRows] = useState<Array<{ keyword: string; search_intent: string; post_type: string; word_count: number }>>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseCSV() {
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { setError("Need a header row + at least one data row"); return; }

    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const kwIdx = header.findIndex((h) => h.includes("keyword"));
    const intentIdx = header.findIndex((h) => h.includes("intent"));
    const typeIdx = header.findIndex((h) => h.includes("type"));
    const wcIdx = header.findIndex((h) => h.includes("word") || h.includes("count"));

    if (kwIdx < 0) { setError("CSV must have a 'keyword' column"); return; }

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return {
        keyword: cols[kwIdx] || "",
        search_intent: intentIdx >= 0 ? cols[intentIdx] || "informational" : "informational",
        post_type: typeIdx >= 0 ? cols[typeIdx] || "supporting" : "supporting",
        word_count: wcIdx >= 0 ? parseInt(cols[wcIdx]) || 1800 : 1800,
      };
    }).filter((r) => r.keyword);

    setParsedRows(rows);
    setError(null);
  }

  async function handleSingleSubmit() {
    if (!keyword.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primary_keyword: keyword.trim(),
          post_type: postType,
          search_intent: searchIntent,
          word_count: parseInt(wordCount) || 1800,
        }),
      });
      if (!res.ok) throw new Error("Failed to create post");
      const data = await res.json();
      router.push(`/content/${data.post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  }

  async function handleBulkSubmit() {
    if (parsedRows.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: parsedRows }),
      });
      if (!res.ok) throw new Error("Failed to import");
      router.push("/content");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => router.push("/content")} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Back to Pipeline
      </button>

      <h1 className="text-2xl font-semibold text-gray-900 mb-1">New Content</h1>
      <p className="text-sm text-gray-500 mb-6">Add keywords to your content pipeline.</p>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        <button onClick={() => setMode("single")} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === "single" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          Single Keyword
        </button>
        <button onClick={() => setMode("csv")} className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === "csv" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
          CSV Bulk Import
        </button>
      </div>

      {mode === "single" ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Primary Keyword</label>
            <div className="relative">
              <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g., B2B content strategy"
                className={`w-full rounded-xl border bg-white px-4 py-2.5 ${kwMicSupported ? "pr-10" : "pr-4"} text-sm focus:outline-none focus:ring-1 transition-colors ${
                  kwListening ? "border-red-400 focus:border-red-400 focus:ring-red-400" : "border-gray-300 focus:border-brand-400 focus:ring-brand-400"
                }`} />
              <MicButton isListening={kwListening} supported={kwMicSupported} onClick={toggleKwMic} size="sm" className="absolute right-2 top-1.5" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Post Type</label>
            <div className="grid grid-cols-2 gap-2">
              {POST_TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => setPostType(t.value)}
                  className={`text-left px-3 py-2 rounded-xl border-2 transition-all ${postType === t.value ? "border-brand-400 bg-brand-50" : "border-gray-200 hover:border-gray-300"}`}>
                  <div className="text-sm font-medium text-gray-900">{t.label}</div>
                  <div className="text-[11px] text-gray-500">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Intent</label>
              <select value={searchIntent} onChange={(e) => setSearchIntent(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400">
                <option value="informational">Informational</option>
                <option value="commercial">Commercial</option>
                <option value="navigational">Navigational</option>
                <option value="transactional">Transactional</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Word Count</label>
              <input type="number" value={wordCount} onChange={(e) => setWordCount(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button onClick={handleSingleSubmit} disabled={!keyword.trim() || saving} className="w-full px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm">
            {saving ? "Creating..." : "Create & Start Pipeline"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Paste CSV</label>
            <p className="text-xs text-gray-400 mb-2">Columns: keyword, search_intent, post_type, word_count (only keyword is required)</p>
            <textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); setParsedRows([]); }} rows={8}
              placeholder={"keyword,search_intent,post_type,word_count\nB2B content strategy,informational,pillar,2500\ncontent-led growth,informational,supporting,1800\nwhat is content marketing,informational,question,1000"}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-mono focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400 resize-y" />
          </div>

          {parsedRows.length === 0 ? (
            <button onClick={parseCSV} disabled={!csvText.trim()} className="px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm">
              Parse CSV
            </button>
          ) : (
            <>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">#</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Keyword</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Type</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Words</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedRows.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{r.keyword}</td>
                        <td className="px-3 py-2 text-gray-500">{r.post_type}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{r.word_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleBulkSubmit} disabled={saving} className="w-full px-5 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 transition-colors shadow-sm">
                {saving ? "Importing..." : `Import ${parsedRows.length} Keywords`}
              </button>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
