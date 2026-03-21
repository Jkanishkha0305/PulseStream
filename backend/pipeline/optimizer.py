"""
Numba JIT optimized functions for anomaly detection.

Contains Z-score and IQR computation optimized with Numba.
"""

import numpy as np
from numba import jit


@jit(nopython=True, cache=True)
def compute_zscore_numba(data: np.ndarray) -> np.ndarray:
    """
    Compute Z-score for each column in the data.
    
    Args:
        data: 2D array of shape (n_rows, n_cols)
        
    Returns:
        Array of same shape with Z-scores per column
    """
    n_rows, n_cols = data.shape
    result = np.zeros_like(data)
    
    for col in range(n_cols):
        # Get column values (handle NaN by replacing with 0 for computation)
        col_data = data[:, col]
        
        # Calculate mean and std, skipping NaN
        total = 0.0
        count = 0
        for i in range(n_rows):
            val = col_data[i]
            if not np.isnan(val):
                total += val
                count += 1
        
        if count > 1:
            mean = total / count
            
            # Calculate std
            variance_sum = 0.0
            for i in range(n_rows):
                val = col_data[i]
                if not np.isnan(val):
                    variance_sum += (val - mean) ** 2
            std = np.sqrt(variance_sum / count)
            
            if std > 0:
                # Compute z-scores
                for i in range(n_rows):
                    val = col_data[i]
                    if not np.isnan(val):
                        result[i, col] = (val - mean) / std
            # else: result stays 0
        # else: result stays 0 (not enough data)
    
    return result


@jit(nopython=True, cache=True)
def compute_iqr_flags_numba(data: np.ndarray) -> np.ndarray:
    """
    Compute IQR-based outlier flags for each column.
    
    Args:
        data: 2D array of shape (n_rows, n_cols)
        
    Returns:
        Boolean array of same shape (True = outlier)
    """
    n_rows, n_cols = data.shape
    result = np.zeros((n_rows, n_cols), dtype=np.bool_)
    
    for col in range(n_cols):
        col_data = data[:, col]
        
        # Collect non-NaN values
        values = []
        for i in range(n_rows):
            val = col_data[i]
            if not np.isnan(val):
                values.append(val)
        
        if len(values) >= 4:
            # Sort to find quartiles
            sorted_vals = sorted(values)
            n = len(sorted_vals)
            
            # Q1 (25th percentile) and Q3 (75th percentile)
            q1_idx = n // 4
            q3_idx = 3 * n // 4
            
            q1 = sorted_vals[q1_idx]
            q3 = sorted_vals[q3_idx]
            iqr = q3 - q1
            
            # Define bounds (1.5 * IQR)
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            
            # Flag outliers
            for i in range(n_rows):
                val = col_data[i]
                if not np.isnan(val):
                    if val < lower or val > upper:
                        result[i, col] = True
    
    return result


def to_float32(arr: np.ndarray) -> np.ndarray:
    """
    Convert array to float32, replacing inf/NaN with 0.
    
    Args:
        arr: Input numpy array
        
    Returns:
        Float32 array with no inf/NaN values
    """
    result = arr.astype(np.float32)
    
    # Replace inf and NaN with 0
    result = np.where(np.isfinite(result), result, 0.0)
    
    return result


def warmup() -> None:
    """
    Trigger Numba JIT compilation at startup.
    
    Calls the Numba functions with dummy data to trigger
    compilation so the first real patient doesn't pay the
    1-2 second compile cost.
    """
    print("Running Numba warmup...")
    
    # Dummy data
    dummy_data = np.zeros((30, 5), dtype=np.float32)
    dummy_data[10:20, 0] = np.random.randn(10) * 10 + 80  # HR-like values
    
    # Run both functions
    _ = compute_zscore_numba(dummy_data)
    _ = compute_iqr_flags_numba(dummy_data)
    
    print("Numba warmup complete.")


# Standalone functions for use in other modules
def compute_zscore(data: np.ndarray) -> np.ndarray:
    """Public wrapper for z-score computation."""
    return compute_zscore_numba(data)


def compute_iqr_flags(data: np.ndarray) -> np.ndarray:
    """Public wrapper for IQR flag computation."""
    return compute_iqr_flags_numba(data)


if __name__ == "__main__":
    # Test the functions
    import time
    
    # Create test data
    np.random.seed(42)
    test_data = np.random.randn(100, 5).astype(np.float32)
    test_data[20, 0] = 150  # Add anomaly
    test_data[50, 2] = 45   # Add anomaly
    
    # Warmup
    warmup()
    
    # Test z-score
    print("\nTesting compute_zscore_numba...")
    start = time.perf_counter()
    zscores = compute_zscore_numba(test_data)
    elapsed = time.perf_counter() - start
    print(f"  Time: {elapsed*1000:.2f} ms")
    print(f"  Output shape: {zscores.shape}")
    print(f"  Sample z-scores (row 20): {zscores[20]}")
    
    # Test IQR flags
    print("\nTesting compute_iqr_flags_numba...")
    start = time.perf_counter()
    flags = compute_iqr_flags_numba(test_data)
    elapsed = time.perf_counter() - start
    print(f"  Time: {elapsed*1000:.2f} ms")
    print(f"  Output shape: {flags.shape}")
    print(f"  Outliers found: {flags.sum()}")
    
    # Test to_float32
    print("\nTesting to_float32...")
    test_with_nan = np.array([1.0, np.nan, np.inf, -np.inf, 2.0])
    result = to_float32(test_with_nan)
    print(f"  Input: {test_with_nan}")
    print(f"  Output: {result}")