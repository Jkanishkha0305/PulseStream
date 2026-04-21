/**
 * VitalsChart — Neon Glow Styling
 *
 * Visual decisions:
 * - Lines get SVG drop-shadow filter for neon glow effect
 * - Anomaly points render as pulsing red rings (outer ring + inner dot)
 * - Tooltip uses glass morphism styling
 * - Grid lines are subtle (rgba white 5%)
 * - Reference areas use very low opacity to not compete with glow lines
 */

"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";
import type { VitalReading } from "@/lib/api";

interface Props {
  data: VitalReading[];
  height?: number;
  patientId?: string;
}

const VITAL_CONFIG = {
  hr: { name: "Heart Rate", unit: "bpm", normalMin: 60, normalMax: 100, color: "#ff4757" },
  o2sat: { name: "SpO₂", unit: "%", normalMin: 95, normalMax: 100, color: "#1e90ff" },
  sbp: { name: "Systolic BP", unit: "mmHg", normalMin: 90, normalMax: 140, color: "#ff6348" },
  resp: { name: "Resp. Rate", unit: "/min", normalMin: 12, normalMax: 20, color: "#a29bfe" },
};

const formatTime = (timestamp: number): string => {
  const hours = Math.floor(timestamp);
  const minutes = Math.floor((timestamp % 1) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

function AnomalyDot({ cx, cy, payload, dataKey }: { cx?: number; cy?: number; payload?: { anomaly_flags?: string[] }; dataKey?: string }) {
  if (!cx || !cy || !payload || !dataKey) return null;
  const flags = payload.anomaly_flags || [];
  const isAnomaly =
    flags.includes(dataKey) ||
    flags.includes(dataKey === "o2sat" ? "O2Sat" : dataKey.toUpperCase());
  if (isAnomaly) {
    return (
      <g>
        {/* Outer pulsing ring */}
        <circle cx={cx} cy={cy} r={8} fill="none" stroke="#ef4444" strokeWidth={1.5} opacity={0.4}>
          <animate attributeName="r" values="6;10;6" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Inner dot */}
        <circle cx={cx} cy={cy} r={4} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      </g>
    );
  }
  return null;
}

interface TooltipPayloadEntry {
  dataKey: string;
  color: string;
  value?: number;
  payload?: { anomaly_flags?: string[] };
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="backdrop-blur-xl bg-slate-900/90 border border-white/10 rounded-xl p-3 shadow-xl text-xs space-y-1.5">
      <p className="text-slate-400 font-mono mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6">
          <span className="text-slate-400 font-mono uppercase text-[10px]">{entry.dataKey}</span>
          <span className="text-white font-mono font-bold" style={{ color: entry.color }}>
            {entry.value?.toFixed(1) ?? "—"}
          </span>
        </div>
      ))}
      {payload[0].payload?.anomaly_flags && payload[0].payload.anomaly_flags.length > 0 && (
        <div className="pt-1.5 mt-1.5 border-t border-white/10">
          <div className="flex gap-1 flex-wrap">
            {payload[0].payload.anomaly_flags.map((f: string) => (
              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20 font-mono">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export default function VitalsChart({ data, height = 300 }: Props) {
  const chartData = [...data].reverse().map((r) => ({
    timestamp: r.timestamp,
    hr: r.hr,
    o2sat: r.o2sat,
    sbp: r.sbp,
    resp: r.resp,
    anomaly_flags: r.anomaly_flags || [],
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-600 text-xs">No vital data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 8, right: 16, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="timestamp"
          tickFormatter={formatTime}
          stroke="rgba(255,255,255,0.08)"
          tick={{ fontSize: 10, fill: "#64748b", fontFamily: "var(--font-jetbrains, monospace)" }}
          axisLine={{ stroke: "rgba(255,255,255,0.05)" }}
          tickLine={false}
        />
        <YAxis
          stroke="rgba(255,255,255,0.08)"
          tick={{ fontSize: 10, fill: "#64748b", fontFamily: "var(--font-jetbrains, monospace)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />

        {/* Normal range shaded areas */}
        <ReferenceArea
          y1={60} y2={100}
          fill="#10b981" fillOpacity={0.03}
          strokeOpacity={0}
        />
        <ReferenceArea
          y1={95} y2={100}
          fill="#38bdf8" fillOpacity={0.03}
          strokeOpacity={0}
        />
        <ReferenceArea
          y1={90} y2={140}
          fill="#fb923c" fillOpacity={0.03}
          strokeOpacity={0}
        />
        <ReferenceArea
          y1={12} y2={20}
          fill="#a78bfa" fillOpacity={0.03}
          strokeOpacity={0}
        />

        <Line
          type="monotone" dataKey="hr" stroke={VITAL_CONFIG.hr.color}
          strokeWidth={2} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.9}
        />
        <Line
          type="monotone" dataKey="o2sat" stroke={VITAL_CONFIG.o2sat.color}
          strokeWidth={2} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.9}
        />
        <Line
          type="monotone" dataKey="sbp" stroke={VITAL_CONFIG.sbp.color}
          strokeWidth={2} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.9}
        />
        <Line
          type="monotone" dataKey="resp" stroke={VITAL_CONFIG.resp.color}
          strokeWidth={2} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.9}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
