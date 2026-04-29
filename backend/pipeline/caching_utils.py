"""
Caching & Memoization Utilities
================================
Demonstrates: functools.lru_cache, functools.cache, custom memoization
Course reference: Lecture 02, Lab 02 — Python Performance Tips

Applies memoization to PulseStream functions that are called repeatedly
with the same arguments (threshold lookups, clinical ranges, Fibonacci-
style recurrences for alert escalation).

Usage
-----
    python caching_utils.py
"""

import functools
import time
import numpy as np


# ===================================================================
# 1. functools.lru_cache — threshold lookup memoization
# ===================================================================

@functools.lru_cache(maxsize=128)
def get_clinical_range(vital_name, severity="normal"):
    """
    Return (low, high) clinical range for a given vital and severity.
    Simulates an expensive lookup (database, config file, etc.).

    @lru_cache avoids re-computing for repeated (vital, severity) pairs.
    """
    ranges = {
        ("HR",    "normal"):   (60, 100),
        ("HR",    "warning"):  (50, 110),
        ("HR",    "critical"): (40, 130),
        ("O2Sat", "normal"):   (95, 100),
        ("O2Sat", "warning"):  (90, 95),
        ("O2Sat", "critical"): (85, 90),
        ("Temp",  "normal"):   (36.1, 37.2),
        ("Temp",  "warning"):  (35.5, 38.0),
        ("Temp",  "critical"): (35.0, 39.0),
        ("SBP",   "normal"):   (90, 120),
        ("SBP",   "warning"):  (80, 140),
        ("SBP",   "critical"): (70, 180),
        ("Resp",  "normal"):   (12, 20),
        ("Resp",  "warning"):  (10, 25),
        ("Resp",  "critical"): (8, 30),
    }
    return ranges.get((vital_name, severity), (0, 999))


# ===================================================================
# 2. functools.lru_cache — expensive computation memoization
# ===================================================================

@functools.lru_cache(maxsize=256)
def compute_z_threshold(fp_cost, fn_cost, prior_anomaly_rate):
    """
    Compute the optimal z-score threshold given cost parameters.
    This is an 'expensive' computation we don't want to repeat.

    In real use, called once per (fp_cost, fn_cost, rate) triple,
    then cached for all future calls with the same parameters.
    """
    # Simulate cost-based threshold selection
    ratio = fn_cost / max(fp_cost, 1e-6)
    base = 3.0
    adjusted = base - 0.5 * np.log(ratio) + 0.2 * np.log(1 / max(prior_anomaly_rate, 1e-6))
    return round(float(np.clip(adjusted, 1.5, 5.0)), 4)


# ===================================================================
# 3. Fibonacci-style alert escalation (classic lru_cache example)
# ===================================================================

@functools.lru_cache(maxsize=None)
def alert_escalation_delay(n):
    """
    Fibonacci-based escalation delay (seconds) for the nth re-alert.
    fib(0)=1, fib(1)=1, fib(n) = fib(n-1) + fib(n-2)

    Without memoization: O(2^n) recursive calls.
    With @lru_cache:     O(n) — each value computed only once.
    """
    if n <= 1:
        return 1
    return alert_escalation_delay(n - 1) + alert_escalation_delay(n - 2)


# ===================================================================
# 4. Custom decorator-based memoization (manual approach)
# ===================================================================

def memoize(func):
    """Hand-rolled memoization decorator (for pedagogical comparison)."""
    cache = {}

    @functools.wraps(func)
    def wrapper(*args):
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]

    wrapper.cache = cache
    wrapper.cache_clear = cache.clear
    return wrapper


@memoize
def severity_score(z_hr, z_o2, z_temp, z_sbp, z_resp):
    """Weighted severity score — memoized for repeated z-score tuples."""
    weights = np.array([1.0, 1.5, 0.8, 1.2, 0.7])
    z = np.array([z_hr, z_o2, z_temp, z_sbp, z_resp])
    return float(np.sqrt(np.sum(weights * z**2) / np.sum(weights)))


# ===================================================================
# 5. Benchmark: cached vs uncached
# ===================================================================

def benchmark_caching():
    """Compare performance with and without caching."""

    # --- Fibonacci escalation ---
    print("  Fibonacci alert escalation (n=35):")
    alert_escalation_delay.cache_clear()

    t0 = time.perf_counter()
    val = alert_escalation_delay(35)
    first_call = (time.perf_counter() - t0) * 1e6

    t0 = time.perf_counter()
    val2 = alert_escalation_delay(35)
    cached_call = (time.perf_counter() - t0) * 1e6

    print(f"    fib(35) = {val}")
    print(f"    First call (computes all):  {first_call:.1f} \u00b5s")
    print(f"    Cached call (instant):      {cached_call:.1f} \u00b5s")
    info = alert_escalation_delay.cache_info()
    print(f"    Cache info: {info}")

    # --- Clinical range lookup ---
    print("\n  Clinical range lookup (1000 calls):")
    get_clinical_range.cache_clear()
    vitals = ["HR", "O2Sat", "Temp", "SBP", "Resp"]
    severities = ["normal", "warning", "critical"]

    t0 = time.perf_counter()
    for _ in range(1000):
        for v in vitals:
            for s in severities:
                get_clinical_range(v, s)
    elapsed = (time.perf_counter() - t0) * 1000

    info = get_clinical_range.cache_info()
    hit_rate = info.hits / max(info.hits + info.misses, 1) * 100
    print(f"    1000 × 15 lookups in {elapsed:.2f} ms")
    print(f"    Cache: {info.hits} hits, {info.misses} misses ({hit_rate:.1f}% hit rate)")

    # --- Z-threshold computation ---
    print("\n  Z-threshold computation (repeated calls):")
    compute_z_threshold.cache_clear()

    t0 = time.perf_counter()
    for _ in range(10000):
        compute_z_threshold(1.0, 5.0, 0.15)
        compute_z_threshold(1.0, 10.0, 0.10)
        compute_z_threshold(2.0, 5.0, 0.20)
    elapsed = (time.perf_counter() - t0) * 1000

    info = compute_z_threshold.cache_info()
    print(f"    30,000 calls in {elapsed:.2f} ms")
    print(f"    Cache: {info.hits} hits, {info.misses} misses")
    print(f"    Unique thresholds: {info.currsize}")


# ===================================================================
# Main
# ===================================================================

if __name__ == "__main__":
    print("=" * 70)
    print("PulseStream \u2014 Caching & Memoization")
    print("=" * 70)

    benchmark_caching()

    print("\n  Escalation delays (first 10):")
    delays = [alert_escalation_delay(i) for i in range(10)]
    print(f"    {delays}")

    print("\n  Example thresholds:")
    for fp, fn, rate in [(1, 5, 0.15), (1, 10, 0.10), (2, 3, 0.20)]:
        t = compute_z_threshold(fp, fn, rate)
        print(f"    fp_cost={fp}, fn_cost={fn}, rate={rate} \u2192 z*={t}")
