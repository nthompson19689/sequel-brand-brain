"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ViewTab = "upcoming" | "calendar" | "series";

const EVENT_TYPES = ["webinar", "virtual_event", "in_person", "hybrid", "workshop", "ama"];
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  planning: { label: "Planning", color: "bg-gray-800/40 text-gray-400" },
  promoting: { label: "Promoting", color: "bg-purple-900/40 text-purple-400" },
  live: { label: "Live", color: "bg-red-900/40 text-red-400" },
  completed: { label: "Completed", color: "bg-blue-900/40 text-blue-400" },
  repurposed: { label: "Repurposed", color: "bg-emerald-900/40 text-emerald-400" },
};

const TYPE_COLORS: Record<string, string> = {
  webinar: "#7C3AED", virtual_event: "#3B82F6", in_person: "#10B981",
  hybrid: "#F59E0B", workshop: "#EC4899", ama: "#06B6D4",
};

export default function EventsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>("upcoming");
  const [statusFilter, setStatusFilter] = useState("all");

  // Create event form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("webinar");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDuration, setFormDuration] = useState("60");
  const [formAudience, setFormAudience] = useState("");
  const [formRegUrl, setFormRegUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Event detail
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedContent, setSelectedContent] = useState<any[]>([]);
  const [selectedStats, setSelectedStats] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // CSV registrants
  const [csvText, setCsvText] = useState("");

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!selectedId) { setSelectedEvent(null); setSelectedContent([]); return; }
    setDetailLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/events/${selectedId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedEvent(data.event);
          setSelectedContent(data.content || []);
          setSelectedStats(data.stats || null);
        }
      } catch { /* ignore */ }
      setDetailLoading(false);
    })();
  }, [selectedId]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function handleCreate() {
    if (!formName.trim()) return;
    setCreating(true);
    try {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: formName.trim(),
          event_type: formType,
          description: formDescription.trim() || null,
          event_date: formDate || null,
          duration_minutes: parseInt(formDuration) || 60,
          target_audience: formAudience.trim() || null,
          registration_url: formRegUrl.trim() || null,
        }),
      });
      setFormName(""); setFormDescription(""); setFormDate(""); setFormAudience(""); setFormRegUrl("");
      setShowCreateForm(false);
      await loadEvents();
    } catch { /* ignore */ }
    setCreating(false);
  }

  async function handlePromote() {
    if (!selectedId) return;
    setActionStatus("Generating promotion...");
    try {
      await fetch("/api/events/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: selectedId }),
      });
      setActionStatus("Promotion generated!");
      // Refresh detail
      const res = await fetch(`/api/events/${selectedId}`);
      if (res.ok) { const d = await res.json(); setSelectedEvent(d.event); setSelectedContent(d.content || []); }
      await loadEvents();
    } catch { setActionStatus("Failed"); }
    setTimeout(() => setActionStatus(null), 3000);
  }

  async function handleFollowUp(includeRecap: boolean) {
    if (!selectedId) return;
    setActionStatus("Generating follow-up...");
    try {
      await fetch("/api/events/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: selectedId, include_recap_blog: includeRecap }),
      });
      setActionStatus("Follow-up generated!");
      const res = await fetch(`/api/events/${selectedId}`);
      if (res.ok) { const d = await res.json(); setSelectedContent(d.content || []); }
    } catch { setActionStatus("Failed"); }
    setTimeout(() => setActionStatus(null), 3000);
  }

  async function handleGenerateQuestions() {
    if (!selectedId) return;
    setActionStatus("Generating questions...");
    try {
      await fetch("/api/events/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: selectedId, generate: true }),
      });
      setActionStatus("Questions generated!");
    } catch { setActionStatus("Failed"); }
    setTimeout(() => setActionStatus(null), 3000);
  }

  async function handleCSVImport() {
    if (!selectedId || !csvText.trim()) return;
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return;
    const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
    const registrants = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const r: Record<string, string> = {};
      headers.forEach((h, i) => { r[h] = cols[i] || ""; });
      return {
        first_name: r.first_name || (r.name || "").split(" ")[0] || "",
        last_name: r.last_name || (r.name || "").split(" ").slice(1).join(" ") || "",
        email: r.email || null,
        company: r.company || r.organization || null,
        title: r.title || null,
        attended: r.attended === "Yes" || r.attended === "yes" || r.attended === "true",
      };
    }).filter(r => r.first_name);

    await fetch("/api/events/registrants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: selectedId, registrants }),
    });
    setCsvText("");
    const res = await fetch(`/api/events/${selectedId}`);
    if (res.ok) { const d = await res.json(); setSelectedStats(d.stats); }
    await loadEvents();
  }

  async function handleContentAction(contentId: string, status: string) {
    await fetch("/api/events/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contentId, status }),
    });
    if (selectedId) {
      const res = await fetch(`/api/events/${selectedId}`);
      if (res.ok) { const d = await res.json(); setSelectedContent(d.content || []); }
    }
  }

  const filtered = statusFilter === "all" ? events : events.filter(e => e.status === statusFilter);
  const upcoming = filtered.filter(e => e.event_date && new Date(e.event_date) >= new Date());
  // const past = filtered.filter(e => !e.event_date || new Date(e.event_date) < new Date());

  // Aggregate metrics
  const totalRegs = events.reduce((s, e) => s + (e.registration_count || 0), 0);
  const totalAttendance = events.reduce((s, e) => s + (e.attendance_count || 0), 0);
  const avgAttRate = totalRegs > 0 ? Math.round((totalAttendance / totalRegs) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Events</h1>
            <p className="text-sm text-gray-400 mt-1">{actionStatus || `${events.length} events`}</p>
          </div>
          <button onClick={() => setShowCreateForm(!showCreateForm)} className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors inline-flex items-center gap-2">
            {showCreateForm ? "← Back" : (
              <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>New Event</>
            )}
          </button>
        </div>

        {/* Metrics bar */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Events", value: events.length },
            { label: "Total Registrations", value: totalRegs },
            { label: "Avg Attendance Rate", value: `${avgAttRate}%` },
            { label: "Upcoming", value: upcoming.length },
          ].map((m) => (
            <div key={m.label} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-3 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{m.label}</p>
              <p className="text-lg font-bold text-white">{m.value}</p>
            </div>
          ))}
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create Event</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Event Name *</label><input value={formName} onChange={e => setFormName(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Type</label><select value={formType} onChange={e => setFormType(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">{EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
              </div>
              <div><label className="text-xs font-medium text-gray-400 block mb-1">Description</label><textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none resize-none" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Date & Time</label><input type="datetime-local" value={formDate} onChange={e => setFormDate(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Duration (min)</label><input value={formDuration} onChange={e => setFormDuration(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Target Audience</label><input value={formAudience} onChange={e => setFormAudience(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" placeholder="CMOs at B2B SaaS" /></div>
              </div>
              <div><label className="text-xs font-medium text-gray-400 block mb-1">Registration URL</label><input value={formRegUrl} onChange={e => setFormRegUrl(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
              <button onClick={handleCreate} disabled={!formName.trim() || creating} className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">{creating ? "Creating..." : "Create Event"}</button>
            </div>
          </div>
        )}

        {/* View tabs */}
        {!showCreateForm && !selectedId && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-0.5">
                {(["upcoming", "calendar"] as const).map(tab => (
                  <button key={tab} onClick={() => setViewTab(tab)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${viewTab === tab ? "bg-[#7C3AED] text-white" : "text-gray-400 hover:text-white"}`}>{tab}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {["all", "planning", "promoting", "completed"].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${statusFilter === s ? "bg-[#7C3AED] text-white" : "bg-[#0F0A1A] text-gray-400 border border-[#2A2040]"}`}>{s}</button>
                ))}
              </div>
            </div>

            {/* Event cards */}
            {viewTab === "upcoming" && (
              <div className="space-y-3">
                {loading ? <p className="text-center py-12 text-gray-500 text-sm">Loading...</p> :
                filtered.length === 0 ? <p className="text-center py-12 text-gray-500 text-sm">No events. Create one to get started.</p> :
                filtered.map(evt => (
                  <button key={evt.id} onClick={() => setSelectedId(evt.id)} className="w-full text-left bg-[#1A1228] border border-[#2A2040] rounded-xl p-5 hover:border-[#7C3AED]/40 transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[evt.event_type] || "#7C3AED" }} />
                          <h3 className="text-sm font-semibold text-white">{evt.event_name}</h3>
                        </div>
                        <p className="text-xs text-gray-500">{evt.event_type.replace(/_/g, " ")} · {evt.event_date ? new Date(evt.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Date TBD"} · {evt.duration_minutes}min</p>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_LABELS[evt.status]?.color || ""}`}>{STATUS_LABELS[evt.status]?.label || evt.status}</span>
                    </div>
                    {evt.description && <p className="text-xs text-gray-400 line-clamp-2 mb-2">{evt.description}</p>}
                    <div className="flex items-center gap-4 text-[10px] text-gray-600">
                      <span>{evt.registration_count || 0} registered</span>
                      <span>{evt.attendance_count || 0} attended</span>
                      <span>{(evt.event_content || []).length} content pieces</span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Calendar view */}
            {viewTab === "calendar" && (
              <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                <div className="grid grid-cols-7 gap-1 text-center">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                    <div key={d} className="text-[10px] text-gray-500 font-medium py-2">{d}</div>
                  ))}
                  {Array.from({ length: 35 }, (_, i) => {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                    const day = i - firstDay.getDay() + 1;
                    const date = new Date(now.getFullYear(), now.getMonth(), day);
                    const isCurrentMonth = date.getMonth() === now.getMonth();
                    const dateStr = date.toISOString().split("T")[0];
                    const dayEvents = events.filter(e => e.event_date && e.event_date.startsWith(dateStr));

                    return (
                      <div key={i} className={`min-h-[60px] p-1 rounded-lg border ${isCurrentMonth ? "border-[#2A2040]" : "border-transparent opacity-30"}`}>
                        <p className={`text-[10px] ${date.toDateString() === now.toDateString() ? "text-purple-400 font-bold" : "text-gray-500"}`}>{day}</p>
                        {dayEvents.map(e => (
                          <button key={e.id} onClick={() => setSelectedId(e.id)} className="w-full mt-0.5 text-left">
                            <div className="text-[8px] px-1 py-0.5 rounded truncate text-white" style={{ backgroundColor: TYPE_COLORS[e.event_type] || "#7C3AED" }}>
                              {e.event_name}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Event Detail ── */}
        {selectedId && !showCreateForm && (
          <div>
            <button onClick={() => setSelectedId(null)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              Back to events
            </button>

            {detailLoading ? (
              <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto" /></div>
            ) : selectedEvent && (
              <div className="space-y-6">
                {/* Event header */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white mb-1">{selectedEvent.event_name}</h2>
                      <p className="text-xs text-gray-400">
                        {selectedEvent.event_type.replace(/_/g, " ")} · {selectedEvent.event_date ? new Date(selectedEvent.event_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Date TBD"} · {selectedEvent.duration_minutes}min
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_LABELS[selectedEvent.status]?.color || ""}`}>{STATUS_LABELS[selectedEvent.status]?.label}</span>
                  </div>
                  {selectedEvent.description && <p className="text-sm text-gray-300 mb-4">{selectedEvent.description}</p>}

                  {/* Stats */}
                  {selectedStats && (
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      <div className="bg-[#0F0A1A] rounded-lg p-2 text-center"><p className="text-[10px] text-gray-500">Registered</p><p className="text-sm font-bold text-white">{selectedStats.total_registrants}</p></div>
                      <div className="bg-[#0F0A1A] rounded-lg p-2 text-center"><p className="text-[10px] text-gray-500">Attended</p><p className="text-sm font-bold text-white">{selectedStats.total_attendees}</p></div>
                      <div className="bg-[#0F0A1A] rounded-lg p-2 text-center"><p className="text-[10px] text-gray-500">Att. Rate</p><p className="text-sm font-bold text-white">{selectedStats.attendance_rate}%</p></div>
                      <div className="bg-[#0F0A1A] rounded-lg p-2 text-center"><p className="text-[10px] text-gray-500">Hot Leads</p><p className="text-sm font-bold text-white">{selectedStats.hot_leads}</p></div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {["planning", "promoting"].includes(selectedEvent.status) && (
                      <button onClick={handlePromote} className="px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors">Generate Promotion</button>
                    )}
                    {selectedEvent.status === "completed" && (
                      <>
                        <button onClick={() => handleFollowUp(false)} className="px-3 py-1.5 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors">Generate Follow-up</button>
                        <button onClick={() => handleFollowUp(true)} className="px-3 py-1.5 text-xs font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 transition-colors">Follow-up + Recap Blog</button>
                      </>
                    )}
                    <button onClick={handleGenerateQuestions} className="px-3 py-1.5 text-xs font-medium text-gray-400 border border-[#2A2040] rounded-lg hover:bg-[#1A1228] transition-colors">Generate Reg Questions</button>
                  </div>
                </div>

                {/* CSV registrant import */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Import Registrants (CSV)</h3>
                  <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={4} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none font-mono resize-none mb-2" placeholder={`first_name,last_name,email,company,title,attended\nJane,Smith,jane@acme.com,Acme,VP Marketing,Yes`} />
                  <button onClick={handleCSVImport} disabled={!csvText.trim()} className="px-4 py-2 text-xs font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">Import</button>
                </div>

                {/* Generated content */}
                {selectedContent.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Generated Content ({selectedContent.length})</h3>
                    {selectedContent.map((c: any) => (
                      <div key={c.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-[#2A2040]">
                          <div>
                            <span className="text-xs font-semibold text-white capitalize">{c.content_type.replace(/_/g, " ")}</span>
                            {c.subject_line && <span className="text-xs text-gray-500 ml-2">— {c.subject_line}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_LABELS[c.status]?.color || "bg-gray-800/40 text-gray-400"}`}>{c.status}</span>
                            <button onClick={() => navigator.clipboard.writeText(c.body)} className="px-2 py-1 text-[10px] font-medium text-gray-400 border border-[#2A2040] rounded hover:bg-[#0F0A1A] transition-colors">Copy</button>
                            {c.status === "draft" && <button onClick={() => handleContentAction(c.id, "approved")} className="px-2 py-1 text-[10px] font-medium text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20 transition-colors">Approve</button>}
                            {c.status === "approved" && <button onClick={() => handleContentAction(c.id, "published")} className="px-2 py-1 text-[10px] font-medium text-blue-400 border border-blue-800/30 rounded hover:bg-blue-900/20 transition-colors">Published</button>}
                          </div>
                        </div>
                        <div className="p-4 max-h-[250px] overflow-y-auto">
                          <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{c.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
