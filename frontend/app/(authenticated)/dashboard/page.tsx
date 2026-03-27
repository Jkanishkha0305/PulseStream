"use client";

import { useEffect, useState, useCallback } from "react";
import { getPatients, getPatient, getAlerts, type PatientSummary, type VitalReading, type Alert } from "@/lib/api";
import VitalsChart from "@/components/VitalsChart";
import { Toaster, toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const VITALS_META = [
  { key: "hr", label: "Heart Rate", unit: "bpm", normalMin: 60, normalMax: 100 },
  { key: "o2sat", label: "SpO₂", unit: "%", normalMin: 95, normalMax: 100 },
  { key: "sbp", label: "Systolic BP", unit: "mmHg", normalMin: 90, normalMax: 140 },
  { key: "temp", label: "Temperature", unit: "°C", normalMin: 36.5, normalMax: 37.5 },
  { key: "resp", label: "Resp. Rate", unit: "/min", normalMin: 12, normalMax: 20 },
];

function vitalColor(value: number | null, min: number, max: number): string {
  if (value === null) return "text-slate-400";
  if (value < min || value > max) return "text-red-400";
  const border = (max - min) * 0.15;
  if (value < min + border || value > max - border) return "text-amber-400";
  return "text-emerald-400";
}

function vitalBorderColor(value: number | null, min: number, max: number): string {
  if (value === null) return "border-slate-800";
  if (value < min || value > max) return "border-red-500/40 bg-red-500/5";
  const border = (max - min) * 0.15;
  if (value < min + border || value > max - border) return "border-amber-500/40 bg-amber-500/5";
  return "border-emerald-500/40 bg-emerald-500/5";
}

function vitalProgress(value: number | null, min: number, max: number): number {
  if (value === null) return 50;
  const range = max - min;
  const pct = ((value - (min - range)) / (range * 3)) * 100;
  return Math.max(2, Math.min(98, pct));
}

function VitalCard({ meta, readings }: { meta: (typeof VITALS_META)[number]; readings: VitalReading[] }) {
  const curr = readings[0]?.[meta.key as keyof VitalReading] as number | null;
  const prev = readings[1]?.[meta.key as keyof VitalReading] as number | null;
  const color = vitalColor(curr, meta.normalMin, meta.normalMax);
  const border = vitalBorderColor(curr, meta.normalMin, meta.normalMax);
  const progress = vitalProgress(curr, meta.normalMin, meta.normalMax);
  const progressColor =
    curr === null ? "bg-slate-700" : curr < meta.normalMin || curr > meta.normalMax ? "bg-red-500" : curr < meta.normalMin + (meta.normalMax - meta.normalMin) * 0.15 || curr > meta.normalMax - (meta.normalMax - meta.normalMin) * 0.15 ? "bg-amber-500" : "bg-emerald-500";

  let arrow = "→";
  let arrowColor = "text-slate-600";
  if (prev !== null && curr !== null) {
    const delta = curr - prev;
    if (delta > 0.5) { arrow = "↑"; arrowColor = "text-red-400"; }
    else if (delta < -0.5) { arrow = "↓"; arrowColor = "text-emerald-400"; }
  }

  return (
    <div className={cn("rounded-2xl border p-5 transition-all", border)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
          {meta.label}
        </span>
        <span className={cn("text-lg font-mono font-bold", arrowColor)}>{arrow}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={cn("text-4xl font-mono font-bold", color)}>
          {curr !== null ? curr.toFixed(1) : "—"}
        </span>
        <span className="text-sm text-slate-500 font-mono">{meta.unit}</span>
      </div>
      <div className="text-[10px] text-slate-600 font-mono mb-2">
        {meta.normalMin}–{meta.normalMax}
      </div>
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", progressColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function getBedNumber(patientId: string): string {
  const num = patientId.replace(/[^0-9]/g, "");
  return `Bed ${num || patientId}`;
}

export default function DashboardPage() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const loadPatients = useCallback(async () => {
    try {
      const data = await getPatients();
      setPatients(data);
      setError(null);
    } catch {
      setError("Unable to connect to backend. Retrying...");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReadings = useCallback(async (id: string) => {
    try {
      const data = await getPatient(id);
      setReadings(data);
    } catch {
      setReadings([]);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const data = await getAlerts({ status: "pending" });
      setPendingAlerts(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadPatients();
    loadAlerts();
    const interval = setInterval(loadPatients, 5000);
    return () => clearInterval(interval);
  }, [loadPatients, loadAlerts]);

  useEffect(() => {
    if (!selectedId) return;
    loadReadings(selectedId);
    const interval = setInterval(() => loadReadings(selectedId), 3000);
    return () => clearInterval(interval);
  }, [selectedId, loadReadings]);

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        () => { loadPatients(); loadAlerts(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadPatients, loadAlerts]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const { updateAlert } = await import("@/lib/api");
      await updateAlert(id, status);
      toaster().toast({ type: "success", title: status === "acknowledged" ? "Alert acknowledged" : "Alert escalated" });
      loadAlerts();
      loadPatients();
    } catch {
      toaster().toast({ type: "error", title: "Failed to update alert" });
    }
  };

  const pending = pendingAlerts.length;
  const critical = pendingAlerts.filter((a) => a.severity > 0.7).length;

  return (
    <div className="min-h-screen">
      <Toaster />

      {/* Top Stats Bar */}
      <div className="grid grid-cols-4 gap-4 px-6 pt-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Patients Monitored
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-white">
            {loading ? "—" : patients.length}
          </p>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("w-1.5 h-1.5 rounded-full", critical > 0 ? "bg-red-500 animate-ping" : "bg-slate-700")} />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Critical Alerts
            </span>
          </div>
          <p className={cn("text-3xl font-mono font-bold", critical > 0 ? "text-red-400" : "text-slate-500")}>
            {loading ? "—" : critical}
          </p>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Pending Review
            </span>
          </div>
          <p className={cn("text-3xl font-mono font-bold", pending > 0 ? "text-amber-400" : "text-slate-500")}>
            {loading ? "—" : pending}
          </p>
        </div>

        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Pipeline Active
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-emerald-400">LIVE</p>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Critical Alert Banner */}
      {pendingAlerts[0] && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-red-950/50 border border-red-900/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">⚠</span>
              <div>
                <p className="text-sm font-semibold text-red-300">
                  ANOMALY — Patient {pendingAlerts[0].patient_id}
                </p>
                <div className="flex gap-1.5 mt-1">
                  {pendingAlerts[0].vital_flags.map((f) => (
                    <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-800 font-mono">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleStatusChange(pendingAlerts[0].id, "acknowledged")}
                className="text-xs px-3 py-1.5 rounded-lg border border-amber-700 text-amber-400 hover:bg-amber-900/30 transition-colors"
              >
                Acknowledge
              </button>
              <button
                onClick={() => handleStatusChange(pendingAlerts[0].id, "escalated")}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-900/50 border border-red-700 text-red-300 hover:bg-red-900/70 transition-colors"
              >
                Escalate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-0 px-6 mt-4 h-[calc(100vh-220px)]">
        {/* Left: Patient List */}
        <div className="w-80 flex-shrink-0 overflow-y-auto pr-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
            Patients ({patients.length})
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : patients.length === 0 ? (
            <div className="text-center py-12 text-slate-600 text-xs">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse mx-auto mb-2" />
              Connecting to ICU stream...
            </div>
          ) : (
            patients.map((p) => {
              const sev = p.severity ?? 0;
              const borderColor =
                sev > 0.7 ? "border-l-red-500" : sev > 0.4 ? "border-l-amber-500" : "border-l-emerald-500";
              const glow =
                sev > 0.7 ? "shadow-red-900/30 shadow-lg" : "";
              return (
                <button
                  key={p.patient_id}
                  onClick={() => setSelectedId(p.patient_id)}
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
                    <span className="text-sm font-semibold text-slate-100">{getBedNumber(p.patient_id)}</span>
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      sev > 0.7 ? "bg-red-500 animate-pulse" : sev > 0.4 ? "bg-amber-500" : "bg-emerald-500"
                    )} />
                  </div>
                  <div className="flex gap-3 text-xs">
                    {p.latest_vitals?.hr !== undefined && (
                      <span className={cn(
                        "font-mono px-1.5 py-0.5 rounded text-[10px]",
                        (p.latest_vitals.hr < 60 || p.latest_vitals.hr > 100)
                          ? "bg-red-900/50 text-red-300 border border-red-800"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      )}>
                        HR {p.latest_vitals.hr}
                      </span>
                    )}
                    {p.latest_vitals?.o2sat !== undefined && (
                      <span className={cn(
                        "font-mono px-1.5 py-0.5 rounded text-[10px]",
                        p.latest_vitals.o2sat < 95
                          ? "bg-red-900/50 text-red-300 border border-red-800"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      )}>
                        SpO₂ {p.latest_vitals.o2sat}
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right: Patient Detail */}
        <div className="flex-1 overflow-y-auto pl-2">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-slate-600 text-sm">Select a patient to view vitals</p>
            </div>
          ) : readings.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse mr-2" />
              <span className="text-slate-500 text-sm">Loading vitals...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Patient Header */}
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-white">{getBedNumber(selectedId)}</h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
                  {selectedId}
                </span>
                <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-900">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE
                </span>
                <Link href={`/patient/${selectedId}`}>
                  <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-300 ml-auto">
                    Full View →
                  </Button>
                </Link>
              </div>

              {/* Vital Cards */}
              <div className="grid grid-cols-5 gap-3">
                {VITALS_META.map((meta) => (
                  <VitalCard key={meta.key} meta={meta} readings={readings} />
                ))}
              </div>

              {/* Chart */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
                  Vital Signs History (last {Math.min(readings.length, 30)} readings)
                </p>
                <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
                  <VitalsChart data={readings.slice(-30)} height={280} />
                </div>
              </div>

              {/* Active Alerts for this patient */}
              {pendingAlerts.filter((a) => a.patient_id === selectedId).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
                    Active Alerts
                  </p>
                  <div className="space-y-2">
                    {pendingAlerts
                      .filter((a) => a.patient_id === selectedId)
                      .map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between rounded-xl border border-red-900/50 bg-red-950/20 p-4">
                          <div className="flex items-center gap-3">
                            <span className="text-amber-400 text-sm">⚠</span>
                            <div>
                              <div className="flex gap-1.5">
                                {alert.vital_flags.map((f) => (
                                  <span key={f} className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-900/50 text-red-300 border border-red-800">
                                    {f}
                                  </span>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1">
                                Severity {(alert.severity * 100).toFixed(0)}% — Tier {alert.tier}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleStatusChange(alert.id, "acknowledged")}
                            className="text-xs px-3 py-1.5 rounded-lg border border-amber-700 text-amber-400 hover:bg-amber-900/30"
                          >
                            Acknowledge
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
