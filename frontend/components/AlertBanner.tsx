"use client";

import { Button } from "@/components/ui/button";
import type { Alert } from "@/lib/api";

interface Props {
  alert: Alert | null;
  onStatusChange: (alertId: string, status: string) => void;
}

// Vital flag colors
const VITAL_COLORS: Record<string, string> = {
  HR: "bg-red-500/20 text-red-400 border-red-500/30",
  O2Sat: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Temp: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  SBP: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Resp: "bg-green-500/20 text-green-400 border-green-500/30",
  multivariate: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

export default function AlertBanner({ alert, onStatusChange }: Props) {
  // Only show for pending or escalated alerts
  if (!alert || (alert.status !== "pending" && alert.status !== "escalated")) {
    return null;
  }

  const handleAcknowledge = () => {
    onStatusChange(alert.id, "acknowledged");
  };

  const handleEscalate = () => {
    onStatusChange(alert.id, "escalated");
  };

  const handleDismiss = () => {
    onStatusChange(alert.id, "resolved");
  };

  return (
    <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">⚠️</span>
            <span className="text-lg font-bold text-white">ANOMALY DETECTED</span>
            <span className="text-xs px-2 py-1 rounded-full bg-red-500/30 text-red-300 border border-red-500/50">
              Severity: {alert.severity.toFixed(2)}
            </span>
            <span className={`text-xs px-2 py-1 rounded-full border ${
              alert.tier === 1 
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                : "bg-purple-500/20 text-purple-400 border-purple-500/30"
            }`}>
              {alert.tier === 1 ? "Tier 1 — Statistical" : "Tier 2 — ML"}
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-2">
            {alert.vital_flags.map((flag) => (
              <span
                key={flag}
                className={`text-xs px-2 py-1 rounded-full border ${
                  VITAL_COLORS[flag] || "bg-slate-500/20 text-slate-400 border-slate-500/30"
                }`}
              >
                {flag}
              </span>
            ))}
          </div>
          
          <div className="text-sm text-red-300">
            Patient: {alert.patient_id} | Time: {new Date(alert.triggered_at).toLocaleTimeString()}
          </div>
        </div>
        
        <div className="flex gap-2 ml-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleAcknowledge}
            className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/20"
          >
            Acknowledge
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleEscalate}
          >
            Escalate to Doctor
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-200"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}