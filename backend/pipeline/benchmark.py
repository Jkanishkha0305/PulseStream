"""
PulseStream Benchmark Harness — Course Deliverable
Demonstrates progressive optimization of a real-time ICU patient anomaly
detection pipeline using: Python loops → NumPy → Numba JIT → Multiprocessing → Float32.

Run: uv run python -m backend.pipeline.benchmark
Output: benchmark_results.json
"""
import gc
import json
import time
import timeit
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from numba import njit

from pipeline.simulator import StreamSimulator
from pipeline.buffer import PatientBuffer
from pipeline.detector import AnomalyDetector
from pipeline.optimizer import warmup

N_PATIENTS = 100
N_TIMESTEPS = 30
N_RUNS = 100


# ─── Stage 1: Pure Python (baseline) ───────────────────────────────────────────

def compute_zscore_python(values: list[float]) -> list[float]:
    if len(values) < 2:
        return [0.0] * len(values)
    n = len(values)
    mean = sum(values) / n
    variance = sum((x - mean) ** 2 for x in values) / n
    std = variance**0.5
    if std == 0:
        return [0.0] * n
    return [(x - mean) / std for x in values]


def detect_tier1_python(patient_id: str, window: list[dict]) -> dict | None:
    if len(window) < 3:
        return None

    vitals = ["hr", "o2sat", "temp", "sbp", "resp"]
    thresholds = {"hr": 90, "o2sat": 92, "temp": 38.0, "sbp": 100, "resp": 22}

    max_severity = 0.0
    triggered = []

    for vital in vitals:
        values = [r.get(vital, 0) for r in window[-6:]]
        valid = [v for v in values if v is not None and v != 0]
        if len(valid) < 3:
            continue
        if valid[-1] > thresholds.get(vital, 999):
            zscores = compute_zscore_python(valid)
            z = abs(zscores[-1])
            if z > 2.0:
                severity = min(1.0, (z / 3.0) * 0.7 + 0.3)
                max_severity = max(max_severity, severity)
                triggered.append(vital)

    if not triggered:
        return None
    return {"patient_id": patient_id, "tier": 1, "severity": max_severity, "triggered_vitals": triggered}


def stage1_baseline(patient_windows: list[tuple[str, list[dict]]]) -> list[dict]:
    results = []
    for pid, window in patient_windows:
        r = detect_tier1_python(pid, window)
        if r:
            results.append(r)
    return results


# ─── Stage 2: NumPy Vectorized ─────────────────────────────────────────────────

def compute_zscore_np(values: np.ndarray) -> np.ndarray:
    n = len(values)
    if n < 2:
        return np.zeros(n)
    mean = np.mean(values)
    std = np.std(values)
    if std == 0:
        return np.zeros(n)
    return (values - mean) / std


def detect_tier1_numpy(patient_id: str, window: list[dict]) -> dict | None:
    if len(window) < 3:
        return None

    vitals = ["heart_rate", "bp_systolic", "spo2", "temp", "resp_rate"]
    thresholds = np.array([90.0, 92.0, 38.0, 100.0, 22.0])

    arr = np.array(
        [[r.get(v, np.nan) for v in vitals] for r in window[-6:]],
        dtype=np.float64,
    )
    crosses = np.any(arr > thresholds, axis=1)
    if not crosses[-1]:
        return None

    max_sev = 0.0
    triggered = []
    for i, vital in enumerate(vitals):
        col = arr[:, i]
        valid = col[~np.isnan(col)]
        if len(valid) < 3:
            continue
        if valid[-1] > thresholds[i]:
            z = np.abs(compute_zscore_np(valid))
            if z[-1] > 2.0:
                sev = min(1.0, (z[-1] / 3.0) * 0.7 + 0.3)
                max_sev = max(max_sev, sev)
                triggered.append(vital)

    if not triggered:
        return None
    return {"patient_id": patient_id, "tier": 1, "severity": max_sev, "triggered_vitals": triggered}


def stage2_numpy(patient_windows: list[tuple[str, list[dict]]]) -> list[dict]:
    return [r for pid, w in patient_windows if (r := detect_tier1_numpy(pid, w))]


# ─── Stage 3: Numba JIT ────────────────────────────────────────────────────────

@njit(cache=True)
def _zscore_numba(values: np.ndarray) -> np.ndarray:
    n = len(values)
    if n < 2:
        return np.zeros(n)
    mean = np.mean(values)
    std = np.std(values)
    if std == 0:
        return np.zeros(n)
    return (values - mean) / std


@njit(cache=True)
def _threshold_cross_numba(values: np.ndarray, threshold: float) -> np.ndarray:
    n = len(values)
    result = np.zeros(n, dtype=np.int8)
    for i in range(n):
        if values[i] > threshold:
            result[i] = 1
    return result


def detect_tier1_numba(patient_id: str, window: list[dict]) -> dict | None:
    if len(window) < 3:
        return None

    vitals = ["heart_rate", "bp_systolic", "spo2", "temp", "resp_rate"]
    thresholds = np.array([90.0, 92.0, 38.0, 100.0, 22.0])

    arr = np.array(
        [[r.get(v, np.nan) for v in vitals] for r in window[-6:]],
        dtype=np.float64,
    )
    crosses = np.any(arr > thresholds, axis=1)
    if not crosses[-1]:
        return None

    max_sev = 0.0
    triggered = []
    for i, vital in enumerate(vitals):
        col = arr[:, i]
        valid = col[~np.isnan(col)]
        if len(valid) < 3:
            continue
        if valid[-1] > thresholds[i]:
            z = np.abs(_zscore_numba(valid))
            if z[-1] > 2.0:
                sev = min(1.0, (z[-1] / 3.0) * 0.7 + 0.3)
                max_sev = max(max_sev, sev)
                triggered.append(vital)

    if not triggered:
        return None
    return {"patient_id": patient_id, "tier": 1, "severity": max_sev, "triggered_vitals": triggered}


def stage3_numba(patient_windows: list[tuple[str, list[dict]]]) -> list[dict]:
    return [r for pid, w in patient_windows if (r := detect_tier1_numba(pid, w))]


# ─── Stage 4: Multiprocessing ─────────────────────────────────────────────────

def detect_tier1_sync(args: tuple) -> dict | None:
    pid, window = args
    return detect_tier1_numba(pid, window)


def stage4_multiprocess(patient_windows: list[tuple[str, list[dict]]]) -> list[dict]:
    from concurrent.futures import ProcessPoolExecutor
    with ProcessPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(detect_tier1_sync, patient_windows))
    return [r for r in results if r is not None]


# ─── Stage 5: Float32 Memory ─────────────────────────────────────────────────

@njit(cache=True)
def _zscore_f32(values: np.ndarray) -> np.ndarray:
    n = len(values)
    if n < 2:
        return np.zeros(n, dtype=np.float32)
    mean = values.mean()
    std = values.std()
    if std == 0:
        return np.zeros(n, dtype=np.float32)
    return (values - mean) / std


def detect_tier1_float32(patient_id: str, window: list[dict]) -> dict | None:
    if len(window) < 3:
        return None

    vitals = ["heart_rate", "bp_systolic", "spo2", "temp", "resp_rate"]
    thresholds = np.array([90.0, 100.0, 92.0, 38.0, 22.0], dtype=np.float32)

    arr = np.array(
        [[r.get(v, np.nan) for v in vitals] for r in window[-6:]],
        dtype=np.float32,
    )
    crosses = np.any(arr > thresholds, axis=1)
    if not crosses[-1]:
        return None

    max_sev = 0.0
    triggered = []
    for i, vital in enumerate(vitals):
        col = arr[:, i]
        valid = col[~np.isnan(col)]
        if len(valid) < 3:
            continue
        if valid[-1] > thresholds[i]:
            z = np.abs(_zscore_f32(valid))
            if z[-1] > 2.0:
                sev = min(1.0, (z[-1] / 3.0) * 0.7 + 0.3)
                max_sev = max(max_sev, sev)
                triggered.append(vital)

    if not triggered:
        return None
    return {"patient_id": patient_id, "tier": 1, "severity": max_sev, "triggered_vitals": triggered}


def stage5_float32(patient_windows: list[tuple[str, list[dict]]]) -> list[dict]:
    return [r for pid, w in patient_windows if (r := detect_tier1_float32(pid, w))]


# ─── Benchmark Runner ─────────────────────────────────────────────────────────

def _windows_to_dicts(patient_windows: list[tuple[str, np.ndarray]]) -> list[tuple[str, list[dict]]]:
    """Convert np.ndarray windows to list[dict] for baseline stage."""
    result: list[tuple[str, list[dict]]] = []
    vital_cols = ["hr", "o2sat", "temp", "sbp", "resp"]
    for pid, window in patient_windows:
        rows: list[dict] = []
        for row in window:
            rows.append({v: float(row[i]) if not np.isnan(row[i]) else None for i, v in enumerate(vital_cols)})
        result.append((pid, rows))
    return result


def run_benchmark(n_patients: int = N_PATIENTS, n_timesteps: int = N_TIMESTEPS) -> dict:
    print(f"\n{'='*60}")
    print(f"  PulseStream Benchmark — {n_patients} patients × {n_timesteps} timesteps")
    print(f"{'='*60}\n")

    gc.collect()
    warmup()

    sim = StreamSimulator(num_patients=n_patients, seed=42)
    sim.load_all_patients()
    buf = PatientBuffer(window_size=10)
    patient_ids = sim.get_all_patient_ids()

    all_readings: list[dict] = []
    for _ in range(n_timesteps):
        for pid in patient_ids:
            row = sim._generate_synthetic_reading(pid)
            if row:
                vitals = {v: row[v] for v in ["hr", "o2sat", "temp", "sbp", "resp"]}
                all_readings.append({"patient_id": pid, "vitals": vitals, "timestamp": row["timestamp"]})

    patient_windows: list[tuple[str, np.ndarray]] = []
    for pid in patient_ids:
        for reading in all_readings:
            if reading["patient_id"] == pid:
                buf.push(pid, reading["vitals"])
        window = buf.get_window(pid)
        if window.size > 0:
            patient_windows.append((pid, window))

    del all_readings
    gc.collect()

    dict_windows = _windows_to_dicts(patient_windows)

    stages = [
        ("Baseline", stage1_baseline),
        ("NumPy", stage2_numpy),
        ("Numba JIT", stage3_numba),
        ("Multiprocessing", stage4_multiprocess),
        ("Float32", stage5_float32),
    ]

    results: list[dict] = []
    baseline_ms = 0.0

    windows_by_stage = {
        "Baseline": dict_windows,
        "NumPy": patient_windows,
        "Numba JIT": patient_windows,
        "Multiprocessing": patient_windows,
        "Float32": patient_windows,
    }

    for name, fn in stages:
        pw = windows_by_stage[name]
        gc.collect()
        timer = timeit.Timer(lambda f=fn, w=pw: f(w), timer=time.perf_counter)
        times = timer.repeat(repeat=3, number=1)
        times_ms = [t * 1000 for t in times]
        mean_ms = float(np.mean(times_ms))
        std_ms = float(np.std(times_ms))

        peak_mem = 0.0
        try:
            from memory_profiler import memory_usage
            mem_usage = memory_usage((fn, (pw,)), interval=0.1, max_iterations=1)
            peak_mem = float(max(mem_usage)) if mem_usage else 0.0
        except Exception:
            peak_mem = 0.0

        speedup = baseline_ms / mean_ms if name != "Baseline" and baseline_ms > 0 else 1.0

        if name == "Baseline":
            baseline_ms = mean_ms
            speedup = 1.0

        results.append({
            "stage": name,
            "latency_ms": round(mean_ms, 3),
            "latency_std_ms": round(std_ms, 3),
            "speedup": round(speedup, 2),
            "memory_mb": round(peak_mem, 2) if peak_mem > 0 else None,
        })

        bar_len = int(mean_ms / baseline_ms * 30) if baseline_ms > 0 else 30
        bar = "█" * bar_len
        print(
            f"  {name:<18} │ {mean_ms:>8.2f} ms  ±{std_ms:>5.2f}  │ "
            f"{speedup:>7.2f}x  │ {peak_mem:>6.1f} MB  │ {bar}"
        )

    results_dict = {
        "results": results,
        "n_patients": n_patients,
        "n_timesteps": n_timesteps,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    output_path = Path(__file__).parent.parent / "benchmark_results.json"
    with open(output_path, "w") as f:
        json.dump(results_dict, f, indent=2)

    print(f"\n  Results saved to: {output_path}")
    print(f"\n{'='*60}\n")

    return results_dict


if __name__ == "__main__":
    run_benchmark()
