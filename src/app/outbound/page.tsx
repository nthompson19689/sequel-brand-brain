"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import ProspectKanban from "@/components/outbound/ProspectKanban";
import TodayView from "@/components/outbound/TodayView";
import SequenceList from "@/components/outbound/SequenceList";
import ProspectDetail from "@/components/outbound/ProspectDetail";
import AddProspectModal from "@/components/outbound/AddProspectModal";
import type { Prospect } from "@/components/outbound/ProspectCard";

type ViewTab = "pipeline" | "today" | "sequences" | "activity";

export default function OutboundPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sequences, setSequences] = useState<Array<{ id: string; sequence_name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState<ViewTab>("pipeline");
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState<{
    total_prospects: number;
    active_prospects: number;
    sent_this_week: number;
    reply_rate: number;
    booking_rate: number;
    bookings_this_week: number;
  } | null>(null);

  const loadProspects = useCallback(async () => {
    try {
      const res = await fetch("/api/outbound/prospects");
      if (res.ok) {
        const data = await res.json();
        setProspects(data.prospects || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadSequences = useCallback(async () => {
    try {
      const res = await fetch("/api/outbound/sequences");
      if (res.ok) {
        const data = await res.json();
        setSequences((data.sequences || []).map((s: { id: string; sequence_name: string }) => ({
          id: s.id,
          sequence_name: s.sequence_name,
        })));
      }
    } catch { /* ignore */ }
  }, []);

  const loadMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/outbound/metrics");
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadProspects();
    loadSequences();
    loadMetrics();
  }, [loadProspects, loadSequences, loadMetrics]);

  if (authLoading) return null;
  if (!user) { router.push("/login"); return null; }

  async function handleStatusChange(prospectId: string, newStatus: string) {
    setProspects((prev) =>
      prev.map((p) => (p.id === prospectId ? { ...p, prospect_status: newStatus } : p))
    );
    await fetch(`/api/outbound/prospects/${prospectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_status: newStatus }),
    });
  }

  async function handleResearch(prospectId: string) {
    setActionStatus("Researching...");
    try {
      await fetch("/api/outbound/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId }),
      });
      setActionStatus("Research complete");
      setTimeout(() => setActionStatus(null), 3000);
      if (selectedProspectId === prospectId) {
        setSelectedProspectId(null);
        setTimeout(() => setSelectedProspectId(prospectId), 100);
      }
    } catch {
      setActionStatus("Research failed");
      setTimeout(() => setActionStatus(null), 3000);
    }
  }

  async function handleGenerate(prospectId: string, sequenceId: string) {
    setActionStatus("Generating messages...");
    try {
      await fetch("/api/outbound/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: prospectId, sequence_id: sequenceId }),
      });
      setActionStatus("Messages generated");
      await loadProspects();
      setTimeout(() => setActionStatus(null), 3000);
      if (selectedProspectId === prospectId) {
        setSelectedProspectId(null);
        setTimeout(() => setSelectedProspectId(prospectId), 100);
      }
    } catch {
      setActionStatus("Generation failed");
      setTimeout(() => setActionStatus(null), 3000);
    }
  }

  return (
    <div className="min-h-screen bg-[#0F0A1A] text-white">
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Outbound</h1>
            <p className="text-sm text-gray-400 mt-1">
              {actionStatus || `${prospects.length} prospect${prospects.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 text-sm font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Prospect
          </button>
        </div>

        {/* Metrics bar */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            {[
              { label: "Active", value: metrics.active_prospects },
              { label: "Sent (7d)", value: metrics.sent_this_week },
              { label: "Reply Rate", value: `${metrics.reply_rate}%` },
              { label: "Booking Rate", value: `${metrics.booking_rate}%` },
              { label: "Booked (7d)", value: metrics.bookings_this_week },
            ].map((m) => (
              <div key={m.label} className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{m.label}</p>
                <p className="text-lg font-bold text-white">{m.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* View tabs */}
        <div className="flex items-center gap-1 mb-6 bg-[#0F0A1A] border border-[#2A2040] rounded-lg p-0.5 w-fit">
          {([
            { id: "pipeline" as ViewTab, label: "Pipeline" },
            { id: "today" as ViewTab, label: "Today" },
            { id: "sequences" as ViewTab, label: "Sequences" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewTab(tab.id)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewTab === tab.id ? "bg-[#7C3AED] text-white" : "text-gray-400 hover:text-white"
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
              <ProspectKanban
                prospects={prospects}
                onSelectProspect={(p) => setSelectedProspectId(p.id)}
                onStatusChange={handleStatusChange}
              />
            )}
            {viewTab === "today" && <TodayView />}
            {viewTab === "sequences" && <SequenceList />}
          </>
        )}
      </div>

      {/* Detail drawer */}
      {selectedProspectId && (
        <ProspectDetail
          prospectId={selectedProspectId}
          onClose={() => setSelectedProspectId(null)}
          onResearch={handleResearch}
          onGenerate={handleGenerate}
          sequences={sequences}
        />
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddProspectModal
          onClose={() => setShowAddModal(false)}
          onAdded={loadProspects}
        />
      )}
    </div>
  );
}
