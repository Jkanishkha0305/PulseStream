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

const VITALS_META = [
  {
    key: "hr",
    label: "Heart Rate",
    unit: "bpm",
    normalMin: 60,
    normalMax: 100,
    badDirection: "up" as const,
    color: "#f87171",
  },
  {
    key: "sbp",
    label: "Systolic BP",
    unit: "mmHg",
    normalMin: 90,
    normalMax: 140,
    badDirection: "up" as const,
    color: "#fb923c",
  },
  {
    key: "o2sat",
    label: "SpO₂",
    unit: "%",
    normalMin: 95,
    normalMax: 100,
    badDirection: "down" as const,
    color: "#38bdf8",
  },
  {
    key: "temp",
    label: "Temperature",
    unit: "°C",
    normalMin: 36.5,
    normalMax: 37.5,
    badDirection: "up" as const,
    color: "#facc15",
  },
  {
    key: "resp",
    label: "Resp. Rate",
    unit: "/min",
    normalMin: 12,
    normalMax: 20,
    badDirection: "up" as const,
    color: "#a78bfa",
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
  if (value === null) return "border-slate-800";
  if (value < normalMin || value > normalMax) return "border-red-500/40 bg-red-500/5";
  const border = (normalMax - normalMin) * 0.15;
  if (value < normalMin + border || value > normalMax - border) return "border-amber-500/40 bg-amber-500/5";
  return "border-emerald-500/40 bg-emerald-500/5";
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
}: {
  meta: (typeof VITALS_META)[number];
  readings: VitalReading[];
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

  return (
    <div className={`rounded-2xl border p-5 ${border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
          {meta.label}
        </span>
        <TrendArrow prev={prev} curr={curr} badDirection={meta.badDirection} />
      </div>
      <div className="flex items-baseline gap-1.5 mb-1">
        <span className={`text-4xl font-mono font-bold ${color}`}>
          {curr !== null ? curr.toFixed(1) : "—"}
        </span>
        <span className="text-sm font-mono text-slate-500">{meta.unit}</span>
      </div>
      <div className="text-[10px] text-slate-600 font-mono mb-2">
        {meta.normalMin}–{meta.normalMax}
      </div>
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${progressColor}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
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
    <div className="min-h-screen">
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/dashboard" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            ← Dashboard
          </Link>
          <span className="text-slate-700">/</span>
          <h1 className="text-xl font-semibold text-white">{getBedNumber(patientId)}</h1>
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
            {patientId}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-900 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="text-[10px] text-slate-600 font-mono">
          {readings[0] ? `Admitted ${new Date(readings[0].timestamp).toLocaleDateString()}` : "—"}
        </p>
      </div>

      {loading ? (
        <div className="px-6">
          <div className="flex justify-center py-16">
            <div className="w-3 h-3 rounded-full bg-violet-500 animate-pulse" />
          </div>
        </div>
      ) : (
        <>
          {/* Vital Cards */}
          <div className="px-6 grid grid-cols-5 gap-3">
            {VITALS_META.map((meta) => (
              <VitalCard key={meta.key} meta={meta} readings={readings} />
            ))}
          </div>

          {/* Chart */}
          <div className="px-6">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
              Vital Signs History
            </p>
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <Tabs defaultValue="all" className="w-full">
                <TabsList className="mb-4 bg-slate-800 border border-slate-700">
                  <TabsTrigger value="1h" className="data-[state=active]:bg-violet-600 text-xs">1H</TabsTrigger>
                  <TabsTrigger value="6h" className="data-[state=active]:bg-violet-600 text-xs">6H</TabsTrigger>
                  <TabsTrigger value="all" className="data-[state=active]:bg-violet-600 text-xs">All</TabsTrigger>
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
          </div>

          {/* Alert Timeline */}
          <div className="px-6">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-medium mb-3">
              Alert Timeline
            </p>
            {alerts.length === 0 ? (
              <div className="text-center py-10 rounded-xl border border-slate-800 text-slate-600">
                <div className="text-lg mb-1">✓</div>
                <p className="text-xs">No alerts for this patient</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => {
                  const isCritical = alert.severity > 0.7;
                  return (
                    <div
                      key={alert.id}
                      className={`rounded-xl border border-slate-800 border-l-4 p-4 ${
                        isCritical ? "border-l-red-500 bg-red-950/10" : "border-l-amber-500 bg-amber-950/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {alert.vital_flags.map((v) => (
                              <span
                                key={v}
                                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                  isCritical
                                    ? "bg-red-900/60 text-red-300 border border-red-800"
                                    : "bg-amber-900/60 text-amber-300 border border-amber-800"
                                }`}
                              >
                                {v}
                              </span>
                            ))}
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                              alert.tier === 1
                                ? "bg-blue-900/60 text-blue-300 border border-blue-800"
                                : "bg-purple-900/60 text-purple-300 border border-purple-800"
                            }`}>
                              {alert.tier === 1 ? "Tier 1" : "Tier 2 ML"}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-mono">
                            {relativeTime(alert.triggered_at)} · Severity {(alert.severity * 100).toFixed(0)}%
                          </p>
                        </div>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border capitalize ${
                          alert.status === "pending" ? "bg-red-900/50 text-red-300 border-red-800" :
                          alert.status === "acknowledged" ? "bg-amber-900/50 text-amber-300 border-amber-800" :
                          alert.status === "escalated" ? "bg-orange-900/50 text-orange-300 border-orange-800" :
                          "bg-emerald-900/50 text-emerald-300 border-emerald-800"
                        }`}>
                          {alert.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Performance */}
          <div className="px-6">
            <Accordion type="single" collapsible>
              <AccordionItem value="performance">
                <AccordionTrigger className="text-sm font-semibold text-slate-300 hover:text-white">
                  Pipeline Performance
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
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="name" stroke="#334155" fontSize={10} tick={{ fill: "#64748b" }} />
                          <YAxis stroke="#334155" fontSize={10} tick={{ fill: "#64748b" }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                            labelStyle={{ color: "#94a3b8" }}
                            formatter={(val: number, name: string) =>
                              name === "latency" ? [`${val.toFixed(2)} ms`, "Latency"] : [`${val.toFixed(1)}x`, "Speedup"]
                            }
                          />
                          <Bar dataKey="latency" name="Latency (ms)" radius={[3, 3, 0, 0]}>
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
                          <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
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
          </div>
        </>
      )}
    </div>
  );
}
