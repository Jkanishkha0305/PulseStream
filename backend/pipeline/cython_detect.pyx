# cython: boundscheck=False, wraparound=False, cdivision=True
"""
Cython-optimized anomaly detection kernel.

Compiles to C with typed memoryviews for near-native performance.
Build: python setup_cython.py build_ext --inplace
"""
import numpy as np
cimport numpy as np
from libc.math cimport sqrt, fabs

ctypedef np.float64_t DTYPE_t


def detect_cython(np.ndarray[DTYPE_t, ndim=3] data):
    """Process all patients using Cython typed memoryviews.

    Args:
        data: shape (n_patients, window_size, 5), float64

    Returns:
        list of flag counts per patient
    """
    cdef int n_patients = data.shape[0]
    cdef int n_rows = data.shape[1]
    cdef int n_cols = 5
    cdef int p, col, r, flags
    cdef double total, mean, var_sum, std, z, last_val
    cdef double q1, q3, iqr, lo, hi

    cdef np.ndarray[DTYPE_t, ndim=1] sorted_vals = np.empty(n_rows, dtype=np.float64)
    cdef np.ndarray[np.int32_t, ndim=1] results = np.zeros(n_patients, dtype=np.int32)

    for p in range(n_patients):
        flags = 0
        for col in range(n_cols):
            total = 0.0
            for r in range(n_rows):
                total += data[p, r, col]
            mean = total / n_rows

            var_sum = 0.0
            for r in range(n_rows):
                var_sum += (data[p, r, col] - mean) * (data[p, r, col] - mean)
            std = sqrt(var_sum / n_rows)

            if std > 0:
                z = fabs((data[p, n_rows - 1, col] - mean) / std)
            else:
                z = 0.0

            for r in range(n_rows):
                sorted_vals[r] = data[p, r, col]
            sorted_vals.sort()

            q1 = sorted_vals[n_rows // 4]
            q3 = sorted_vals[3 * n_rows // 4]
            iqr = q3 - q1
            lo = q1 - 1.5 * iqr
            hi = q3 + 1.5 * iqr
            last_val = data[p, n_rows - 1, col]

            if z > 3.0 or last_val < lo or last_val > hi:
                flags += 1
        results[p] = flags
    return results
