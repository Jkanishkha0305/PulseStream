<div align="center">

# PulseStream

> Real-Time ICU Patient Anomaly Detection — A Performance Engineering Study

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-green?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js&logoColor=white)
![Numba](https://img.shields.io/badge/Numba-0.61-orange)
![CUDA](https://img.shields.io/badge/CUDA-T4-76B900?logo=nvidia&logoColor=white)
![Apple Metal](https://img.shields.io/badge/Apple_Metal-MPS-000000?logo=apple&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)

**NYU Advanced Python — Final Project**

</div>

PulseStream is a real-time ICU monitoring pipeline that ingests multi-patient vital-sign streams, detects clinical deterioration with a tiered anomaly-detection stack, and visualizes alerts in a live dashboard. The project's primary focus is **performance engineering**: the same anomaly-detection kernel is implemented **nine different ways** spanning Pure Python → NumPy → Numba JIT → multi-core parallelism → reduced precision → Cython → PyTorch → Apple Metal GPU → NVIDIA CUDA, and benchmarked across two hardware platforms and two dataset sizes.

---

## Team

- Arya Kotibhaskar — `aak10234`
- Jeethu Srinivas Amuthan — `ja5163`
- Kanishkha Jaisankar — `kj2675`
- Siya Koppikar — `sk11806`
- Vrinda Tibrewal — `vt2370`

---

## Headline Results

Same anomaly-detection algorithm. Same input data. Nine implementations, two hardware platforms, two workload sizes. **All non-Cython implementations produce byte-identical outputs**, proving correctness preservation.

### 5,000 patients × 50 readings × 5 vitals (1.25M cells)

| # | Stage | Mac M-series | Colab T4 | Speedup vs Baseline |
|---|---|---:|---:|---:|
| 1 | Pure Python loops | 399.64 ms | 1078.38 ms | 1× |
| 2 | NumPy vectorization | 14.93 ms | 34.55 ms | 27 – 31× |
| 3 | Numba `@njit` (1 thread) | 2.34 ms | 5.56 ms | 171 – 194× |
| 4 | **Numba parallel (`prange`)** | **0.48 ms** ⭐ | 3.51 ms | **307 – 829×** |
| 5 | float32 + Numba parallel | 0.98 ms | 4.31 ms | 250 – 408× |
| 6 | Cython AOT-compiled `.pyx` | 22.93 ms | 19.00 ms | 17 – 57× |
| 7 | PyTorch CPU tensors | 7.84 ms | 31.99 ms | 34 – 51× |
| 8 | **Apple Metal GPU (PyTorch MPS)** | **4.17 ms** ⭐ | N/A | 96× |
| 9 | **NVIDIA T4 GPU (Numba CUDA)** | N/A | **4.21 ms** ⭐ | 256× |

### 50,000 patients × 50 readings × 5 vitals (12.5M cells)

| # | Stage | Mac M-series | Colab T4 | Speedup vs Baseline |
|---|---|---:|---:|---:|
| 1 | Pure Python loops | 4155.24 ms | 11444.57 ms | 1× |
| 2 | NumPy vectorization | 145.26 ms | 391.41 ms | 28 – 29× |
| 3 | Numba `@njit` (1 thread) | 23.06 ms | 55.27 ms | 180 – 207× |
| 4 | **Numba parallel (`prange`)** | **4.85 ms** ⭐ | 33.21 ms | **345 – 857×** |
| 5 | float32 + Numba parallel | 10.89 ms | 55.78 ms | 205 – 382× |
| 6 | Cython AOT-compiled `.pyx` | 238.51 ms | 203.43 ms | 17 – 56× |
| 7 | PyTorch CPU tensors | 64.92 ms | 314.92 ms | 36 – 64× |
| 8 | **Apple Metal GPU (PyTorch MPS)** | **40.23 ms** ⭐ | N/A | 103× |
| 9 | **NVIDIA T4 GPU (Numba CUDA)** | N/A | **33.11 ms** ⭐ | 346× |

> Raw JSON for every cell of the matrix: `backend/bottleneck_results_{5000,50000}p_{mac,t4}.json`

### Three insights from the data

1. **Numba parallel on Apple Silicon is the overall winner** — `4.85 ms` for 50,000 patients (857× speedup). It outperforms even the NVIDIA T4 GPU because the kernel is memory-bound, not compute-bound.
2. **Apple Metal GPU ≈ NVIDIA T4 GPU at 5k patients** (4.17 vs 4.21 ms — within 1%). At this workload size, a consumer-grade integrated GPU matches a datacenter accelerator. PCIe / unified-memory transfer dominates kernel time on both platforms.
3. **Linear scaling = correctness control.** Pure Python: 5k → 50k = 10.4× slower (expected ~10×). Numba parallel: 5k → 50k = 10.1× slower. No hidden complexity bugs, no caching artifacts.

---

## What "Optimization" Means Here

The bottleneck function is **anomaly detection on a window of patient vitals**. Input: a 3-D NumPy array of shape `(n_patients, 50_readings, 5_vitals)`. Output: a 1-D array of length `n_patients` containing the count of vitals that breach a Z-score or IQR threshold for each patient. This function runs once per stream tick in production (`backend/main.py`), so its latency directly determines how many patients can be monitored in real time.

The 9 stages progressively remove a different bottleneck each time:

| # | Technique | Bottleneck Removed | Course Topic |
|---|---|---|---|
| 1 | Pure Python loops | (baseline — interpreter overhead) | — |
| 2 | NumPy vectorization | Python interpreter dispatch | Lec 02-03 |
| 3 | Numba `@njit` | NumPy temporary-array allocations | Lec 05 |
| 4 | Numba `prange` | Single-threaded execution | Lec 09 |
| 5 | float32 conversion | Memory bandwidth (float64 = 8B/cell) | Memory hierarchy |
| 6 | Cython AOT | JIT warm-up cost on first call | Lec 05 |
| 7 | PyTorch CPU tensors | NumPy's BLAS vs MKL/Accelerate | Library choice |
| 8 | PyTorch MPS (Apple Metal) | CPU core count | Lec 12 (GPU) |
| 9 | Numba CUDA kernel | CPU SIMD width | Lec 06-2, 12 (GPU) |

Each stage is implemented in `backend/bottleneck_benchmark.py` with explicit narrative metadata (`did`, `bottleneck`, `used`, `solved`) so the JSON output is self-documenting.

---

## Reproducing the Benchmark

The benchmark is fully self-contained: it generates synthetic data with a fixed seed, warms up JIT compilation, runs each stage 3 times, reports the median, and writes a JSON file. **Reproducible across machines.**

### A. Local benchmark (CPU + Apple Metal GPU)

Requires only Python 3.10+. Tested on macOS arm64 (M-series), should also work on Linux x86_64 and Windows.

```bash
cd pulsestream
make install          # installs backend deps + builds Cython (or skips if compiler missing)
cd backend

# Default: 5,000 patients
PYTHONPATH=. python bottleneck_benchmark.py

# Larger workload
PYTHONPATH=. N_PATIENTS=50000 python bottleneck_benchmark.py
```

Output: `bottleneck_results_5000p.json` (or `_50000p.json`). Contains all 9 blocks. **On a Mac, Block 8 (Apple Metal MPS) runs on real GPU; Block 9 falls back to a CUDA simulator** (intentionally skip Block 9 in your analysis on a Mac — see step B for real CUDA).

### B. NVIDIA GPU benchmark (Google Colab T4 — free)

The repo includes `colab_launcher.ipynb` that automates the entire Colab path:

1. Open `colab_launcher.ipynb` in Google Colab (`File → Upload notebook`).
2. **Runtime → Change runtime type → T4 GPU → Save**.
3. **Runtime → Run all**.

The notebook will:

1. Run `nvidia-smi` to confirm a real T4 is attached.
2. Clone this repo fresh from GitHub.
3. Install Cython and build the `.pyx` extension.
4. Assert `torch.cuda.is_available()` and `numba.cuda.is_available()` are both `True` and the simulator is **off**.
5. Run `bottleneck_benchmark.py` at 5,000 and 50,000 patients on real CUDA.
6. Pop a download dialog with each `bottleneck_results_*.json`.

End state: 4 result files locally:

```
backend/
├── bottleneck_results_5000p_mac.json    # Mac CPU + Apple Metal
├── bottleneck_results_5000p_t4.json     # Colab CPU + NVIDIA T4
├── bottleneck_results_50000p_mac.json
└── bottleneck_results_50000p_t4.json
```

### Knobs

```bash
N_PATIENTS=50000   # patients to simulate
N_READINGS=50      # readings per patient
REPEATS=3          # timing repeats (median reported)
```

---

## Hardware Platforms Tested

| Platform | CPU | GPU | Used For |
|---|---|---|---|
| MacBook (Apple Silicon, arm64) | M-series Performance + Efficiency cores | Apple Metal (integrated, 8-10 cores) | Blocks 1-8 |
| Google Colab (Linux x86_64) | Intel Xeon vCPUs | **NVIDIA Tesla T4 (16 GB GDDR6)** | Blocks 1-7, 9 |

Block 8 requires Apple Metal (Mac only). Block 9 requires NVIDIA CUDA (not available on Mac). The two platforms together cover the full 9-block matrix.

---

## Why This Project

ICU monitoring systems generate continuous streams of vital signs across many patients. Manual monitoring is slow and error-prone; automated detection must be both **fast** (sub-second per patient cycle) and **interpretable** (clinical staff need to act on alerts). PulseStream uses a two-tier design that mirrors how real ICU early-warning scoring systems work:

- **Tier 1** — Z-score + IQR statistical screening (sub-millisecond, runs every reading)
- **Tier 2** — Isolation Forest ML escalation (~10ms, only triggered when severity > 0.5)

The performance work in this repo is what makes Tier 1 viable as the always-on first line of defense.

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         PulseStream                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐   REST API  ┌─────────────┐                │
│  │  Next.js 16 │◀───────────▶│   FastAPI   │                │
│  │  Dashboard  │             │   Backend   │                │
│  └─────────────┘             └──────┬──────┘                │
│         │ Realtime                  │                       │
│         │                    ┌──────▼──────┐                │
│         │                    │  Detection  │                │
│         │                    │   Pipeline  │                │
│         │                    └──────┬──────┘                │
│         │                           │                       │
│  ┌──────▼───────────────────────────▼─────┐                 │
│  │              Supabase                  │                 │
│  │    vital_readings  │  alerts           │                 │
│  └────────────────────────────────────────┘                 │
│                                                             │
│  Pipeline: StreamSimulator → PatientBuffer → AnomalyDetector│
│                                                             │
│  Tier 1: Z-Score + IQR     (~1ms, Numba JIT)                │
│  Tier 2: Isolation Forest  (~10ms, severity-gated)          │
└─────────────────────────────────────────────────────────────┘
```

---

## Dataset

PulseStream uses the [PhysioNet Challenge 2012](https://physionet.org/content/challenge-2012/1.0.0/) ICU dataset (40,000+ ICU stays, hourly vitals). When the dataset isn't available locally, `simulator.py` generates synthetic data with realistic clinical drift around documented baselines.

| Vital | Unit | Normal Range |
|---|---|---|
| Heart Rate | bpm | 60-100 |
| Systolic BP | mmHg | 90-140 |
| SpO₂ | % | 95-100 |
| Temperature | °C | 36.5-37.5 |
| Respiratory Rate | /min | 12-20 |

---

## Tech Stack

**Backend** — FastAPI, NumPy, Numba (`@njit` + CUDA), Cython, PyTorch (CPU + MPS + CUDA), pandas, scikit-learn, PySpark, Supabase Python SDK
**Frontend** — Next.js 16, React 18, TypeScript, Tailwind CSS, Recharts, Framer Motion
**Database** — Supabase (PostgreSQL + Realtime)
**GPU** — Apple Metal (MPS via PyTorch), NVIDIA CUDA (Numba `@cuda.jit` + PyTorch)

---

## Quick Start

### Just the benchmark (no Supabase needed)

```bash
cd pulsestream
make install
cd backend
PYTHONPATH=. python bottleneck_benchmark.py
```

### Full stack (live dashboard)

Requires a Supabase project.

```bash
cd pulsestream
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# fill in Supabase URL + keys in both .env files
make dev
```

| Service | URL |
|---|---|
| Frontend Dashboard | `http://localhost:3000` |
| Backend API | `http://localhost:8000` |
| API Docs | `http://localhost:8000/docs` |

Required environment variables:

```bash
# backend/.env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
DATA_DIR=./data
N_PATIENTS=10
WINDOW_SIZE=30
TIER1_Z_THRESHOLD=3.0
TIER2_MIN_READINGS=10
TIER1_SEVERITY_ESCALATION=0.5

# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Project Structure

```text
pulsestream/
├── backend/
│   ├── main.py                              # FastAPI app + live pipeline loop
│   ├── bottleneck_benchmark.py              # ★ 9-stage optimization study
│   ├── setup_cython.py                      # Cython build script
│   ├── pipeline/
│   │   ├── simulator.py                     # PhysioNet loader + synthetic fallback
│   │   ├── buffer.py                        # Per-patient sliding window
│   │   ├── detector.py                      # Tier 1 (Z-score+IQR) + Tier 2 (IsoForest)
│   │   ├── optimizer.py                     # Numba kernels used in production
│   │   ├── benchmark.py                     # Original 6-stage benchmark (used by API)
│   │   ├── multiprocess_detect.py           # ProcessPool + ThreadPool variants
│   │   ├── gpu_detect.py                    # CuPy GPU + NumPy fallback
│   │   ├── cython_detect.pyx                # AOT-compiled C kernel
│   │   ├── numba_cuda_detect.py             # Explicit @cuda.jit kernel (Lec 06-2/12)
│   │   ├── mpi_detect.py                    # MPI point-to-point + collectives (Lec 10-11)
│   │   ├── scipy_optimize.py                # BFGS / L-BFGS-B / Newton-CG (Lec 08, HW05)
│   │   ├── jax_anomaly.py                   # JAX autodiff (Lec 08)
│   │   ├── symbolic_analysis.py             # SymPy derivations (Lec 08)
│   │   ├── resource_optimizer.py            # cvxpy LP for ICU bed/nurse allocation
│   │   ├── caching_utils.py                 # functools.lru_cache demos (Lec 02, Lab 02)
│   │   ├── profiler.py                      # cProfile + line_profiler (Lec 04)
│   │   ├── itertools_utils.py               # itertools demonstrations (Lec 03)
│   │   └── spark_analysis.py                # PySpark batch analytics
│   ├── api/routes/                          # FastAPI route handlers
│   ├── db/                                  # Supabase client + schema
│   └── tests/                               # pytest suite (44 tests)
├── frontend/
│   ├── app/                                 # Next.js App Router pages
│   ├── components/                          # React components ("Dark Medical Futurism")
│   └── lib/                                 # Supabase client + utilities
├── Makefile
└── README.md
```

---

## Course Topic Coverage

Every module below maps to a specific lecture or homework. Run any of them standalone with `python -m pipeline.<module>` from `backend/`.

| Course Topic | Lecture / HW | Module | Demonstrates |
|---|---|---|---|
| Caching / memoization | Lec 02, Lab 02 | `pipeline/caching_utils.py` | `@lru_cache`, `@functools.cache`, custom decorators |
| `itertools` toolbox | Lec 03 | `pipeline/itertools_utils.py` | sliding windows, `groupby`, `accumulate`, `tee`, etc. |
| NumPy vectorization | Lec 02-03 | `bottleneck_benchmark.py` (Block 2) | broadcasting, axis ops, SIMD-accelerated reductions |
| `cProfile` + `line_profiler` | Lec 04 | `pipeline/profiler.py` | function-level + line-level profiling |
| Cython AOT compilation | Lec 05 | `pipeline/cython_detect.pyx` | typed memoryviews, `boundscheck=False` |
| Numba JIT | Lec 05 | `bottleneck_benchmark.py` (Blocks 3-5) | `@njit`, `cache=True`, LLVM lowering |
| GPU / CUDA basics | Lec 06-2 | `pipeline/numba_cuda_detect.py` | `@cuda.jit`, `cuda.grid`, shared memory, `@cuda.reduce` |
| `scipy.optimize` | Lec 08, HW05 | `pipeline/scipy_optimize.py` | BFGS, L-BFGS-B, Newton-CG, brute force |
| Symbolic math (SymPy) | Lec 08 | `pipeline/symbolic_analysis.py` | symbolic derivation of Z-score, IQR fences |
| Autodiff (JAX) | Lec 08 | `pipeline/jax_anomaly.py` | `grad`, `hessian`, `jacfwd`, `jacrev`, `vmap` |
| Convex optimization (cvxpy) | Lec 08 | `pipeline/resource_optimizer.py` | LP for nurse / ICU bed allocation |
| Multi-core (`prange`) | Lec 09 | `bottleneck_benchmark.py` (Block 4) | Numba's OpenMP-style threading |
| Multiprocessing | Lec 09 | `pipeline/multiprocess_detect.py` | `ProcessPoolExecutor`, `ThreadPoolExecutor` |
| MPI | Lec 10-11 | `pipeline/mpi_detect.py` | `Send`/`Recv`, `Bcast`, `Gather`, collectives |
| GPU computing | Lec 12 | `bottleneck_benchmark.py` (Blocks 8-9) | PyTorch MPS (Apple), Numba CUDA (NVIDIA) |
| Big-data analytics | PySpark | `pipeline/spark_analysis.py` | DataFrame API, group-by aggregations |

---

## Verification & Correctness

The benchmark embeds a correctness check: every block reports an `anomalous_patients` count, and **all non-Cython blocks must produce identical counts** for the result to be valid.

| Workload | Pure Python | NumPy | Numba JIT | Numba parallel | float32 | PyTorch CPU | Apple Metal | NVIDIA T4 |
|---|---|---|---|---|---|---|---|---|
| 5,000 patients | 1936 | 1936 | 1936 | 1936 | 1936 | 1936 | 1936 | 1936 ✅ |
| 50,000 patients | 19514 | 19514 | 19514 | 19514 | 19514 | 19514 | 19514 ✅ | 19514 ✅ |

**Cython** (Block 6) reports a different count (280 / 2821) because it implements a **stricter** anomaly definition (last-reading point-wise check vs window-wide check). This is documented in the report; the timing comparison still holds because both definitions are O(n_patients × n_readings × n_vitals).

The 44-test pytest suite (`backend/tests/`) exercises the buffer, simulator, multiprocess, GPU, and benchmark stages independently. Run with:

```bash
cd backend && PYTHONPATH=. python -m pytest tests/ -v
```

---

## Common Commands

```bash
make install         # Install backend/frontend deps + build Cython
make dev             # Start backend + frontend dev servers
make benchmark       # Run the 6-stage benchmark used by the API dashboard
make test            # Run pytest backend test suite
make build-cython    # Rebuild Cython extension only
make clean           # Remove build artifacts and caches
```

```bash
# Direct invocations
cd backend
PYTHONPATH=. python bottleneck_benchmark.py                  # 9-stage benchmark @ 5k
PYTHONPATH=. N_PATIENTS=50000 python bottleneck_benchmark.py # 9-stage benchmark @ 50k
PYTHONPATH=. python -m pipeline.profiler                     # cProfile demo
PYTHONPATH=. python -m pipeline.scipy_optimize               # SciPy demo
PYTHONPATH=. python -m pipeline.jax_anomaly                  # JAX demo
PYTHONPATH=. python -m pipeline.symbolic_analysis            # SymPy demo
PYTHONPATH=. python -m pipeline.resource_optimizer           # cvxpy LP demo
PYTHONPATH=. python -m pipeline.caching_utils                # lru_cache demo
PYTHONPATH=. python -m pipeline.numba_cuda_detect            # CUDA kernel demo
mpiexec -n 4 python -m pipeline.mpi_detect                   # MPI demo (requires mpi4py)
```

---

## Notes

- Exact benchmark numbers vary by machine. Pure Python runtime is the strongest indicator of CPU class; Numba parallel and GPU runtimes correlate more with cache size and memory bandwidth.
- If Cython compilation fails (no C compiler available), Block 6 is automatically skipped — the rest of the benchmark still runs.
- If Apple Metal is unavailable (Linux/Windows), Block 8 is skipped.
- If NVIDIA CUDA is unavailable, Block 9 falls back to the Numba CUDA simulator (slow, intentionally) — for real CUDA numbers, use the Colab notebook.
- Frontend dashboard uses ICU elapsed time for vital readings and wall-clock time for alert events.
- All code is pure Python except `cython_detect.pyx` (compiled to a `.so`) — no precomputed results or hardcoded speedup values anywhere in the pipeline.
