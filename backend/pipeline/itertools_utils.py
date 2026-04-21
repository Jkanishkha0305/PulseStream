"""
Itertools-based utilities for streaming data processing.

Demonstrates efficient use of itertools for memory-friendly iteration
over large patient streams (Week 3 course topic).
"""
import itertools
from collections import deque
from typing import Iterator

import numpy as np


def sliding_window(iterable, n: int) -> Iterator[tuple]:
    """Yield overlapping windows of size n from an iterable.

    Uses itertools.islice and collections.deque for O(1) per-step
    advancement instead of slicing a list each time.

    >>> list(sliding_window([1,2,3,4,5], 3))
    [(1, 2, 3), (2, 3, 4), (3, 4, 5)]
    """
    it = iter(iterable)
    window = deque(itertools.islice(it, n), maxlen=n)
    if len(window) == n:
        yield tuple(window)
    for item in it:
        window.append(item)
        yield tuple(window)


def batch_patients(patient_ids: list[str], batch_size: int) -> Iterator[tuple]:
    """Split patient IDs into fixed-size batches using itertools.batched.

    Falls back to islice-based chunking for Python < 3.12.

    >>> list(batch_patients(['p1','p2','p3','p4','p5'], 2))
    [('p1', 'p2'), ('p3', 'p4'), ('p5',)]
    """
    it = iter(patient_ids)
    while True:
        batch = tuple(itertools.islice(it, batch_size))
        if not batch:
            break
        yield batch


def chain_vital_streams(*streams: Iterator[dict]) -> Iterator[dict]:
    """Merge multiple vital-sign streams into a single ordered iterator.

    Uses itertools.chain to lazily concatenate without materializing
    all data in memory.
    """
    return itertools.chain(*streams)


def repeat_baseline(baseline_reading: dict, n: int) -> Iterator[dict]:
    """Generate n identical baseline readings for warm-start testing.

    Uses itertools.repeat which is faster and more memory-efficient
    than [baseline_reading] * n for large n.
    """
    return itertools.repeat(baseline_reading, n)


def filter_anomalous_windows(
    windows: Iterator[tuple[str, np.ndarray]],
    threshold: float = 3.0,
) -> Iterator[tuple[str, np.ndarray]]:
    """Lazily filter windows that contain potential anomalies.

    Uses itertools.filterfalse logic (inverted) to yield only
    windows where at least one vital exceeds the Z-score threshold.
    """
    def _has_anomaly(item: tuple[str, np.ndarray]) -> bool:
        _, window = item
        means = np.mean(window, axis=0)
        stds = np.std(window, axis=0)
        stds_safe = np.where(stds == 0, 1.0, stds)
        z_last = np.abs((window[-1] - means) / stds_safe)
        return bool(np.any(z_last > threshold))

    return filter(_has_anomaly, windows)


def pairwise_vital_combos(vital_names: list[str]) -> Iterator[tuple[str, str]]:
    """Generate all 2-vital combinations for correlation analysis.

    Uses itertools.combinations to enumerate pairs without repetition.

    >>> list(pairwise_vital_combos(['hr', 'o2sat', 'temp']))
    [('hr', 'o2sat'), ('hr', 'temp'), ('o2sat', 'temp')]
    """
    return itertools.combinations(vital_names, 2)


def accumulate_alert_counts(alert_flags: list[int]) -> list[int]:
    """Running total of alerts over time using itertools.accumulate.

    Useful for tracking cumulative alert burden per patient.

    >>> list(accumulate_alert_counts([1, 0, 2, 1, 0]))
    [1, 1, 3, 4, 4]
    """
    return list(itertools.accumulate(alert_flags))


def generate_patient_vital_product(
    patient_ids: list[str],
    vital_names: list[str],
) -> Iterator[tuple[str, str]]:
    """Cartesian product of patients x vitals for exhaustive analysis.

    Uses itertools.product to avoid nested loops.
    """
    return itertools.product(patient_ids, vital_names)
