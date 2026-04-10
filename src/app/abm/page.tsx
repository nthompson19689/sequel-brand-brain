"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import KanbanBoard from "@/components/abm/KanbanBoard";
import PriorityList from "@/components/abm/PriorityList";
import ActivityFeed from "@/components/abm/ActivityFeed";
import AccountDetail from "@/components/abm/AccountDetail";
import AddAccountModal from "@/components/abm/AddAccountModal";
import type { Account } from "@/components/abm/AccountCard";

type ViewTab = "pipeline" | "priority" | "activity";

export default function ABMPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>("pipeline");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/abm/accounts");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function handleStatusChange(accountId: string, newStatus: string) {
    // Optimistic update
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, account_status: newStatus } : a))
    );
    await fetch(`/api/abm/accounts/${accountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_status: newStatus }),
    });
  }

  async function handleResearch(accountId: string, domain: string) {
    setActionLoading(accountId);
    try {
      const res = await fetch("/api/abm/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, domain }),
      });
      if (res.ok) {
        await loadAccounts();
        // If detail drawer is open for this account, it will re-fetch
        if (selectedAccountId === accountId) {
          setSelectedAccountId(null);
          setTimeout(() => setSelectedAccountId(accountId), 100);
        }
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  async function handleOutreach(accountId: string) {
    setActionLoading(accountId);
    try {
      await fetch("/api/abm/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });
      // Refresh the detail view if open
      if (selectedAccountId === accountId) {
        setSelectedAccountId(null);
        setTimeout(() => setSelectedAccountId(accountId), 100);
      }
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">ABM Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">
              {accounts.length} target account{accounts.length !== 1 ? "s" : ""}
              {actionLoading && " · Processing..."}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Account
          </button>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 mb-6 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-0.5 w-fit">
          {([
            { id: "pipeline" as ViewTab, label: "Pipeline" },
            { id: "priority" as ViewTab, label: "Priority" },
            { id: "activity" as ViewTab, label: "Activity Feed" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewTab(tab.id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewTab === tab.id
                  ? "bg-[#7C3AED] text-white"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Views */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        ) : (
          <>
            {viewTab === "pipeline" && (
              <KanbanBoard
                accounts={accounts}
                onSelectAccount={(a) => setSelectedAccountId(a.id)}
                onStatusChange={handleStatusChange}
              />
            )}

            {viewTab === "priority" && (
              <PriorityList
                accounts={accounts}
                onSelectAccount={(a) => setSelectedAccountId(a.id)}
                onResearch={handleResearch}
                onOutreach={handleOutreach}
              />
            )}

            {viewTab === "activity" && <ActivityFeed />}
          </>
        )}
      </div>

      {/* Account detail drawer */}
      {selectedAccountId && (
        <AccountDetail
          accountId={selectedAccountId}
          onClose={() => setSelectedAccountId(null)}
          onResearch={handleResearch}
          onOutreach={handleOutreach}
        />
      )}

      {/* Add account modal */}
      {showAddModal && (
        <AddAccountModal
          onClose={() => setShowAddModal(false)}
          onAdded={loadAccounts}
        />
      )}
    </div>
  );
}
