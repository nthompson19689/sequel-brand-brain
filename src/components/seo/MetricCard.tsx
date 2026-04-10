"use client";

interface MetricCardProps {
  label: string;
  value: string | number;
  trend?: number | null; // percentage change, e.g. 12.5 or -3.2
  trendLabel?: string; // e.g. "vs last period"
  placeholder?: boolean; // show placeholder state
}

export default function MetricCard({ label, value, trend, trendLabel, placeholder }: MetricCardProps) {
  const trendColor =
    trend === undefined || trend === null
      ? "text-gray-500"
      : trend > 0
        ? "text-emerald-400"
        : trend < 0
          ? "text-red-400"
          : "text-gray-500";

  const trendArrow =
    trend === undefined || trend === null
      ? "—"
      : trend > 0
        ? "▲"
        : trend < 0
          ? "▼"
          : "—";

  return (
    <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      {placeholder ? (
        <p className="text-2xl font-bold text-gray-600">—</p>
      ) : (
        <>
          <p className="text-2xl font-bold text-white">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {trend !== undefined && (
            <p className={`text-xs mt-1 ${trendColor}`}>
              {trendArrow} {trend !== null ? `${Math.abs(trend).toFixed(1)}%` : ""}{" "}
              {trendLabel && <span className="text-gray-600">{trendLabel}</span>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
