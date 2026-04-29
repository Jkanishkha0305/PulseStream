"""
Threshold Optimizer — SciPy Optimization for Anomaly Detection
==============================================================
Demonstrates: scipy.optimize (minimize_scalar, minimize/BFGS, brute, L-BFGS-B)
Course reference: Lecture 08 — Optimization in Python

Finds optimal anomaly detection thresholds by minimizing a cost function
that balances false positives (unnecessary alerts) and false negatives
(missed anomalies) using multiple SciPy optimization methods.
"""

import numpy as np
from scipy import optimize


VITALS = ["HR", "O2Sat", "Temp", "SBP", "Resp"]


# ---------------------------------------------------------------------------
# Synthetic labeled data
# ---------------------------------------------------------------------------

def generate_labeled_data(n_patients=200, n_readings=50, anomaly_rate=0.15,
                          seed=42):
    """Generate synthetic patient data with known ground-truth anomaly labels."""
    rng = np.random.RandomState(seed)
    n_vitals = len(VITALS)
    data = rng.randn(n_patients, n_readings, n_vitals)

    n_anomalous = int(n_patients * anomaly_rate)
    labels = np.zeros(n_patients, dtype=int)
    labels[:n_anomalous] = 1

    for i in range(n_anomalous):
        cols = rng.choice(n_vitals, size=rng.randint(1, 3), replace=False)
        for c in cols:
            data[i, :, c] += rng.choice([-1, 1]) * rng.uniform(3, 6)

    return data, labels


# ---------------------------------------------------------------------------
# Cost function (objective)
# ---------------------------------------------------------------------------

def anomaly_cost(thresholds, data, labels, fp_weight=1.0, fn_weight=5.0):
    """
    Cost = fp_weight · FPR + fn_weight · FNR

    Parameters
    ----------
    thresholds : array-like, shape (n_vitals,)
        Z-score thresholds per vital sign.
    data       : ndarray (n_patients, n_readings, n_vitals)
    labels     : ndarray (n_patients,) — 1 = true anomaly, 0 = normal
    fp_weight  : cost of a false positive
    fn_weight  : cost of a missed anomaly (higher ⇒ more conservative)
    """
    thresholds = np.abs(thresholds)
    n_patients = data.shape[0]

    means = np.mean(data, axis=1, keepdims=True)
    stds  = np.std(data, axis=1, keepdims=True)
    stds  = np.where(stds == 0, 1.0, stds)
    zscores = np.abs((data - means) / stds)

    flagged = np.zeros(n_patients, dtype=int)
    for v in range(data.shape[2]):
        frac_over = np.mean(zscores[:, :, v] > thresholds[v], axis=1)
        flagged |= (frac_over > 0.2).astype(int)

    fp = np.sum((flagged == 1) & (labels == 0))
    fn = np.sum((flagged == 0) & (labels == 1))
    n_pos = max(np.sum(labels), 1)
    n_neg = max(np.sum(1 - labels), 1)

    return fp_weight * (fp / n_neg) + fn_weight * (fn / n_pos)


# ---------------------------------------------------------------------------
# 1. Univariate — optimize.minimize_scalar (bounded)
# ---------------------------------------------------------------------------

def optimize_single_threshold(data, labels):
    """Find one optimal global z-score threshold."""
    def cost_single(t):
        return anomaly_cost(np.full(data.shape[2], t), data, labels)

    result = optimize.minimize_scalar(cost_single,
                                      bounds=(1.0, 5.0), method="bounded")
    print(f"[minimize_scalar] threshold = {result.x:.4f}, "
          f"cost = {result.fun:.4f}, evals = {result.nfev}")
    return result


# ---------------------------------------------------------------------------
# 2. Multivariate — optimize.minimize with BFGS (quasi-Newton)
# ---------------------------------------------------------------------------

def optimize_per_vital_bfgs(data, labels):
    """Per-vital thresholds via BFGS (gradient-free finite-difference)."""
    x0 = np.full(data.shape[2], 3.0)
    result = optimize.minimize(anomaly_cost, x0, args=(data, labels),
                               method="BFGS",
                               options={"disp": True, "maxiter": 100})
    print(f"[BFGS] thresholds = {np.abs(result.x).round(4)}, "
          f"cost = {result.fun:.4f}")
    return result


# ---------------------------------------------------------------------------
# 3. Global search — optimize.brute
# ---------------------------------------------------------------------------

def optimize_brute_force(data, labels):
    """Grid search over threshold space, refined with fmin."""
    n_vitals = data.shape[2]
    ranges = [slice(1.5, 4.5, 0.5)] * n_vitals

    result = optimize.brute(anomaly_cost, ranges,
                            args=(data, labels), finish=optimize.fmin)
    cost = anomaly_cost(result, data, labels)
    print(f"[brute+fmin] thresholds = {np.abs(result).round(4)}, "
          f"cost = {cost:.4f}")
    return result


# ---------------------------------------------------------------------------
# 4. Constrained — L-BFGS-B (bounded)
# ---------------------------------------------------------------------------

def optimize_constrained(data, labels):
    """Keep each threshold in a clinically valid range [1.5, 5.0]."""
    x0 = np.full(data.shape[2], 3.0)
    bounds = [(1.5, 5.0)] * data.shape[2]

    result = optimize.minimize(anomaly_cost, x0, args=(data, labels),
                               method="L-BFGS-B", bounds=bounds,
                               options={"disp": True, "maxiter": 100})
    print(f"[L-BFGS-B] thresholds = {result.x.round(4)}, "
          f"cost = {result.fun:.4f}")
    return result


# ===================================================================
# 5. Newton-CG optimisation — fmin_ncg (HW05 pattern)
# ===================================================================

def optimize_newton_cg(data, labels, n_vitals=5):
    """
    Multivariate threshold optimisation using scipy.optimize.fmin_ncg.
    Provides gradient (fprime) and Hessian (fhess) for Newton-CG.
    Mirrors HW05 Problem 2 pattern.
    """
    from scipy import optimize

    def cost(thresholds):
        z = np.abs(data[:, -1, :n_vitals] - data[:, :, :n_vitals].mean(axis=1))
        z /= np.clip(data[:, :, :n_vitals].std(axis=1), 1e-6, None)
        preds = (z > thresholds).any(axis=1).astype(float)
        fp = np.sum(preds * (1 - labels))
        fn = np.sum((1 - preds) * labels)
        reg = 0.01 * np.sum(thresholds ** 2)
        return float(fp + 5.0 * fn + reg)

    def grad(thresholds):
        eps = 1e-5
        g = np.zeros_like(thresholds)
        f0 = cost(thresholds)
        for i in range(len(thresholds)):
            t_up = thresholds.copy()
            t_up[i] += eps
            g[i] = (cost(t_up) - f0) / eps
        return g

    def hess(thresholds):
        eps = 1e-5
        n = len(thresholds)
        H = np.zeros((n, n))
        g0 = grad(thresholds)
        for i in range(n):
            t_up = thresholds.copy()
            t_up[i] += eps
            gi = grad(t_up)
            H[i, :] = (gi - g0) / eps
        return 0.5 * (H + H.T)

    x0 = np.array([3.0] * n_vitals)

    # fmin_ncg with gradient + Hessian (HW05 2.1 pattern)
    result = optimize.fmin_ncg(
        f=cost, x0=x0, fprime=grad, fhess=hess,
        disp=False, full_output=True,
    )
    xopt, fopt, fcalls, gcalls, hcalls, warnflag = result
    print(f"[fmin_ncg] thresholds = {np.round(xopt, 4)}, "
          f"cost = {fopt:.4f}")
    print(f"  func_evals={fcalls}, grad_evals={gcalls}, hess_evals={hcalls}")

    # fmin_ncg with gradient only (HW05 2.2 pattern — no full Hessian)
    result2 = optimize.fmin_ncg(
        f=cost, x0=x0, fprime=grad,
        disp=False, full_output=True,
    )
    xopt2, fopt2, fcalls2, gcalls2, hcalls2, _ = result2
    print(f"[fmin_ncg, no hess] thresholds = {np.round(xopt2, 4)}, "
          f"cost = {fopt2:.4f}")

    # fmin_bfgs without gradient (HW05 2.3 pattern)
    result3 = optimize.fmin_bfgs(
        f=cost, x0=x0, disp=False, full_output=True,
    )
    xopt3, fopt3, _, _, fcalls3, gcalls3, _ = result3
    print(f"[fmin_bfgs, no grad] thresholds = {np.round(xopt3, 4)}, "
          f"cost = {fopt3:.4f}")

    return xopt


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 70)
    print("PulseStream — SciPy Threshold Optimization")
    print("=" * 70)

    data, labels = generate_labeled_data()
    print(f"Data : {data.shape[0]} patients, {data.shape[1]} readings, "
          f"{data.shape[2]} vitals")
    print(f"Anomaly rate: {labels.mean():.1%}\n")

    print("--- 1. Univariate (minimize_scalar) ---")
    optimize_single_threshold(data, labels)

    print("\n--- 2. Multivariate (BFGS) ---")
    optimize_per_vital_bfgs(data, labels)

    print("\n--- 3. Global grid search (brute) ---")
    optimize_brute_force(data, labels)

    print("\n--- 4. Bounded constrained (L-BFGS-B) ---")
    optimize_constrained(data, labels)

    print("\n--- 5. Newton-CG (fmin_ncg) ---")
    optimize_newton_cg(data, labels)
