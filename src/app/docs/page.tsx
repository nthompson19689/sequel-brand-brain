"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

/* eslint-disable @typescript-eslint/no-explicit-any */

type ViewTab = "articles" | "import" | "tickets" | "faqs" | "changelog" | "health";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-800/40 text-gray-400",
  review: "bg-amber-900/40 text-amber-400",
  published: "bg-emerald-900/40 text-emerald-400",
  archived: "bg-gray-800/40 text-gray-500",
  outdated: "bg-red-900/40 text-red-400",
};

export default function DocsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [viewTab, setViewTab] = useState<ViewTab>("articles");
  const [articles, setArticles] = useState<any[]>([]);
  const [, setCategories] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [changelogs, setChangelogs] = useState<any[]>([]);
  const [healthData, setHealthData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Import transcript form
  const [importText, setImportText] = useState("");
  const [importSource, setImportSource] = useState("support_call");
  const [importCustomer, setImportCustomer] = useState("");
  const [importCompany, setImportCompany] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  // Ticket import
  const [ticketCsv, setTicketCsv] = useState("");
  const [ticketAnalysis, setTicketAnalysis] = useState<any>(null);
  const [analyzingTickets, setAnalyzingTickets] = useState(false);

  // Changelog
  const [changelogDesc, setChangelogDesc] = useState("");
  const [changelogVersion, setChangelogVersion] = useState("");
  const [generatingChangelog, setGeneratingChangelog] = useState(false);

  // Create article
  const [showCreateArticle, setShowCreateArticle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newProductArea, setNewProductArea] = useState("");

  const loadArticles = useCallback(async () => {
    try {
      const [aRes, cRes] = await Promise.all([
        fetch("/api/docs/articles"),
        fetch("/api/docs/categories"),
      ]);
      if (aRes.ok) setArticles((await aRes.json()).articles || []);
      if (cRes.ok) setCategories((await cRes.json()).categories || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadArticles(); }, [loadArticles]);

  useEffect(() => {
    if (viewTab === "faqs") {
      fetch("/api/docs/faqs").then(r => r.ok ? r.json() : { faqs: [] }).then(d => setFaqs(d.faqs || []));
    }
    if (viewTab === "changelog") {
      fetch("/api/docs/changelog").then(r => r.ok ? r.json() : { changelogs: [] }).then(d => setChangelogs(d.changelogs || []));
    }
    if (viewTab === "health") {
      fetch("/api/docs/health").then(r => r.ok ? r.json() : { health: null }).then(d => setHealthData(d));
    }
  }, [viewTab]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function handleImportTranscript() {
    if (!importText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/docs/import-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript_text: importText.trim(),
          transcript_source: importSource,
          customer_name: importCustomer.trim() || null,
          customer_company: importCompany.trim() || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setImportResult(data);
        setImportText("");
        await loadArticles();
      }
    } catch { /* ignore */ }
    setImporting(false);
  }

  async function handleTicketImport() {
    if (!ticketCsv.trim()) return;
    const lines = ticketCsv.trim().split("\n");
    if (lines.length < 2) return;
    const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
    const tickets = lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      const t: Record<string, string> = {};
      headers.forEach((h, i) => { t[h] = cols[i] || ""; });
      return t;
    });

    await fetch("/api/docs/analyze-tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickets }),
    });
    setTicketCsv("");
    setActionStatus("Tickets imported");
    setTimeout(() => setActionStatus(null), 3000);
  }

  async function handleAnalyzeTickets() {
    setAnalyzingTickets(true);
    try {
      const res = await fetch("/api/docs/analyze-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analyze: true }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicketAnalysis(data.analysis || data);
        await loadArticles();
      }
    } catch { /* ignore */ }
    setAnalyzingTickets(false);
  }

  async function handleGenerateChangelog() {
    if (!changelogDesc.trim()) return;
    setGeneratingChangelog(true);
    try {
      const res = await fetch("/api/docs/changelog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate: true, update_description: changelogDesc.trim(), version: changelogVersion.trim() || null }),
      });
      if (res.ok) {
        setChangelogDesc(""); setChangelogVersion("");
        const d = await fetch("/api/docs/changelog").then(r => r.json());
        setChangelogs(d.changelogs || []);
        await loadArticles();
      }
    } catch { /* ignore */ }
    setGeneratingChangelog(false);
  }

  async function handleGenerateFaqs() {
    setActionStatus("Generating FAQs...");
    try {
      await fetch("/api/docs/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate_from: "articles" }),
      });
      const d = await fetch("/api/docs/faqs").then(r => r.json());
      setFaqs(d.faqs || []);
      setActionStatus("FAQs generated");
    } catch { setActionStatus("Failed"); }
    setTimeout(() => setActionStatus(null), 3000);
  }

  async function handleCreateArticle() {
    if (!newTitle.trim() || !newContent.trim()) return;
    await fetch("/api/docs/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), content_markdown: newContent.trim(), product_area: newProductArea.trim() || null }),
    });
    setNewTitle(""); setNewContent(""); setNewProductArea(""); setShowCreateArticle(false);
    await loadArticles();
  }

  async function handleArticleAction(id: string, status: string) {
    await fetch(`/api/docs/articles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadArticles();
  }

  const filtered = articles.filter(a => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (visibilityFilter !== "all" && a.visibility !== visibilityFilter) return false;
    return true;
  });

  const tabs: { id: ViewTab; label: string }[] = [
    { id: "articles", label: "Articles" },
    { id: "import", label: "Import" },
    { id: "tickets", label: "Tickets" },
    { id: "faqs", label: "FAQs" },
    { id: "changelog", label: "Changelog" },
    { id: "health", label: "Health" },
  ];

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Customer Docs</h1>
            <p className="text-sm text-gray-400 mt-1">{actionStatus || `${articles.length} articles`}</p>
          </div>
          <button onClick={() => setShowCreateArticle(!showCreateArticle)} className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors inline-flex items-center gap-2">
            {showCreateArticle ? "← Back" : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>New Article</>}
          </button>
        </div>

        {/* Create article form */}
        {showCreateArticle && (
          <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">New Article</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Title *</label><input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" placeholder="How to..." /></div>
                <div><label className="text-xs font-medium text-gray-400 block mb-1">Product Area</label><input value={newProductArea} onChange={e => setNewProductArea(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
              </div>
              <div><label className="text-xs font-medium text-gray-400 block mb-1">Content (Markdown) *</label><textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={12} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none font-mono resize-none" /></div>
              <button onClick={handleCreateArticle} disabled={!newTitle.trim() || !newContent.trim()} className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">Create Article</button>
            </div>
          </div>
        )}

        {/* Tabs */}
        {!showCreateArticle && (
          <>
            <div className="flex items-center gap-1 mb-6 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-0.5 w-fit">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setViewTab(tab.id)} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewTab === tab.id ? "bg-[#7C3AED] text-white" : "text-gray-400 hover:text-white"}`}>{tab.label}</button>
              ))}
            </div>

            {/* ── Articles Tab ── */}
            {viewTab === "articles" && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  {["all", "draft", "review", "published", "outdated", "archived"].map(s => (
                    <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${statusFilter === s ? "bg-[#7C3AED] text-white" : "bg-[#0F0A1A] text-gray-400 border border-[#2A2040]"}`}>{s}</button>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    {["all", "public", "internal"].map(v => (
                      <button key={v} onClick={() => setVisibilityFilter(v)} className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${visibilityFilter === v ? "bg-[#7C3AED] text-white" : "bg-[#0F0A1A] text-gray-400 border border-[#2A2040]"}`}>{v}</button>
                    ))}
                  </div>
                </div>

                {loading ? <p className="text-center py-12 text-gray-500 text-sm">Loading...</p> :
                filtered.length === 0 ? <p className="text-center py-12 text-gray-500 text-sm">No articles found.</p> :
                <div className="space-y-2">
                  {filtered.map(a => (
                    <div key={a.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-white truncate">{a.title}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[a.status] || ""}`}>{a.status}</span>
                          {a.visibility === "internal" && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900/40 text-blue-400">internal</span>}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{a.excerpt || a.content_markdown?.slice(0, 100)}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-600">
                          {a.product_area && <span>{a.product_area}</span>}
                          <span>{a.view_count || 0} views</span>
                          <span>👍 {a.helpful_yes || 0} 👎 {a.helpful_no || 0}</span>
                          <span>{a.source_type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        {a.status === "draft" && <button onClick={() => handleArticleAction(a.id, "review")} className="px-2 py-1 text-[10px] text-amber-400 border border-amber-800/30 rounded hover:bg-amber-900/20">→ Review</button>}
                        {a.status === "review" && <button onClick={() => handleArticleAction(a.id, "published")} className="px-2 py-1 text-[10px] text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20">Publish</button>}
                        {a.status === "outdated" && <button onClick={() => handleArticleAction(a.id, "review")} className="px-2 py-1 text-[10px] text-amber-400 border border-amber-800/30 rounded hover:bg-amber-900/20">Review</button>}
                        <button onClick={() => navigator.clipboard.writeText(a.content_markdown || "")} className="px-2 py-1 text-[10px] text-gray-400 border border-[#2A2040] rounded hover:bg-[#0F0A1A]">Copy</button>
                      </div>
                    </div>
                  ))}
                </div>}
              </div>
            )}

            {/* ── Import Tab ── */}
            {viewTab === "import" && (
              <div className="space-y-6">
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Import Transcript</h2>
                  <p className="text-xs text-gray-400 mb-4">Paste a support call, onboarding session, or training transcript. AI will extract questions, generate help articles, and identify documentation gaps.</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="text-xs font-medium text-gray-400 block mb-1">Source</label><select value={importSource} onChange={e => setImportSource(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:outline-none">{["support_call", "onboarding_call", "training_session", "sales_call", "customer_meeting"].map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></div>
                      <div><label className="text-xs font-medium text-gray-400 block mb-1">Customer Name</label><input value={importCustomer} onChange={e => setImportCustomer(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:outline-none" /></div>
                      <div><label className="text-xs font-medium text-gray-400 block mb-1">Company</label><input value={importCompany} onChange={e => setImportCompany(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:outline-none" /></div>
                    </div>
                    <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={10} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:outline-none font-mono resize-none" placeholder="Paste transcript here..." />
                    <button onClick={handleImportTranscript} disabled={!importText.trim() || importing} className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">{importing ? "Analyzing..." : "Analyze & Generate Articles"}</button>
                  </div>
                </div>
                {importResult && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-3">Import Results</h3>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="bg-[#0F0A1A] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500">Articles Created</p><p className="text-lg font-bold text-emerald-400">{importResult.articles_generated || 0}</p></div>
                      <div className="bg-[#0F0A1A] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500">Updates Needed</p><p className="text-lg font-bold text-amber-400">{(importResult.update_recommendations || []).length}</p></div>
                      <div className="bg-[#0F0A1A] rounded-lg p-3 text-center"><p className="text-[10px] text-gray-500">Gaps Found</p><p className="text-lg font-bold text-red-400">{(importResult.gaps_identified || []).length}</p></div>
                    </div>
                    {importResult.gaps_identified?.length > 0 && (
                      <div className="mb-3"><h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Documentation Gaps</h4><ul className="space-y-1">{importResult.gaps_identified.map((g: string, i: number) => <li key={i} className="text-xs text-gray-300 flex gap-2"><span className="text-red-400">-</span>{g}</li>)}</ul></div>
                    )}
                    {importResult.update_recommendations?.length > 0 && (
                      <div><h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Update Recommendations</h4>{importResult.update_recommendations.map((r: any, i: number) => (
                        <div key={i} className="bg-[#0F0A1A] rounded-lg p-3 mb-2"><p className="text-xs text-white font-medium">{r.topic}</p><p className="text-[10px] text-gray-400 mt-1">{r.reason}</p><p className="text-[10px] text-purple-400 mt-1">Suggested: {r.suggested_edit}</p></div>
                      ))}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Tickets Tab ── */}
            {viewTab === "tickets" && (
              <div className="space-y-6">
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-2">Support Ticket Analysis</h2>
                  <p className="text-xs text-gray-400 mb-4">Import support tickets to find patterns and auto-generate documentation for recurring issues.</p>
                  <textarea value={ticketCsv} onChange={e => setTicketCsv(e.target.value)} rows={6} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-xs text-white focus:outline-none font-mono resize-none mb-3" placeholder={`ticket_subject,ticket_body,ticket_source,product_area\nHow do I reset my password?,I can't log in,email,authentication`} />
                  <div className="flex items-center gap-3">
                    <button onClick={handleTicketImport} disabled={!ticketCsv.trim()} className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">Import Tickets</button>
                    <button onClick={handleAnalyzeTickets} disabled={analyzingTickets} className="px-4 py-2 text-sm font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 disabled:opacity-40 transition-colors">{analyzingTickets ? "Analyzing..." : "Analyze All Tickets"}</button>
                  </div>
                </div>
                {ticketAnalysis && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                    <h3 className="text-sm font-semibold text-white mb-3">Analysis Results</h3>
                    {ticketAnalysis.clusters?.map((c: any, i: number) => (
                      <div key={i} className="bg-[#0F0A1A] rounded-lg p-3 mb-2 flex items-start justify-between">
                        <div><p className="text-xs font-medium text-white">{c.topic}</p><p className="text-[10px] text-gray-400">{c.ticket_count} tickets · {c.documentation_gap || "no gap"}</p></div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.priority === "high" ? "bg-red-900/40 text-red-400" : c.priority === "medium" ? "bg-amber-900/40 text-amber-400" : "bg-gray-800/40 text-gray-400"}`}>{c.priority}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── FAQs Tab ── */}
            {viewTab === "faqs" && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs text-gray-400">{faqs.length} FAQs</p>
                  <button onClick={handleGenerateFaqs} className="px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors">Generate from Articles</button>
                </div>
                {faqs.length === 0 ? <p className="text-center py-12 text-gray-500 text-sm">No FAQs yet. Generate them from published articles.</p> :
                <div className="space-y-2">
                  {faqs.map((f: any) => (
                    <div key={f.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white mb-1">{f.question}</p>
                          <p className="text-xs text-gray-400 leading-relaxed">{f.answer}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[f.status] || ""}`}>{f.status}</span>
                          {f.schema_markup && <button onClick={() => navigator.clipboard.writeText(f.schema_markup)} className="px-2 py-1 text-[10px] text-gray-400 border border-[#2A2040] rounded hover:bg-[#0F0A1A]">Copy Schema</button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>}
              </div>
            )}

            {/* ── Changelog Tab ── */}
            {viewTab === "changelog" && (
              <div className="space-y-6">
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6">
                  <h2 className="text-lg font-semibold mb-2">Product Update</h2>
                  <p className="text-xs text-gray-400 mb-4">Describe a product change. AI will generate a customer changelog, scan all docs for affected articles, and flag what needs updating.</p>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="col-span-3"><label className="text-xs font-medium text-gray-400 block mb-1">What changed?</label><textarea value={changelogDesc} onChange={e => setChangelogDesc(e.target.value)} rows={4} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:outline-none resize-none" placeholder="Describe the product update or paste release notes..." /></div>
                    <div><label className="text-xs font-medium text-gray-400 block mb-1">Version</label><input value={changelogVersion} onChange={e => setChangelogVersion(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:outline-none" placeholder="v2.1" /></div>
                  </div>
                  <button onClick={handleGenerateChangelog} disabled={!changelogDesc.trim() || generatingChangelog} className="px-5 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">{generatingChangelog ? "Generating..." : "Generate Changelog & Scan Docs"}</button>
                </div>
                {changelogs.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Changelog ({changelogs.length})</h3>
                    {changelogs.map((c: any) => (
                      <div key={c.id} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          {c.version && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/40 text-purple-400">{c.version}</span>}
                          <h3 className="text-sm font-semibold text-white">{c.title}</h3>
                          <span className="text-[10px] text-gray-600">{new Date(c.release_date).toLocaleDateString()}</span>
                        </div>
                        {c.summary && <p className="text-xs text-gray-400 mb-2">{c.summary}</p>}
                        {c.affected_articles?.length > 0 && <p className="text-[10px] text-amber-400">{c.affected_articles.length} articles flagged for update</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Health Tab ── */}
            {viewTab === "health" && healthData && (
              <div className="space-y-6">
                {/* Health score */}
                <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-6 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Documentation Health Score</p>
                  <p className={`text-5xl font-bold ${healthData.health?.score >= 70 ? "text-emerald-400" : healthData.health?.score >= 40 ? "text-amber-400" : "text-red-400"}`}>{healthData.health?.score || 0}</p>
                  <div className="grid grid-cols-4 gap-3 mt-4">
                    <div><p className="text-[10px] text-gray-500">Published</p><p className="text-sm font-bold text-white">{healthData.health?.published || 0}</p></div>
                    <div><p className="text-[10px] text-gray-500">In Review</p><p className="text-sm font-bold text-amber-400">{healthData.health?.in_review || 0}</p></div>
                    <div><p className="text-[10px] text-gray-500">Freshness</p><p className="text-sm font-bold text-white">{healthData.health?.freshness_pct || 0}%</p></div>
                    <div><p className="text-[10px] text-gray-500">Helpfulness</p><p className="text-sm font-bold text-white">{healthData.health?.helpfulness_pct || 0}%</p></div>
                  </div>
                </div>

                {/* Review queue */}
                {healthData.review_queue?.length > 0 && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">Review Queue ({healthData.review_queue.length})</h3>
                    <div className="space-y-2">{healthData.review_queue.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between bg-[#0F0A1A] rounded-lg p-3">
                        <div><p className="text-xs text-white">{a.title}</p><p className="text-[10px] text-gray-500">{a.source_type} · {a.product_area || "general"}</p></div>
                        <button onClick={() => handleArticleAction(a.id, "published")} className="px-2 py-1 text-[10px] text-emerald-400 border border-emerald-800/30 rounded hover:bg-emerald-900/20">Approve</button>
                      </div>
                    ))}</div>
                  </div>
                )}

                {/* Stale articles */}
                {healthData.stale_articles?.length > 0 && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Stale Content ({healthData.stale_articles.length})</h3>
                    <div className="space-y-2">{healthData.stale_articles.slice(0, 10).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between bg-[#0F0A1A] rounded-lg p-3">
                        <div><p className="text-xs text-white">{a.title}</p><p className="text-[10px] text-gray-500">{a.view_count} views · last reviewed {a.last_reviewed_at ? new Date(a.last_reviewed_at).toLocaleDateString() : "never"}</p></div>
                      </div>
                    ))}</div>
                  </div>
                )}

                {/* Unhelpful articles */}
                {healthData.unhelpful_articles?.length > 0 && (
                  <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
                    <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Needs Rewriting (High 👎)</h3>
                    <div className="space-y-2">{healthData.unhelpful_articles.slice(0, 10).map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between bg-[#0F0A1A] rounded-lg p-3">
                        <div><p className="text-xs text-white">{a.title}</p><p className="text-[10px] text-gray-500">👍 {a.helpful_yes} 👎 {a.helpful_no} · {a.view_count} views</p></div>
                      </div>
                    ))}</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
