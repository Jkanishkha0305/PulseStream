"use client";

import { Button } from "@/components/ui/button";
import type { Alert } from "@/lib/api";

interface Props {
  alerts: Alert[];
  onStatusChange?: (alertId: string, status: string) => void;
}

// Severity colors
const getSeverityColor = (severity: number): string => {
  if (severity > 0.7) return "bg-red-500/20 text-red-400";
  if (severity > 0.4) return "bg-yellow-500/20 text-yellow-400";
  return "bg-green-500/20 text-green-400";
};

// Status colors
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-red-500/20 text-red-400 border-red-500/30",
  acknowledged: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  escalated: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
};

// Tier badge colors
const TIER_COLORS: Record<string, string> = {
  "1": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "2": "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

// Format relative time
const formatRelativeTime = (triggered_at: string): string => {
  try {
    const diff = Math.floor((Date.now() - new Date(triggered_at).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return triggered_at;
  }
};

export default function AlertTable({ alerts, onStatusChange }: Props) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-slate-800 text-slate-500">
        <div className="text-3xl mb-2">✅</div>
        <p>No active alerts</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400">
            <th className="px-4 py-3 text-left font-medium">Time</th>
            <th className="px-4 py-3 text-left font-medium">Patient</th>
            <th className="px-4 py-3 text-left font-medium">Vitals Affected</th>
            <th className="px-4 py-3 text-left font-medium">Severity</th>
            <th className="px-4 py-3 text-left font-medium">Tier</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
            <tr
              key={alert.id}
              className="border-b border-slate-800/50 hover:bg-slate-900/30 transition-colors"
            >
              <td className="px-4 py-3 text-slate-300">
                {formatRelativeTime(alert.triggered_at)}
              </td>
              <td className="px-4 py-3">
                <span className="text-emerald-400 font-medium">{alert.patient_id}</span>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {alert.vital_flags.map((flag) => (
                    <span
                      key={flag}
                      className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300"
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getSeverityColor(alert.severity)}`}
                      style={{ width: `${alert.severity * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400">{(alert.severity * 100).toFixed(0)}%</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${TIER_COLORS[(alert.tier ?? 1).toString()]}`}>
                  T{alert.tier ?? 1} {alert.tier === 1 ? "Fast" : "ML"}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[alert.status]}`}>
                  {alert.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                {onStatusChange && alert.status === "pending" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onStatusChange(alert.id, "acknowledged")}
                    className="text-xs"
                  >
                    Ack
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}