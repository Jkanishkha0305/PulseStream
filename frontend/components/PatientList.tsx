"use client";

import { useEffect, useState } from "react";
import type { PatientSummary } from "@/lib/api";
import { getPatients } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Props {
  patients: PatientSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function getBedNumber(patientId: string): string {
  const num = patientId.replace(/[^0-9]/g, "");
  return `Bed ${num || patientId}`;
}

export default function PatientList({ patients: initialPatients, selectedId, onSelect }: Props) {
  const [patients, setPatients] = useState<PatientSummary[]>(initialPatients);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await getPatients();
        setPatients(updated);
      } catch {
        // silently fail
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-600">
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse mb-2" />
        <p className="text-xs">Connecting to ICU stream...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {patients.map((p) => {
        const sev = p.severity ?? 0;
        const borderColor =
          sev > 0.7 ? "border-l-red-500" : sev > 0.4 ? "border-l-amber-500" : "border-l-emerald-500";
        const glow = sev > 0.7 ? "shadow-red-900/20 shadow-md" : "";

        return (
          <button
            key={p.patient_id}
            onClick={() => onSelect(p.patient_id)}
            className={cn(
              "w-full text-left rounded-xl border border-slate-800 border-l-4 p-4 transition-all hover:bg-slate-800/60",
              borderColor,
              glow,
              selectedId === p.patient_id
                ? "bg-slate-800 ring-1 ring-violet-500/50"
                : "bg-slate-900"
            )}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-slate-100">
                {getBedNumber(p.patient_id)}
              </span>
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  sev > 0.7 ? "bg-red-500 animate-pulse" : sev > 0.4 ? "bg-amber-500" : "bg-emerald-500"
                )}
              />
            </div>
            <div className="flex gap-2 text-xs font-mono">
              {p.latest_vitals?.hr !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px]",
                    p.latest_vitals.hr < 60 || p.latest_vitals.hr > 100
                      ? "bg-red-900/50 text-red-300 border border-red-800"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  )}
                >
                  HR {p.latest_vitals.hr}
                </span>
              )}
              {p.latest_vitals?.o2sat !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-[10px]",
                    p.latest_vitals.o2sat < 95
                      ? "bg-red-900/50 text-red-300 border border-red-800"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  )}
                >
                  SpO₂ {p.latest_vitals.o2sat}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
