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
