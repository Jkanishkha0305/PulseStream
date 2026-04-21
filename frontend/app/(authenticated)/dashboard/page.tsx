/**
 * PulseStream Dashboard — "Dark Medical Futurism"
 *
 * Visual decisions:
 * - Bento grid layout for top stats with asymmetric sizing
 * - Glass cards throughout with hover lift effects
 * - Critical alert banner with neon red glow + animated left border
 * - Patient list with colored left accent bars + hover lift
 * - Vital cards in 2-3 bento grid with gradient text for values
 * - Recharts area with neon glow lines
 * - LIVE badge with CSS ping animation
 * - Framer motion for staggered card entrance animations
 */

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { getPatients, getPatient, getAlerts, type PatientSummary, type VitalReading, type Alert } from "@/lib/api";
import VitalsChart from "@/components/VitalsChart";
import { Toaster, toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, Clock, Heart, Wind, Thermometer, HeartPulse, ArrowRight } from "lucide-react";

const VITALS_META = [
  { key: "hr", label: "Heart Rate", unit: "bpm", normalMin: 60, normalMax: 100, icon: HeartPulse, color: "from-rose-400 to-red-500" },
  { key: "o2sat", label: "SpO₂", unit: "%", normalMin: 95, normalMax: 100, icon: Wind, color: "from-blue-400 to-cyan-500" },
  { key: "sbp", label: "Systolic BP", unit: "mmHg", normalMin: 90, normalMax: 140, icon: Heart, color: "from-orange-400 to-amber-500" },
  { key: "temp", label: "Temperature", unit: "°C", normalMin: 36.5, normalMax: 37.5, icon: Thermometer, color: "from-yellow-400 to-orange-500" },
  { key: "resp", label: "Resp. Rate", unit: "/min", normalMin: 12, normalMax: 20, icon: Activity, color: "from-violet-400 to-purple-500" },
];

function vitalColor(value: number | null, min: number, max: number): string {
  if (value === null) return "text-slate-400";
  if (value < min || value > max) return "text-red-400";
  const border = (max - min) * 0.15;
  if (value < min + border || value > max - border) return "text-amber-400";
  return "text-emerald-400";
}

function vitalBorderColor(value: number | null, min: number, max: number): string {
  if (value === null) return "border-white/5 bg-white/[0.02]";
  if (value < min || value > max) return "border-red-500/30 bg-red-500/[0.04]";
  const border = (max - min) * 0.15;
  if (value < min + border || value > max - border) return "border-amber-500/30 bg-amber-500/[0.04]";
  return "border-emerald-500/30 bg-emerald-500/[0.04]";
}

function vitalProgress(value: number | null, min: number, max: number): number {
  if (value === null) return 50;
  const range = max - min;
  const pct = ((value - (min - range)) / (range * 3)) * 100;
  return Math.max(2, Math.min(98, pct));
}

function VitalCard({ meta, readings, index }: { meta: (typeof VITALS_META)[number]; readings: VitalReading[]; index: number }) {
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

  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className={cn("rounded-2xl border p-4 transition-all duration-300 hover:-translate-y-1", border)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center", meta.color)}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            {meta.label}
          </span>
        </div>
        <span className={cn("text-sm font-mono font-bold", arrowColor)}>{arrow}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={cn("text-3xl font-mono font-bold", color)}>
          {curr != null ? curr.toFixed(1) : "—"}
        </span>
        <span className="text-xs text-slate-500 font-mono">{meta.unit}</span>
      </div>
      <div className="text-[10px] text-slate-600 font-mono mb-2">
        {meta.normalMin}–{meta.normalMax}
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", progressColor)}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}

function getBedNumber(patientId: string): string {
  const num = patientId.replace(/[^0-9]/g, "");
  return `Bed ${num || patientId}`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function DashboardPage() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

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
    <div className="min-h-screen relative">
      {/* Background gradient mesh */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-violet-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-600/5 rounded-full blur-3xl" />
      </div>

      <Toaster />

      {/* Top Stats Bar — Bento Grid */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pt-6"
      >
        <motion.div variants={itemVariants} className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-violet-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Patients Monitored
            </span>
          </div>
          <p className="text-3xl font-mono font-bold text-white">
            {loading ? "—" : patients.length}
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-red-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center gap-2 mb-2">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-white" />
              {critical > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-400 animate-ping opacity-75" />
              )}
            </div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Critical Alerts
            </span>
          </div>
          <p className={cn("text-3xl font-mono font-bold", critical > 0 ? "gradient-text-critical" : "text-slate-500")}>
            {loading ? "—" : critical}
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-amber-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
              <Clock className="w-4 h-4 text-white" />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Pending Review
            </span>
          </div>
          <p className={cn("text-3xl font-mono font-bold", pending > 0 ? "gradient-text-warning" : "text-slate-500")}>
            {loading ? "—" : pending}
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="glass-card rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-cyan-500/10 to-transparent rounded-bl-full" />
          <div className="flex items-center gap-2 mb-2">
            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
              <span className="relative flex h-2.5 w-2.5 absolute -top-0.5 -right-0.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-300" />
              </span>
              <Activity className="w-4 h-4 text-white" />
            </div>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              Pipeline Active
            </span>
          </div>
          <p className="text-3xl font-mono font-bold gradient-text-healthy">LIVE</p>
        </motion.div>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs"
        >
          {error}
        </motion.div>
      )}

      {/* Critical Alert Banner */}
      {pendingAlerts[0] && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mx-6 mt-4 neon-critical rounded-2xl relative overflow-hidden"
        >
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-red-500 to-rose-500 animate-border-flow bg-[length:200%_100%]" />
          <div className="p-4 pl-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold gradient-text-critical">
                  ANOMALY — Patient {pendingAlerts[0].patient_id}
                </p>
                <div className="flex gap-1.5 mt-1">
                  {pendingAlerts[0].vital_flags.map((f) => (
                    <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/20 font-mono">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleStatusChange(pendingAlerts[0].id, "acknowledged")}
                className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
              >
                Acknowledge
              </button>
              <button
                onClick={() => handleStatusChange(pendingAlerts[0].id, "escalated")}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors"
              >
                Escalate
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-0 px-6 mt-4 h-[calc(100vh-220px)]">
        {/* Left: Patient List */}
        <div className="w-80 flex-shrink-0 overflow-y-auto pr-4 space-y-2 scrollbar-thin">
          <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
            Patients ({patients.length})
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-2xl shimmer" />
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
              const glow = sev > 0.7 ? "neon-critical" : "";
              return (
                <motion.button
                  key={p.patient_id}
                  onClick={() => setSelectedId(p.patient_id)}
                  className={cn(
                    "w-full text-left rounded-2xl border border-white/5 border-l-4 p-4 transition-all duration-300 hover:-translate-y-0.5",
                    borderColor,
                    glow,
                    selectedId === p.patient_id
                      ? "bg-white/[0.06] ring-1 ring-violet-500/40"
                      : "bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-slate-100">{getBedNumber(p.patient_id)}</span>
                    <span className={cn(
                      "relative flex h-2.5 w-2.5",
                      sev > 0.7 ? "" : sev > 0.4 ? "" : ""
                    )}>
                      {sev > 0.7 && (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      )}
                      <span className={cn(
                        "relative inline-flex rounded-full h-2.5 w-2.5",
                        sev > 0.7 ? "bg-red-500" : sev > 0.4 ? "bg-amber-500" : "bg-emerald-500"
                      )} />
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    {p.latest_vitals?.hr !== undefined && (
                      <span className={cn(
                        "font-mono px-1.5 py-0.5 rounded text-[10px]",
                        (p.latest_vitals.hr < 60 || p.latest_vitals.hr > 100)
                          ? "bg-red-500/15 text-red-300 border border-red-500/20"
                          : "bg-white/5 text-slate-400 border border-white/5"
                      )}>
                        HR {p.latest_vitals.hr}
                      </span>
                    )}
                    {p.latest_vitals?.o2sat !== undefined && (
                      <span className={cn(
                        "font-mono px-1.5 py-0.5 rounded text-[10px]",
                        p.latest_vitals.o2sat < 95
                          ? "bg-red-500/15 text-red-300 border border-red-500/20"
                          : "bg-white/5 text-slate-400 border border-white/5"
                      )}>
                        SpO₂ {p.latest_vitals.o2sat}
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })
          )}
        </div>

        {/* Right: Patient Detail */}
        <div className="flex-1 overflow-y-auto pl-2 scrollbar-thin">
          {!selectedId ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-500 text-sm">Select a patient to view vitals</p>
              </div>
            </div>
          ) : readings.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-400" />
                </span>
                <span className="text-slate-500 text-sm">Loading vitals...</span>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              {/* Patient Header */}
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold text-white">{getBedNumber(selectedId)}</h1>
                <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
                  {selectedId}
                </span>
                <span className="relative flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                  LIVE
                </span>
                <Link href={`/patient/${selectedId}`} className="ml-auto">
                  <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1">
                    Full View <ArrowRight className="w-3 h-3" />
                  </Button>
                </Link>
              </div>

              {/* Vital Cards — Bento Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {VITALS_META.map((meta, i) => (
                  <VitalCard key={meta.key} meta={meta} readings={readings} index={i} />
                ))}
              </div>

              {/* Chart */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
                  Vital Signs History (last {Math.min(readings.length, 30)} readings)
                </p>
                <div className="glass-card rounded-2xl p-6">
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
                        <div key={alert.id} className="flex items-center justify-between rounded-2xl border border-red-500/15 bg-red-500/[0.03] p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                            </div>
                            <div>
                              <div className="flex gap-1.5">
                                {alert.vital_flags.map((f) => (
                                  <span key={f} className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20">
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
                            className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
                          >
                            Acknowledge
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
