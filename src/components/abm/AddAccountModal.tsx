"use client";

import { useState } from "react";

interface AddAccountModalProps {
  onClose: () => void;
  onAdded: () => void;
}

export default function AddAccountModal({ onClose, onAdded }: AddAccountModalProps) {
  const [mode, setMode] = useState<"manual" | "csv">("manual");
  const [saving, setSaving] = useState(false);

  // Manual entry
  const [companyName, setCompanyName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");

  // CSV
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Array<{ company_name: string; domain: string; industry: string }>>([]);

  function parseCSV() {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return;
    const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());
    const nameIdx = headers.findIndex((h) => h.includes("company") || h.includes("name"));
    const domainIdx = headers.findIndex((h) => h.includes("domain") || h.includes("website") || h.includes("url"));
    const industryIdx = headers.findIndex((h) => h.includes("industry"));

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return {
        company_name: nameIdx >= 0 ? cols[nameIdx] : cols[0] || "",
        domain: domainIdx >= 0 ? cols[domainIdx] : cols[1] || "",
        industry: industryIdx >= 0 ? cols[industryIdx] : "",
      };
    }).filter((r) => r.company_name && r.domain);

    setCsvPreview(rows);
  }

  async function handleManualSubmit() {
    if (!companyName.trim() || !domain.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/abm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          domain: domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
          industry: industry.trim() || null,
          employee_count: employeeCount.trim() || null,
        }),
      });
      if (res.ok) {
        onAdded();
        onClose();
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleCSVImport() {
    if (csvPreview.length === 0) return;
    setSaving(true);
    try {
      const accounts = csvPreview.map((r) => ({
        company_name: r.company_name,
        domain: r.domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        industry: r.industry || null,
      }));

      const res = await fetch("/api/abm/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts }),
      });
      if (res.ok) {
        onAdded();
        onClose();
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-[#1A1228] border border-[#2A2040] rounded-2xl w-full max-w-lg p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Add Target Account</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 mb-5 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-0.5">
          <button
            onClick={() => setMode("manual")}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "manual" ? "bg-[#7C3AED] text-white" : "text-gray-400"
            }`}
          >
            Manual Entry
          </button>
          <button
            onClick={() => setMode("csv")}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              mode === "csv" ? "bg-[#7C3AED] text-white" : "text-gray-400"
            }`}
          >
            CSV Import
          </button>
        </div>

        {mode === "manual" ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1">Company Name *</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1">Domain *</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                placeholder="acme.com"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1">Industry</label>
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                placeholder="SaaS, FinTech, etc."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1">Employee Count</label>
              <input
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
                className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none"
                placeholder="50-200"
              />
            </div>
            <button
              onClick={handleManualSubmit}
              disabled={!companyName.trim() || !domain.trim() || saving}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
            >
              {saving ? "Adding..." : "Add Account"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-400 block mb-1">
                Paste CSV (headers: company_name, domain, industry)
              </label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-[#2A2040] bg-[#0F0A1A] px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-purple-500 focus:outline-none font-mono resize-none"
                placeholder={`company_name,domain,industry\nAcme Corp,acme.com,SaaS\nWidgetCo,widgetco.io,FinTech`}
              />
            </div>
            {csvPreview.length === 0 ? (
              <button
                onClick={parseCSV}
                disabled={!csvText.trim()}
                className="w-full py-2 text-sm font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 disabled:opacity-40 transition-colors"
              >
                Preview Import
              </button>
            ) : (
              <>
                <div className="max-h-40 overflow-y-auto border border-[#2A2040] rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0F0A1A]">
                      <tr>
                        <th className="px-3 py-1.5 text-left text-gray-500">Company</th>
                        <th className="px-3 py-1.5 text-left text-gray-500">Domain</th>
                        <th className="px-3 py-1.5 text-left text-gray-500">Industry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((r, i) => (
                        <tr key={i} className="border-t border-[#2A2040]">
                          <td className="px-3 py-1.5 text-gray-300">{r.company_name}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.domain}</td>
                          <td className="px-3 py-1.5 text-gray-400">{r.industry || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={handleCSVImport}
                  disabled={saving}
                  className="w-full py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] disabled:opacity-40 transition-colors"
                >
                  {saving ? "Importing..." : `Import ${csvPreview.length} Accounts`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
