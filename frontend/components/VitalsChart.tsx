"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Dot,
} from "recharts";
import type { VitalReading } from "@/lib/api";

interface Props {
  data: VitalReading[];
  height?: number;
  patientId?: string;
}

// Vital sign configurations
const VITAL_CONFIG = {
  hr: {
    name: "Heart Rate",
    unit: "bpm",
    normalRange: [60, 100],
    color: "#60a5fa", // blue-400
  },
  o2sat: {
    name: "O2 Sat",
    unit: "%",
    normalRange: [95, 100],
    color: "#34d399", // emerald-400
  },
  sbp: {
    name: "SBP",
    unit: "mmHg",
    normalRange: [90, 140],
    color: "#f87171", // red-400
  },
  resp: {
    name: "Resp",
    unit: "/min",
    normalRange: [12, 20],
    color: "#fbbf24", // amber-400
  },
};

// Format timestamp as HH:MM
const formatTime = (timestamp: number): string => {
  const hours = Math.floor(timestamp);
  const minutes = Math.floor((timestamp % 1) * 60);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
};

// Format timestamp for display
const formatTimestamp = (timestamp: number): string => {
  return `T+${Math.floor(timestamp)}h`;
};

export default function VitalsChart({ data, height = 300 }: Props) {
  // Prepare chart data - reverse so oldest is on left
  const chartData = [...data].reverse().map((reading) => ({
    timestamp: reading.timestamp,
    hr: reading.hr,
    o2sat: reading.o2sat,
    sbp: reading.sbp,
    resp: reading.resp,
    anomaly_flags: reading.anomaly_flags || [],
  }));

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-slate-900 rounded-lg border border-slate-800"
        style={{ height }}
      >
        <p className="text-slate-500">No vital data available</p>
      </div>
    );
  }

  // Custom dot to highlight anomalies
  const renderCustomDot = (props: any) => {
    const { cx, cy, payload, dataKey } = props;
    const anomalyFlags = payload.anomaly_flags || [];
    
    // Check if this vital is in the anomaly flags
    const vitalKey = dataKey === "o2sat" ? "O2Sat" : dataKey.toUpperCase();
    const isAnomaly = anomalyFlags.includes(vitalKey) || anomalyFlags.includes(dataKey);
    
    if (isAnomaly) {
      return (
        <Dot
          cx={cx}
          cy={cy}
          r={6}
          fill="#ef4444"
          stroke="#fff"
          strokeWidth={2}
        />
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatTime}
            stroke="#64748b"
            tick={{ fontSize: 12 }}
          />
          <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "#f8fafc",
            }}
            labelFormatter={(value) => `Time: ${formatTimestamp(value)}`}
          />
          
          {/* Heart Rate */}
          <Line
            type="monotone"
            dataKey="hr"
            name="HR"
            stroke={VITAL_CONFIG.hr.color}
            strokeWidth={2}
            dot={renderCustomDot}
            connectNulls
          />
          <ReferenceLine
            y={VITAL_CONFIG.hr.normalRange[0]}
            stroke={VITAL_CONFIG.hr.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
          <ReferenceLine
            y={VITAL_CONFIG.hr.normalRange[1]}
            stroke={VITAL_CONFIG.hr.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
          
          {/* O2 Sat */}
          <Line
            type="monotone"
            dataKey="o2sat"
            name="O2Sat"
            stroke={VITAL_CONFIG.o2sat.color}
            strokeWidth={2}
            dot={renderCustomDot}
            connectNulls
          />
          <ReferenceLine
            y={VITAL_CONFIG.o2sat.normalRange[0]}
            stroke={VITAL_CONFIG.o2sat.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
          
          {/* SBP */}
          <Line
            type="monotone"
            dataKey="sbp"
            name="SBP"
            stroke={VITAL_CONFIG.sbp.color}
            strokeWidth={2}
            dot={renderCustomDot}
            connectNulls
          />
          <ReferenceLine
            y={VITAL_CONFIG.sbp.normalRange[0]}
            stroke={VITAL_CONFIG.sbp.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
          <ReferenceLine
            y={VITAL_CONFIG.sbp.normalRange[1]}
            stroke={VITAL_CONFIG.sbp.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
          
          {/* Respiration */}
          <Line
            type="monotone"
            dataKey="resp"
            name="Resp"
            stroke={VITAL_CONFIG.resp.color}
            strokeWidth={2}
            dot={renderCustomDot}
            connectNulls
          />
          <ReferenceLine
            y={VITAL_CONFIG.resp.normalRange[0]}
            stroke={VITAL_CONFIG.resp.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
          <ReferenceLine
            y={VITAL_CONFIG.resp.normalRange[1]}
            stroke={VITAL_CONFIG.resp.color}
            strokeDasharray="3 3"
            opacity={0.3}
          />
        </LineChart>
      </ResponsiveContainer>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 justify-center">
        {Object.entries(VITAL_CONFIG).map(([key, config]) => (
          <div key={key} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: config.color }}
            />
            <span className="text-xs text-slate-400">
              {config.name} ({config.normalRange[0]}-{config.normalRange[1]})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}