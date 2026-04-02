<div align="center">

# PulseStream

> Real-Time ICU Patient Anomaly Detection Pipeline

![Python](https://img.shields.io/badge/Python-3.13-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white)
![Numba](https://img.shields.io/badge/Numba-0.61-orange)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)

</div>

---

# 🏥 PulseStream – Real-Time ICU Patient Anomaly Detection Pipeline

A full-stack, performance-focused pipeline that ingests multi-patient ICU vital signs from the [PhysioNet Challenge 2012](https://physionet.org/content/challenge-2012/1.0.0/) dataset (~4,000 patients), detects patient deterioration using a **tiered anomaly detection system**, and visualizes live alerts and vitals trends in a **real-time clinical dashboard**.

---

## 🧠 Why PulseStream?

ICU environments generate continuous, high-frequency vital sign data across dozens of patients simultaneously. Manual monitoring is error-prone and slow. PulseStream automates deterioration detection with a **two-tier architecture** that balances speed and accuracy:

- **Tier 1** — Z-Score + IQR via **Numba JIT** (~1ms): fast statistical screening on every reading
- **Tier 2** — **Isolation Forest** (~10ms): ML-based confirmation, triggered only when severity > 0.5

This design ensures critical alerts surface in **under 10ms** while keeping compute costs low.

---


## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         PulseStream                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐   REST API  ┌─────────────┐               │
│  │  Next.js 16 │◀───────────▶│   FastAPI   │               │
│  │  Dashboard  │             │   Backend   │               │
│  └─────────────┘             └──────┬──────┘               │
│         │ Realtime                  │                       │
│         │                    ┌──────▼──────┐               │
│         │                    │  Detection  │               │
│         │                    │   Pipeline  │               │
│         │                    └──────┬──────┘               │
│         │                           │                       │
│  ┌──────▼───────────────────────────▼─────┐               │
│  │              Supabase                   │               │
│  │    vital_readings  │  alerts            │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
│  Pipeline: StreamSimulator → PatientBuffer → AnomalyDetector│
│                                                             │
│  Tier 1: Z-Score + IQR     (~1ms,  Numba JIT)              │
│  Tier 2: Isolation Forest  (~10ms, only if severity > 0.5) │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

**Backend:** FastAPI · NumPy · Numba · Pandas · Scikit-learn · Supabase Python SDK · uv

**Frontend:** Next.js 16 · React 18 · Tailwind CSS · Recharts · Supabase SSR · TypeScript

**Database:** Supabase (PostgreSQL) with Realtime subscriptions

---

## Quick Start

### Prerequisites

- Python 3.13+
- [uv](https://github.com/astral-sh/uv) — Python package manager
- Node.js 18+

### 1. Install dependencies

```bash
make install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Fill in your Supabase credentials from **Settings → API** in your Supabase project:

**`backend/.env`**
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJ...   # service_role key
```

**`frontend/.env.local`**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # anon/public key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Run

```bash
make dev
```

| Service | URL |
|---------|-----|
| Frontend Dashboard | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## Optimization Pipeline

The benchmark measures 5 progressive optimization stages across detection latency:

| Stage | Technique | Description |
|-------|-----------|-------------|
| Baseline | Pure Python loops | Reference implementation |
| NumPy | Vectorized ops | Array-based sliding window |
| Numba JIT | LLVM compilation | JIT-compiled Z-score + IQR |
| Multiprocessing | Parallel workers | 4-process pool for patient batches |
| Float32 | Reduced precision | Half memory, better SIMD throughput |

```bash
make benchmark
```

Results saved to `backend/benchmark_results.json` and displayed in the dashboard.

---

## Dataset

Uses the [PhysioNet Challenge 2012](https://physionet.org/content/challenge-2012/1.0.0/) dataset (~4,000 ICU patients, pipe-separated PSV format).

Vitals monitored per patient:

| Vital | Unit | Normal Range |
|-------|------|-------------|
| Heart Rate | bpm | 60–100 |
| Systolic BP | mmHg | 90–140 |
| SpO₂ | % | 95–100 |
| Temperature | °C | 36.5–37.5 |
| Resp. Rate | /min | 12–20 |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/patients` | All patients with latest vitals |
| GET | `/api/patients/{id}` | Single patient vital history |
| GET | `/api/alerts` | All alerts with filters |
| PATCH | `/api/alerts/{id}` | Update alert status |
| GET | `/api/benchmark` | Latest benchmark results |
| GET | `/health` | Health check |

---

## Project Structure

```
pulsestream/
├── backend/
│   ├── main.py                  # FastAPI app + pipeline loop
│   ├── pipeline/
│   │   ├── simulator.py         # Streams PhysioNet data per patient
│   │   ├── buffer.py            # Sliding window deque (30 readings)
│   │   ├── detector.py          # Tier 1 (Z-Score/IQR) + Tier 2 (IsolationForest)
│   │   ├── optimizer.py         # Numba JIT warmup + optimization stages
│   │   └── benchmark.py         # Full benchmark suite
│   ├── api/routes/
│   │   ├── patients.py
│   │   ├── alerts.py
│   │   └── benchmark.py
│   └── db/
│       └── supabase_client.py
├── frontend/
│   ├── app/
│   │   ├── page.tsx                     # Login
│   │   └── (authenticated)/
│   │       ├── dashboard/page.tsx       # ICU overview
│   │       ├── patient/[id]/page.tsx    # Patient detail + charts
│   │       └── alerts/page.tsx          # Alert management
│   ├── components/
│   │   ├── VitalsChart.tsx              # Recharts vitals history
│   │   └── PatientList.tsx              # Severity-coded patient list
│   └── lib/
│       ├── api.ts                       # Backend API client
│       └── supabase.ts                  # Supabase browser client
└── Makefile
```

---

## Makefile Commands

```bash
make install    # Install all dependencies (backend + frontend)
make dev        # Start both servers (backend :8000, frontend :3000)
make benchmark  # Run optimization benchmark suite
make test       # Run all tests
make clean      # Remove build artifacts and node_modules
```
