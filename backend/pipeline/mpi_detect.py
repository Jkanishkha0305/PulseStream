"""
MPI-based Distributed Anomaly Detection
========================================
Demonstrates:
  Point-to-point (Lecture 10):  Send, Recv, Isend, Irecv, tags, Status
  Collectives   (Lecture 11):   Bcast, Scatter, Gather, Reduce, Allreduce, Barrier
  Domain decomposition, Amdahl's law

Distributes patient anomaly detection across MPI processes.

Usage
-----
    mpiexec -n 4 python mpi_detect.py
"""

import numpy as np
import time

try:
    from mpi4py import MPI
    MPI_AVAILABLE = True
except ImportError:
    MPI_AVAILABLE = False


# ---------------------------------------------------------------------------
# Local detection kernel (runs on every rank)
# ---------------------------------------------------------------------------

def detect_anomalies_local(windows, z_threshold=3.0):
    """Z-score detection on a batch of patient windows.
    Returns per-patient flag count (number of vitals flagged)."""
    n_patients, n_readings, n_vitals = windows.shape
    results = np.zeros(n_patients, dtype=np.int32)

    for p in range(n_patients):
        for v in range(n_vitals):
            col  = windows[p, :, v]
            mean = np.mean(col)
            std  = np.std(col)
            if std > 0:
                if np.any(np.abs((col - mean) / std) > z_threshold):
                    results[p] += 1
    return results


def generate_patient_data(n_patients=100, n_readings=50, n_vitals=5,
                          seed=42):
    """Generate synthetic patient data (rank 0 only)."""
    rng = np.random.RandomState(seed)
    data = rng.randn(n_patients, n_readings, n_vitals).astype(np.float64)
    data[:int(n_patients * 0.15), :, :2] += 5.0       # inject anomalies
    return data


# ============================= SECTION A ====================================
# Point-to-point communication  (Send, Recv, Isend, Irecv, tags, Status)
# ============================================================================

def run_point_to_point():
    """Rank 0 distributes patient chunks via Send/Recv; workers return results
    via non-blocking Isend.  Demonstrates tags and MPI.Status."""

    comm = MPI.COMM_WORLD
    rank = comm.Get_rank()
    size = comm.Get_size()

    TAG_THRESH   = 0
    TAG_SHAPE    = 1
    TAG_DATA     = 2
    TAG_RES_META = 3
    TAG_RES_DATA = 4

    N_PAT, N_READ, N_VIT = 100, 50, 5

    if rank == 0:
        print(f"\n{'='*60}")
        print(f"POINT-TO-POINT: {size} ranks, {N_PAT} patients")
        print(f"{'='*60}")

        data = generate_patient_data(N_PAT, N_READ, N_VIT)
        per_rank  = N_PAT // size
        remainder = N_PAT % size
        threshold = np.array([3.0], dtype=np.float64)

        t0 = time.perf_counter()

        # ---- Send to each worker ----
        for dest in range(1, size):
            start = dest * per_rank + min(dest, remainder)
            count = per_rank + (1 if dest < remainder else 0)
            chunk = data[start:start + count].copy()

            comm.Send(threshold, dest=dest, tag=TAG_THRESH)
            comm.send(chunk.shape, dest=dest, tag=TAG_SHAPE)
            comm.Send(chunk,      dest=dest, tag=TAG_DATA)

        # ---- Own chunk ----
        own_count = per_rank + (1 if 0 < remainder else 0)
        own_res   = detect_anomalies_local(data[:own_count], threshold[0])

        # ---- Receive results ----
        all_results = [own_res]
        for src in range(1, size):
            info  = MPI.Status()
            shape = comm.recv(source=src, tag=TAG_RES_META, status=info)
            buf   = np.empty(shape, dtype=np.int32)
            comm.Recv(buf, source=src, tag=TAG_RES_DATA, status=info)
            all_results.append(buf)
            print(f"  Recv {len(buf)} results from rank {info.Get_source()}, "
                  f"tag {info.Get_tag()}")

        all_results = np.concatenate(all_results)
        elapsed = time.perf_counter() - t0
        print(f"  Anomalous: {np.sum(all_results > 0)}/{N_PAT}  "
              f"time={elapsed*1000:.2f} ms")

    else:
        # ---- Worker: receive, detect, reply ----
        threshold = np.empty(1, dtype=np.float64)
        comm.Recv(threshold, source=0, tag=TAG_THRESH)

        shape = comm.recv(source=0, tag=TAG_SHAPE)
        chunk = np.empty(shape, dtype=np.float64)
        comm.Recv(chunk, source=0, tag=TAG_DATA)

        results = detect_anomalies_local(chunk, threshold[0])

        # non-blocking Isend
        comm.send(results.shape, dest=0, tag=TAG_RES_META)
        req = comm.Isend(results, dest=0, tag=TAG_RES_DATA)
        req.Wait()


# ============================= SECTION B ====================================
# Collective communication  (Bcast, Scatter, Gather, Reduce, Allreduce, Barrier)
# ============================================================================

def run_collectives():
    """Demonstrate Bcast, Scatter, Gather, Reduce, Allreduce, Barrier."""

    comm = MPI.COMM_WORLD
    rank = comm.Get_rank()
    size = comm.Get_size()

    N_PAT  = size * 25           # evenly divisible
    N_READ = 50
    N_VIT  = 5
    per_rank = N_PAT // size

    # ---- Barrier: synchronise all ranks before starting ----
    comm.Barrier()

    if rank == 0:
        print(f"\n{'='*60}")
        print(f"COLLECTIVES: {size} ranks, {N_PAT} patients")
        print(f"{'='*60}")

    # ---- Bcast: broadcast threshold from rank 0 ----
    threshold = np.array([3.0], dtype=np.float64) if rank == 0 \
                else np.empty(1, dtype=np.float64)
    comm.Bcast(threshold, root=0)

    # ---- Scatter: distribute patient data ----
    if rank == 0:
        all_data = generate_patient_data(N_PAT, N_READ, N_VIT)
        send_buf = all_data.reshape(size, per_rank, N_READ, N_VIT)
        t0 = time.perf_counter()
    else:
        send_buf = None

    local_data = np.empty((per_rank, N_READ, N_VIT), dtype=np.float64)
    comm.Scatter(send_buf, local_data, root=0)

    # ---- Each rank detects anomalies locally ----
    local_results = detect_anomalies_local(local_data, threshold[0])
    local_count   = np.array([np.sum(local_results > 0)], dtype=np.int32)

    # ---- Gather: collect all results at rank 0 ----
    gathered = np.empty(N_PAT, dtype=np.int32) if rank == 0 else None
    comm.Gather(local_results, gathered, root=0)

    # ---- Reduce: sum anomaly counts → rank 0 only ----
    total_reduce = np.zeros(1, dtype=np.int32)
    comm.Reduce(local_count, total_reduce, op=MPI.SUM, root=0)

    # ---- Allreduce: every rank gets the global total ----
    global_total = np.zeros(1, dtype=np.int32)
    comm.Allreduce(local_count, global_total, op=MPI.SUM)

    # ---- Final Barrier ----
    comm.Barrier()

    if rank == 0:
        elapsed = time.perf_counter() - t0
        print(f"  Bcast threshold      : {threshold[0]}")
        print(f"  Scatter              : {N_PAT} → {per_rank}/rank")
        print(f"  Gather results       : {len(gathered)} total")
        print(f"  Reduce  (rank 0)     : {total_reduce[0]} anomalous")
        print(f"  Allreduce (all ranks): {global_total[0]} anomalous")
        print(f"  Time                 : {elapsed*1000:.2f} ms")

        # Amdahl's law estimate
        P = 0.90      # 90 % parallelisable
        speedup = 1.0 / ((1 - P) + P / size)
        print(f"\n  Amdahl's law (P={P}, N={size}): "
              f"theoretical speedup = {speedup:.2f}x")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not MPI_AVAILABLE:
        print("mpi4py not installed.  Install with: pip install mpi4py")
        print("Run with: mpiexec -n 4 python mpi_detect.py")
    else:
        run_point_to_point()
        run_collectives()
