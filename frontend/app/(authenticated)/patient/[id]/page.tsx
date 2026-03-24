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
    badDirection: "up",
    color: "#f87171",
  },
  {
    key: "sbp",
    label: "Systolic BP",
    unit: "mmHg",
    normalMin: 90,
    normalMax: 140,
    badDirection: "up",
    color: "#fb923c",
  },
  {
    key: "o2sat",
    label: "SpO₂",
    unit: "%",
    normalMin: 95,
    normalMax: 100,
    badDirection: "down",
    color: "#38bdf8",
  },
  {
    key: "temp",
    label: "Temperature",
    unit: "°C",
    normalMin: 36.5,
    normalMax: 37.5,
    badDirection: "up",
    color: "#facc15",
  },
  {
    key: "resp",
    label: "Resp. Rate",
    unit: "/min",
    normalMin: 12,
    normalMax: 20,
    badDirection: "up",
    color: "#a78bfa",
  },
];

function getVitalColor(
  value: number | null,
  normalMin: number,
  normalMax: number
): string {
  if (value === null) return "text-slate-400";
  const border = (normalMax - normalMin) * 0.1;
  if (value < normalMin) return "text-red-400";
  if (value <= normalMin + border) return "text-yellow-400";
  if (value >= normalMax - border) return "text-yellow-400";
  if (value > normalMax) return "text-red-400";
  return "text-emerald-400";
}

function getVitalBorder(
  value: number | null,
  normalMin: number,
  normalMax: number
): string {
  if (value === null) return "border-slate-800";
  const border = (normalMax - normalMin) * 0.1;
  if (value < normalMin || value > normalMax) return "border-red-500/50 bg-red-500/5";
  if (value < normalMin + border || value > normalMax - border) return "border-yellow-500/50 bg-yellow-500/5";
  return "border-emerald-500/50 bg-emerald-500/5";
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

  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
          {meta.label}
        </span>
        <TrendArrow prev={prev} curr={curr} badDirection={meta.badDirection} />
      </div>
      <div className={`text-3xl font-bold ${color}`}>
        {curr !== null ? curr.toFixed(1) : "—"}
        <span className="text-sm font-normal text-slate-400 ml-1">{meta.unit}</span>
      </div>
      <div className="text-xs text-slate-500 mt-1">
        {meta.normalMin}–{meta.normalMax} {meta.unit}
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

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = params.id as string;
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResults | null>(null);
  const [loading, setLoading] = useState(true);

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
    <div className="p-6 space-y-6 max-w-7xl">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          ← Back to Dashboard
        </Link>
        <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
        <h1 className="text-2xl font-bold">{patientId}</h1>
        <span className="text-sm text-slate-400">Bed 12A</span>
        <span className="text-sm text-slate-500">
          Admitted {readings[0] ? new Date(readings[0].timestamp).toLocaleDateString() : "—"}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3">
            {VITALS_META.map((meta) => (
              <VitalCard key={meta.key} meta={meta} readings={readings} />
            ))}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Vitals History</h2>
            <Tabs defaultValue="all" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="1h">1 Hour</TabsTrigger>
                <TabsTrigger value="6h">6 Hours</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
              <TabsContent value="1h">
                <VitalsChart
                  patientId={patientId}
                  data={chartData.slice(-30)}
                />
              </TabsContent>
              <TabsContent value="6h">
                <VitalsChart
                  patientId={patientId}
                  data={chartData.slice(-180)}
                />
              </TabsContent>
              <TabsContent value="all">
                <VitalsChart patientId={patientId} data={chartData} />
              </TabsContent>
            </Tabs>
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3">Alert Timeline</h2>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center py-12 rounded-xl border border-slate-800 text-slate-500">
                <div className="text-3xl mb-2">✅</div>
                <p>No alerts for this patient</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => {
                  const isCritical = alert.severity > 0.7;
                  return (
                    <div
                      key={alert.id}
                      className={`rounded-xl border-l-4 ${
                        isCritical
                          ? "border-red-500 bg-red-500/5"
                          : "border-yellow-500 bg-yellow-500/5"
                      } border border-slate-800 p-4`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap gap-2 mb-2">
                            {alert.vital_flags.map((v) => (
                              <span
                                key={v}
                                className={`text-xs px-2 py-0.5 rounded-full border ${
                                  isCritical
                                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                                    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                                }`}
                              >
                                {v}
                              </span>
                            ))}
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border ${
                                isCritical
                                  ? "bg-red-500/20 text-red-400 border-red-500/30"
                                  : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                              }`}
                            >
                              Tier {alert.tier}
                            </span>
                          </div>
                          <div className="text-sm text-slate-400">
                            {new Date(alert.triggered_at).toLocaleString()}
                            {" — "}
                            <span className="text-slate-300">
                              Severity: {(alert.severity * 100).toFixed(1)}%
                            </span>
                          </div>
                          {alert.acknowledged_at && (
                            <div className="text-xs text-slate-500 mt-1">
                              Acknowledged at{" "}
                              {new Date(alert.acknowledged_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div
                          className={`text-xs px-3 py-1 rounded-full border ${
                            alert.status === "pending"
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          }`}
                        >
                          {alert.status}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Accordion type="single" collapsible>
            <AccordionItem value="performance">
              <AccordionTrigger className="text-base font-semibold">
                Pipeline Performance (Advanced Python)
              </AccordionTrigger>
              <AccordionContent>
                {!benchmarkData ? (
                  <div className="text-sm text-slate-400 py-4">
                    Run <code className="text-purple-400">make benchmark</code> to
                    generate performance data.
                  </div>
                ) : (
                  <div className="space-y-6 py-4">
                    <div className="text-xs text-slate-500 italic mb-2">
                      (Pre-computed — run make benchmark to update)
                    </div>

                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={benchmarkData} margin={{ left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} label={{ value: "ms", angle: -90, position: "insideLeft", fill: "#64748b" }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#0f172a",
                            border: "1px solid #1e293b",
                            borderRadius: 8,
                          }}
                          labelStyle={{ color: "#94a3b8" }}
                          formatter={(val: number, name: string) =>
                            name === "latency"
                              ? [`${val.toFixed(2)} ms`, "Latency"]
                              : [`${val.toFixed(1)}x`, "Speedup"]
                          }
                        />
                        <Bar dataKey="latency" name="Latency (ms)" radius={[4, 4, 0, 0]}>
                          {benchmarkData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={STAGE_COLORS[entry.name] ?? "#94a3b8"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                        <div className="text-slate-400">Current Mode</div>
                        <div className="font-semibold text-purple-400 mt-1">
                          Numba + Float32
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                        <div className="text-slate-400">Avg Latency</div>
                        <div className="font-semibold text-white mt-1">
                          {avgLatency} ms
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                        <div className="text-slate-400">Throughput</div>
                        <div className="font-semibold text-emerald-400 mt-1">
                          {benchmark?.n_patients ?? "—"} patients/cycle
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  );
}
