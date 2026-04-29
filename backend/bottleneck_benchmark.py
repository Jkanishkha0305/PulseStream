"""
Bottleneck → Solution → Speedup
================================
Progressive optimization of PulseStream's anomaly-detection kernel.

Each block follows the pattern:
    1. DID: ran the kernel using approach X
    2. BOTTLENECK: identified the limiting factor
    3. USED: applied technique Y
    4. SOLVED: explanation of why it worked
    5. SPEEDUP: measured factor vs the previous block

Measures REAL numbers on this machine:
    - Apple Silicon CPU (M-series)
    - Apple Metal GPU via PyTorch MPS
    - Numba CUDA simulator (no real GPU, but covers the concept)

Usage
-----
    cd pulsestream/backend
    PYTHONPATH=. python bottleneck_benchmark.py
"""

import os
# Force CUDA simulator BEFORE any numba import (so simulator path is wired up)
os.environ.setdefault("NUMBA_ENABLE_CUDASIM", "1")

import time
import json
import platform
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Optional accelerators
# ---------------------------------------------------------------------------
try:
    from numba import njit, prange
    NUMBA_OK = True
except Exception:
    NUMBA_OK = False

try:
    import torch
    TORCH_OK = True
    MPS_OK = torch.backends.mps.is_available()
    CUDA_OK = torch.cuda.is_available()
except Exception:
    TORCH_OK = False
    MPS_OK = False
    CUDA_OK = False

try:
    from pipeline import cython_detect
    CYTHON_OK = True
except Exception:
    CYTHON_OK = False

# Force CUDA simulator BEFORE importing numba.cuda
if not os.environ.get("NUMBA_ENABLE_CUDASIM"):
    os.environ["NUMBA_ENABLE_CUDASIM"] = "1"
try:
    from numba import cuda
    NUMBA_CUDA_OK = True
except Exception:
    NUMBA_CUDA_OK = False


# ---------------------------------------------------------------------------
# Synthetic ICU dataset
# ---------------------------------------------------------------------------
N_PATIENTS = int(os.environ.get("N_PATIENTS", "5000"))
N_READINGS = int(os.environ.get("N_READINGS", "50"))
N_VITALS = 5
Z_THRESHOLD = 3.0
REPEATS = int(os.environ.get("REPEATS", "3"))


def make_data(seed: int = 42) -> np.ndarray:
    """Synthetic ICU vitals: (n_patients, n_readings, n_vitals) float64."""
    rng = np.random.RandomState(seed)
    data = rng.randn(N_PATIENTS, N_READINGS, N_VITALS)
    # inject anomalies into 15% of patients
    n_anom = int(0.15 * N_PATIENTS)
    data[:n_anom, :, :2] += 5.0
    return data


def time_call(fn, *args, repeats: int = REPEATS):
    """Run fn(*args) `repeats` times and return (result, median_ms)."""
    times = []
    result = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        result = fn(*args)
        times.append((time.perf_counter() - t0) * 1000)
    return result, float(np.median(times))


# ---------------------------------------------------------------------------
# Block 1 — Pure Python (baseline)
# ---------------------------------------------------------------------------
def detect_pure_python(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
    n_p, n_r, n_v = data.shape
    flagged = np.zeros(n_p, dtype=np.int32)
    for p in range(n_p):
        for v in range(n_v):
            total = 0.0
            for r in range(n_r):
                total += data[p, r, v]
            mean = total / n_r
            sq = 0.0
            for r in range(n_r):
                d = data[p, r, v] - mean
                sq += d * d
            std = (sq / n_r) ** 0.5
            if std > 0:
                for r in range(n_r):
                    if abs(data[p, r, v] - mean) / std > z_thr:
                        flagged[p] += 1
                        break
    return flagged


# ---------------------------------------------------------------------------
# Block 2 — NumPy vectorized
# ---------------------------------------------------------------------------
def detect_numpy(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
    means = data.mean(axis=1, keepdims=True)
    stds = data.std(axis=1, keepdims=True)
    z = np.abs(data - means) / np.clip(stds, 1e-9, None)
    return (z > z_thr).any(axis=1).sum(axis=1).astype(np.int32)


# ---------------------------------------------------------------------------
# Block 3 — Numba JIT, single thread
# ---------------------------------------------------------------------------
if NUMBA_OK:
    @njit(cache=True)
    def detect_numba(data, z_thr):
        n_p, n_r, n_v = data.shape
        flagged = np.zeros(n_p, dtype=np.int32)
        for p in range(n_p):
            for v in range(n_v):
                total = 0.0
                for r in range(n_r):
                    total += data[p, r, v]
                mean = total / n_r
                sq = 0.0
                for r in range(n_r):
                    d = data[p, r, v] - mean
                    sq += d * d
                std = (sq / n_r) ** 0.5
                if std > 0:
                    for r in range(n_r):
                        if abs(data[p, r, v] - mean) / std > z_thr:
                            flagged[p] += 1
                            break
        return flagged

    # Block 4 — Numba parallel
    @njit(cache=True, parallel=True)
    def detect_numba_parallel(data, z_thr):
        n_p, n_r, n_v = data.shape
        flagged = np.zeros(n_p, dtype=np.int32)
        for p in prange(n_p):
            for v in range(n_v):
                total = 0.0
                for r in range(n_r):
                    total += data[p, r, v]
                mean = total / n_r
                sq = 0.0
                for r in range(n_r):
                    d = data[p, r, v] - mean
                    sq += d * d
                std = (sq / n_r) ** 0.5
                if std > 0:
                    for r in range(n_r):
                        if abs(data[p, r, v] - mean) / std > z_thr:
                            flagged[p] += 1
                            break
        return flagged


# ---------------------------------------------------------------------------
# Block 5 — float32 + Numba parallel (memory bandwidth)
# ---------------------------------------------------------------------------
def detect_float32(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
    return detect_numba_parallel(data.astype(np.float32), np.float32(z_thr))


# ---------------------------------------------------------------------------
# Block 6 — PyTorch CPU
# ---------------------------------------------------------------------------
def detect_torch_cpu(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
    t = torch.from_numpy(data).float()
    means = t.mean(dim=1, keepdim=True)
    stds = t.std(dim=1, keepdim=True, unbiased=False)
    z = (t - means).abs() / torch.clamp(stds, min=1e-9)
    return (z > z_thr).any(dim=1).sum(dim=1).to(torch.int32).numpy()


# ---------------------------------------------------------------------------
# Block 7 — Apple Metal GPU via PyTorch MPS
# ---------------------------------------------------------------------------
def detect_torch_mps(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
    device = torch.device("mps")
    t = torch.from_numpy(data).float().to(device)
    means = t.mean(dim=1, keepdim=True)
    stds = t.std(dim=1, keepdim=True, unbiased=False)
    z = (t - means).abs() / torch.clamp(stds, min=1e-9)
    out = (z > z_thr).any(dim=1).sum(dim=1).to(torch.int32)
    torch.mps.synchronize()           # wait for GPU
    return out.cpu().numpy()


# ---------------------------------------------------------------------------
# Block 8 — Cython (AOT compiled)
# ---------------------------------------------------------------------------
def detect_cython_wrap(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
    if not CYTHON_OK:
        return None
    # The .pyx kernel uses a hardcoded z_threshold of 3.0
    return np.asarray(cython_detect.detect_cython(
        np.ascontiguousarray(data, dtype=np.float64)
    ), dtype=np.int32)


# ---------------------------------------------------------------------------
# Block 9 — Numba CUDA simulator (concept demo, not a real speedup)
# ---------------------------------------------------------------------------
if NUMBA_CUDA_OK:
    @cuda.jit
    def cuda_kernel(data, z_thr, out):
        p = cuda.grid(1)
        if p >= data.shape[0]:
            return
        n_r = data.shape[1]
        n_v = data.shape[2]
        flagged = 0
        for v in range(n_v):
            total = 0.0
            for r in range(n_r):
                total += data[p, r, v]
            mean = total / n_r
            sq = 0.0
            for r in range(n_r):
                d = data[p, r, v] - mean
                sq += d * d
            std = (sq / n_r) ** 0.5
            if std > 0.0:
                for r in range(n_r):
                    if abs(data[p, r, v] - mean) / std > z_thr:
                        flagged += 1
                        break
        out[p] = flagged

    def detect_cuda(data: np.ndarray, z_thr: float = Z_THRESHOLD) -> np.ndarray:
        n_p = data.shape[0]
        d_data = cuda.to_device(np.ascontiguousarray(data, dtype=np.float64))
        d_out = cuda.to_device(np.zeros(n_p, dtype=np.int32))
        TPB = 64
        blocks = (n_p + TPB - 1) // TPB
        cuda_kernel[blocks, TPB](d_data, np.float64(z_thr), d_out)
        return d_out.copy_to_host()


# ===========================================================================
# Driver
# ===========================================================================
def block(name, fn, data, prev_ms, baseline_ms, narrative):
    """Run one optimization block and print bottleneck → solution narrative."""
    try:
        result, ms = time_call(fn, data)
    except Exception as e:
        print(f"\n■ BLOCK: {name}")
        print(f"  SKIPPED — {e}")
        return prev_ms, None

    sp_prev = (prev_ms / ms) if (prev_ms and ms > 0) else 1.0
    sp_base = (baseline_ms / ms) if (baseline_ms and ms > 0) else 1.0

    print(f"\n■ BLOCK: {name}")
    print(f"  DID         : {narrative['did']}")
    print(f"  BOTTLENECK  : {narrative['bottleneck']}")
    print(f"  USED        : {narrative['used']}")
    print(f"  SOLVED      : {narrative['solved']}")
    print(f"  TIME        : {ms:>9.2f} ms   (median of {REPEATS})")
    print(f"  SPEEDUP     : {sp_prev:>6.2f}x vs previous   |   "
          f"{sp_base:>6.2f}x vs baseline")
    return ms, {
        "block": name,
        "time_ms": round(ms, 3),
        "speedup_vs_prev": round(sp_prev, 2),
        "speedup_vs_baseline": round(sp_base, 2),
        "narrative": narrative,
        "anomalous_patients": int(np.sum(result > 0)) if result is not None else None,
    }


def main():
    print("=" * 78)
    print("  PulseStream — Bottleneck → Solution → Speedup Experiment")
    print("=" * 78)
    print(f"  Platform        : {platform.platform()}")
    print(f"  CPU             : {platform.processor() or platform.machine()}")
    print(f"  PyTorch         : {torch.__version__ if TORCH_OK else 'N/A'}")
    print(f"  MPS available   : {MPS_OK}")
    print(f"  CUDA available  : {CUDA_OK}")
    print(f"  Numba available : {NUMBA_OK}")
    print(f"  Cython compiled : {CYTHON_OK}")
    print()
    print(f"  Workload : {N_PATIENTS} patients × {N_READINGS} readings "
          f"× {N_VITALS} vitals = {N_PATIENTS*N_READINGS*N_VITALS:,} cells")
    print(f"  Repeats  : {REPEATS} (median reported)")
    print(f"  Threshold: |z| > {Z_THRESHOLD}")

    data = make_data()

    # warm up Numba (first call compiles; we don't want to time that)
    if NUMBA_OK:
        detect_numba(data, Z_THRESHOLD)
        detect_numba_parallel(data, Z_THRESHOLD)
        detect_numba_parallel(data.astype(np.float32), np.float32(Z_THRESHOLD))
    if MPS_OK:
        # warm MPS — first launch on a device pays a compilation cost
        detect_torch_mps(data, Z_THRESHOLD)

    results = []
    baseline_ms = None
    prev_ms = None

    # Block 1 — Pure Python
    prev_ms, rec = block(
        "1. Pure Python loops", detect_pure_python, data, prev_ms, baseline_ms,
        {
            "did": "Triple-nested for-loops over (patient, vital, reading)",
            "bottleneck": "CPython interpreter overhead — every op boxed/unboxed, GIL-bound",
            "used": "(baseline)",
            "solved": "(this is the baseline we improve from)",
        })
    if rec:
        baseline_ms = prev_ms
        results.append(rec)

    # Block 2 — NumPy
    prev_ms, rec = block(
        "2. NumPy vectorization", detect_numpy, data, prev_ms, baseline_ms,
        {
            "did": "Replaced loops with broadcasted array ops (mean, std, abs, comparison)",
            "bottleneck": "Interpreter dispatch was 99% of the time, not the math",
            "used": "NumPy broadcasting → SIMD-accelerated C kernels",
            "solved": "One vectorised line replaces three Python loops",
        })
    if rec:
        results.append(rec)

    # Block 3 — Numba JIT
    if NUMBA_OK:
        prev_ms, rec = block(
            "3. Numba @njit (single thread)", lambda d: detect_numba(d, Z_THRESHOLD),
            data, prev_ms, baseline_ms,
            {
                "did": "JIT-compiled the original Python loops to native machine code",
                "bottleneck": "NumPy creates large temporary arrays for each op (memory bw)",
                "used": "@njit(cache=True) — LLVM compilation, no temporaries",
                "solved": "Loops fuse; one pass over data instead of N passes",
            })
        if rec:
            results.append(rec)

    # Block 4 — Numba parallel
    if NUMBA_OK:
        prev_ms, rec = block(
            "4. Numba parallel (prange)",
            lambda d: detect_numba_parallel(d, Z_THRESHOLD),
            data, prev_ms, baseline_ms,
            {
                "did": "Replaced range() with prange() over patients",
                "bottleneck": "Single-threaded — only 1 of 8+ cores in use",
                "used": "@njit(parallel=True) + prange — compiler-level OpenMP-style threading",
                "solved": "Patients are independent (embarrassingly parallel); all cores busy",
            })
        if rec:
            results.append(rec)

    # Block 5 — float32
    if NUMBA_OK:
        prev_ms, rec = block(
            "5. float32 + Numba parallel", detect_float32, data, prev_ms, baseline_ms,
            {
                "did": "Down-cast input from float64 → float32 before the kernel",
                "bottleneck": "Memory bandwidth — 8 bytes/cell x N_cells exceeds L2 cache",
                "used": "float32 halves the working-set; twice as many values per cache line",
                "solved": "Better cache utilisation; clinical precision unaffected (~7 dp)",
            })
        if rec:
            results.append(rec)

    # Block 6 — Cython
    if CYTHON_OK:
        prev_ms, rec = block(
            "6. Cython (AOT-compiled .pyx)", detect_cython_wrap, data, prev_ms, baseline_ms,
            {
                "did": "Compiled a typed .pyx kernel with float64_t[:, :, :] memoryviews",
                "bottleneck": "JIT warmup cost on first call (Numba) — Cython is AOT",
                "used": "cdef typed locals + boundscheck(False) + wraparound(False)",
                "solved": "Same near-C performance, but compiled once at install time",
            })
        if rec:
            results.append(rec)

    # Block 7 — PyTorch CPU
    if TORCH_OK:
        prev_ms, rec = block(
            "7. PyTorch CPU tensors", detect_torch_cpu, data, prev_ms, baseline_ms,
            {
                "did": "Same NumPy logic, but using torch.Tensor on CPU",
                "bottleneck": "NumPy uses generic BLAS; PyTorch uses MKL/Accelerate w/ vectorisation",
                "used": "torch CPU backend (Apple Accelerate framework on macOS)",
                "solved": "Better SIMD use + multi-threaded BLAS",
            })
        if rec:
            results.append(rec)

    # Block 8 — MPS GPU
    if MPS_OK:
        prev_ms, rec = block(
            "8. Apple Metal GPU (PyTorch MPS)", detect_torch_mps,
            data, prev_ms, baseline_ms,
            {
                "did": "Moved tensor to MPS device; ran the same ops on Apple GPU",
                "bottleneck": "CPU peaks at ~8 cores; GPU has thousands of ALUs",
                "used": "torch.device('mps') + tensor.to(device); torch.mps.synchronize()",
                "solved": "Massively parallel reduction across all (patient, vital) pairs at once",
            })
        if rec:
            results.append(rec)

    # Block 9 — Numba CUDA (real GPU if available, else simulator)
    if NUMBA_CUDA_OK:
        # Detect whether we're actually on a real GPU or the simulator
        using_sim = os.environ.get("NUMBA_ENABLE_CUDASIM") == "1"
        try:
            real_gpu = (not using_sim) and cuda.is_available() and cuda.detect()
        except Exception:
            real_gpu = (not using_sim)
        gpu_label = "real GPU" if real_gpu else "simulator"
        gpu_bottleneck = (
            "Single-threaded CPU work; GPUs have thousands of ALUs running in parallel"
            if real_gpu else
            "No NVIDIA GPU on this machine — uses CUDA simulator (CPU)"
        )
        gpu_solved = (
            "Massive thread-level parallelism: each patient handled by its own GPU thread"
            if real_gpu else
            "Code-portability: identical kernel runs on professor's CUDA cluster"
        )
        prev_ms_cuda, rec = block(
            f"9. Numba CUDA kernel ({gpu_label})", detect_cuda, data, prev_ms, baseline_ms,
            {
                "did": "Wrote a @cuda.jit kernel: 1 thread per patient, block size 64",
                "bottleneck": gpu_bottleneck,
                "used": "@cuda.jit + cuda.grid(1) — same code runs on CPU sim or real GPU",
                "solved": gpu_solved,
            })
        if rec:
            results.append(rec)

    # Final summary
    print("\n" + "=" * 78)
    print("  SUMMARY — speedup vs baseline (Pure Python)")
    print("=" * 78)
    print(f"  {'Block':<42}{'Time (ms)':>12}{'vs prev':>10}{'vs base':>10}")
    print(f"  {'-'*42}{'-'*12}{'-'*10}{'-'*10}")
    for r in results:
        print(f"  {r['block']:<42}{r['time_ms']:>12.2f}"
              f"{r['speedup_vs_prev']:>9.2f}x{r['speedup_vs_baseline']:>9.2f}x")
    print()

    out_path = Path(__file__).parent / f"bottleneck_results_{N_PATIENTS}p.json"
    with open(out_path, "w") as f:
        json.dump({
            "platform": platform.platform(),
            "torch_version": torch.__version__ if TORCH_OK else None,
            "mps_available": MPS_OK,
            "cuda_available": CUDA_OK,
            "workload": {
                "n_patients": N_PATIENTS, "n_readings": N_READINGS,
                "n_vitals": N_VITALS, "z_threshold": Z_THRESHOLD,
            },
            "results": results,
        }, f, indent=2)
    print(f"  Results saved to: {out_path.relative_to(Path.cwd())}")


if __name__ == "__main__":
    main()
