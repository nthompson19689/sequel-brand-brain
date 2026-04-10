"use client";

import ProspectCard, { type Prospect } from "./ProspectCard";

const STATUSES = [
  { id: "researching", label: "Researching", color: "text-blue-400" },
  { id: "sequenced", label: "Sequenced", color: "text-purple-400" },
  { id: "replied", label: "Replied", color: "text-amber-400" },
  { id: "interested", label: "Interested", color: "text-cyan-400" },
  { id: "booked", label: "Booked", color: "text-emerald-400" },
  { id: "disqualified", label: "DQ'd", color: "text-red-400" },
];

interface ProspectKanbanProps {
  prospects: Prospect[];
  onSelectProspect: (prospect: Prospect) => void;
  onStatusChange: (prospectId: string, newStatus: string) => void;
}

export default function ProspectKanban({ prospects, onSelectProspect, onStatusChange }: ProspectKanbanProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUSES.map((status) => {
        const col = prospects.filter((p) => p.prospect_status === status.id);
        return (
          <div
            key={status.id}
            className="flex-shrink-0 w-[240px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("prospectId");
              if (id) onStatusChange(id, status.id);
            }}
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${status.color}`}>
                {status.label}
              </h3>
              <span className="text-[10px] text-gray-600 bg-[#0F0A1A] px-1.5 py-0.5 rounded-full">
                {col.length}
              </span>
            </div>
            <div className="space-y-2 min-h-[200px] bg-[#0F0A1A]/50 rounded-xl p-2 border border-[#2A2040]/50">
              {col.length === 0 && (
                <p className="text-[10px] text-gray-600 text-center py-8">Drop here</p>
              )}
              {col.map((prospect) => (
                <div
                  key={prospect.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("prospectId", prospect.id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <ProspectCard prospect={prospect} onClick={() => onSelectProspect(prospect)} compact />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
