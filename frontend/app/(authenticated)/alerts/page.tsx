"use client";

import { useEffect, useState, useCallback } from "react";
import { getAlerts, updateAlert, type Alert } from "@/lib/api";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Toaster, toaster } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type StatusFilter = "" | "pending" | "acknowledged" | "escalated" | "resolved";
type SeverityFilter = "" | "critical" | "warning" | "normal";

function relativeTime(iso: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return iso;
  }
}

const VITAL_COLORS: Record<string, string> = {
  hr: "bg-red-900 text-red-300 border border-red-700",
  o2sat: "bg-blue-900 text-blue-300 border border-blue-700",
  temp: "bg-orange-900 text-orange-300 border border-orange-700",
  sbp: "bg-pink-900 text-pink-300 border border-pink-700",
  resp: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  multivariate: "bg-purple-900 text-purple-300 border border-purple-700",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("");
  const [search, setSearch] = useState("");
  const [noteDialogAlert, setNoteDialogAlert] = useState<Alert | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  const supabase = createClientComponentClient();

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await getAlerts({ limit: 100 });
      setAlerts(data);
      setError(null);
    } catch {
      setError("Unable to connect to backend. Retrying...");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    const channel = supabase
      .channel("alerts-page")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        (payload) => {
          const newAlert = payload.new as Alert;
          setAlerts((prev) => [newAlert, ...prev]);
          setFlashingIds((prev) => new Set([...prev, newAlert.id]));
          setTimeout(() => {
            setFlashingIds((prev) => {
              const next = new Set(prev);
              next.delete(newAlert.id);
              return next;
            });
          }, 2000);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alerts" },
        (payload) => {
          const updated = payload.new as Alert;
          setAlerts((prev) =>
            prev.map((a) => (a.id === updated.id ? updated : a))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateAlert(id, newStatus);
      toaster().toast({
        type: "success",
        title:
          newStatus === "acknowledged"
            ? "Alert acknowledged"
            : newStatus === "escalated"
            ? "Escalated to doctor"
            : `Alert ${newStatus}`,
      });
      await fetchAlerts();
    } catch {
      toaster().toast({ type: "error", title: "Failed to update alert" });
    }
  };

  const handleAddNote = async () => {
    if (!noteDialogAlert) return;
    setSaving(true);
    try {
      await updateAlert(noteDialogAlert.id, noteDialogAlert.status, noteText);
      toaster().toast({ type: "success", title: "Note saved" });
      setNoteDialogAlert(null);
      setNoteText("");
      await fetchAlerts();
    } catch {
      toaster().toast({ type: "error", title: "Failed to save note" });
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toDateString();
  const todayAlerts = alerts.filter(
    (a) => new Date(a.triggered_at).toDateString() === today
  );
  const pending = alerts.filter((a) => a.status === "pending");
  const critical = alerts.filter((a) => a.severity > 0.7);

  const acknowledgedWithTime = alerts.filter(
    (a) => a.status === "acknowledged" && a.acknowledged_at
  );
  const avgResponse =
    acknowledgedWithTime.length > 0
      ? acknowledgedWithTime.reduce((sum, a) => {
          const diff =
            (new Date(a.acknowledged_at!).getTime() -
              new Date(a.triggered_at).getTime()) /
            60000;
          return sum + diff;
        }, 0) / acknowledgedWithTime.length
      : null;

  const filtered = alerts.filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (severityFilter) {
      if (severityFilter === "critical" && a.severity <= 0.7) return false;
      if (severityFilter === "warning" && (a.severity <= 0.4 || a.severity > 0.7))
        return false;
      if (severityFilter === "normal" && a.severity > 0.4) return false;
    }
    if (search && !a.patient_id.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const severityBar = (sev: number) => {
    const pct = Math.round(sev * 100);
    const color = sev > 0.7 ? "bg-red-500" : sev > 0.4 ? "bg-yellow-500" : "bg-green-500";
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden w-20">
          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-slate-400">{pct}%</span>
      </div>
    );
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-red-900/50 text-red-300 border border-red-600",
      acknowledged: "bg-yellow-900/50 text-yellow-300 border border-yellow-600",
      escalated: "bg-orange-900/50 text-orange-300 border border-orange-600",
      resolved: "bg-emerald-900/50 text-emerald-300 border border-emerald-600",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded ${map[s] ?? ""}`}>
        {s}
      </span>
    );
  };

  const tierBadge = (t?: number) => {
    if (!t) return null;
    return (
      <span
        className={`text-xs px-2 py-0.5 rounded ${
          t === 1
            ? "bg-blue-900/50 text-blue-300 border border-blue-600"
            : "bg-purple-900/50 text-purple-300 border border-purple-600"
        }`}
      >
        {t === 1 ? "T1 Fast" : "T2 ML"}
      </span>
    );
  };

  return (
    <div className="p-8">
      <Toaster />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Alerts Management</h1>
        <p className="text-sm text-slate-400 mt-1">Monitor and respond to patient anomalies</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Total Today</p>
          <p className="text-2xl font-bold text-white mt-1">
            {loading ? <Skeleton className="h-7 w-12" /> : todayAlerts.length}
          </p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Pending</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {loading ? <Skeleton className="h-7 w-12" /> : pending.length}
          </p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Avg Response</p>
          <p className="text-2xl font-bold text-white mt-1">
            {loading ? (
              <Skeleton className="h-7 w-16" />
            ) : avgResponse !== null ? (
              `${Math.round(avgResponse)}m`
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Critical</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {loading ? <Skeleton className="h-7 w-12" /> : critical.length}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 items-center">
        <ToggleGroup
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <ToggleGroupItem value="">All</ToggleGroupItem>
          <ToggleGroupItem value="pending">Pending</ToggleGroupItem>
          <ToggleGroupItem value="acknowledged">Acknowledged</ToggleGroupItem>
          <ToggleGroupItem value="escalated">Escalated</ToggleGroupItem>
          <ToggleGroupItem value="resolved">Resolved</ToggleGroupItem>
        </ToggleGroup>

        <Select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical (&gt;0.7)</option>
          <option value="warning">Warning (0.4–0.7)</option>
          <option value="normal">Normal (&lt;0.4)</option>
        </Select>

        <Input
          placeholder="Search patient ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-900/50 border border-red-600 text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-16">
          <div className="text-emerald-400 text-3xl mb-2">✓</div>
          <p className="text-emerald-400 font-medium">All patients stable</p>
          <p className="text-sm text-slate-500 mt-1">No alerts match your filters</p>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-slate-900/50 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-xs text-slate-500 font-medium">Patient</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium">Time</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium">Vitals</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium w-36">Severity</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium">Tier</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium">Status</th>
                <th className="px-4 py-3 text-xs text-slate-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert) => (
                <tr
                  key={alert.id}
                  className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${
                    flashingIds.has(alert.id) ? "bg-red-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <a
                      href={`/patient/${alert.patient_id}`}
                      className="text-purple-400 hover:underline font-mono text-xs"
                    >
                      {alert.patient_id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {relativeTime(alert.triggered_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {alert.vital_flags.map((v) => (
                        <span
                          key={v}
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            VITAL_COLORS[v] ?? "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">{severityBar(alert.severity)}</td>
                  <td className="px-4 py-3">{tierBadge(alert.tier)}</td>
                  <td className="px-4 py-3">{statusBadge(alert.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(alert.status === "pending" || alert.status === "acknowledged") && (
                        <button
                          onClick={() => handleStatusChange(alert.id, "acknowledged")}
                          className="text-xs px-2 py-1 rounded bg-yellow-900/50 text-yellow-300 border border-yellow-700 hover:bg-yellow-900"
                        >
                          Ack
                        </button>
                      )}
                      {(alert.status === "pending" || alert.status === "acknowledged") && (
                        <button
                          onClick={() => handleStatusChange(alert.id, "escalated")}
                          className="text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 border border-red-700 hover:bg-red-900"
                        >
                          Escalate
                        </button>
                      )}
                      <Dialog>
                        <DialogTrigger>
                          <button
                            onClick={() => {
                              setNoteDialogAlert(alert);
                              setNoteText(alert.notes ?? "");
                            }}
                            className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600"
                          >
                            Note
                          </button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Note — {alert.patient_id}</DialogTitle>
                          </DialogHeader>
                          <Textarea
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Clinical observations..."
                            className="mt-2"
                          />
                          <DialogFooter>
                            <Button
                              variant="ghost"
                              onClick={() => setNoteDialogAlert(null)}
                            >
                              Cancel
                            </Button>
                            <Button onClick={handleAddNote} disabled={saving}>
                              {saving ? "Saving..." : "Save Note"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
