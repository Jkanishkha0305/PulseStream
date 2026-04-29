<div align="center">

# PulseStream

> Real-Time ICU Patient Anomaly Detection Pipeline

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white)
![Numba](https://img.shields.io/badge/Numba-0.61-orange)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)

</div>

PulseStream is a performance-focused ICU monitoring project built for the NYU Advanced Python course. It processes multi-patient vital-sign streams, detects deterioration using a tiered anomaly detection pipeline, and visualizes alerts and trends in a live dashboard.

The project is strongest as an Advanced Python systems project: profiling, vectorization, JIT compilation, parallelism, reduced-precision optimization, and benchmarking, applied to real-world physiological time-series data.

## Team

- Arya Kotibhaskar — aak10234
- Jeethu Srinivas Amuthan — ja5163
- Kanishkha Jaisankar — kj2675
- Siya Koppikar — sk11806
- Vrinda Tibrewal — vt2370

## Benchmark Results

Official report numbers at **10,000 patients x 50 window size**:

| Stage | Latency | Speedup vs Baseline | Improvement vs Previous |
|---|---:|---:|---:|
| Pure Python | 444.5 ms | 1.0x | baseline |
| NumPy Vectorized | 69.2 ms | 6.4x | 84.4% faster |
| Numba JIT | 59.5 ms | 7.5x | 14.1% faster |
| Numba Parallel (`prange`) | 10.7 ms | 41.4x | 82.0% faster |
| Float32 + Parallel | 11.9 ms | 37.5x | 50% memory saved |

Key takeaways:

- Best latency: **Numba Parallel** at **10.7 ms**
- Total speedup: **41.4x faster**
- Latency reduction: **97.6%**
- Memory reduction: **50.0%** with `float32`

One subtle but important result: `Float32 + Parallel` is slightly slower than `Numba Parallel` on modern x86 CPUs, so its benefit is primarily **memory efficiency**, not raw latency.

The benchmark script in this repo also includes comparison stages for **multiprocessing**, **Cython**, and **GPU / fallback** so the project shows broader course-topic coverage.

## Why This Project

ICU monitoring systems generate continuous streams of vital signs across many patients at once. Manual monitoring is slow and error-prone, and anomaly detection needs to be both fast and interpretable.

PulseStream uses a two-tier design:

- **Tier 1**: Z-score + IQR for low-latency statistical screening
- **Tier 2**: Isolation Forest for confirmation when severity crosses a threshold

This gives the project a strong balance between systems optimization and practical data-science relevance.

## Architecture

```text
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
│  Tier 1: Z-Score + IQR     (~1ms, Numba JIT)               │
│  Tier 2: Isolation Forest  (~10ms, severity-gated)         │
└─────────────────────────────────────────────────────────────┘
```

## Dataset

PulseStream uses the [PhysioNet Challenge 2012](https://physionet.org/content/challenge-2012/1.0.0/) ICU dataset.

Core vitals monitored:

| Vital | Unit | Normal Range |
|---|---|---|
| Heart Rate | bpm | 60-100 |
| Systolic BP | mmHg | 90-140 |
| SpO2 | % | 95-100 |
| Temperature | deg C | 36.5-37.5 |
| Respiratory Rate | /min | 12-20 |

## Tech Stack

**Backend:** FastAPI, NumPy, Numba, Cython, Pandas, scikit-learn, PySpark, Supabase Python SDK

**Frontend:** Next.js 16, React 18, Tailwind CSS, Recharts, Framer Motion, TypeScript

**Database:** Supabase (PostgreSQL + Realtime)

## Quick Start

### Benchmark Only

The benchmark runs standalone and does **not** require Supabase or the frontend.

```bash
cd pulsestream
make install
make benchmark
```

This:

1. installs backend dependencies
2. builds the optional Cython extension
3. runs the benchmark suite
4. prints formatted results to the terminal
5. saves results to `backend/benchmark_results.json`

### Full Application

To run the full dashboard and API, you also need a Supabase project.

```bash
cd pulsestream
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
make dev
```

Services:

| Service | URL |
|---|---|
| Frontend Dashboard | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| API Docs | `http://localhost:8000/docs` |

Required environment variables:

**`backend/.env`**

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
DATA_DIR=./data
N_PATIENTS=10
WINDOW_SIZE=30
TIER1_Z_THRESHOLD=3.0
TIER2_MIN_READINGS=10
TIER1_SEVERITY_ESCALATION=0.5
```

**`frontend/.env.local`**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project Structure

```text
pulsestream/
├── backend/
│   ├── main.py                  # FastAPI app + pipeline loop
│   ├── setup_cython.py          # Cython build script
│   ├── pipeline/
│   │   ├── simulator.py         # Streams patient data
│   │   ├── buffer.py            # Sliding window buffer
│   │   ├── detector.py          # Tiered anomaly detection
│   │   ├── optimizer.py         # Numba utilities and warmup
│   │   ├── benchmark.py         # Benchmark runner
│   │   ├── multiprocess_detect.py
│   │   ├── gpu_detect.py
│   │   ├── spark_analysis.py
│   │   ├── itertools_utils.py
│   │   └── cython_detect.pyx
│   ├── api/routes/
│   ├── db/
│   └── tests/
├── frontend/
│   ├── app/
│   ├── components/
│   └── lib/
└── Makefile
```

## Course Topic Coverage

This repo intentionally demonstrates multiple Advanced Python course topics:

| Topic | Where It Appears |
|---|---|
| Vectorization | `backend/pipeline/benchmark.py` |
| Numba JIT | `backend/pipeline/optimizer.py`, `benchmark.py` |
| Parallelism with `prange` | `backend/pipeline/benchmark.py` |
| Multiprocessing | `backend/pipeline/multiprocess_detect.py` |
| Cython | `backend/pipeline/cython_detect.pyx` |
| GPU / fallback | `backend/pipeline/gpu_detect.py` |
| PySpark | `backend/pipeline/spark_analysis.py` |
| `itertools` utilities | `backend/pipeline/itertools_utils.py` |

## Common Commands

```bash
make install       # Install backend/frontend deps and build Cython if available
make dev           # Start backend + frontend
make benchmark     # Run benchmark suite
make test          # Run backend tests
make build-cython  # Rebuild Cython extension only
make clean         # Remove build artifacts and caches
```

## Notes

- Exact benchmark numbers vary by machine.
- If Cython build fails, the benchmark still runs and skips that stage.
- If CuPy is not installed or CUDA is unavailable, the GPU stage falls back to NumPy.
- The dashboard uses ICU elapsed time for patient readings and wall-clock time for alert events.
