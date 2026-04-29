"""
ICU Resource Allocation — Convex Optimization with cvxpy
========================================================
Demonstrates: cvxpy (Variable, Problem, Minimize/Maximize, constraints, LP)
Course reference: Lecture 08 — Linear Programming / Convex Optimization

Solves the ICU resource-allocation problem: given patient severity scores
from the anomaly detection pipeline, optimally allocate limited nursing
attention and ICU beds to minimise total patient risk.
"""

import numpy as np

try:
    import cvxpy as cp
    CVXPY_AVAILABLE = True
except ImportError:
    CVXPY_AVAILABLE = False
    print("[resource_optimizer] cvxpy not installed. "
          "Install with: pip install cvxpy")


# ---------------------------------------------------------------------------
# Problem 1 — Nurse-hour allocation (LP)
# ---------------------------------------------------------------------------

def allocate_nurse_attention(severities, n_nurses=5, hours_per_nurse=8.0,
                             min_hours_critical=2.0):
    """
    LP: allocate nurse hours to patients to maximise severity-weighted care.

        max  Σ  severity_i · (x_i / hours_needed_i)
    s.t.
        x_i  ≥ 0                           (non-negative hours)
        x_i  ≤ hours_needed_i              (don't over-allocate)
        Σ x_i ≤ n_nurses · hours_per_nurse (total capacity)
        x_i  ≥ min_hours_critical          for critical patients (sev > 0.7)
    """
    n = len(severities)
    sev = np.asarray(severities, dtype=float)
    hours_needed = sev * 4.0                       # up to 4 h at max severity
    safe_needed  = np.where(hours_needed > 0, hours_needed, 1.0)

    x = cp.Variable(n)

    objective = cp.Maximize(sev @ (x / safe_needed))

    constraints = [
        x >= 0,
        x <= hours_needed,
        cp.sum(x) <= n_nurses * hours_per_nurse,
    ]
    for idx in np.where(sev > 0.7)[0]:
        constraints.append(x[idx] >= min(min_hours_critical,
                                         hours_needed[idx]))

    prob = cp.Problem(objective, constraints)
    prob.solve()

    return {
        "status":       prob.status,
        "optimal_value": prob.value,
        "hours_allocated": x.value,
        "hours_needed":  hours_needed,
        "total_used":    float(np.sum(x.value)) if x.value is not None else 0,
        "total_avail":   n_nurses * hours_per_nurse,
    }


# ---------------------------------------------------------------------------
# Problem 2 — ICU-bed assignment (LP relaxation)
# ---------------------------------------------------------------------------

def allocate_icu_beds(severities, n_beds=10):
    """
    LP relaxation: assign limited ICU beds to maximise severity coverage.

        max  severity^T · x
    s.t.
        0 ≤ x_i ≤ 1
        Σ x_i  ≤ n_beds
    """
    n = len(severities)
    sev = np.asarray(severities, dtype=float)

    x = cp.Variable(n)
    prob = cp.Problem(
        cp.Maximize(sev @ x),
        [x >= 0, x <= 1, cp.sum(x) <= n_beds],
    )
    prob.solve()

    return {
        "status":       prob.status,
        "optimal_value": prob.value,
        "assignments":  x.value,
        "beds_used":    int(np.sum(x.value > 0.5)) if x.value is not None else 0,
    }


# ---------------------------------------------------------------------------
# Problem 3 — Alert-staffing cost minimisation (LP)
# ---------------------------------------------------------------------------

def minimise_alert_staffing_cost(severities, costs_per_nurse_type):
    """
    LP: choose cheapest mix of nurse types to cover every critical patient.

        min  c^T · y
    s.t.
        A · y ≥ demand          (coverage matrix)
        y ≥ 0
    """
    n_patients = len(severities)
    sev = np.asarray(severities, dtype=float)
    demand = np.maximum(sev * 10, 1.0)          # attention-minutes needed

    c = np.asarray(costs_per_nurse_type, dtype=float)   # cost per nurse type
    n_types = len(c)

    # coverage: type j can serve A[i,j] minutes to patient i
    rng = np.random.RandomState(99)
    A = rng.uniform(2, 8, size=(n_patients, n_types))

    y = cp.Variable(n_types)
    prob = cp.Problem(
        cp.Minimize(c @ y),
        [A @ y >= demand, y >= 0],
    )
    prob.solve()

    return {
        "status":  prob.status,
        "cost":    prob.value,
        "staff":   y.value,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not CVXPY_AVAILABLE:
        raise SystemExit("cvxpy not available — install with: pip install cvxpy")

    print("=" * 70)
    print("PulseStream — ICU Resource Allocation (cvxpy)")
    print("=" * 70)

    rng = np.random.RandomState(42)
    n = 20
    severities = rng.beta(2, 5, size=n)
    severities[:5] = rng.uniform(0.7, 1.0, size=5)       # 5 critical

    # ---- Problem 1 ----
    print(f"\n{'─'*60}")
    print("Problem 1: Nurse Attention Allocation (LP)")
    print(f"{'─'*60}")
    r1 = allocate_nurse_attention(severities, n_nurses=5)
    print(f"Status : {r1['status']}")
    print(f"Hours  : {r1['total_used']:.1f} / {r1['total_avail']:.1f}")
    top5 = np.argsort(severities)[-5:][::-1]
    for i in top5:
        print(f"  Patient {i:2d}: sev={severities[i]:.3f}  "
              f"alloc={r1['hours_allocated'][i]:.2f}h / "
              f"need={r1['hours_needed'][i]:.2f}h")

    # ---- Problem 2 ----
    print(f"\n{'─'*60}")
    print("Problem 2: ICU Bed Assignment (LP relaxation)")
    print(f"{'─'*60}")
    r2 = allocate_icu_beds(severities, n_beds=10)
    print(f"Status : {r2['status']}")
    print(f"Beds   : {r2['beds_used']} / 10")

    # ---- Problem 3 ----
    print(f"\n{'─'*60}")
    print("Problem 3: Alert Staffing Cost Minimisation (LP)")
    print(f"{'─'*60}")
    costs = [50.0, 35.0, 20.0]        # RN, LPN, CNA hourly cost
    r3 = minimise_alert_staffing_cost(severities, costs)
    print(f"Status : {r3['status']}")
    print(f"Min cost: ${r3['cost']:.2f}")
    print(f"Staff mix (RN, LPN, CNA): {np.round(r3['staff'], 2)}")
