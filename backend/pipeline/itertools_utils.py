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


# ===================================================================
# Additional itertools demonstrations (Lecture 03 completeness)
# ===================================================================

def count_patient_ids(start: int = 1) -> Iterator[int]:
    """Infinite patient ID generator using itertools.count.

    >>> import itertools
    >>> list(itertools.islice(count_patient_ids(100), 3))
    [100, 101, 102]
    """
    return itertools.count(start)


def cycle_alert_levels() -> Iterator[str]:
    """Cycle through alert severity levels indefinitely.

    Uses itertools.cycle for round-robin assignment.

    >>> import itertools
    >>> list(itertools.islice(cycle_alert_levels(), 5))
    ['low', 'medium', 'high', 'low', 'medium']
    """
    return itertools.cycle(["low", "medium", "high"])


def compress_patients(
    patient_ids: list[str],
    mask: list[bool],
) -> Iterator[str]:
    """Select patients where mask is True using itertools.compress.

    >>> list(compress_patients(["P1","P2","P3"], [True, False, True]))
    ['P1', 'P3']
    """
    return itertools.compress(patient_ids, mask)


def dropwhile_stable(
    readings: Iterator[float],
    threshold: float = 3.0,
) -> Iterator[float]:
    """Skip stable readings until the first anomalous one.

    Uses itertools.dropwhile to fast-forward past normal values.

    >>> list(dropwhile_stable(iter([1.0, 0.5, 4.0, 0.2, 5.0])))
    [4.0, 0.2, 5.0]
    """
    return itertools.dropwhile(lambda x: abs(x) < threshold, readings)


def takewhile_normal(
    readings: Iterator[float],
    threshold: float = 3.0,
) -> Iterator[float]:
    """Take readings while they are within normal range.

    Uses itertools.takewhile — stops at the first anomaly.

    >>> list(takewhile_normal(iter([0.5, 1.0, 4.0, 0.2])))
    [0.5, 1.0]
    """
    return itertools.takewhile(lambda x: abs(x) < threshold, readings)


def filterfalse_normal(
    readings: Iterator[float],
    threshold: float = 3.0,
) -> Iterator[float]:
    """Keep only anomalous readings (complement of filter).

    Uses itertools.filterfalse to invert the predicate.

    >>> list(filterfalse_normal(iter([0.5, 4.0, 1.0, 5.0])))
    [4.0, 5.0]
    """
    return itertools.filterfalse(lambda x: abs(x) < threshold, readings)


def groupby_severity(
    alerts: list[dict],
) -> dict[str, list[dict]]:
    """Group alerts by severity level using itertools.groupby.

    Input must be sorted by the grouping key.

    >>> alerts = [{"sev":"high","id":1},{"sev":"high","id":2},{"sev":"low","id":3}]
    >>> result = groupby_severity(alerts)
    >>> list(result.keys())
    ['high', 'low']
    """
    sorted_alerts = sorted(alerts, key=lambda a: a.get("sev", ""))
    return {
        key: list(group)
        for key, group in itertools.groupby(
            sorted_alerts, key=lambda a: a.get("sev", "")
        )
    }


def starmap_zscore(
    vital_params: list[tuple[float, float, float]],
) -> list[float]:
    """Compute z-scores from (value, mean, std) tuples using starmap.

    >>> starmap_zscore([(100, 80, 10), (95, 97, 2)])
    [2.0, -1.0]
    """
    def zscore(val, mean, std):
        return (val - mean) / std if std > 0 else 0.0
    return list(itertools.starmap(zscore, vital_params))


def tee_vital_stream(
    stream: Iterator,
    n: int = 2,
) -> tuple:
    """Duplicate a vital stream for independent consumption using tee.

    >>> import itertools
    >>> a, b = tee_vital_stream(iter([1,2,3]))
    >>> list(a), list(b)
    ([1, 2, 3], [1, 2, 3])
    """
    return itertools.tee(stream, n)


def zip_longest_vitals(
    *vital_streams: Iterator[float],
    fillvalue: float = 0.0,
) -> Iterator[tuple]:
    """Align vital streams of unequal length using zip_longest.

    >>> list(zip_longest_vitals(iter([1,2]), iter([3,4,5])))
    [(1, 3), (2, 4), (0.0, 5)]
    """
    return itertools.zip_longest(*vital_streams, fillvalue=fillvalue)
