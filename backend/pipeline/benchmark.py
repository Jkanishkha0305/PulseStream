"""
PulseStream Benchmark Harness — Course Deliverable
Demonstrates progressive optimization of a real-time ICU patient anomaly
detection pipeline using: Python loops → NumPy → Numba JIT → Parallel → Float32.

Run: PYTHONPATH=. python -m pipeline.benchmark
Output: benchmark_results.json
"""

import numpy as np

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
