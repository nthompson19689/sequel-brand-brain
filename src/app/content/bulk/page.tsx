"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Bulk Batch Runner
 *
 * Lets the user queue up to 10 keywords (via manual entry or CSV paste) and
 * run the full brief → write → edit pipeline sequentially on each one. Each
 * row has its own intent + word count target. Posts are created in Supabase
 * first, then each one is kicked off through /api/content/batch one at a
 * time with live progress.
 */

const POST_TYPES = [
  { value: "pillar", label: "Pillar" },
  { value: "supporting", label: "Supporting" },
  { value: "question", label: "Question" },
  { value: "comparison", label: "Comparison" },
];

const INTENTS = [
  { value: "informational", label: "Informational" },
  { value: "commercial", label: "Commercial" },
  { value: "transactional", label: "Transactional" },
  { value: "navigational", label: "Navigational" },
];

const DEFAULT_WORD_COUNT = 1300;
const MAX_ROWS = 10;

interface Row {
  id: string;
  keyword: string;
  search_intent: string;
  post_type: string;
  word_count: number;
}

type RowStatus =
  | "pending"
  | "creating"
  | "brief"
  | "write"
  | "edit"
  | "complete"
  | "error";

interface RunState {
  status: RowStatus;
  message: string;
  postId?: string;
  wordCount?: number;
  error?: string;
}

function newRow(): Row {
  return {
    id: crypto.randomUUID(),
    keyword: "",
    search_intent: "informational",
    post_type: "supporting",
    word_count: DEFAULT_WORD_COUNT,
  };
}

export default function BulkBatchPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [rows, setRows] = useState<Row[]>(() => [
    newRow(),
    newRow(),
    newRow(),
    newRow(),
    newRow(),
  ]);
  const [csvText, setCsvText] = useState("");
  const [runStates, setRunStates] = useState<Record<string, RunState>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [overallStatus, setOverallStatus] = useState<string>("");

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (rows.length >= MAX_ROWS) return;
    setRows((r) => [...r, newRow()]);
  }

  function removeRow(id: string) {
    setRows((r) => r.filter((row) => row.id !== id));
  }

  function parseCSV() {
    const lines = csvText.trim().split("\n").filter(Boolean);
    if (lines.length < 2) {
      alert("CSV needs a header row + at least one data row.");
      return;
    }
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const kwIdx = header.findIndex((h) => h.includes("keyword"));
    const intentIdx = header.findIndex((h) => h.includes("intent"));
    const typeIdx = header.findIndex((h) => h.includes("type"));
    const wcIdx = header.findIndex((h) => h.includes("word") || h.includes("count"));
    if (kwIdx < 0) {
      alert("CSV must have a 'keyword' column.");
      return;
    }
    const parsed: Row[] = lines
      .slice(1)
      .map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        return {
          id: crypto.randomUUID(),
          keyword: cols[kwIdx] || "",
          search_intent:
            intentIdx >= 0 ? cols[intentIdx] || "informational" : "informational",
          post_type: typeIdx >= 0 ? cols[typeIdx] || "supporting" : "supporting",
          word_count:
            wcIdx >= 0
              ? parseInt(cols[wcIdx]) || DEFAULT_WORD_COUNT
              : DEFAULT_WORD_COUNT,
        };
      })
      .filter((r) => r.keyword)
      .slice(0, MAX_ROWS);
    if (parsed.length === 0) {
      alert("No valid keywords found in CSV.");
      return;
    }
    setRows(parsed);
    setMode("manual");
  }

  function setRowState(id: string, update: Partial<RunState>) {
    setRunStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: "pending", message: "" }), ...update },
    }));
  }

  async function runBatch() {
    const valid = rows.filter((r) => r.keyword.trim());
    if (valid.length === 0) {
      alert("Enter at least one keyword.");
      return;
    }

    setIsRunning(true);
    setOverallStatus(`Running ${valid.length} keywords sequentially...`);

    // Step 1: create every post in Supabase up front so they all exist
    // before any pipeline kicks off.
    setOverallStatus("Creating post records...");
    const postIdMap = new Map<string, string>();
    for (const row of valid) {
      setRowState(row.id, { status: "creating", message: "Creating post..." });
      try {
        const res = await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            primary_keyword: row.keyword.trim(),
            search_intent: row.search_intent,
            post_type: row.post_type,
            word_count: row.word_count,
          }),
        });
        if (!res.ok) throw new Error(`Failed to create: ${res.statusText}`);
        const data = await res.json();
        const postId = data.post?.id;
        if (!postId) throw new Error("No post id returned");
        postIdMap.set(row.id, postId);
        setRowState(row.id, {
          status: "pending",
          message: "Queued for pipeline...",
          postId,
        });
      } catch (err) {
        setRowState(row.id, {
          status: "error",
          message: "Create failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Step 2: run the full pipeline sequentially for each post that was
    // created successfully. One kicks off the next; there is no human gate.
    let successCount = 0;
    let failCount = 0;
    for (const row of valid) {
      const postId = postIdMap.get(row.id);
      if (!postId) {
        failCount++;
        continue;
      }

      setOverallStatus(
        `(${successCount + failCount + 1}/${valid.length}) Running "${row.keyword}"...`
      );
      setRowState(row.id, { status: "brief", message: "Generating brief..." });

      try {
        const res = await fetch("/api/content/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            postId,
            keyword: row.keyword.trim(),
            postType: row.post_type,
            searchIntent: row.search_intent,
            wordCount: row.word_count,
          }),
        });
        if (!res.ok) throw new Error(`Batch request failed: ${res.statusText}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let completeEvent: Record<string, unknown> | null = null;
        let errored: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === "stage") {
                const stage = ev.stage as RowStatus;
                setRowState(row.id, {
                  status: stage,
                  message: ev.message || stage,
                });
              } else if (ev.type === "status") {
                setRowState(row.id, { message: ev.message });
              } else if (ev.type === "complete") {
                completeEvent = ev;
              } else if (ev.type === "error") {
                errored = ev.error || "Unknown error";
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
            }
          }
        }

        if (errored) throw new Error(errored);

        if (completeEvent) {
          setRowState(row.id, {
            status: "complete",
            message: `Done (${completeEvent.wordCount} words)`,
            wordCount: completeEvent.wordCount as number,
          });
          successCount++;
        } else {
          // Stream ended without a "complete" event. This can happen when
          // Vercel cuts the serverless function off mid-stream, or when
          // the network drops before the last event flushes. Don't give
          // up — the pipeline may still have saved state to Supabase.
          // Fall through to the DB status check below.
          throw new Error(
            "Stream ended without a complete event — checking DB for saved state..."
          );
        }
      } catch (err) {
        // Before marking as failed, verify the DB state. The pipeline
        // saves state after every stage (brief → draft → edit), so the
        // row may actually be done even if the stream died.
        try {
          const checkRes = await fetch(`/api/content`);
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const dbPost = (checkData.posts || []).find(
              (p: { id: string; status: string; word_count: number | null }) =>
                p.id === postId
            );
            if (dbPost?.status === "edited") {
              setRowState(row.id, {
                status: "complete",
                message: `Done (${dbPost.word_count || "?"} words, recovered from DB)`,
                wordCount: dbPost.word_count || 0,
              });
              successCount++;
              continue;
            }
            if (dbPost?.status === "draft_complete") {
              setRowState(row.id, {
                status: "error",
                message: "Write complete, edit failed",
                error: err instanceof Error ? err.message : String(err),
                postId,
              });
              failCount++;
              continue;
            }
          }
        } catch {
          /* fall through */
        }
        setRowState(row.id, {
          status: "error",
          message: "Pipeline failed",
          error: err instanceof Error ? err.message : String(err),
          postId,
        });
        failCount++;
      }
    }

    setOverallStatus(
      `Done! ${successCount} succeeded, ${failCount} failed.`
    );
    setIsRunning(false);
  }

  const statusBadge = (state?: RunState) => {
    if (!state || state.status === "pending") {
      return "bg-gray-100 text-gray-600";
    }
    if (state.status === "complete") return "bg-emerald-100 text-emerald-700";
    if (state.status === "error") return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Bulk Batch Runner</h1>
          <p className="mt-1 text-sm text-body">
            Run the full pipeline (brief → write → edit) on up to {MAX_ROWS} keywords sequentially. One kicks off the next automatically.
          </p>
        </div>
        <Link
          href="/content"
          className="text-sm text-body hover:text-heading"
        >
          ← Back to Content
        </Link>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg mb-4 w-fit">
        <button
          onClick={() => setMode("manual")}
          disabled={isRunning}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === "manual"
              ? "bg-white text-heading shadow-sm"
              : "text-body hover:text-heading"
          }`}
        >
          Manual Entry
        </button>
        <button
          onClick={() => setMode("csv")}
          disabled={isRunning}
          className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === "csv"
              ? "bg-white text-heading shadow-sm"
              : "text-body hover:text-heading"
          }`}
        >
          Paste CSV
        </button>
      </div>

      {mode === "csv" && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-heading mb-2">
            CSV — columns: keyword, intent, post_type, word_count
          </label>
          <textarea
            className="w-full h-48 rounded-xl border border-gray-300 p-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-400"
            placeholder={`keyword,intent,post_type,word_count\nwebinar analytics,informational,supporting,1300\nb2b webinar software,commercial,comparison,1500`}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            disabled={isRunning}
          />
          <button
            onClick={parseCSV}
            disabled={isRunning || !csvText.trim()}
            className="mt-3 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40"
          >
            Parse CSV
          </button>
        </div>
      )}

      {mode === "manual" && (
        <>
          {/* Manual row table */}
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">#</th>
                  <th className="px-4 py-3">Keyword</th>
                  <th className="px-4 py-3 w-44">Intent</th>
                  <th className="px-4 py-3 w-36">Post Type</th>
                  <th className="px-4 py-3 w-28">Words</th>
                  <th className="px-4 py-3 w-44">Status</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const state = runStates[row.id];
                  return (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={row.keyword}
                          onChange={(e) => updateRow(row.id, { keyword: e.target.value })}
                          disabled={isRunning}
                          placeholder="e.g. webinar analytics platform"
                          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400 focus:border-brand-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={row.search_intent}
                          onChange={(e) => updateRow(row.id, { search_intent: e.target.value })}
                          disabled={isRunning}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                        >
                          {INTENTS.map((i) => (
                            <option key={i.value} value={i.value}>
                              {i.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={row.post_type}
                          onChange={(e) => updateRow(row.id, { post_type: e.target.value })}
                          disabled={isRunning}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                        >
                          {POST_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={400}
                          max={4000}
                          step={100}
                          value={row.word_count}
                          onChange={(e) => updateRow(row.id, { word_count: parseInt(e.target.value) || DEFAULT_WORD_COUNT })}
                          disabled={isRunning}
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${statusBadge(state)}`}>
                            {state?.status || "pending"}
                          </span>
                          {state?.postId && (
                            <button
                              onClick={() => router.push(`/content/${state.postId}`)}
                              className="text-xs text-brand-500 hover:text-brand-600"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        {state?.message && (
                          <div className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]" title={state.message}>
                            {state.message}
                          </div>
                        )}
                        {state?.error && (
                          <div className="text-xs text-red-600 mt-0.5 truncate max-w-[180px]" title={state.error}>
                            {state.error}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {!isRunning && rows.length > 1 && (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="text-gray-400 hover:text-red-500 text-sm"
                            aria-label="Remove row"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={addRow}
              disabled={isRunning || rows.length >= MAX_ROWS}
              className="px-3 py-1.5 text-xs font-medium text-body bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              + Add row
            </button>
            <span className="text-xs text-gray-400">
              {rows.length}/{MAX_ROWS} rows
            </span>
          </div>
        </>
      )}

      {/* Run button + overall status */}
      <div className="flex items-center gap-4">
        <button
          onClick={runBatch}
          disabled={isRunning || rows.filter((r) => r.keyword.trim()).length === 0}
          className="px-6 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-40 shadow-sm inline-flex items-center gap-2"
        >
          {isRunning ? (
            <>
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Running...
            </>
          ) : (
            <>🚀 Run Batch</>
          )}
        </button>
        {overallStatus && (
          <span className="text-sm text-body">{overallStatus}</span>
        )}
      </div>
    </div>
  );
}
