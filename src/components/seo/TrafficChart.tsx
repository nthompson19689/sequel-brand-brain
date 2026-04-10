"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface DayPoint {
  date: string;
  sessions: number;
}

export default function TrafficChart() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DayPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/seo/traffic-timeseries?days=${days}`);
      if (res.ok) {
        const json = await res.json();
        // Format dates for display (YYYYMMDD → M/D)
        const formatted = (json.data || []).map((d: DayPoint) => ({
          ...d,
          date: d.date
            ? `${parseInt(d.date.slice(4, 6))}/${parseInt(d.date.slice(6, 8))}`
            : d.date,
        }));
        setData(formatted);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Organic Traffic</h3>
        <div className="inline-flex items-center rounded-md bg-[#0F0A1A] border border-[#2A2040] p-0.5">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                days === d
                  ? "bg-[#7C3AED] text-white"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">
          No traffic data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2A2040" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6B6680", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#2A2040" }}
              interval={Math.max(0, Math.floor(data.length / 8))}
            />
            <YAxis
              tick={{ fill: "#6B6680", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1A1228",
                border: "1px solid #2A2040",
                borderRadius: 8,
                fontSize: 12,
                color: "#fff",
              }}
            />
            <Line
              type="monotone"
              dataKey="sessions"
              stroke="#7C3AED"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#7C3AED" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
