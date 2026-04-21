<div align="center">

# PulseStream

> Real-Time ICU Patient Anomaly Detection Pipeline

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white)
![Numba](https://img.shields.io/badge/Numba-0.61-orange)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)

</div>

---

## About

PulseStream is a full-stack, performance-focused pipeline that ingests multi-patient ICU vital signs from the [PhysioNet Challenge 2012](https://physionet.org/content/challenge-2012/1.0.0/) dataset (~4,000 patients), detects patient deterioration using a **tiered anomaly detection system**, and visualizes live alerts and vitals trends in a **real-time clinical dashboard**.

ICU environments generate continuous, high-frequency vital sign data across dozens of patients simultaneously. PulseStream automates deterioration detection with a **two-tier architecture**:

- **Tier 1** — Z-Score + IQR via **Numba JIT** (~1ms): fast statistical screening on every reading
- **Tier 2** — **Isolation Forest** (~10ms): ML-based confirmation, triggered only when severity > 0.5

---

## Reproduce the Benchmark (Quick Start)

The benchmark runs **standalone** — it generates synthetic data internally and does **not** require Supabase, the frontend, or any external database. Your professor can reproduce the optimization results with three commands:

### Prerequisites

- **Python 3.10+** (tested with 3.13)
- **pip** (or [uv](https://github.com/astral-sh/uv))
- A C compiler for Cython (Xcode Command Line Tools on macOS, `gcc` on Linux)

### Steps

```bash
# 1. Clone and enter the project
git clone https://github.com/<your-user>/PulseStream.git
cd PulseStream/pulsestream

# 2. Install Python dependencies + build Cython extension
make install

# 3. Run the optimization benchmark
make benchmark
```

This will:
1. Install all backend Python packages from `backend/requirements.txt`
2. Build the Cython C-extension (`pipeline/cython_detect.so`)
3. Run the benchmark across all 8 optimization stages
4. Print a results table to the terminal
5. Save JSON results to `backend/benchmark_results.json`

### Alternative: without Make

```bash
cd pulsestream/backend

# Install dependencies
pip install -r requirements.txt

# Build Cython extension (optional — benchmark skips it if missing)
python setup_cython.py build_ext --inplace

# Run benchmark
PYTHONPATH=. python -m pipeline.benchmark
```

### Run the Test Suite

```bash
make test
# or
cd backend && PYTHONPATH=. python -m pytest tests/ -v
```

---

## Optimization Pipeline

The benchmark measures **8 progressive optimization stages** on the anomaly detection workload (1,000 patients × 50 time-steps × 5 vitals):

| # | Stage | Technique | Course Topic |
|---|-------|-----------|--------------|
| 1 | Pure Python | Nested loops, manual stats | Baseline reference |
| 2 | NumPy Vectorized | Batch array ops, no Python loops | Weeks 3–4 |
| 3 | Numba JIT | LLVM-compiled kernel (`@njit`) | Week 7 |
| 4 | Numba Parallel | `prange` across patients | Week 7 |
| 5 | Float32 + Parallel | Reduced precision + `prange` | Week 7 |
| 6 | Multiprocessing | `ProcessPoolExecutor` (4 workers) | Weeks 9–11 |
| 7 | Cython | C-compiled typed kernel (`.pyx`) | Week 5 |
| 8 | GPU (CuPy / fallback) | CUDA or NumPy vectorized fallback | Week 12 |

### Expected Output (example)

```
======================================================================
  PulseStream Benchmark — 1000 patients × 50 window
======================================================================

  Stage                │    Latency │   Speedup │   Mem (MB) │ Bar
  ─────────────────────┼────────────┼───────────┼────────────┼──────
  Pure Python          │   1320.0ms │      1.0x │       1.9  │ ██████████████████████████████
  NumPy Vectorized     │     12.5ms │    105.6x │       1.9  │ █
  Numba JIT            │     11.2ms │    117.9x │       1.9  │ █
  Numba Parallel       │      3.8ms │    347.4x │       1.9  │ █
  Float32 + Parallel   │      3.1ms │    425.8x │       1.0  │ █
  Multiprocessing      │     35.7ms │     37.0x │       1.9  │ █
  Cython               │      8.4ms │    157.1x │       1.9  │ █
  GPU (fallback)       │     10.1ms │    130.7x │       1.9  │ █

  OPTIMIZATION SUMMARY
  ──────────────────────────────────────────
  Baseline (Pure Python):          1320.0 ms
  Best (  Float32 + Parallel):        3.1 ms
  ──────────────────────────────────────────
  Total Speedup:                    425.8x faster
  Latency Reduction:                 99.8%
  Memory Reduction (f32):            50.0%
```

> **Note**: Exact speedup values vary by hardware (CPU cores, clock speed, cache sizes). The relative ordering and approximate ratios should remain consistent.

### GPU Stage

- If **CuPy** is installed with a CUDA-enabled GPU, the GPU stage runs on CUDA.
- Without CuPy/CUDA, it automatically falls back to a NumPy-based vectorized implementation (labeled "GPU (fallback)").
- Install CuPy for CUDA 12.x: `pip install cupy-cuda12x`

### Cython Stage

- Cython requires a C compiler. If `make install` or `python setup_cython.py build_ext --inplace` fails, the benchmark still runs — it just skips the Cython row.
- On macOS: `xcode-select --install`
- On Ubuntu: `sudo apt install gcc python3-dev`

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

**Backend:** FastAPI · NumPy · Numba · Cython · Pandas · Scikit-learn · PySpark · Supabase SDK

**Frontend:** Next.js 16 · React 18 · Tailwind CSS · Recharts · Framer Motion · Supabase SSR · TypeScript

**Database:** Supabase (PostgreSQL) with Realtime subscriptions

---

## Full Application Setup (Dashboard + API)

If you want to run the full application (not just the benchmark), you also need:

- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Fill in your Supabase credentials:

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

### 2. Run

```bash
make dev
```

| Service | URL |
|---------|-----|
| Frontend Dashboard | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## Dataset

Uses the [PhysioNet Challenge 2012](https://physionet.org/content/challenge-2012/1.0.0/) dataset (~4,000 ICU patients).

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
│   ├── main.py                     # FastAPI app + pipeline loop
│   ├── requirements.txt            # Python dependencies
│   ├── pyproject.toml              # Project metadata
│   ├── setup_cython.py             # Cython build script
│   ├── benchmark_results.json      # Generated benchmark output
│   ├── pipeline/
│   │   ├── simulator.py            # Streams PhysioNet data per patient
│   │   ├── buffer.py               # Sliding window deque (30 readings)
│   │   ├── detector.py             # Tier 1 (Z-Score/IQR) + Tier 2 (IsolationForest)
│   │   ├── optimizer.py            # Numba JIT warmup + optimization stages
│   │   ├── benchmark.py            # Full 8-stage benchmark suite
│   │   ├── multiprocess_detect.py  # ProcessPoolExecutor / ThreadPoolExecutor
│   │   ├── itertools_utils.py      # itertools-based streaming utilities
│   │   ├── gpu_detect.py           # CuPy GPU detection + NumPy fallback
│   │   ├── spark_analysis.py       # PySpark batch analysis
│   │   └── cython_detect.pyx       # Cython-compiled anomaly kernel
│   ├── api/routes/
│   │   ├── patients.py
│   │   ├── alerts.py
│   │   └── benchmark.py
│   ├── db/
│   │   └── supabase_client.py
│   └── tests/
│       ├── test_benchmark.py       # Benchmark data + stage consistency
│       ├── test_itertools_utils.py # itertools utility tests
│       ├── test_multiprocess.py    # Multiprocessing stage tests
│       └── test_gpu_detect.py      # GPU detection tests
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
make install       # Install dependencies + build Cython
make benchmark     # Run the 8-stage optimization benchmark
make test          # Run pytest suite (39 tests)
make dev           # Start both servers (backend :8000, frontend :3000)
make build-cython  # Rebuild Cython extension only
make clean         # Remove build artifacts, caches, node_modules
```
