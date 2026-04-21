"""
Multiprocessing-based anomaly detection using concurrent.futures.

Demonstrates Python-level parallelism via ProcessPoolExecutor,
contrasting with Numba's compiler-level prange parallelism.
"""
import numpy as np
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor


def _detect_single_patient(args: tuple) -> int:
    """Process one patient's window — runs in a separate process."""
    window = args
    n_rows = len(window)
    flags = 0

    for col in range(5):
        vals = [window[r][col] for r in range(n_rows)]
        n = len(vals)
        if n < 2:
            continue

        mean = sum(vals) / n
        variance = sum((x - mean) ** 2 for x in vals) / n
        std = variance ** 0.5

        z = abs((vals[-1] - mean) / std) if std > 0 else 0.0

        s = sorted(vals)
        q1, q3 = s[n // 4], s[3 * n // 4]
        iqr = q3 - q1
        lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outlier = vals[-1] < lo or vals[-1] > hi

        if z > 3.0 or outlier:
            flags += 1
    return flags


def stage_multiprocess(data: np.ndarray, n_workers: int = 4) -> list[int]:
    """Distribute patients across processes using ProcessPoolExecutor."""
    windows = [data[i].tolist() for i in range(data.shape[0])]
    with ProcessPoolExecutor(max_workers=n_workers) as executor:
        results = list(executor.map(_detect_single_patient, windows))
    return results


def stage_threadpool(data: np.ndarray, n_workers: int = 4) -> list[int]:
    """Distribute patients across threads using ThreadPoolExecutor.

    Useful for I/O-bound workloads; included to compare with
    ProcessPoolExecutor for CPU-bound detection.
    """
    windows = [data[i].tolist() for i in range(data.shape[0])]
    with ThreadPoolExecutor(max_workers=n_workers) as executor:
        results = list(executor.map(_detect_single_patient, windows))
    return results
