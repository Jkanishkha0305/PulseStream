# PulseStream

> Profiling and Optimizing a Real-Time ICU Patient Anomaly Detection Pipeline

A performance-focused Python pipeline that processes multi-patient ICU vital signs, detects patient deterioration using sliding window anomaly detection, and demonstrates progressive speedups through profiling, NumPy vectorization, Numba JIT compilation, and multiprocessing.

## Team

- **Arya Kotibhaskar** — aak10234
- **Jeethu Srinivas Amuthan** — ja5163
- **Kanishkha Jaisankar** — kj2675
- **Siya Koppikar** — sk11806
- **Vrinda Tibrewal** — vt2370

## Architecture

```
pulsestream/
├── backend/              # FastAPI pipeline server
│   ├── main.py          # API entrypoint
│   ├── pipeline/        # Core processing modules
│   │   ├── simulator.py    # Patient vital sign generator
│   │   ├── buffer.py       # Sliding window buffer
│   │   ├── detector.py    # Anomaly detection (Numba JIT)
│   │   ├── optimizer.py    # Optimization strategies
│   │   └── benchmark.py    # Benchmarking suite
│   ├── api/routes/      # API endpoints
│   └── db/              # Supabase integration
├── frontend/            # Next.js 14 dashboard
│   ├── app/             # App router pages
│   └── components/      # UI components
└── Makefile            # Development commands
```

## Quick Start

### Prerequisites

- Python 3.10+ with [uv](https://github.com/astral-sh/uv)
- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone and navigate
cd pulsestream

# Install all dependencies
make install

# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

### Development

```bash
make dev
```

This starts:
- **Backend API** at `http://localhost:8000`
- **Frontend** at `http://localhost:3000`

### Benchmarking

```bash
make benchmark
```

Runs the full optimization pipeline and saves results to `backend/benchmark_results.json`.

## Optimization Pipeline

| Stage | Technique | Speedup Target |
|-------|-----------|---------------|
| 1 | Python loops (baseline) | 1x |
| 2 | NumPy vectorization | ~10-50x |
| 3 | Numba JIT compilation | ~50-200x |
| 4 | Multiprocessing (4 workers) | ~100-500x |

## Dataset

Uses simulated ICU vital signs data modeled after the [PhysioNet Early Prediction of Sepsis dataset](https://physionet.org/content/challenge-2019/1.0.0/).

Vitals monitored:
- Heart rate (bpm)
- Blood pressure (systolic/diastolic)
- SpO₂ (%)
- Temperature (°C)
- Respiratory rate (/min)

## Tech Stack

**Backend:** FastAPI · NumPy · Numba · Pandas · SciPy · Scikit-learn

**Frontend:** Next.js 14 · React · Tailwind CSS · shadcn/ui · Recharts · Supabase

**Package Manager:** [uv](https://github.com/astral-sh/uv) (Python)

## Deployment

### Vercel (Frontend)

1. Push code to GitHub
2. Import project in Vercel
3. Configure environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` (Railway backend URL)
4. Deploy

### Railway (Backend)

1. Push code to GitHub
2. Import project in Railway
3. Configure environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `DATA_DIR=/data`
4. Deploy

## Live Demo

[View Live Demo on Vercel →]()

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              PulseStream                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐             │
│  │   Frontend  │────▶│   Backend    │────▶│  Supabase   │             │
│  │  (Next.js)  │◀────│  (FastAPI)   │◀────│  (Database) │             │
│  └──────────────┘     └──────────────┘     └──────────────┘             │
│         │                    │                                              │
│         │                    ▼                                              │
│         │            ┌──────────────┐                                     │
│         │            │   Pipeline   │                                     │
│         │            └──────────────┘                                     │
│         │                   │                                            │
│         ▼                   ▼                                            │
│  ┌─────────────────────────────────────────────────────┐                  │
│  │              Detection Tiers                        │                  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────┐ │                  │
│  │  │ Tier 1      │    │ Tier 2      │    │ Tier 3 │ │                  │
│  │  │ Z-Score +   │    │ Isolation   │    │ LSTM   │ │                  │
│  │  │ IQR         │    │ Forest      │    │        │ │                  │
│  │  └─────────────┘    └─────────────┘    └─────────┘ │                  │
│  └─────────────────────────────────────────────────────┘                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Screenshot

![Dashboard Screenshot]()

---

**Monitoring:** cProfile · memory-profiler · line-profiler
