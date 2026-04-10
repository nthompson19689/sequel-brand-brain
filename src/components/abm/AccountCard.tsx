"use client";

interface Account {
  id: string;
  company_name: string;
  domain: string;
  industry: string | null;
  account_status: string;
  priority_score: number;
  key_contacts: unknown[];
  triggers: unknown;
  updated_at: string;
}

interface AccountCardProps {
  account: Account;
  onClick: () => void;
  compact?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  researching: "bg-blue-900/40 text-blue-400 border-blue-800/40",
  monitoring: "bg-gray-800/40 text-gray-400 border-gray-700/40",
  engaging: "bg-amber-900/40 text-amber-400 border-amber-800/40",
  opportunity: "bg-purple-900/40 text-purple-400 border-purple-800/40",
  customer: "bg-emerald-900/40 text-emerald-400 border-emerald-800/40",
};

export default function AccountCard({ account, onClick, compact }: AccountCardProps) {
  const contactCount = Array.isArray(account.key_contacts) ? account.key_contacts.length : 0;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-[#1A1228] border border-[#2A2040] rounded-xl hover:border-[#7C3AED]/40 hover:shadow-lg transition-all ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <h3 className={`font-semibold text-white truncate ${compact ? "text-xs" : "text-sm"}`}>
            {account.company_name}
          </h3>
          <p className="text-[10px] text-gray-500 truncate">{account.domain}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            account.priority_score >= 80 ? "bg-red-900/40 text-red-400" :
            account.priority_score >= 60 ? "bg-amber-900/40 text-amber-400" :
            "bg-gray-800/40 text-gray-500"
          }`}>
            {account.priority_score}
          </span>
        </div>
      </div>

      {!compact && account.industry && (
        <p className="text-[10px] text-gray-500 mb-2">{account.industry}</p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
          STATUS_COLORS[account.account_status] || STATUS_COLORS.monitoring
        }`}>
          {account.account_status}
        </span>
        {contactCount > 0 && (
          <span className="text-[10px] text-gray-500">
            {contactCount} contact{contactCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </button>
  );
}

export type { Account };
