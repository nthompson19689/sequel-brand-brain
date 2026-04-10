"use client";

type SeoTab = "executive" | "tactical";

interface SeoTabSwitcherProps {
  activeTab: SeoTab;
  onTabChange: (tab: SeoTab) => void;
}

export default function SeoTabSwitcher({ activeTab, onTabChange }: SeoTabSwitcherProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-[#0F0A1A] border border-[#2A2040] p-0.5">
      {(["executive", "tactical"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            activeTab === tab
              ? "bg-[#7C3AED] text-white"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {tab === "executive" ? "Executive" : "Tactical"}
        </button>
      ))}
    </div>
  );
}

export type { SeoTab };
