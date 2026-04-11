"use client";

import { useState, useEffect } from "react";

interface AddProspectModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddProspectModal({ onClose, onAdded }: AddProspectModalProps) {
  const [mode, setMode] = useState<"manual" | "csv" | "abm">("manual");
  const [saving, setSaving] = useState(false);

  // Manual
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [seniority, setSeniority] = useState("");

  // CSV
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Array<Record<string, string>>>([]);

  // ABM
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [abmAccounts, setAbmAccounts] = useState<any[]>([]);
  const [selectedAbmId, setSelectedAbmId] = useState("");

  useEffect(() => {
    if (mode === "abm") {
      (async () => {
        try {
          const res = await fetch("/api/abm/accounts");
          if (res.ok) {
            const data = await res.json();
            setAbmAccounts(data.accounts || []);
          }
        } catch { /* ignore */ }
      })();
    }
  }, [mode]);

  function parseCSV() {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return;
    const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cols[i] || ""; });
      return row;
    }).filter((r) => (r.first_name || r.name) && (r.email || r.company_name || r.company));
    setCsvPreview(rows);
  }

  const [error, setError] = useState<string | null>(null);

  async function handleManual() {
    if (!firstName.trim() || !lastName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/outbound/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim() || null,
          title: title.trim() || null,
          company_name: company.trim() || null,
          company_domain: domain.trim() || null,
          linkedin_url: linkedin.trim() || null,
          seniority_level: seniority || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed (HTTP ${res.status}). Run migration_016_outbound.sql in Supabase.`);
        setSaving(false);
        return;
      }
      onAdded(); onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
    setSaving(false);
  }

  async function handleCSV() {
    if (csvPreview.length === 0) return;
    setSaving(true);
    try {
      const prospects = csvPreview.map((r) => ({
        first_name: r.first_name || (r.name || "").split(" ")[0] || "",
        last_name: r.last_name || (r.name || "").split(" ").slice(1).join(" ") || "",
        email: r.email || null,
        title: r.title || null,
        company_name: r.company_name || r.company || null,
        company_domain: r.company_domain || r.domain || null,
        linkedin_url: r.linkedin_url || r.linkedin || null,
        seniority_level: r.seniority_level || r.seniority || null,
      }));
      await fetch("/api/outbound/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospects }),
      });
      onAdded(); onClose();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleABMImport() {
    if (!selectedAbmId) return;
    setSaving(true);
    try {
      await fetch("/api/outbound/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from_abm: selectedAbmId }),
      });
      onAdded(); onClose();
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#1A1228] border border-[#2A2040] rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Prospect</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-0.5">
          {(["manual", "csv", "abm"] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${mode === m ? "bg-[#7C3AED] text-white" : "text-gray-400"}`}>
              {m === "manual" ? "Manual" : m === "csv" ? "CSV Import" : "From ABM"}
            </button>
          ))}
        </div>

        {mode === "manual" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-gray-400 block mb-1">First Name *</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
              <div><label className="text-xs font-medium text-gray-400 block mb-1">Last Name *</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-400 block mb-1">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
            <div><label className="text-xs font-medium text-gray-400 block mb-1">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" placeholder="VP Marketing" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-gray-400 block mb-1">Company</label><input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
              <div><label className="text-xs font-medium text-gray-400 block mb-1">Domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" placeholder="acme.com" /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-400 block mb-1">LinkedIn URL</label><input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none" /></div>
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1">Seniority</label>
              <select value={seniority} onChange={(e) => setSeniority(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
                <option value="">Select...</option>
                {["C-suite", "VP", "Director", "Manager", "IC"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {error && <p className="text-xs text-red-400 p-2 bg-red-900/20 rounded-lg">{error}</p>}
            <button onClick={handleManual} disabled={!firstName.trim() || !lastName.trim() || saving} className="w-full py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">
              {saving ? "Adding..." : "Add Prospect"}
            </button>
          </div>
        )}

        {mode === "csv" && (
          <div className="space-y-3">
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-xs text-white focus:border-purple-500 focus:outline-none font-mono resize-none" placeholder={`first_name,last_name,email,title,company_name,company_domain\nJane,Smith,jane@acme.com,VP Marketing,Acme Corp,acme.com`} />
            {csvPreview.length === 0 ? (
              <button onClick={parseCSV} disabled={!csvText.trim()} className="w-full py-2 text-sm font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 disabled:opacity-40 transition-colors">Preview</button>
            ) : (
              <>
                <p className="text-xs text-gray-400">{csvPreview.length} prospects parsed</p>
                <button onClick={handleCSV} disabled={saving} className="w-full py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">
                  {saving ? "Importing..." : `Import ${csvPreview.length} Prospects`}
                </button>
              </>
            )}
          </div>
        )}

        {mode === "abm" && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Import key contacts from a target account in the ABM module.</p>
            <select value={selectedAbmId} onChange={(e) => setSelectedAbmId(e.target.value)} className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white focus:border-purple-500 focus:outline-none">
              <option value="">Select account...</option>
              {abmAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.company_name} ({(a.key_contacts || []).length} contacts)</option>
              ))}
            </select>
            <button onClick={handleABMImport} disabled={!selectedAbmId || saving} className="w-full py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors">
              {saving ? "Importing..." : "Import Contacts"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
