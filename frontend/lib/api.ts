const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, body || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ============================================================================
// Types - matching Supabase schema
// ============================================================================

export interface PatientSummary {
  patient_id: string;
  latest_vitals: {
    hr?: number;
    o2sat?: number;
    temp?: number;
    sbp?: number;
    resp?: number;
  } | null;
  severity: number;
  has_active_alert: boolean;
}

export interface VitalReading {
  id?: string;
  patient_id: string;
  timestamp: number;
  hr?: number;
  o2sat?: number;
  temp?: number;
  sbp?: number;
  resp?: number;
  anomaly_detected?: boolean;
  anomaly_severity?: number;
  anomaly_tier?: number;
  anomaly_flags: string[];
  created_at?: string;
}

export interface Alert {
  id: string;
  patient_id: string;
  vital_flags: string[];
  severity: number;
  tier?: number;
  status: "pending" | "acknowledged" | "escalated" | "resolved";
  triggered_at: string;
  notes?: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

export interface BenchmarkResults {
  results?: Array<{
    stage: string;
    latency_ms: number;
    speedup: number;
    memory_mb: number;
  }>;
  n_patients?: number;
  generated_at?: string;
  message?: string;
}

// ============================================================================
// API Functions
// ============================================================================

export async function getPatients(): Promise<PatientSummary[]> {
  return request<PatientSummary[]>("/api/patients");
}

export async function getPatient(id: string): Promise<VitalReading[]> {
  return request<VitalReading[]>(`/api/patients/${id}`);
}

export async function getAlerts(params?: {
  status?: string;
  patient_id?: string;
  limit?: number;
}): Promise<Alert[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.patient_id) searchParams.set("patient_id", params.patient_id);
  if (params?.limit) searchParams.set("limit", params.limit.toString());
  
  const qs = searchParams.toString();
  return request<Alert[]>(`/api/alerts${qs ? "?" + qs : ""}`);
}

export async function updateAlert(
  id: string,
  status: string,
  notes?: string
): Promise<Alert> {
  return request<Alert>(`/api/alerts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });
}

export async function getBenchmarkResults(): Promise<BenchmarkResults> {
  return request<BenchmarkResults>("/api/benchmark");
}