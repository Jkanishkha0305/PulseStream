"""
PulseStream Benchmark Harness — Course Deliverable
Demonstrates progressive optimization of a real-time ICU patient anomaly
detection pipeline using: Python loops → NumPy → Numba JIT → Multiprocessing → Float32.

Run: PYTHONPATH=. python -m pipeline.benchmark
Output: benchmark_results.json
"""
import gc
import json
import time
import timeit
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from numba import njit, prange


N_PATIENTS = 1000
WINDOW_SIZE = 50
VITALS = ["hr", "o2sat", "temp", "sbp", "resp"]
THRESHOLDS = np.array([100.0, 92.0, 38.5, 140.0, 20.0])


# ─── Synthetic data generation ────────────────────────────────────────────────

def generate_test_data(n_patients: int, window_size: int) -> np.ndarray:
    """Generate realistic vital-sign windows: (n_patients, window_size, 5)."""
    rng = np.random.default_rng(42)
    data = np.empty((n_patients, window_size, 5), dtype=np.float64)
    data[:, :, 0] = rng.normal(80, 12, (n_patients, window_size))    # HR
    data[:, :, 1] = rng.normal(97, 2, (n_patients, window_size))     # O2Sat
    data[:, :, 2] = rng.normal(37.0, 0.4, (n_patients, window_size)) # Temp
    data[:, :, 3] = rng.normal(120, 15, (n_patients, window_size))   # SBP
    data[:, :, 4] = rng.normal(16, 3, (n_patients, window_size))     # Resp

    anomaly_patients = rng.choice(n_patients, size=n_patients // 5, replace=False)
    for idx in anomaly_patients:
        data[idx, -1, 0] = rng.normal(150, 10)
        data[idx, -1, 3] = rng.normal(180, 15)
    return data


# ─── Stage 1: Pure Python (baseline) ─────────────────────────────────────────

def _zscore_python(values: list[float]) -> list[float]:
    n = len(values)
    if n < 2:
        return [0.0] * n
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / n
    std = variance ** 0.5
    if std == 0:
        return [0.0] * n
    return [(x - mean) / std for x in values]


def _iqr_flags_python(values: list[float]) -> list[bool]:
    n = len(values)
    if n < 4:
        return [False] * n
    s = sorted(values)
    q1 = s[n // 4]
    q3 = s[3 * n // 4]
    iqr = q3 - q1
    lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    return [v < lo or v > hi for v in values]


def _detect_python(window: list[list[float]], thresholds: list[float]) -> int:
    """Returns count of flagged vitals for the latest reading."""
    flags = 0
    for col in range(5):
        vals = [window[row][col] for row in range(len(window))]
        zscores = _zscore_python(vals)
        iqr = _iqr_flags_python(vals)
        if abs(zscores[-1]) > 3.0 or iqr[-1]:
            flags += 1
    return flags


def stage1_baseline(data: np.ndarray) -> list[int]:
    results = []
    thresholds = THRESHOLDS.tolist()
    for i in range(data.shape[0]):
        window = data[i].tolist()
        results.append(_detect_python(window, thresholds))
    return results


# ─── Stage 2: NumPy Batch Vectorized ─────────────────────────────────────────

def stage2_numpy(data: np.ndarray) -> np.ndarray:
    """Vectorized across ALL patients simultaneously — no Python loops over patients."""
    n_patients, n_rows, n_cols = data.shape

    means = np.mean(data, axis=1, keepdims=True)
    stds = np.std(data, axis=1, keepdims=True)
    stds_safe = np.where(stds == 0, 1.0, stds)
    zscores = np.abs((data - means) / stds_safe)
    z_last = zscores[:, -1, :]
    z_flags = z_last > 3.0

    sorted_data = np.sort(data, axis=1)
    q1 = sorted_data[:, n_rows // 4, :]
    q3 = sorted_data[:, 3 * n_rows // 4, :]
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    last_vals = data[:, -1, :]
    iqr_flags = (last_vals < lo) | (last_vals > hi)

    combined = z_flags | iqr_flags
    return np.sum(combined, axis=1)


# ─── Stage 3: Numba JIT ─────────────────────────────────────────────────────

@njit(cache=True)
def _detect_numba_kernel(window: np.ndarray) -> int:
    flags = 0
    n_rows = window.shape[0]
    for col in range(5):
        total = 0.0
        for r in range(n_rows):
            total += window[r, col]
        mean = total / n_rows

        var_sum = 0.0
        for r in range(n_rows):
            var_sum += (window[r, col] - mean) ** 2
        std = (var_sum / n_rows) ** 0.5

        if std > 0:
            z = abs((window[n_rows - 1, col] - mean) / std)
        else:
            z = 0.0

        sorted_vals = np.empty(n_rows)
        for r in range(n_rows):
            sorted_vals[r] = window[r, col]
        sorted_vals.sort()

        q1 = sorted_vals[n_rows // 4]
        q3 = sorted_vals[3 * n_rows // 4]
        iqr = q3 - q1
        lo = q1 - 1.5 * iqr
        hi = q3 + 1.5 * iqr
        last_val = window[n_rows - 1, col]
        outlier = last_val < lo or last_val > hi

        if z > 3.0 or outlier:
            flags += 1
    return flags


def stage3_numba(data: np.ndarray) -> list[int]:
    return [_detect_numba_kernel(data[i]) for i in range(data.shape[0])]


# ─── Stage 4: Numba Parallel (prange) ────────────────────────────────────────

@njit(parallel=True, cache=True)
def _detect_batch_parallel(data: np.ndarray) -> np.ndarray:
    """Process all patients in parallel using Numba prange."""
    n_patients = data.shape[0]
    n_rows = data.shape[1]
    results = np.zeros(n_patients, dtype=np.int32)

    for p in prange(n_patients):
        flags = 0
        for col in range(5):
            total = 0.0
            for r in range(n_rows):
                total += data[p, r, col]
            mean = total / n_rows

            var_sum = 0.0
            for r in range(n_rows):
                var_sum += (data[p, r, col] - mean) ** 2
            std = (var_sum / n_rows) ** 0.5

            if std > 0:
                z = abs((data[p, n_rows - 1, col] - mean) / std)
            else:
                z = 0.0

            sorted_vals = np.empty(n_rows)
            for r in range(n_rows):
                sorted_vals[r] = data[p, r, col]
            sorted_vals.sort()

            q1 = sorted_vals[n_rows // 4]
            q3 = sorted_vals[3 * n_rows // 4]
            iqr = q3 - q1
            lo = q1 - 1.5 * iqr
            hi = q3 + 1.5 * iqr
            last_val = data[p, n_rows - 1, col]
            outlier = last_val < lo or last_val > hi

            if z > 3.0 or outlier:
                flags += 1
        results[p] = flags
    return results


def stage4_parallel(data: np.ndarray) -> np.ndarray:
    return _detect_batch_parallel(data)


# ─── Stage 5: Float32 + Numba ────────────────────────────────────────────────

@njit(cache=True)
def _detect_numba_f32_kernel(window: np.ndarray) -> int:
    flags = 0
    n_rows = window.shape[0]
    for col in range(5):
        total = np.float32(0.0)
        for r in range(n_rows):
            total += window[r, col]
        mean = total / np.float32(n_rows)

        var_sum = np.float32(0.0)
        for r in range(n_rows):
            var_sum += (window[r, col] - mean) ** 2
        std = np.sqrt(var_sum / np.float32(n_rows))

        if std > 0:
            z_val = abs((window[n_rows - 1, col] - mean) / std)
        else:
            z_val = np.float32(0.0)

        sorted_vals = np.empty(n_rows, dtype=np.float32)
        for r in range(n_rows):
            sorted_vals[r] = window[r, col]
        sorted_vals.sort()

        q1 = sorted_vals[n_rows // 4]
        q3 = sorted_vals[3 * n_rows // 4]
        iqr = q3 - q1
        lo = q1 - np.float32(1.5) * iqr
        hi = q3 + np.float32(1.5) * iqr
        last_val = window[n_rows - 1, col]
        outlier = last_val < lo or last_val > hi

        if z_val > 3.0 or outlier:
            flags += 1
    return flags


def stage5_float32(data: np.ndarray) -> list[int]:
    data_f32 = data.astype(np.float32)
    return [_detect_numba_f32_kernel(data_f32[i]) for i in range(data_f32.shape[0])]


# ─── Stage 6: Float32 + Parallel (best of everything) ────────────────────────

@njit(parallel=True, cache=True)
def _detect_batch_parallel_f32(data: np.ndarray) -> np.ndarray:
    """Float32 + parallel prange for maximum throughput with minimum memory."""
    n_patients = data.shape[0]
    n_rows = data.shape[1]
    results = np.zeros(n_patients, dtype=np.int32)

    for p in prange(n_patients):
        flags = 0
        for col in range(5):
            total = np.float32(0.0)
            for r in range(n_rows):
                total += data[p, r, col]
            mean = total / np.float32(n_rows)

            var_sum = np.float32(0.0)
            for r in range(n_rows):
                var_sum += (data[p, r, col] - mean) ** 2
            std = np.sqrt(var_sum / np.float32(n_rows))

            if std > 0:
                z = abs((data[p, n_rows - 1, col] - mean) / std)
            else:
                z = np.float32(0.0)

            sorted_vals = np.empty(n_rows, dtype=np.float32)
            for r in range(n_rows):
                sorted_vals[r] = data[p, r, col]
            sorted_vals.sort()

            q1 = sorted_vals[n_rows // 4]
            q3 = sorted_vals[3 * n_rows // 4]
            iqr = q3 - q1
            lo = q1 - np.float32(1.5) * iqr
            hi = q3 + np.float32(1.5) * iqr
            last_val = data[p, n_rows - 1, col]
            outlier = last_val < lo or last_val > hi

            if z > 3.0 or outlier:
                flags += 1
        results[p] = flags
    return results


def stage6_float32_parallel(data: np.ndarray) -> np.ndarray:
    data_f32 = data.astype(np.float32)
    return _detect_batch_parallel_f32(data_f32)


# ─── Benchmark Runner ────────────────────────────────────────────────────────

def run_benchmark(n_patients: int = N_PATIENTS, window_size: int = WINDOW_SIZE) -> dict:
    print(f"\n{'='*70}")
    print(f"  PulseStream Benchmark — {n_patients} patients × {window_size} window")
    print(f"{'='*70}\n")

    print("  Generating test data...")
    data = generate_test_data(n_patients, window_size)
    data_f32 = data.astype(np.float32)
    mem_f64 = data.nbytes / (1024 * 1024)
    mem_f32 = data_f32.nbytes / (1024 * 1024)
    print(f"  Data: {data.shape}  float64={mem_f64:.1f} MB  float32={mem_f32:.1f} MB\n")

    print("  Warming up Numba JIT...")
    _detect_numba_kernel(data[0])
    _detect_numba_f32_kernel(data_f32[0])
    _detect_batch_parallel(data[:2])
    _detect_batch_parallel_f32(data_f32[:2])
    print("  Warmup complete.\n")

    stages = [
        ("Pure Python", stage1_baseline, data, mem_f64),
        ("NumPy Vectorized", stage2_numpy, data, mem_f64),
        ("Numba JIT", stage3_numba, data, mem_f64),
        ("Numba Parallel", stage4_parallel, data, mem_f64),
        ("Float32 + Parallel", stage6_float32_parallel, data, mem_f32),
    ]

    results: list[dict] = []
    baseline_ms = 0.0

    print(f"  {'Stage':<20} │ {'Latency':>10} │ {'Speedup':>9} │ {'Mem (MB)':>9} │ Bar")
    print(f"  {'─'*20}─┼─{'─'*10}─┼─{'─'*9}─┼─{'─'*9}─┼─{'─'*30}")

    for name, fn, input_data, mem_mb in stages:
        gc.collect()
        timer = timeit.Timer(lambda f=fn, d=input_data: f(d), timer=time.perf_counter)
        times = timer.repeat(repeat=5, number=1)
        times_ms = [t * 1000 for t in times]
        mean_ms = float(np.median(times_ms))
        std_ms = float(np.std(times_ms))

        if name == "Pure Python":
            baseline_ms = mean_ms
            speedup = 1.0
        else:
            speedup = baseline_ms / mean_ms if mean_ms > 0 else 1.0

        results.append({
            "stage": name,
            "latency_ms": round(mean_ms, 3),
            "latency_std_ms": round(std_ms, 3),
            "speedup": round(speedup, 2),
            "memory_mb": round(mem_mb, 2),
        })

        bar_len = max(1, int(30 / max(speedup, 0.01)))
        bar = "█" * min(bar_len, 30)
        print(
            f"  {name:<20} │ {mean_ms:>8.1f}ms │ {speedup:>7.1f}x  │ {mem_mb:>7.1f}   │ {bar}"
        )

    # ── Optimization Summary ──────────────────────────────────────────────
    best = max(results[1:], key=lambda r: r["speedup"])
    total_speedup = best["speedup"]
    pct_reduction = (1 - best["latency_ms"] / results[0]["latency_ms"]) * 100

    print(f"\n{'─'*70}")
    print("  OPTIMIZATION SUMMARY")
    print(f"{'─'*70}")
    print(f"  Baseline (Pure Python):       {results[0]['latency_ms']:>10.1f} ms")
    print(f"  Best ({best['stage']:>18}):  {best['latency_ms']:>10.1f} ms")
    print("  ──────────────────────────────────────────")
    print(f"  Total Speedup:                {total_speedup:>10.1f}x faster")
    print(f"  Latency Reduction:            {pct_reduction:>10.1f}%")
    print(f"  Memory Reduction (f32):       {((1 - mem_f32 / mem_f64) * 100):>10.1f}%")
    print()

    print("  Progressive Optimization:")
    print(f"  {'Stage':<20} {'Time (ms)':>10} {'vs Baseline':>12} {'vs Previous':>12}")
    print(f"  {'─'*56}")
    for i, r in enumerate(results):
        vs_base = f"{r['speedup']:.1f}x" if i > 0 else "---"
        if i > 0:
            prev_ms = results[i - 1]["latency_ms"]
            delta = ((1 - r["latency_ms"] / prev_ms) * 100) if prev_ms > 0 else 0
            vs_prev = f"{delta:+.1f}%" if delta != 0 else "~0%"
        else:
            vs_prev = "baseline"
        print(f"  {r['stage']:<20} {r['latency_ms']:>10.1f} {vs_base:>12} {vs_prev:>12}")

    print(f"\n{'='*70}\n")

    results_dict = {
        "results": results,
        "summary": {
            "baseline_ms": results[0]["latency_ms"],
            "best_stage": best["stage"],
            "best_ms": best["latency_ms"],
            "total_speedup": round(total_speedup, 2),
            "latency_reduction_pct": round(pct_reduction, 1),
            "memory_reduction_pct": round((1 - mem_f32 / mem_f64) * 100, 1),
        },
        "n_patients": n_patients,
        "window_size": window_size,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    output_path = Path(__file__).parent.parent / "benchmark_results.json"
    with open(output_path, "w") as f:
        json.dump(results_dict, f, indent=2)

    print(f"  Results saved to: {output_path}")
    print(f"\n{'='*70}\n")

    return results_dict


if __name__ == "__main__":
    run_benchmark()
