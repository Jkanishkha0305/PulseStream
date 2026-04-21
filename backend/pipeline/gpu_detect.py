"""
GPU-accelerated anomaly detection using CuPy (CUDA).

Falls back gracefully to NumPy when no GPU is available, allowing
the benchmark to include the stage on any machine.

Demonstrates Week 12 course topic: Python for GPUs.
"""
import numpy as np

try:
    import cupy as cp
    GPU_AVAILABLE = True
except ImportError:
    cp = None
    GPU_AVAILABLE = False


def detect_gpu(data: np.ndarray) -> np.ndarray:
    """Run Z-score + IQR anomaly detection on GPU via CuPy.

    Mirrors stage2_numpy logic but executes on CUDA cores. The entire
    3D array is transferred to GPU memory once, computed in parallel,
    and the result transferred back.

    Args:
        data: shape (n_patients, window_size, 5), float64 or float32

    Returns:
        1D array of flag counts per patient
    """
    if not GPU_AVAILABLE:
        return _detect_numpy_fallback(data)

    d = cp.asarray(data)
    n_rows = d.shape[1]

    means = cp.mean(d, axis=1, keepdims=True)
    stds = cp.std(d, axis=1, keepdims=True)
    stds_safe = cp.where(stds == 0, 1.0, stds)
    z_last = cp.abs((d[:, -1:, :] - means) / stds_safe)[:, 0, :]
    z_flags = z_last > 3.0

    sorted_d = cp.sort(d, axis=1)
    q1 = sorted_d[:, n_rows // 4, :]
    q3 = sorted_d[:, 3 * n_rows // 4, :]
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    last_vals = d[:, -1, :]
    iqr_flags = (last_vals < lo) | (last_vals > hi)

    combined = z_flags | iqr_flags
    result = cp.sum(combined, axis=1)
    return cp.asnumpy(result)


def _detect_numpy_fallback(data: np.ndarray) -> np.ndarray:
    """CPU fallback using the same vectorized logic as NumPy stage."""
    n_rows = data.shape[1]

    means = np.mean(data, axis=1, keepdims=True)
    stds = np.std(data, axis=1, keepdims=True)
    stds_safe = np.where(stds == 0, 1.0, stds)
    z_last = np.abs((data[:, -1:, :] - means) / stds_safe)[:, 0, :]
    z_flags = z_last > 3.0

    sorted_d = np.sort(data, axis=1)
    q1 = sorted_d[:, n_rows // 4, :]
    q3 = sorted_d[:, 3 * n_rows // 4, :]
    iqr = q3 - q1
    lo = q1 - 1.5 * iqr
    hi = q3 + 1.5 * iqr
    last_vals = data[:, -1, :]
    iqr_flags = (last_vals < lo) | (last_vals > hi)

    combined = z_flags | iqr_flags
    return np.sum(combined, axis=1)
