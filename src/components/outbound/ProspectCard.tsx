"use client";

export interface Prospect {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  title: string | null;
  seniority_level: string | null;
  company_name: string | null;
  company_domain: string | null;
  prospect_status: string;
  lead_score: number;
  updated_at: string;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<string, string> = {
  researching: "bg-blue-900/40 text-blue-400 border-blue-800/40",
  sequenced: "bg-purple-900/40 text-purple-400 border-purple-800/40",
  replied: "bg-amber-900/40 text-amber-400 border-amber-800/40",
  interested: "bg-cyan-900/40 text-cyan-400 border-cyan-800/40",
  booked: "bg-emerald-900/40 text-emerald-400 border-emerald-800/40",
  disqualified: "bg-red-900/40 text-red-400 border-red-800/40",
  nurture: "bg-gray-800/40 text-gray-400 border-gray-700/40",
};

interface ProspectCardProps {
  prospect: Prospect;
  onClick: () => void;
  compact?: boolean;
}

export default function ProspectCard({ prospect, onClick, compact }: ProspectCardProps) {
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(prospect.updated_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-[#1A1228] border border-[#2A2040] rounded-xl hover:border-[#7C3AED]/40 hover:shadow-lg transition-all ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between mb-1.5">
        <div className="min-w-0">
          <h3 className={`font-semibold text-white truncate ${compact ? "text-xs" : "text-sm"}`}>
            {prospect.first_name} {prospect.last_name}
          </h3>
          <p className="text-[10px] text-gray-500 truncate">
            {prospect.title}{prospect.company_name ? ` · ${prospect.company_name}` : ""}
          </p>
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ml-2 ${
          prospect.lead_score >= 80 ? "bg-red-900/40 text-red-400" :
          prospect.lead_score >= 60 ? "bg-amber-900/40 text-amber-400" :
          "bg-gray-800/40 text-gray-500"
        }`}>
          {prospect.lead_score}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
          STATUS_COLORS[prospect.prospect_status] || STATUS_COLORS.nurture
        }`}>
          {prospect.prospect_status}
        </span>
        {daysSinceUpdate > 0 && (
          <span className="text-[10px] text-gray-600">{daysSinceUpdate}d ago</span>
        )}
      </div>
    </button>
  );
}
