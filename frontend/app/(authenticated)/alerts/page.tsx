/**
 * PulseStream Alerts Page — "Dark Medical Futurism"
 *
 * Visual decisions:
 * - Stats row: 4 mini glass cards with gradient icon badges
 * - Filter bar: glass morphism pill tabs with counts
 * - Alert cards: full glass treatment, severity shown as animated gradient bar
 * - Critical alerts: red glow halo on entire card
 * - Acknowledge button: satisfying press animation via framer-motion
 * - Framer motion for staggered entrance + shake on new critical alerts
 */

"use client";

import { useEffect, useState, useCallback } from "react";
import { getAlerts, updateAlert, type Alert } from "@/lib/api";
import { createClient } from "@/lib/supabase";
import { Toaster, toaster } from "@/components/ui/sonner";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle, Clock, BarChart3, Search, Filter } from "lucide-react";

type StatusFilter = "" | "pending" | "acknowledged" | "escalated" | "resolved";
type SeverityFilter = "" | "critical" | "warning" | "normal";

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

const VITAL_COLORS: Record<string, string> = {
  hr: "bg-red-500/15 text-red-300 border border-red-500/20",
  o2sat: "bg-blue-500/15 text-blue-300 border border-blue-500/20",
  temp: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
  sbp: "bg-pink-500/15 text-pink-300 border border-pink-500/20",
  resp: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/20",
  multivariate: "bg-purple-500/15 text-purple-300 border border-purple-500/20",
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("");
  const [search, setSearch] = useState("");
  const [noteAlert, setNoteAlert] = useState<Alert | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  const supabase = createClient();

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts({ limit: 100 });
      setAlerts(data);
      setError(null);
    } catch { setError("Unable to connect to backend."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  useEffect(() => {
    const channel = supabase
      .channel("alerts-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload) => {
        const a = payload.new as Alert;
        setAlerts((prev) => [a, ...prev]);
        setFlashingIds((prev) => new Set([...prev, a.id]));
        setTimeout(() => setFlashingIds((prev) => { const n = new Set(prev); n.delete(a.id); return n; }), 2000);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "alerts" }, (payload) => {
        const u = payload.new as Alert;
        setAlerts((prev) => prev.map((a) => a.id === u.id ? u : a));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateAlert(id, newStatus);
      toaster().toast({ type: "success", title: newStatus === "acknowledged" ? "Alert acknowledged" : newStatus === "escalated" ? "Escalated to doctor" : `Alert ${newStatus}` });
      await fetchAlerts();
    } catch { toaster().toast({ type: "error", title: "Failed to update alert" }); }
  };

  const handleAddNote = async () => {
    if (!noteAlert) return;
    setSaving(true);
    try {
      await updateAlert(noteAlert.id, noteAlert.status, noteText);
      toaster().toast({ type: "success", title: "Note saved" });
      setNoteAlert(null); setNoteText("");
      await fetchAlerts();
    } catch { toaster().toast({ type: "error", title: "Failed to save note" }); }
    finally { setSaving(false); }
  };

  const today = new Date().toDateString();
  const todayAlerts = alerts.filter((a) => new Date(a.triggered_at).toDateString() === today);
  const pending = alerts.filter((a) => a.status === "pending");
  const acknowledged = alerts.filter((a) => a.status === "acknowledged");
  const critical = alerts.filter((a) => a.severity > 0.7);
  const ackedWithTime = alerts.filter((a) => a.status === "acknowledged" && a.acknowledged_at);
  const avgResponse = ackedWithTime.length > 0
    ? ackedWithTime.reduce((s, a) => s + (new Date(a.acknowledged_at!).getTime() - new Date(a.triggered_at).getTime()) / 60000, 0) / ackedWithTime.length
    : null;

  const filtered = alerts.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (severityFilter) {
      if (severityFilter === "critical" && a.severity <= 0.7) return false;
      if (severityFilter === "warning" && (a.severity <= 0.4 || a.severity > 0.7)) return false;
      if (severityFilter === "normal" && a.severity > 0.4) return false;
    }
    if (search && !a.patient_id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sevColor = (sev: number) =>
    sev > 0.7 ? "CRITICAL" : sev > 0.4 ? "WARNING" : "LOW";

  const statusPillStyle = (s: string) => ({
    pending: "bg-red-500/15 text-red-300 border border-red-500/20",
    acknowledged: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
    escalated: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
    resolved: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  }[s] ?? "bg-white/5 text-slate-400 border border-white/10");

  return (
    <div className="min-h-screen relative">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-0 w-[400px] h-[400px] bg-red-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[300px] h-[300px] bg-violet-600/5 rounded-full blur-3xl" />
      </div>

      <Toaster />

      <div className="px-6 pt-6 pb-4 relative z-10">
        <h1 className="text-2xl font-bold gradient-text">Alerts</h1>
        <p className="text-xs text-slate-500 mt-1">Monitor and respond to patient anomalies</p>
      </div>

      {/* Stats Bar */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 mb-5 relative z-10"
      >
        {[
          { label: "Total Today", value: todayAlerts.length, color: "text-white", icon: BarChart3, gradient: "from-slate-400 to-slate-500" },
          { label: "Pending", value: pending.length, color: pending.length > 0 ? "gradient-text-critical" : "text-slate-500", icon: AlertTriangle, gradient: "from-red-400 to-rose-500" },
          { label: "Acknowledged", value: acknowledged.length, color: "gradient-text-healthy", icon: CheckCircle, gradient: "from-cyan-400 to-teal-500" },
          { label: "Avg Response", value: avgResponse !== null ? `${Math.round(avgResponse)}m` : "—", color: "text-white", icon: Clock, gradient: "from-amber-400 to-yellow-500" },
        ].map(({ label, value, color, icon: Icon, gradient }) => (
          <motion.div key={label} variants={itemVariants} className="glass-card rounded-2xl p-4 relative overflow-hidden">
            <div className={cn("absolute top-0 right-0 w-16 h-16 bg-gradient-to-br rounded-bl-full opacity-10", gradient)} />
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center", gradient)}>
                <Icon className="w-3 h-3 text-white" />
              </div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">{label}</p>
            </div>
            <p className={cn("text-2xl font-mono font-bold mt-1", color)}>
              {loading ? "—" : value}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* Filter Row */}
      <div className="px-6 mb-4 flex gap-3 items-center flex-wrap relative z-10">
        <div className="flex glass rounded-xl p-1 gap-0.5">
          {STATUS_TABS.map((tab) => {
            const count = tab.value === "" ? alerts.length
              : alerts.filter((a) => a.status === tab.value).length;
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                  active
                    ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
                  active ? "bg-white/20 text-violet-100" : "bg-white/5 text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            placeholder="Search patient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 text-xs glass-input rounded-xl pl-9"
          />
        </div>

        <Select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="w-44 text-xs glass-input rounded-xl"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical (&gt;0.7)</option>
          <option value="warning">Warning (0.4–0.7)</option>
          <option value="normal">Normal (&lt;0.4)</option>
        </Select>
      </div>

      {error && (
        <div className="mx-6 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs relative z-10">
          {error}
        </div>
      )}

      {/* Alert Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="px-6 pb-6 space-y-3 relative z-10"
      >
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl shimmer" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <motion.div variants={itemVariants} className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-emerald-400 font-medium text-sm">All patients stable</p>
            <p className="text-xs text-slate-600 mt-1">No alerts match your filters</p>
          </motion.div>
        )}

        {!loading && filtered.map((alert) => {
          const isCritical = alert.severity > 0.7;
          const isFlashing = flashingIds.has(alert.id);
          const severityPct = (alert.severity * 100).toFixed(0);
          const severityGradient = isCritical
            ? "from-red-500 to-rose-500"
            : alert.severity > 0.4
            ? "from-amber-500 to-yellow-500"
            : "from-slate-500 to-slate-600";

          return (
            <motion.div
              key={alert.id}
              variants={itemVariants}
              animate={isFlashing && isCritical ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={isFlashing && isCritical ? { duration: 0.4 } : {}}
              className={cn(
                "glass-card rounded-2xl p-5 relative overflow-hidden",
                isCritical && "neon-critical",
                isFlashing && "bg-red-500/10"
              )}
            >
              {/* Severity gradient bar */}
              <div className={cn("absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b", severityGradient)} />

              <div className="flex items-start justify-between gap-4 pl-3">
                <div className="flex-1 min-w-0">
                  {/* Row 1: Patient + time + severity */}
                  <div className="flex items-center gap-3 mb-2.5 flex-wrap">
                    <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                      {getBedNumber(alert.patient_id)}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {relativeTime(alert.triggered_at)}
                    </span>
                    <span className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded-full font-bold",
                      isCritical
                        ? "bg-red-500/15 text-red-300 border border-red-500/20"
                        : alert.severity > 0.4
                        ? "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                        : "bg-white/5 text-slate-400 border border-white/10"
                    )}>
                      {sevColor(alert.severity)} · {severityPct}%
                    </span>
                  </div>

                  {/* Row 2: Vital flags */}
                  <div className="flex gap-1.5 mb-2.5 flex-wrap">
                    {alert.vital_flags.map((v) => (
                      <span key={v} className={cn("text-[10px] font-mono px-2 py-0.5 rounded", VITAL_COLORS[v] ?? "bg-white/5 text-slate-300 border border-white/10")}>
                        {v}
                      </span>
                    ))}
                  </div>

                  {/* Row 3: Tier + status */}
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded",
                      alert.tier === 1
                        ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
                        : "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                    )}>
                      {alert.tier === 1 ? "Tier 1 Statistical" : "Tier 2 ML"}
                    </span>
                    <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded capitalize", statusPillStyle(alert.status))}>
                      {alert.status}
                    </span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-col gap-1.5 items-end flex-shrink-0">
                  {(alert.status === "pending" || alert.status === "acknowledged") && (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleStatusChange(alert.id, "acknowledged")}
                        className="text-[11px] px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors whitespace-nowrap"
                      >
                        Acknowledge
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleStatusChange(alert.id, "escalated")}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors whitespace-nowrap"
                      >
                        Escalate
                      </motion.button>
                    </>
                  )}
                  {alert.status === "resolved" && (
                    <span className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/20 text-emerald-400">
                      Resolved
                    </span>
                  )}
                  <Dialog>
                    <DialogTrigger>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { setNoteAlert(alert); setNoteText(alert.notes ?? ""); }}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-colors whitespace-nowrap"
                      >
                        + Note
                      </motion.button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-base">Add Note — {alert.patient_id}</DialogTitle>
                      </DialogHeader>
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Clinical observations..."
                        className="mt-2 text-sm glass-input rounded-xl"
                      />
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setNoteAlert(null)}>Cancel</Button>
                        <Button onClick={handleAddNote} disabled={saving} size="sm">
                          {saving ? "Saving..." : "Save Note"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
