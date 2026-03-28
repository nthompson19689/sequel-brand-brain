"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
interface Post {
  id: string;
  title: string | null;
  primary_keyword: string;
  post_type: string | null;
  status: string;
  word_count: number | null;
  created_at: string;
  updated_at?: string;
}

const STATUS_COLS = [
  { key: "queued", label: "Queued", dot: "bg-gray-400" },
  { key: "brief_generated", label: "Brief", dot: "bg-blue-400" },
  { key: "brief_approved", label: "Approved", dot: "bg-brand-400" },
  { key: "draft_complete", label: "Draft", dot: "bg-amber-400" },
  { key: "edited", label: "Edited", dot: "bg-purple-400" },
  { key: "approved", label: "Review", dot: "bg-emerald-400" },
  { key: "published", label: "Complete", dot: "bg-emerald-500" },
];

const STATUS_META: Record<string, { label: string; color: string }> = {
  queued: { label: "Queued", color: "bg-gray-100 text-gray-600" },
  brief_generated: { label: "Brief Done", color: "bg-blue-100 text-blue-700" },
  brief_approved: { label: "Brief Approved", color: "bg-brand-100 text-brand-700" },
  draft_complete: { label: "Draft Done", color: "bg-amber-100 text-amber-700" },
  edited: { label: "Edited", color: "bg-purple-100 text-purple-700" },
  approved: { label: "In Review", color: "bg-emerald-100 text-emerald-700" },
  published: { label: "Complete", color: "bg-emerald-100 text-emerald-700" },
};

const TYPE_BADGE: Record<string, string> = {
  pillar: "bg-brand-100 text-brand-600",
  supporting: "bg-blue-100 text-blue-700",
  question: "bg-amber-100 text-amber-700",
  comparison: "bg-purple-100 text-purple-700",
};

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function ContentDashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/content")
      .then((r) => r.json())
      .then((d) => setPosts(d.posts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Filter and search
  const filtered = posts.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (p.title || "").toLowerCase().includes(q) ||
        p.primary_keyword.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sort: most recently updated first
  const sorted = [...filtered].sort((a, b) => {
    const dateA = new Date(a.updated_at || a.created_at).getTime();
    const dateB = new Date(b.updated_at || b.created_at).getTime();
    return dateB - dateA;
  });

  // Group for board view
  const grouped: Record<string, Post[]> = {};
  for (const col of STATUS_COLS) grouped[col.key] = [];
  for (const post of posts) {
    if (grouped[post.status]) grouped[post.status].push(post);
    else grouped["queued"]?.push(post);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-heading">Content Pipeline</h1>
          <p className="mt-1 text-sm text-body">{posts.length} posts across all stages</p>
        </div>
        <Link
          href="/content/import"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Content
        </Link>
      </div>

      {/* Controls: view toggle, search, filter */}
      <div className="flex items-center gap-3 mb-5">
        {/* View toggle */}
        <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              view === "list" ? "bg-white text-heading shadow-sm" : "text-body hover:text-heading"
            }`}
          >
            <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5m-16.5 4.5h16.5" />
            </svg>
            List
          </button>
          <button
            onClick={() => setView("board")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              view === "board" ? "bg-white text-heading shadow-sm" : "text-body hover:text-heading"
            }`}
          >
            <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            Board
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or keyword..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-white text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-border bg-white px-3 py-2 text-sm text-heading focus:border-brand-400 focus:outline-none"
        >
          <option value="all">All statuses</option>
          {STATUS_COLS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-body py-12 justify-center">
          <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          Loading pipeline...
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-border">
          <div className="text-4xl mb-4">📝</div>
          <h2 className="text-lg font-semibold text-heading mb-2">No content yet</h2>
          <p className="text-sm text-body mb-4">Import keywords to start your content pipeline.</p>
          <Link href="/content/import" className="text-sm text-brand-500 font-medium hover:text-brand-600">
            Import keywords →
          </Link>
        </div>
      ) : view === "list" ? (
        /* ═══ LIST VIEW ═══ */
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-4 px-4 py-2.5 bg-gray-50 border-b border-border text-[11px] font-semibold text-body uppercase tracking-wider">
            <div className="col-span-5">Title / Keyword</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1">Type</div>
            <div className="col-span-1 text-right">Words</div>
            <div className="col-span-2 text-right">Updated</div>
            <div className="col-span-1"></div>
          </div>

          {sorted.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-body">
              No posts match your search.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sorted.map((post) => {
                const meta = STATUS_META[post.status] || STATUS_META.queued;
                return (
                  <Link
                    key={post.id}
                    href={`/content/${post.id}`}
                    className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-gray-50 transition-colors group"
                  >
                    <div className="col-span-5 min-w-0">
                      <p className="text-sm font-medium text-heading truncate group-hover:text-brand-600 transition-colors">
                        {post.title || post.primary_keyword}
                      </p>
                      {post.title && (
                        <p className="text-xs text-body truncate mt-0.5">{post.primary_keyword}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="col-span-1">
                      {post.post_type && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_BADGE[post.post_type] || "bg-gray-100 text-gray-600"}`}>
                          {post.post_type}
                        </span>
                      )}
                    </div>
                    <div className="col-span-1 text-right text-xs text-body">
                      {post.word_count && post.word_count > 0 ? `${post.word_count.toLocaleString()}` : "—"}
                    </div>
                    <div className="col-span-2 text-right text-xs text-body">
                      {timeAgo(post.updated_at || post.created_at)}
                    </div>
                    <div className="col-span-1 text-right">
                      <span className="text-xs text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                        Open →
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ═══ BOARD VIEW ═══ */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUS_COLS.map((col) => (
            <div key={col.key} className="min-w-[220px] w-[220px] shrink-0">
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-xs font-semibold text-body uppercase tracking-wider">{col.label}</span>
                <span className="text-xs text-body ml-auto">{grouped[col.key]?.length || 0}</span>
              </div>
              <div className="space-y-2">
                {(grouped[col.key] || []).map((post) => (
                  <Link
                    key={post.id}
                    href={`/content/${post.id}`}
                    className="block bg-white rounded-xl border border-border p-3 hover:border-brand-200 hover:shadow-sm transition-all"
                  >
                    <p className="text-sm font-medium text-heading line-clamp-2 mb-1">
                      {post.title || post.primary_keyword}
                    </p>
                    <p className="text-xs text-body truncate mb-2">{post.primary_keyword}</p>
                    <div className="flex items-center gap-1.5">
                      {post.post_type && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_BADGE[post.post_type] || "bg-gray-100 text-gray-600"}`}>
                          {post.post_type}
                        </span>
                      )}
                      {post.word_count && post.word_count > 0 && (
                        <span className="text-[10px] text-body">{post.word_count.toLocaleString()}w</span>
                      )}
                    </div>
                  </Link>
                ))}
                {(grouped[col.key] || []).length === 0 && (
                  <div className="text-xs text-gray-300 text-center py-6 border border-dashed border-border rounded-xl">Empty</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
