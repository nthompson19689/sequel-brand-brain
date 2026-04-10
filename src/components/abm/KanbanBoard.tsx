"use client";

import AccountCard, { type Account } from "./AccountCard";

const STATUSES = [
  { id: "researching", label: "Researching", color: "text-blue-400" },
  { id: "monitoring", label: "Monitoring", color: "text-gray-400" },
  { id: "engaging", label: "Engaging", color: "text-amber-400" },
  { id: "opportunity", label: "Opportunity", color: "text-purple-400" },
  { id: "customer", label: "Customer", color: "text-emerald-400" },
];

interface KanbanBoardProps {
  accounts: Account[];
  onSelectAccount: (account: Account) => void;
  onStatusChange: (accountId: string, newStatus: string) => void;
}

export default function KanbanBoard({ accounts, onSelectAccount, onStatusChange }: KanbanBoardProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {STATUSES.map((status) => {
        const columnAccounts = accounts.filter((a) => a.account_status === status.id);
        return (
          <div
            key={status.id}
            className="flex-shrink-0 w-[260px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const accountId = e.dataTransfer.getData("accountId");
              if (accountId) onStatusChange(accountId, status.id);
            }}
          >
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${status.color}`}>
                {status.label}
              </h3>
              <span className="text-[10px] text-gray-600 bg-[#0F0A1A] px-1.5 py-0.5 rounded-full">
                {columnAccounts.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-2 min-h-[200px] bg-[#0F0A1A]/50 rounded-xl p-2 border border-[#2A2040]/50">
              {columnAccounts.length === 0 && (
                <p className="text-[10px] text-gray-600 text-center py-8">
                  Drop accounts here
                </p>
              )}
              {columnAccounts.map((account) => (
                <div
                  key={account.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("accountId", account.id)}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <AccountCard
                    account={account}
                    onClick={() => onSelectAccount(account)}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
