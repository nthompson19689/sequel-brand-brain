"use client";

import type { Account } from "./AccountCard";

const STATUS_COLORS: Record<string, string> = {
  researching: "bg-blue-900/40 text-blue-400 border-blue-800/40",
  monitoring: "bg-gray-800/40 text-gray-400 border-gray-700/40",
  engaging: "bg-amber-900/40 text-amber-400 border-amber-800/40",
  opportunity: "bg-purple-900/40 text-purple-400 border-purple-800/40",
  customer: "bg-emerald-900/40 text-emerald-400 border-emerald-800/40",
};

interface PriorityListProps {
  accounts: Account[];
  onSelectAccount: (account: Account) => void;
  onResearch: (accountId: string, domain: string) => void;
  onOutreach: (accountId: string) => void;
}

export default function PriorityList({ accounts, onSelectAccount, onResearch, onOutreach }: PriorityListProps) {
  const sorted = [...accounts].sort((a, b) => b.priority_score - a.priority_score);

  return (
    <div className="space-y-2">
      {sorted.map((account, idx) => (
        <div
          key={account.id}
          className="flex items-center gap-4 bg-[#1A1228] border border-[#2A2040] rounded-xl p-4 hover:border-[#7C3AED]/30 transition-colors"
        >
          {/* Rank */}
          <span className="text-lg font-bold text-gray-600 w-8 text-center shrink-0">
            {idx + 1}
          </span>

          {/* Account info */}
          <button onClick={() => onSelectAccount(account)} className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-white truncate">{account.company_name}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                STATUS_COLORS[account.account_status] || ""
              }`}>
                {account.account_status}
              </span>
            </div>
            <p className="text-xs text-gray-500 truncate">
              {account.domain} {account.industry ? `· ${account.industry}` : ""}
            </p>
          </button>

          {/* Priority bar */}
          <div className="w-24 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500">Priority</span>
              <span className={`text-xs font-bold ${
                account.priority_score >= 80 ? "text-red-400" :
                account.priority_score >= 60 ? "text-amber-400" :
                "text-gray-500"
              }`}>
                {account.priority_score}
              </span>
            </div>
            <div className="h-1.5 bg-[#0F0A1A] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  account.priority_score >= 80 ? "bg-red-500" :
                  account.priority_score >= 60 ? "bg-amber-500" :
                  "bg-gray-600"
                }`}
                style={{ width: `${account.priority_score}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onResearch(account.id, account.domain)}
              className="px-3 py-1.5 text-[10px] font-medium text-purple-400 border border-purple-800/30 rounded-lg hover:bg-purple-900/20 transition-colors"
            >
              Research
            </button>
            <button
              onClick={() => onOutreach(account.id)}
              className="px-3 py-1.5 text-[10px] font-medium text-white bg-[#7C3AED] rounded-lg hover:bg-[#6D28D9] transition-colors"
            >
              Outreach
            </button>
          </div>
        </div>
      ))}

      {sorted.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          No target accounts yet. Add accounts to get started.
        </div>
      )}
    </div>
  );
}
