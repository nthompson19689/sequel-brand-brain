"use client";

import { useAuth } from "@/contexts/AuthContext";
import VoiceInput from "@/components/ui/VoiceInput";
import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface Ticket {
  id: string;
  type: "workflow_request" | "bug_report";
  status: string;
  goal?: string;
  process?: string;
  due_date?: string;
  title?: string;
  description?: string;
  page_feature?: string;
  severity?: string;
  screenshot_url?: string;
  created_at: string;
  updated_at: string;
  assignee?: { id: string; full_name: string } | null;
}

interface Comment {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; full_name: string; avatar_url?: string } | null;
}

const PAGE_FEATURES = [
  "Chat",
  "Agents",
  "Content",
  "Decks",
  "LinkedIn",
  "Competitors",
  "SEO",
  "Brain",
  "Settings",
  "Other",
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-blue-500/20 text-blue-400" },
  { value: "medium", label: "Medium", color: "bg-yellow-500/20 text-yellow-400" },
  { value: "high", label: "High", color: "bg-orange-500/20 text-orange-400" },
  { value: "critical", label: "Critical", color: "bg-red-500/20 text-red-400" },
];

function statusBadge(status: string) {
  const map: Record<string, string> = {
    new: "bg-blue-500/20 text-blue-400",
    in_progress: "bg-yellow-500/20 text-yellow-400",
    investigating: "bg-yellow-500/20 text-yellow-400",
    completed: "bg-green-500/20 text-green-400",
    fixed: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-red-400",
    wont_fix: "bg-red-500/20 text-red-400",
  };
  return map[status] || "bg-gray-500/20 text-gray-400";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"submit" | "my">("submit");

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0F0A1A]">
        <div className="w-8 h-8 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0F0A1A]">
        <p className="text-[#A09CB0]">Please sign in to submit requests.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Requests</h1>
        <p className="text-[#A09CB0] text-sm mb-8">Submit workflow requests or report bugs</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 bg-[#1A1228] rounded-xl p-1 w-fit">
          {(["submit", "my"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? "bg-[#7C3AED] text-white" : "text-[#A09CB0] hover:text-white"
              }`}
            >
              {t === "submit" ? "Submit Request" : "My Requests"}
            </button>
          ))}
        </div>

        {tab === "submit" ? <SubmitForm /> : <MyTickets userId={profile.id} />}
      </div>
    </div>
  );
}

// ─── Submit Form ────────────────────────────────────────────────────────────────

function SubmitForm() {
  const [ticketType, setTicketType] = useState<"workflow_request" | "bug_report">("workflow_request");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Workflow fields
  const [goal, setGoal] = useState("");
  const [process, setProcess] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Bug fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pageFeature, setPageFeature] = useState("");
  const [severity, setSeverity] = useState("medium");

  const resetForm = () => {
    setGoal(""); setProcess(""); setDueDate("");
    setTitle(""); setDescription(""); setPageFeature(""); setSeverity("medium");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    const body: Record<string, unknown> = { type: ticketType };
    if (ticketType === "workflow_request") {
      body.goal = goal;
      body.process = process || undefined;
      body.due_date = dueDate || undefined;
    } else {
      body.title = title;
      body.description = description || undefined;
      body.page_feature = pageFeature || undefined;
      body.severity = severity;
    }

    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");
      setSuccess(true);
      resetForm();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full rounded-xl border border-[#2A2040] bg-[#0F0A1A] px-4 py-3 text-sm text-white placeholder-[#6B6680] focus:outline-none focus:ring-1 focus:ring-[#7C3AED] focus:border-[#7C3AED]";
  const labelCls = "block text-sm font-medium text-[#A09CB0] mb-1.5";

  return (
    <div className="bg-[#1A1228] border border-[#2A2040] rounded-2xl p-6">
      {/* Type toggle */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => setTicketType("workflow_request")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
            ticketType === "workflow_request"
              ? "border-[#7C3AED] bg-[#7C3AED]/10 text-white"
              : "border-[#2A2040] text-[#A09CB0] hover:border-[#3A3050]"
          }`}
        >
          🔧 Workflow Request
        </button>
        <button
          type="button"
          onClick={() => setTicketType("bug_report")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
            ticketType === "bug_report"
              ? "border-[#7C3AED] bg-[#7C3AED]/10 text-white"
              : "border-[#2A2040] text-[#A09CB0] hover:border-[#3A3050]"
          }`}
        >
          🐛 Bug Report
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {ticketType === "workflow_request" ? (
          <>
            <div>
              <label className={labelCls}>Goal *</label>
              <p className="text-xs text-[#6B6680] mb-2">How will this workflow be used?</p>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                required
                className={inputCls}
                placeholder="e.g., Automatically generate weekly competitor reports"
              />
            </div>
            <div>
              <label className={labelCls}>Process</label>
              <p className="text-xs text-[#6B6680] mb-2">What would you ask a human to do? Use the mic to describe it.</p>
              <VoiceInput
                as="textarea"
                value={process}
                onChange={setProcess}
                placeholder="Describe the step-by-step process you'd give to a person..."
                rows={5}
                micPosition="inside"
                micSize="md"
                className={inputCls + " min-h-[120px]"}
              />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={inputCls}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelCls}>Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className={inputCls}
                placeholder="Brief description of the issue"
              />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <p className="text-xs text-[#6B6680] mb-2">What happened? Use the mic to describe it.</p>
              <VoiceInput
                as="textarea"
                value={description}
                onChange={setDescription}
                placeholder="Describe the bug, what you expected, and what happened instead..."
                rows={5}
                micPosition="inside"
                micSize="md"
                className={inputCls + " min-h-[120px]"}
              />
            </div>
            <div>
              <label className={labelCls}>Page / Feature</label>
              <select
                value={pageFeature}
                onChange={(e) => setPageFeature(e.target.value)}
                className={inputCls}
              >
                <option value="">Select...</option>
                {PAGE_FEATURES.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Severity</label>
              <div className="flex gap-2">
                {SEVERITY_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSeverity(s.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      severity === s.value
                        ? "border-[#7C3AED] bg-[#7C3AED]/10 text-white"
                        : "border-[#2A2040] text-[#A09CB0] hover:border-[#3A3050]"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">Request submitted successfully!</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 text-sm font-semibold text-white bg-[#7C3AED] rounded-xl hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
        >
          {loading ? "Submitting..." : "Submit Request"}
        </button>
      </form>
    </div>
  );
}

// ─── My Tickets ─────────────────────────────────────────────────────────────────

function MyTickets({ userId }: { userId: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets");
      const data = await res.json();
      if (data.tickets) setTickets(data.tickets);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-[#6B6680] text-sm">No requests submitted yet.</p>
        <p className="text-[#6B6680] text-xs mt-1">Switch to &quot;Submit Request&quot; to create one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tickets.map((t) => (
        <div key={t.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
            className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#1e1630] transition-colors"
          >
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
              t.type === "workflow_request" ? "bg-purple-500/20 text-purple-400" : "bg-orange-500/20 text-orange-400"
            }`}>
              {t.type === "workflow_request" ? "Workflow" : "Bug"}
            </span>
            <span className="flex-1 text-sm text-white truncate">
              {t.type === "workflow_request" ? t.goal : t.title}
            </span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${statusBadge(t.status)}`}>
              {t.status.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-[#6B6680]">{formatDate(t.created_at)}</span>
            <svg className={`w-4 h-4 text-[#6B6680] transition-transform ${expandedId === t.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {expandedId === t.id && (
            <div className="px-5 pb-5 border-t border-[#2A2040] pt-4">
              <TicketDetails ticket={t} />
              <CommentThread ticketId={t.id} userId={userId} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Ticket Details ─────────────────────────────────────────────────────────────

function TicketDetails({ ticket: t }: { ticket: Ticket }) {
  const detailCls = "text-xs text-[#6B6680]";
  const valueCls = "text-sm text-white mt-0.5";

  return (
    <div className="grid grid-cols-2 gap-4 mb-4">
      {t.type === "workflow_request" ? (
        <>
          <div>
            <p className={detailCls}>Goal</p>
            <p className={valueCls}>{t.goal}</p>
          </div>
          {t.process && (
            <div className="col-span-2">
              <p className={detailCls}>Process</p>
              <p className={valueCls + " whitespace-pre-wrap"}>{t.process}</p>
            </div>
          )}
          {t.due_date && (
            <div>
              <p className={detailCls}>Due Date</p>
              <p className={valueCls}>{formatDate(t.due_date)}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div>
            <p className={detailCls}>Title</p>
            <p className={valueCls}>{t.title}</p>
          </div>
          {t.severity && (
            <div>
              <p className={detailCls}>Severity</p>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                SEVERITY_OPTIONS.find((s) => s.value === t.severity)?.color || ""
              }`}>
                {t.severity}
              </span>
            </div>
          )}
          {t.page_feature && (
            <div>
              <p className={detailCls}>Page / Feature</p>
              <p className={valueCls}>{t.page_feature}</p>
            </div>
          )}
          {t.description && (
            <div className="col-span-2">
              <p className={detailCls}>Description</p>
              <p className={valueCls + " whitespace-pre-wrap"}>{t.description}</p>
            </div>
          )}
        </>
      )}
      {t.assignee?.full_name && (
        <div>
          <p className={detailCls}>Assigned To</p>
          <p className={valueCls}>{t.assignee.full_name}</p>
        </div>
      )}
    </div>
  );
}

// ─── Comment Thread ─────────────────────────────────────────────────────────────

function CommentThread({ ticketId }: { ticketId: string; userId?: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/comments?ticket_id=${ticketId}`);
      const data = await res.json();
      if (data.comments) setComments(data.comments);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const postComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      const res = await fetch("/api/tickets/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId, body: newComment.trim() }),
      });
      const data = await res.json();
      if (data.comment) {
        setComments((prev) => [...prev, data.comment]);
        setNewComment("");
      }
    } catch {
      // ignore
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="mt-4 pt-4 border-t border-[#2A2040]">
      <p className="text-xs font-medium text-[#A09CB0] mb-3">Comments</p>

      {loading ? (
        <p className="text-xs text-[#6B6680]">Loading...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-[#6B6680] mb-3">No comments yet.</p>
      ) : (
        <div className="space-y-3 mb-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-[#2A2040] flex items-center justify-center text-xs font-medium text-[#A09CB0] shrink-0">
                {c.author?.full_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div>
                <p className="text-xs text-[#6B6680]">
                  <span className="text-white font-medium">{c.author?.full_name || "Unknown"}</span>
                  {" · "}
                  {formatDate(c.created_at)}
                </p>
                <p className="text-sm text-[#A09CB0] mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && postComment()}
          placeholder="Add a comment..."
          className="flex-1 rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white placeholder-[#6B6680] focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
        />
        <button
          onClick={postComment}
          disabled={posting || !newComment.trim()}
          className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-50 transition-colors"
        >
          {posting ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
