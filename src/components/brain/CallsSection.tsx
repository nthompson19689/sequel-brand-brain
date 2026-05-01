"use client";

import { useState, useEffect, useCallback } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

const CALL_TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  sales: "Sales",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  open_opp: "Open Opp",
  prospect_won: "Closed Won",
  prospect_lost: "Closed Lost",
};

const CALL_TYPE_COLORS: Record<string, string> = {
  customer: "bg-blue-100 text-blue-700 border-blue-200",
  sales: "bg-purple-100 text-purple-700 border-purple-200",
  closed_won: "bg-emerald-100 text-emerald-700 border-emerald-200",
  closed_lost: "bg-red-100 text-red-700 border-red-200",
  open_opp: "bg-amber-100 text-amber-700 border-amber-200",
  prospect_won: "bg-emerald-100 text-emerald-700 border-emerald-200",
  prospect_lost: "bg-red-100 text-red-700 border-red-200",
};

const SENTIMENT_DOT: Record<string, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-gray-400",
  negative: "bg-red-500",
};

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

interface FathomListItem {
  id: string;
  title: string | null;
  date: string | null;
  duration_seconds: number | null;
  participants: string[];
  folder: string | null;
  imported: boolean;
}

interface ImportedCall {
  id: string;
  fathom_call_id: string | null;
  call_type: string;
  company_name: string | null;
  contact_name: string | null;
  call_date: string | null;
  summary: string | null;
  sentiment: string | null;
  churn_risk: boolean | null;
  needs_review: boolean;
  created_at: string;
}

export default function CallsSection() {
  const [fathomCalls, setFathomCalls] = useState<FathomListItem[] | null>(null);
  const [loadingFathom, setLoadingFathom] = useState(false);
  const [fathomError, setFathomError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const [imported, setImported] = useState<ImportedCall[]>([]);
  const [loadingImported, setLoadingImported] = useState(true);

  const loadImported = useCallback(async () => {
    setLoadingImported(true);
    try {
      const res = await fetch("/api/brain/calls");
      if (res.ok) {
        const data = await res.json();
        setImported(data.calls || []);
      }
    } catch { /* ignore */ }
    setLoadingImported(false);
  }, []);

  useEffect(() => {
    loadImported();
  }, [loadImported]);

  async function fetchFromFathom() {
    setLoadingFathom(true);
    setFathomError(null);
    try {
      const res = await fetch("/api/brain/calls/fathom?limit=50");
      const data = await res.json();
      if (!res.ok) {
        setFathomError(data.error || `Fathom error (${res.status})`);
        setFathomCalls([]);
      } else {
        setFathomCalls(data.calls || []);
      }
    } catch (err) {
      setFathomError(err instanceof Error ? err.message : String(err));
      setFathomCalls([]);
    }
    setLoadingFathom(false);
  }

  async function importCall(fathomId: string) {
    setImportingId(fathomId);
    try {
      const res = await fetch("/api/brain/calls/fathom/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fathom_call_id: fathomId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Import failed");
      } else {
        // Mark as imported in the Fathom list
        setFathomCalls((prev) =>
          prev ? prev.map((c) => (c.id === fathomId ? { ...c, imported: true } : c)) : prev,
        );
        await loadImported();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
    setImportingId(null);
  }

  async function reclassify(id: string, call_type: string) {
    // Optimistic
    setImported((prev) =>
      prev.map((c) => (c.id === id ? { ...c, call_type, needs_review: false } : c)),
    );
    try {
      await fetch(`/api/brain/calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_type }),
      });
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      {/* ── Section 1: Import from Fathom ───────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Import from Fathom</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Pull recent calls from your Fathom workspace. Imports run through classification + embedding.
            </p>
          </div>
          <button
            onClick={fetchFromFathom}
            disabled={loadingFathom}
            className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {loadingFathom ? "Fetching…" : fathomCalls ? "Refresh" : "Fetch Recent Calls"}
          </button>
        </div>

        {fathomError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {fathomError}
          </div>
        )}

        {fathomCalls && fathomCalls.length === 0 && !fathomError && (
          <p className="text-xs text-gray-500 italic">No calls returned from Fathom.</p>
        )}

        {fathomCalls && fathomCalls.length > 0 && (
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {fathomCalls.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {c.title || "(untitled call)"}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                    {fmtDate(c.date)}
                    {c.duration_seconds && <> · {fmtDuration(c.duration_seconds)}</>}
                    {c.folder && <> · {c.folder}</>}
                    {c.participants.length > 0 && <> · {c.participants.join(", ")}</>}
                  </div>
                </div>
                <div className="ml-3 shrink-0">
                  {c.imported ? (
                    <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                      ✓ Imported
                    </span>
                  ) : (
                    <button
                      onClick={() => importCall(c.id)}
                      disabled={importingId === c.id}
                      className="text-xs px-3 py-1 font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
                    >
                      {importingId === c.id ? "Importing…" : "Import"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: Imported Calls ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Imported Calls <span className="text-gray-400 font-normal">({imported.length})</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Reclassify any call from the dropdown. Yellow ⚠ flag = classification needs review.
            </p>
          </div>
          <button onClick={loadImported} className="text-xs text-gray-500 hover:text-gray-900">
            Refresh
          </button>
        </div>

        {loadingImported ? (
          <p className="text-xs text-gray-400 py-4 text-center">Loading…</p>
        ) : imported.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-4 text-center">
            No calls imported yet. Use the panel above to pull from Fathom.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="text-left py-2 font-medium">Company</th>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-left py-2 font-medium">Date</th>
                  <th className="text-left py-2 font-medium">Sentiment</th>
                  <th className="text-left py-2 font-medium">Reclassify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {imported.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        {c.needs_review && (
                          <span
                            title="Classification flagged for review"
                            className="inline-flex items-center justify-center w-5 h-5 bg-yellow-100 text-yellow-700 border border-yellow-300 rounded text-[10px] font-bold"
                          >
                            ⚠
                          </span>
                        )}
                        <div>
                          <div className="font-medium text-gray-900">{c.company_name || "—"}</div>
                          {c.contact_name && (
                            <div className="text-xs text-gray-500">{c.contact_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`text-xs px-2 py-0.5 border rounded-full ${
                          CALL_TYPE_COLORS[c.call_type] || "bg-gray-100 text-gray-700 border-gray-200"
                        }`}
                      >
                        {CALL_TYPE_LABELS[c.call_type] || c.call_type}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600 whitespace-nowrap">
                      {fmtDate(c.call_date || c.created_at)}
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${SENTIMENT_DOT[c.sentiment || "neutral"]}`} />
                        <span className="text-xs text-gray-600 capitalize">
                          {c.sentiment || "neutral"}
                        </span>
                        {c.churn_risk && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded">
                            churn
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <select
                        value={c.call_type}
                        onChange={(e) => reclassify(c.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:border-gray-900 focus:outline-none"
                      >
                        <option value="customer">Customer</option>
                        <option value="sales">Sales</option>
                        <option value="closed_won">Closed Won</option>
                        <option value="closed_lost">Closed Lost</option>
                        <option value="open_opp">Open Opp</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
