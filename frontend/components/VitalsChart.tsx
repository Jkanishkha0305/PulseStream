"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  Dot,
} from "recharts";
import type { VitalReading } from "@/lib/api";

interface Props {
  data: VitalReading[];
  height?: number;
  patientId?: string;
}

const VITAL_CONFIG = {
  hr: { name: "Heart Rate", unit: "bpm", normalMin: 60, normalMax: 100, color: "#f87171" },
  o2sat: { name: "SpO₂", unit: "%", normalMin: 95, normalMax: 100, color: "#38bdf8" },
  sbp: { name: "Systolic BP", unit: "mmHg", normalMin: 90, normalMax: 140, color: "#fb923c" },
  resp: { name: "Resp. Rate", unit: "/min", normalMin: 12, normalMax: 20, color: "#a78bfa" },
};

const formatTime = (timestamp: number): string => {
  const hours = Math.floor(timestamp);
  const minutes = Math.floor((timestamp % 1) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

function AnomalyDot(props: any) {
  const { cx, cy, payload, dataKey } = props;
  if (!cx || !cy) return null;
  const flags = payload.anomaly_flags || [];
  const isAnomaly =
    flags.includes(dataKey) ||
    flags.includes(dataKey === "o2sat" ? "O2Sat" : dataKey.toUpperCase());
  if (isAnomaly) {
    return <Dot cx={cx} cy={cy} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />;
  }
  return null;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 shadow-xl text-xs space-y-1.5">
      <p className="text-slate-400 font-mono mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-6">
          <span className="text-slate-400 font-mono uppercase text-[10px]">{entry.dataKey}</span>
          <span className="text-white font-mono font-bold" style={{ color: entry.color }}>
            {entry.value?.toFixed(1) ?? "—"}
          </span>
        </div>
      ))}
      {payload[0]?.payload?.anomaly_flags?.length > 0 && (
        <div className="pt-1.5 mt-1.5 border-t border-slate-700">
          <div className="flex gap-1 flex-wrap">
            {payload[0].payload.anomaly_flags.map((f: string) => (
              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/60 text-red-300 border border-red-800 font-mono">
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
          stroke="#334155"
          tick={{ fontSize: 10, fill: "#64748b", fontFamily: "monospace" }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
        />
        <YAxis
          stroke="#334155"
          tick={{ fontSize: 10, fill: "#64748b", fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />

        {/* Normal range shaded areas */}
        <ReferenceArea
          y1={60} y2={100}
          fill="#10b981" fillOpacity={0.04}
          strokeOpacity={0}
        />
        <ReferenceArea
          y1={95} y2={100}
          fill="#38bdf8" fillOpacity={0.04}
          strokeOpacity={0}
        />
        <ReferenceArea
          y1={90} y2={140}
          fill="#fb923c" fillOpacity={0.04}
          strokeOpacity={0}
        />
        <ReferenceArea
          y1={12} y2={20}
          fill="#a78bfa" fillOpacity={0.04}
          strokeOpacity={0}
        />

        <Line
          type="monotone" dataKey="hr" stroke={VITAL_CONFIG.hr.color}
          strokeWidth={1.5} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.8}
        />
        <Line
          type="monotone" dataKey="o2sat" stroke={VITAL_CONFIG.o2sat.color}
          strokeWidth={1.5} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.8}
        />
        <Line
          type="monotone" dataKey="sbp" stroke={VITAL_CONFIG.sbp.color}
          strokeWidth={1.5} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.8}
        />
        <Line
          type="monotone" dataKey="resp" stroke={VITAL_CONFIG.resp.color}
          strokeWidth={1.5} dot={<AnomalyDot />}
          connectNulls strokeOpacity={0.8}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
