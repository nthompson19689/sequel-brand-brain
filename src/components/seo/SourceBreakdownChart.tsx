"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

interface ChannelData {
  channel: string;
  sessions: number;
}

const COLORS: Record<string, string> = {
  "Organic Search": "#10B981",
  Direct: "#3B82F6",
  Referral: "#F59E0B",
  Social: "#EC4899",
  "Paid Search": "#8B5CF6",
  Email: "#06B6D4",
  Other: "#6B7280",
};

export default function SourceBreakdownChart() {
  const [data, setData] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/seo/source-breakdown");
        if (res.ok) {
          const json = await res.json();
          setData(json.channels || []);
        }
      } catch {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="bg-[#1A1228] border border-[#2A2040] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Traffic Sources</h3>

      {loading ? (
        <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center text-gray-600 text-sm">
          No source data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 10 }}>
            <XAxis
              type="number"
              tick={{ fill: "#6B6680", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="channel"
              tick={{ fill: "#A09CB0", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1A1228",
                border: "1px solid #2A2040",
                borderRadius: 8,
                fontSize: 12,
                color: "#fff",
              }}
              formatter={(value) => [Number(value).toLocaleString(), "Sessions"]}
            />
            <Bar dataKey="sessions" radius={[0, 4, 4, 0]} barSize={18}>
              {data.map((entry) => (
                <Cell
                  key={entry.channel}
                  fill={COLORS[entry.channel] || COLORS.Other}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
