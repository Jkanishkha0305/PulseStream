"""
Pipeline Profiler — cProfile & line_profiler
=============================================
Demonstrates: cProfile, pstats.Stats, line_profiler (LineProfiler)
Course reference: Lecture 04 — Performance Tuning / Profiling

Profiles the PulseStream anomaly-detection pipeline to identify hotspots
using both function-level (cProfile) and line-level (line_profiler) tools.
"""

import cProfile
import pstats
import io
import numpy as np
import time


# ===================================================================
# Detection functions to profile
# ===================================================================

def pure_python_detect(data, z_threshold=3.0):
    """Pure Python anomaly detection — intentionally slow for profiling."""
    n_patients, n_readings, n_vitals = data.shape
    results = []

    for p in range(n_patients):
        flagged = 0
        for v in range(n_vitals):
            values = [data[p, r, v] for r in range(n_readings)]
            n = len(values)
            mean = sum(values) / n
            variance = sum((x - mean) ** 2 for x in values) / n
            std = variance ** 0.5

            if std > 0:
                zscores = [abs((x - mean) / std) for x in values]
                if any(z > z_threshold for z in zscores):
                    flagged += 1
        results.append(flagged)
    return results


def numpy_detect(data, z_threshold=3.0):
    """NumPy vectorised anomaly detection."""
    means = np.mean(data, axis=1, keepdims=True)
    stds  = np.std(data, axis=1, keepdims=True)
    stds  = np.where(stds == 0, 1.0, stds)
    zscores = np.abs((data - means) / stds)
    flagged = np.any(zscores > z_threshold, axis=1)
    return np.sum(flagged, axis=1)


def compute_iqr_flags(data):
    """IQR-based outlier detection."""
    q25 = np.percentile(data, 25, axis=1, keepdims=True)
    q75 = np.percentile(data, 75, axis=1, keepdims=True)
    iqr = q75 - q25
    lower = q25 - 1.5 * iqr
    upper = q75 + 1.5 * iqr
    outliers = (data < lower) | (data > upper)
    return np.sum(outliers, axis=(1, 2))


def full_pipeline(data, z_threshold=3.0):
    """Combined z-score + IQR pipeline."""
    zs = numpy_detect(data, z_threshold)
    iq = compute_iqr_flags(data)
    return zs + (iq > 5).astype(int)


# ===================================================================
# 1. cProfile — function-level profiling
# ===================================================================

def run_cprofile(data, n_runs=3):
    """
    Profile with cProfile.  Shows:
      - function call counts
      - tottime  (time in the function itself)
      - cumtime  (time including sub-calls)
    Sorted by cumulative time (most impactful first).
    """
    print("=" * 70)
    print("cProfile — Function-Level Profiling")
    print("=" * 70)

    profiler = cProfile.Profile()
    profiler.enable()
    for _ in range(n_runs):
        pure_python_detect(data[:50])       # small subset for pure Python
        numpy_detect(data)
        compute_iqr_flags(data)
        full_pipeline(data)
    profiler.disable()

    # ---- Sort by cumulative time ----
    stream = io.StringIO()
    stats = pstats.Stats(profiler, stream=stream)
    stats.sort_stats("cumulative")
    stats.print_stats(20)
    print(stream.getvalue())

    # ---- Sort by total time (self only) ----
    stream2 = io.StringIO()
    stats2 = pstats.Stats(profiler, stream=stream2)
    stats2.sort_stats("tottime")
    stats2.print_stats(10)
    print("--- Sorted by tottime ---")
    print(stream2.getvalue())

    # ---- Callers of the hottest functions ----
    stream3 = io.StringIO()
    stats3 = pstats.Stats(profiler, stream=stream3)
    stats3.print_callers(5)
    print("--- Callers ---")
    print(stream3.getvalue())

    return stats


# ===================================================================
# 2. line_profiler — line-by-line profiling
# ===================================================================

def run_line_profiler(data):
    """
    Profile specific functions line-by-line.
    Shows per-line: hits, time, % of total, source code.
    Falls back to manual timing if line_profiler is not installed.
    """
    print("=" * 70)
    print("line_profiler — Line-by-Line Profiling")
    print("=" * 70)

    try:
        from line_profiler import LineProfiler
    except ImportError:
        print("line_profiler not installed (pip install line_profiler).")
        print("Falling back to manual stage timing.\n")
        _manual_line_timing(data)
        return

    lp = LineProfiler()
    lp.add_function(pure_python_detect)
    lp.add_function(numpy_detect)
    lp.add_function(compute_iqr_flags)
    lp.add_function(full_pipeline)

    # profile the full pipeline
    wrapped = lp(full_pipeline)
    wrapped(data)

    # also profile pure Python on a small slice
    wrapped2 = lp(pure_python_detect)
    wrapped2(data[:20])

    stream = io.StringIO()
    lp.print_stats(stream=stream)
    print(stream.getvalue())


def _manual_line_timing(data):
    """Fallback when line_profiler is unavailable."""
    stages = [
        ("pure_python_detect (20 patients)", lambda: pure_python_detect(data[:20])),
        ("numpy_detect",                     lambda: numpy_detect(data)),
        ("compute_iqr_flags",                lambda: compute_iqr_flags(data)),
        ("full_pipeline",                    lambda: full_pipeline(data)),
    ]
    for name, fn in stages:
        t0 = time.perf_counter()
        fn()
        elapsed = time.perf_counter() - t0
        print(f"  {name:40s} {elapsed * 1000:8.2f} ms")


# ===================================================================
# 3. Comparative profiling report
# ===================================================================

def run_comparative_profile(data):
    """Side-by-side cProfile comparison: pure Python vs NumPy."""
    print("\n" + "=" * 70)
    print("Comparative Profiling Report")
    print("=" * 70)

    small = data[:50]

    # ---- pure Python ----
    pr1 = cProfile.Profile()
    pr1.enable()
    r1 = pure_python_detect(small)
    pr1.disable()
    s1 = pstats.Stats(pr1)
    py_time  = sum(v[3] for v in s1.stats.values())
    py_calls = sum(v[0] for v in s1.stats.values())

    # ---- NumPy ----
    pr2 = cProfile.Profile()
    pr2.enable()
    r2 = numpy_detect(small)
    pr2.disable()
    s2 = pstats.Stats(pr2)
    np_time  = sum(v[3] for v in s2.stats.values())
    np_calls = sum(v[0] for v in s2.stats.values())

    print(f"\n  {'Metric':<30s} {'Pure Python':>15s} {'NumPy':>15s}")
    print(f"  {'-' * 60}")
    print(f"  {'Total time (ms)':<30s} {py_time * 1000:>15.2f} {np_time * 1000:>15.2f}")
    print(f"  {'Function calls':<30s} {py_calls:>15d} {np_calls:>15d}")
    print(f"  {'Speedup':<30s} {'—':>15s} "
          f"{py_time / max(np_time, 1e-9):>14.1f}x")
    print(f"  {'Anomalous patients':<30s} "
          f"{sum(1 for v in r1 if v > 0):>15d} "
          f"{int(np.sum(r2 > 0)):>15d}")


# ===================================================================
# Main
# ===================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("PulseStream — Pipeline Profiling")
    print("=" * 70)

    rng  = np.random.RandomState(42)
    data = rng.randn(200, 50, 5)
    data[:30, :, :2] += 5.0

    print(f"Data: {data.shape[0]} patients × {data.shape[1]} readings "
          f"× {data.shape[2]} vitals\n")

    run_cprofile(data, n_runs=1)
    run_line_profiler(data)
    run_comparative_profile(data)
