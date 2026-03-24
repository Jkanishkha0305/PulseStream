"use client";

import { useEffect, useState, useCallback } from "react";
import { getPatients, getPatient, getAlerts, type PatientSummary, type VitalReading, type Alert } from "@/lib/api";
import PatientList from "@/components/PatientList";
import VitalsChart from "@/components/VitalsChart";
import AlertBanner from "@/components/AlertBanner";
import AlertTable from "@/components/AlertTable";
import { Toaster, toaster } from "@/components/ui/sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function DashboardPage() {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readings, setReadings] = useState<VitalReading[]>([]);
  const [pendingAlerts, setPendingAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClientComponentClient();

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
    } catch {
      // silently fail for alerts
    }
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
        () => {
          loadPatients();
          loadAlerts();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadPatients, loadAlerts]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const { updateAlert } = await import("@/lib/api");
      await updateAlert(id, status);
      toaster().toast({
        type: "success",
        title: status === "acknowledged" ? "Alert acknowledged" : "Alert escalated",
      });
      loadAlerts();
      loadPatients();
    } catch {
      toaster().toast({ type: "error", title: "Failed to update alert" });
    }
  };

  const topAlert = pendingAlerts[0] ?? null;

  return (
    <div className="p-6 space-y-6">
      <Toaster />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ICU Dashboard</h1>
        <Link href="/alerts">
          <Button variant="outline" size="sm">View All Alerts</Button>
        </Link>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-900/50 border border-red-600 text-red-300 text-sm">
          {error}
        </div>
      )}

      <AlertBanner alert={topAlert} onStatusChange={handleStatusChange} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Patients</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 bg-slate-800 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <PatientList
              patients={patients}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(id)}
            />
          )}
        </div>
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">
            {selectedId ? (
              <Link href={`/patient/${selectedId}`} className="hover:underline text-purple-400">
                Patient {selectedId}
              </Link>
            ) : (
              "Select a patient"
            )}
          </h2>
          {selectedId ? (
            readings.length > 0 ? (
              <VitalsChart data={readings} />
            ) : (
              <div className="h-64 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" />
                <span className="ml-2 text-slate-500">Loading vitals...</span>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-64 rounded-xl border border-slate-800 text-slate-500">
              Select a patient to view vitals
            </div>
          )}
          {pendingAlerts.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-400 mb-2">Active Alerts</h3>
              <AlertTable
                alerts={pendingAlerts}
                onStatusChange={handleStatusChange}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
