"use client";

import { useEffect, useState } from "react";
import type { PatientSummary } from "@/lib/api";
import { getPatients } from "@/lib/api";

interface Props {
  patients: PatientSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function PatientList({ patients: initialPatients, selectedId, onSelect }: Props) {
  const [patients, setPatients] = useState<PatientSummary[]>(initialPatients);

  // Refresh every 3 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const updated = await getPatients();
        setPatients(updated);
      } catch (e) {
        console.error("Failed to refresh patients:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Get bed number from patient_id (extract number after 'p')
  const getBedNumber = (patientId: string): string => {
    const num = patientId.replace(/[^0-9]/g, "");
    return `Bed ${num || patientId}`;
  };

  // Get status color based on severity
  const getStatusDot = (severity: number | null) => {
    if (severity === null || severity === 0) {
      return <span className="w-3 h-3 rounded-full bg-green-500" />;
    }
    if (severity <= 0.5) {
      return <span className="w-3 h-3 rounded-full bg-yellow-500" />;
    }
    return <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />;
  };

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500">
        <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse mb-2" />
        <p>Connecting to ICU data stream...</p>
      </div>
    );
  }

  return (
    <div className="w-72 space-y-2 overflow-y-auto max-h-full">
      {patients.map((p) => (
        <button
          key={p.patient_id}
          onClick={() => onSelect(p.patient_id)}
          className={`w-full text-left rounded-lg p-3 border transition-all cursor-pointer ${
            selectedId === p.patient_id
              ? "border-purple-500 bg-slate-700"
              : "border-slate-700 bg-slate-800 hover:border-purple-500"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-white">{getBedNumber(p.patient_id)}</span>
            {getStatusDot(p.severity)}
          </div>
          <div className="text-xs text-slate-400 mt-1">{p.patient_id}</div>
          <div className="flex gap-3 mt-2 text-sm text-slate-300">
            <span>HR: {p.latest_vitals?.hr ?? "--"}</span>
            <span>SpO2: {p.latest_vitals?.o2sat ?? "--"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}