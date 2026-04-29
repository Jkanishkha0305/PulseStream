"""
Numba CUDA Kernel for Anomaly Detection
========================================
Demonstrates: @cuda.jit, cuda.grid(), cuda.threadIdx/blockIdx/blockDim,
              cuda.shared.array, cuda.syncthreads, cuda.to_device,
              copy_to_host, thread/block/grid configuration
Course reference: Lecture 06 Part 2, Lecture 12 — GPU / CUDA programming

Implements Z-score anomaly detection as explicit CUDA kernels with both
global-memory and shared-memory variants, following the full CUDA
execution model taught in class.

Usage
-----
    python numba_cuda_detect.py          # auto-uses simulator if no GPU
    NUMBA_ENABLE_CUDASIM=1 python numba_cuda_detect.py   # force simulator
"""

import os
# Must be set BEFORE `from numba import cuda` for simulator mode to take effect.
# Run with `NUMBA_ENABLE_CUDASIM=1 python ...` on machines without a real GPU.
os.environ.setdefault("NUMBA_ENABLE_CUDASIM", "0")

import numpy as np
import math
import time

try:
    from numba import cuda, float32, int32
    HAS_REAL_GPU = cuda.is_available()
    CUDA_AVAILABLE = True
    if not HAS_REAL_GPU and os.environ.get("NUMBA_ENABLE_CUDASIM") != "1":
        print("[numba_cuda_detect] No GPU detected. "
              "Re-run with NUMBA_ENABLE_CUDASIM=1 to use the simulator.")
except Exception:
    CUDA_AVAILABLE = False
    HAS_REAL_GPU = False
    print("[numba_cuda_detect] numba.cuda not available")


# ---- Constants ----
TPB = 32          # Threads Per Block (warp-aligned, rule of thumb 128-512)
N_VITALS = 5
N_READINGS = 50


# ===================================================================
# Kernel 1 — Global-memory Z-score detection
# ===================================================================

if CUDA_AVAILABLE:
    @cuda.jit
    def zscore_kernel_global(data, results, n_patients, z_threshold):
        """
        Each thread processes one patient entirely.
        Thread position is computed from the 1-D grid via cuda.grid().
        """
        pos = cuda.grid(1)                   # absolute position in the grid

        if pos < n_patients:
            flagged = int32(0)

            for v in range(N_VITALS):
                # ---- mean ----
                total = float32(0.0)
                for r in range(N_READINGS):
                    total += float32(data[pos, r, v])
                mean = total / float32(N_READINGS)

                # ---- std ----
                sq_sum = float32(0.0)
                for r in range(N_READINGS):
                    diff = float32(data[pos, r, v]) - mean
                    sq_sum += diff * diff
                std = math.sqrt(sq_sum / float32(N_READINGS))

                # ---- flag ----
                if std > float32(1e-6):
                    for r in range(N_READINGS):
                        z = abs(float32(data[pos, r, v]) - mean) / std
                        if z > z_threshold:
                            flagged += 1
                            break                # one exceedance per vital

            results[pos] = flagged


# ===================================================================
# Kernel 2 — Shared-memory optimised detection
# ===================================================================

if CUDA_AVAILABLE:
    @cuda.jit
    def zscore_kernel_shared(data, results, n_patients, z_threshold):
        """
        Uses shared memory to cache per-thread intermediate values
        and cuda.syncthreads() to coordinate within a block.
        """
        tx = cuda.threadIdx.x               # thread index inside block
        bx = cuda.blockIdx.x                # block index in the grid
        bw = cuda.blockDim.x                # threads per block
        pos = tx + bx * bw                   # flattened global index

        # Shared memory: one slot per thread in the block
        shared_mean = cuda.shared.array(shape=(TPB,), dtype=float32)

        if pos < n_patients:
            flagged = int32(0)

            for v in range(N_VITALS):
                # Phase 1 — compute mean, store in shared memory
                total = float32(0.0)
                for r in range(N_READINGS):
                    total += float32(data[pos, r, v])
                shared_mean[tx] = total / float32(N_READINGS)

                cuda.syncthreads()           # all threads wrote their mean

                # Phase 2 — compute std using shared mean
                sq_sum = float32(0.0)
                for r in range(N_READINGS):
                    diff = float32(data[pos, r, v]) - shared_mean[tx]
                    sq_sum += diff * diff
                std = math.sqrt(sq_sum / float32(N_READINGS))

                cuda.syncthreads()           # sync before next vital

                # Phase 3 — check anomalies
                if std > float32(1e-6):
                    for r in range(N_READINGS):
                        z = abs(float32(data[pos, r, v]) - shared_mean[tx]) / std
                        if z > z_threshold:
                            flagged += 1
                            break

            results[pos] = flagged


# ===================================================================
# Host code — memory transfer + kernel launch
# ===================================================================

def run_gpu_detection(data, z_threshold=3.0, use_shared=False):
    """
    Full CUDA workflow:
      1. Allocate device memory
      2. Host → Device transfer  (cuda.to_device)
      3. Configure grid / block dimensions
      4. Launch kernel
      5. Device → Host transfer  (copy_to_host)
    """
    n_patients = data.shape[0]

    # Step 1-2: transfer to device
    d_data    = cuda.to_device(data.astype(np.float32))
    d_results = cuda.device_array(n_patients, dtype=np.int32)

    # Step 3: grid configuration
    threadsperblock = TPB
    blockspergrid   = math.ceil(n_patients / threadsperblock)

    # Step 4: launch
    t0 = time.perf_counter()
    if use_shared:
        zscore_kernel_shared[blockspergrid, threadsperblock](
            d_data, d_results, n_patients, np.float32(z_threshold))
    else:
        zscore_kernel_global[blockspergrid, threadsperblock](
            d_data, d_results, n_patients, np.float32(z_threshold))
    cuda.synchronize()
    elapsed = time.perf_counter() - t0

    # Step 5: transfer back to host
    results = d_results.copy_to_host()
    return results, elapsed


def run_cpu_baseline(data, z_threshold=3.0):
    """Pure CPU NumPy baseline for speedup comparison."""
    t0 = time.perf_counter()
    n_patients = data.shape[0]
    results = np.zeros(n_patients, dtype=np.int32)
    for p in range(n_patients):
        for v in range(data.shape[2]):
            col = data[p, :, v]
            mean, std = np.mean(col), np.std(col)
            if std > 1e-6 and np.any(np.abs((col - mean) / std) > z_threshold):
                results[p] += 1
    elapsed = time.perf_counter() - t0
    return results, elapsed


# ===================================================================
# Main
# ===================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("PulseStream — Numba CUDA Anomaly Detection")
    print("=" * 70)

    N_PAT = 1000
    rng  = np.random.RandomState(42)
    data = rng.randn(N_PAT, N_READINGS, N_VITALS).astype(np.float32)
    data[:150, :, :2] += 5.0                       # inject anomalies

    print(f"Data : {N_PAT} patients × {N_READINGS} readings × {N_VITALS} vitals")
    print(f"Grid : {math.ceil(N_PAT / TPB)} blocks × {TPB} threads/block\n")

    if CUDA_AVAILABLE:
        cpu_res, cpu_t = run_cpu_baseline(data)
        print(f"CPU baseline         : {cpu_t*1000:8.2f} ms  "
              f"anomalous={np.sum(cpu_res > 0)}")

        gpu_res, gpu_t = run_gpu_detection(data, use_shared=False)
        print(f"GPU (global memory)  : {gpu_t*1000:8.2f} ms  "
              f"anomalous={np.sum(gpu_res > 0)}")

        gpu_sh_res, gpu_sh_t = run_gpu_detection(data, use_shared=True)
        print(f"GPU (shared memory)  : {gpu_sh_t*1000:8.2f} ms  "
              f"anomalous={np.sum(gpu_sh_res > 0)}")

        print(f"\nCPU == GPU (global): {np.array_equal(cpu_res, gpu_res)}")
        print(f"CPU == GPU (shared): {np.array_equal(cpu_res, gpu_sh_res)}")
        if cpu_t > 0:
            print(f"Speedup (global) : {cpu_t / max(gpu_t, 1e-9):.1f}x")
            print(f"Speedup (shared) : {cpu_t / max(gpu_sh_t, 1e-9):.1f}x")
    else:
        print("CUDA not available — skipping GPU benchmarks.")


# ===================================================================
# Section C — @cuda.reduce (HW08 pattern)
# ===================================================================

if CUDA_AVAILABLE:
    @cuda.reduce
    def gpu_sum_reduce(a, b):
        """Parallel tree-reduction sum on GPU.
        @cuda.reduce generates an optimised reduction kernel
        that sums all elements using warp-level primitives."""
        return a + b

    @cuda.reduce
    def gpu_max_reduce(a, b):
        """Parallel max-reduction on GPU."""
        return max(a, b)


def cosine_similarity_cuda(u, v):
    """Cosine similarity computed entirely on GPU using @cuda.reduce.
    Mirrors the HW08 cosine similarity exercise."""
    if not HAS_REAL_GPU:
        dot = np.dot(u.astype(np.float32), v.astype(np.float32))
        return float(dot / (np.linalg.norm(u) * np.linalg.norm(v)))

    u_dev = cuda.to_device(u.astype(np.float32))
    v_dev = cuda.to_device(v.astype(np.float32))

    # Elementwise products via a simple kernel
    uv = np.empty_like(u, dtype=np.float32)
    uu = np.empty_like(u, dtype=np.float32)
    vv = np.empty_like(u, dtype=np.float32)
    uv_dev = cuda.to_device(uv)
    uu_dev = cuda.to_device(uu)
    vv_dev = cuda.to_device(vv)

    TPB = 256
    blocks = (len(u) + TPB - 1) // TPB

    @cuda.jit
    def elementwise_ops(u, v, out_uv, out_uu, out_vv):
        idx = cuda.grid(1)
        if idx < u.shape[0]:
            out_uv[idx] = u[idx] * v[idx]
            out_uu[idx] = u[idx] * u[idx]
            out_vv[idx] = v[idx] * v[idx]

    elementwise_ops[blocks, TPB](u_dev, v_dev, uv_dev, uu_dev, vv_dev)

    dot_uv = gpu_sum_reduce(uv_dev)
    norm_u = gpu_sum_reduce(uu_dev)
    norm_v = gpu_sum_reduce(vv_dev)

    import math
    return float(dot_uv / math.sqrt(float(norm_u) * float(norm_v)))


def demo_cuda_reduce():
    """Demonstrate @cuda.reduce with cosine similarity (HW08)."""
    print("\n--- Section C: @cuda.reduce (HW08) ---")
    rng = np.random.RandomState(42)
    N = 1_000_000
    u = rng.uniform(0, 1, N).astype(np.float32)
    v = rng.uniform(0, 1, N).astype(np.float32)

    cos_val = cosine_similarity_cuda(u, v)
    print(f"  cos(u, v)  = {cos_val:.10f}  (expected ~0.75)")

    if HAS_REAL_GPU:
        arr = cuda.to_device(rng.randn(10000).astype(np.float32))
        total = gpu_sum_reduce(arr)
        mx = gpu_max_reduce(arr)
        print(f"  gpu_sum    = {total:.4f}")
        print(f"  gpu_max    = {mx:.4f}")
    else:
        print("  (Running on CPU fallback — @cuda.reduce requires NVIDIA GPU)")
