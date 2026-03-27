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
  hr: "bg-red-900/60 text-red-300 border border-red-800",
  o2sat: "bg-blue-900/60 text-blue-300 border border-blue-800",
  temp: "bg-orange-900/60 text-orange-300 border border-orange-800",
  sbp: "bg-pink-900/60 text-pink-300 border border-pink-800",
  resp: "bg-yellow-900/60 text-yellow-300 border border-yellow-800",
  multivariate: "bg-purple-900/60 text-purple-300 border border-purple-800",
};

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "escalated", label: "Escalated" },
  { value: "resolved", label: "Resolved" },
];

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
  const sevBadgeStyle = (sev: number) =>
    sev > 0.7
      ? "bg-red-950 text-red-400 border border-red-800"
      : sev > 0.4
      ? "bg-amber-950 text-amber-400 border border-amber-800"
      : "bg-slate-800 text-slate-400 border border-slate-700";

  const statusPillStyle = (s: string) => ({
    pending: "bg-red-900/50 text-red-300 border border-red-800",
    acknowledged: "bg-amber-900/50 text-amber-300 border border-amber-800",
    escalated: "bg-orange-900/50 text-orange-300 border border-orange-800",
    resolved: "bg-emerald-900/50 text-emerald-300 border border-emerald-800",
  }[s] ?? "bg-slate-800 text-slate-400 border border-slate-700");

  return (
    <div className="min-h-screen">
      <Toaster />

      <div className="px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-white">Alerts</h1>
        <p className="text-xs text-slate-500 mt-0.5">Monitor and respond to patient anomalies</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3 px-6 mb-5">
        {[
          { label: "Total Today", value: todayAlerts.length, color: "text-white" },
          { label: "Pending", value: pending.length, color: pending.length > 0 ? "text-red-400" : "text-slate-500" },
          { label: "Acknowledged", value: acknowledged.length, color: "text-emerald-400" },
          { label: "Avg Response", value: avgResponse !== null ? `${Math.round(avgResponse)}m` : "—", color: "text-white" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 rounded-xl border border-slate-800 p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">{label}</p>
            <p className={`text-2xl font-mono font-bold mt-1 ${color}`}>
              {loading ? "—" : value}
            </p>
          </div>
        ))}
      </div>

      {/* Filter Row */}
      <div className="px-6 mb-4 flex gap-3 items-center">
        <div className="flex bg-slate-900 rounded-xl border border-slate-800 p-1 gap-0.5">
          {STATUS_TABS.map((tab) => {
            const count = tab.value === "" ? alerts.length
              : alerts.filter((a) => a.status === tab.value).length;
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  active
                    ? "bg-violet-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
                  active ? "bg-violet-500/40 text-violet-200" : "bg-slate-800 text-slate-500"
                )}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <Select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
          className="w-44 text-xs"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical (&gt;0.7)</option>
          <option value="warning">Warning (0.4–0.7)</option>
          <option value="normal">Normal (&lt;0.4)</option>
        </Select>

        <Input
          placeholder="Search patient..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-52 text-xs"
        />
      </div>

      {error && (
        <div className="mx-6 mb-4 p-3 rounded-lg bg-red-900/40 border border-red-800 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Alert Cards */}
      <div className="px-6 pb-6 space-y-3">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 bg-slate-900 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="text-emerald-400 text-2xl mb-2">✓</div>
            <p className="text-emerald-400 font-medium text-sm">All patients stable</p>
            <p className="text-xs text-slate-600 mt-1">No alerts match your filters</p>
          </div>
        )}

        {!loading && filtered.map((alert) => {
          const isCritical = alert.severity > 0.7;
          const leftColor = isCritical ? "border-l-red-500" : alert.severity > 0.4 ? "border-l-amber-500" : "border-l-slate-700";
          const glow = isCritical ? "shadow-red-900/20 shadow-lg" : "";

          return (
            <div
              key={alert.id}
              className={cn(
                "rounded-xl border border-slate-800 border-l-4 border-l-6 bg-slate-900 p-5 transition-all",
                leftColor,
                glow,
                flashingIds.has(alert.id) ? "bg-red-950/20" : ""
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Row 1: Patient + time + severity */}
                  <div className="flex items-center gap-3 mb-2.5 flex-wrap">
                    <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-violet-950/60 text-violet-300 border border-violet-800">
                      {getBedNumber(alert.patient_id)}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      {relativeTime(alert.triggered_at)}
                    </span>
                    <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded-full font-bold", sevBadgeStyle(alert.severity))}>
                      {sevColor(alert.severity)} · {(alert.severity * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Row 2: Vital flags */}
                  <div className="flex gap-1.5 mb-2.5 flex-wrap">
                    {alert.vital_flags.map((v) => (
                      <span key={v} className={cn("text-[10px] font-mono px-2 py-0.5 rounded", VITAL_COLORS[v] ?? "bg-slate-700 text-slate-300 border border-slate-600")}>
                        {v}
                      </span>
                    ))}
                  </div>

                  {/* Row 3: Tier + status */}
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded",
                      alert.tier === 1
                        ? "bg-blue-950/60 text-blue-300 border border-blue-800"
                        : "bg-purple-950/60 text-purple-300 border border-purple-800"
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
                      <button
                        onClick={() => handleStatusChange(alert.id, "acknowledged")}
                        className="text-[11px] px-3 py-1.5 rounded-lg border border-amber-700 text-amber-400 hover:bg-amber-900/30 transition-colors whitespace-nowrap"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => handleStatusChange(alert.id, "escalated")}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-red-900/50 border border-red-700 text-red-300 hover:bg-red-900/80 transition-colors whitespace-nowrap"
                      >
                        Escalate
                      </button>
                    </>
                  )}
                  {alert.status === "resolved" && (
                    <span className="text-[11px] px-3 py-1.5 rounded-lg bg-emerald-900/50 border border-emerald-800 text-emerald-400">
                      Resolved
                    </span>
                  )}
                  <Dialog>
                    <DialogTrigger>
                      <button
                        onClick={() => { setNoteAlert(alert); setNoteText(alert.notes ?? ""); }}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700 transition-colors whitespace-nowrap"
                      >
                        + Note
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-base">Add Note — {alert.patient_id}</DialogTitle>
                      </DialogHeader>
                      <Textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Clinical observations..."
                        className="mt-2 text-sm"
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
