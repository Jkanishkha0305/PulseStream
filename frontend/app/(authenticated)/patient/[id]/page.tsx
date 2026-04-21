/**
 * PulseStream Patient Detail — "Dark Medical Futurism"
 *
 * Visual decisions:
 * - Header: gradient patient ID badge, breadcrumb with glass styling
 * - Vital cards: same glass treatment with expanded trend arrows + gradient icons
 * - Chart: tabbed time windows with animated tab indicator
 * - Alert timeline: vertical line with glass event cards
 * - Performance section: bar chart with gradient fills
 * - Framer motion for staggered entrance animations
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getPatient,
  getAlerts,
  getBenchmarkResults,
  VitalReading,
  Alert,
  BenchmarkResults,
} from "@/lib/api";
import VitalsChart from "@/components/VitalsChart";
import AlertTable from "@/components/AlertTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { motion } from "framer-motion";
import { HeartPulse, Wind, Heart, Thermometer, Activity, ArrowLeft, Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const VITALS_META = [
  {
    key: "hr",
    label: "Heart Rate",
    unit: "bpm",
    normalMin: 60,
    normalMax: 100,
    badDirection: "up" as const,
    color: "#ff4757",
    icon: HeartPulse,
    gradient: "from-rose-400 to-red-500",
  },
  {
    key: "sbp",
    label: "Systolic BP",
    unit: "mmHg",
    normalMin: 90,
    normalMax: 140,
    badDirection: "up" as const,
    color: "#ff6348",
    icon: Heart,
    gradient: "from-orange-400 to-amber-500",
  },
  {
    key: "o2sat",
    label: "SpO₂",
    unit: "%",
    normalMin: 95,
    normalMax: 100,
    badDirection: "down" as const,
    color: "#1e90ff",
    icon: Wind,
    gradient: "from-blue-400 to-cyan-500",
  },
  {
    key: "temp",
    label: "Temperature",
    unit: "°C",
    normalMin: 36.5,
    normalMax: 37.5,
    badDirection: "up" as const,
    color: "#ffa502",
    icon: Thermometer,
    gradient: "from-yellow-400 to-orange-500",
  },
  {
    key: "resp",
    label: "Resp. Rate",
    unit: "/min",
    normalMin: 12,
    normalMax: 20,
    badDirection: "up" as const,
    color: "#a29bfe",
    icon: Activity,
    gradient: "from-violet-400 to-purple-500",
  },
];

function getVitalColor(
  value: number | null,
  normalMin: number,
  normalMax: number
): string {
  if (value === null) return "text-slate-400";
  if (value < normalMin || value > normalMax) return "text-red-400";
  const border = (normalMax - normalMin) * 0.15;
  if (value < normalMin + border || value > normalMax - border) return "text-amber-400";
  return "text-emerald-400";
}

function getVitalBorder(
  value: number | null,
  normalMin: number,
  normalMax: number
): string {
  if (value === null) return "border-white/5 bg-white/[0.02]";
  if (value < normalMin || value > normalMax) return "border-red-500/30 bg-red-500/[0.04]";
  const border = (normalMax - normalMin) * 0.15;
  if (value < normalMin + border || value > normalMax - border) return "border-amber-500/30 bg-amber-500/[0.04]";
  return "border-emerald-500/30 bg-emerald-500/[0.04]";
}

function TrendArrow({
  prev,
  curr,
  badDirection,
}: {
  prev: number | null;
  curr: number | null;
  badDirection: "up" | "down";
}) {
  if (prev === null || curr === null) return <span className="text-slate-600">—</span>;
  const delta = curr - prev;
  const isBad =
    (badDirection === "up" && delta > 1) || (badDirection === "down" && delta < -1);
  const isGood =
    (badDirection === "up" && delta < -1) || (badDirection === "down" && delta > 1);

  if (isBad) return <span className="text-red-400 text-lg">↑</span>;
  if (isGood) return <span className="text-emerald-400 text-lg">↓</span>;
  return <span className="text-slate-600 text-lg">→</span>;
}

function VitalCard({
  meta,
  readings,
  index,
}: {
  meta: (typeof VITALS_META)[number];
  readings: VitalReading[];
  index: number;
}) {
  const curr = readings[0]?.[meta.key as keyof VitalReading] as number | null;
  const prev = readings[1]?.[meta.key as keyof VitalReading] as number | null;
  const color = getVitalColor(curr, meta.normalMin, meta.normalMax);
  const border = getVitalBorder(curr, meta.normalMin, meta.normalMax);
  const range = meta.normalMax - meta.normalMin;
  const progress = curr !== null
    ? Math.max(2, Math.min(98, ((curr - (meta.normalMin - range)) / (range * 3)) * 100))
    : 50;
  const progressColor = curr === null ? "bg-slate-700"
    : curr < meta.normalMin || curr > meta.normalMax ? "bg-red-500"
    : curr < meta.normalMin + range * 0.15 || curr > meta.normalMax - range * 0.15 ? "bg-amber-500"
    : "bg-emerald-500";

  const Icon = meta.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className={`rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 ${border}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center ${meta.gradient}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            {meta.label}
          </span>
        </div>
        <TrendArrow prev={prev} curr={curr} badDirection={meta.badDirection} />
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={`text-3xl font-mono font-bold ${color}`}>
          {curr != null ? curr.toFixed(1) : "—"}
        </span>
        <span className="text-sm font-mono text-slate-500">{meta.unit}</span>
      </div>
      <div className="text-[10px] text-slate-600 font-mono mb-2">
        {meta.normalMin}–{meta.normalMax}
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${progressColor}`} style={{ width: `${progress}%` }} />
      </div>
    </motion.div>
  );
}

const STAGE_COLORS: Record<string, string> = {
  Baseline: "#94a3b8",
  NumPy: "#38bdf8",
  "Numba JIT": "#a78bfa",
  Multiprocessing: "#34d399",
  Float32: "#fbbf24",
};

function relativeTime(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return iso; }
}

function getBedNumber(patientId: string): string {
  const num = patientId.replace(/[^0-9]/g, "");
  return `Bed ${num || patientId}`;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = params.id as string;
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResults | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([
        getPatient(patientId),
        getAlerts({ patient_id: patientId }),
      ]);
      setReadings(r);
      setAlerts(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    getBenchmarkResults()
      .then((b) => setBenchmark(b))
      .catch(() => {});
  }, []);

  const chartData = readings
    .slice()
    .reverse()
    .map((r) => ({
      ...r,
    }));

  const benchmarkData = benchmark?.results
    ? benchmark.results.map((r) => ({
        name: r.stage,
        latency: r.latency_ms,
        speedup: r.speedup,
        memory: r.memory_mb,
      }))
    : null;

  const avgLatency =
    benchmarkData && benchmarkData.length > 0
      ? (
          benchmarkData.reduce((s, r) => s + r.latency, 0) / benchmarkData.length
        ).toFixed(2)
      : null;

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-cyan-600/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-6 pt-6 pb-4 relative z-10"
      >
        <div className="flex items-center gap-3 mb-1">
          <Link href="/dashboard" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Dashboard
          </Link>
          <span className="text-slate-700">/</span>
          <h1 className="text-xl font-semibold text-white">{getBedNumber(patientId)}</h1>
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-white/5 text-slate-400 border border-white/10">
            {patientId}
          </span>
          <span className="relative flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 ml-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            LIVE
          </span>
        </div>
        <p className="text-[10px] text-slate-600 font-mono">
          {readings[0] ? `Admitted ${new Date(readings[0].timestamp).toLocaleDateString()}` : "—"}
        </p>
      </motion.div>

      {loading ? (
        <div className="px-6">
          <div className="flex justify-center py-16">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-violet-400" />
            </div>
          </div>
        </div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Vital Cards */}
          <div className="px-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {VITALS_META.map((meta, i) => (
              <VitalCard key={meta.key} meta={meta} readings={readings} index={i} />
            ))}
          </div>

          {/* Chart */}
          <motion.div variants={itemVariants} className="px-6 mt-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
              Vital Signs History
            </p>
            <div className="glass-card rounded-2xl p-6">
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="mb-4 bg-white/5 border border-white/10 rounded-xl p-1">
                  {["1h", "6h", "all"].map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-violet-500/20 text-xs rounded-lg"
                    >
                      {tab === "1h" ? "1H" : tab === "6h" ? "6H" : "All"}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="1h">
                  <VitalsChart data={chartData.slice(-30)} height={260} />
                </TabsContent>
                <TabsContent value="6h">
                  <VitalsChart data={chartData.slice(-180)} height={260} />
                </TabsContent>
                <TabsContent value="all">
                  <VitalsChart data={chartData} height={260} />
                </TabsContent>
              </Tabs>
            </div>
          </motion.div>

          {/* Alert Timeline */}
          <motion.div variants={itemVariants} className="px-6 mt-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
              Alert Timeline
            </p>
            {alerts.length === 0 ? (
              <div className="text-center py-10 rounded-2xl glass-card">
                <div className="w-12 h-12 rounded-xl glass flex items-center justify-center mx-auto mb-3">
                  <span className="text-emerald-400 text-xl">✓</span>
                </div>
                <p className="text-xs text-slate-500">No alerts for this patient</p>
              </div>
            ) : (
              <div className="relative space-y-3 pl-6">
                {/* Vertical timeline line */}
                <div className="absolute left-2.5 top-2 bottom-2 w-px bg-gradient-to-b from-violet-500/30 via-white/5 to-transparent" />

                {alerts.map((alert) => {
                  const isCritical = alert.severity > 0.7;
                  return (
                    <div key={alert.id} className="relative">
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute -left-6 top-5 w-3 h-3 rounded-full border-2 border-space",
                        isCritical ? "bg-red-500" : "bg-amber-500"
                      )} />

                      <div className={cn(
                        "glass-card rounded-2xl p-4",
                        isCritical && "neon-critical"
                      )}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {alert.vital_flags.map((v) => (
                                <span
                                  key={v}
                                  className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                    isCritical
                                      ? "bg-red-500/15 text-red-300 border border-red-500/20"
                                      : "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                                  }`}
                                >
                                  {v}
                                </span>
                              ))}
                              <span className={cn(
                                "text-[10px] font-mono px-2 py-0.5 rounded",
                                alert.tier === 1
                                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
                                  : "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                              )}>
                                {alert.tier === 1 ? "Tier 1" : "Tier 2 ML"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 font-mono">
                              {relativeTime(alert.triggered_at)} · Severity {(alert.severity * 100).toFixed(0)}%
                            </p>
                          </div>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border capitalize ${
                            alert.status === "pending" ? "bg-red-500/15 text-red-300 border-red-500/20" :
                            alert.status === "acknowledged" ? "bg-amber-500/15 text-amber-300 border-amber-500/20" :
                            alert.status === "escalated" ? "bg-orange-500/15 text-orange-300 border-orange-500/20" :
                            "bg-emerald-500/15 text-emerald-300 border-emerald-500/20"
                          }`}>
                            {alert.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Performance */}
          <motion.div variants={itemVariants} className="px-6 mt-4 mb-6">
            <Accordion type="single" collapsible>
              <AccordionItem value="performance" className="border-white/5">
                <AccordionTrigger className="text-sm font-semibold text-slate-300 hover:text-white [&[data-state=open]>svg]:rotate-180">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-400" />
                    Pipeline Performance
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  {!benchmarkData ? (
                    <div className="text-xs text-slate-500 py-4 font-mono">
                      Run <code className="text-violet-400">make benchmark</code> to generate performance data.
                    </div>
                  ) : (
                    <div className="space-y-4 pt-2">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={benchmarkData} margin={{ left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                          <XAxis dataKey="name" stroke="rgba(255,255,255,0.1)" fontSize={10} tick={{ fill: "#64748b" }} />
                          <YAxis stroke="rgba(255,255,255,0.1)" fontSize={10} tick={{ fill: "#64748b" }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "rgba(15, 23, 42, 0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, backdropFilter: "blur(12px)" }}
                            labelStyle={{ color: "#94a3b8" }}
                            formatter={(val: number, name: string) =>
                              name === "latency" ? [`${val.toFixed(2)} ms`, "Latency"] : [`${val.toFixed(1)}x`, "Speedup"]
                            }
                          />
                          <Bar dataKey="latency" name="Latency (ms)" radius={[4, 4, 0, 0]}>
                            {benchmarkData.map((entry) => (
                              <Cell key={entry.name} fill={STAGE_COLORS[entry.name] ?? "#94a3b8"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Current Mode", value: "Numba + Float32", color: "text-violet-400" },
                          { label: "Avg Latency", value: `${avgLatency} ms`, color: "text-white" },
                          { label: "Throughput", value: `${benchmark?.n_patients ?? "—"} pts/cycle`, color: "text-emerald-400" },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                            <div className="text-[10px] uppercase tracking-widest text-slate-600">{label}</div>
                            <div className={`text-sm font-mono font-semibold mt-1 ${color}`}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
