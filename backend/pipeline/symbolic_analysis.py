"""
Symbolic Clinical Analysis — SymPy
===================================
Demonstrates: sympy (symbols, solve, diff, simplify, lambdify, Eq, Rational)
Course reference: Lecture 08 — Symbolic Computation with SymPy

Uses symbolic mathematics to derive anomaly-detection formulas, find
critical thresholds, verify IQR bounds, and generate optimised numerical
evaluation functions — all within the PulseStream clinical domain.
"""

import numpy as np
from sympy import (symbols, sqrt, Rational, Eq,
                   solve, diff, simplify, lambdify,
                   exp as sym_exp)


# ---------------------------------------------------------------------------
# 1. Derive the Z-score formula and its partial derivatives
# ---------------------------------------------------------------------------

def derive_zscore():
    """Derive z = (x − μ) / σ  and inspect its derivatives symbolically."""
    x, mu = symbols("x mu", real=True)
    sigma  = symbols("sigma", positive=True)

    z = (x - mu) / sigma

    print("Z-score formula")
    print(f"  z        = {z}")
    print(f"  ∂z/∂x    = {diff(z, x)}")
    print(f"  ∂z/∂μ    = {diff(z, mu)}")
    print(f"  ∂z/∂σ    = {simplify(diff(z, sigma))}")

    # solve for x given |z| = threshold
    z_t = symbols("z_t", positive=True)
    solutions = solve(Eq((x - mu) / sigma, z_t), x)
    print(f"  x when z = z_t : {solutions}")

    solutions_neg = solve(Eq((x - mu) / sigma, -z_t), x)
    print(f"  x when z = -z_t: {solutions_neg}")

    return z


# ---------------------------------------------------------------------------
# 2. Combined multi-vital severity score
# ---------------------------------------------------------------------------

def derive_severity_score():
    """
    Weighted-RMS severity score over 5 vitals:
        S = sqrt( Σ w_i z_i² / Σ w_i )
    """
    z_vars = symbols("z_HR z_O2 z_Temp z_SBP z_Resp", real=True)
    w_vars = symbols("w_HR w_O2 w_Temp w_SBP w_Resp", positive=True)

    S = sqrt(sum(w * z**2 for w, z in zip(w_vars, z_vars)) / sum(w_vars))
    S_simple = simplify(S)

    print("\nCombined severity score (weighted RMS)")
    print(f"  S = {S_simple}")

    # gradient
    print("  Gradient ∂S/∂z_i:")
    for z_i in z_vars:
        print(f"    ∂S/∂{z_i} = {simplify(diff(S, z_i))}")

    # equal-weight specialisation
    eq_subs = {w: Rational(1, 5) for w in w_vars}
    S_eq = simplify(S.subs(eq_subs))
    print(f"  Equal weights → S = {S_eq}")

    return S


# ---------------------------------------------------------------------------
# 3. Optimal threshold from a cost model (symbolic)
# ---------------------------------------------------------------------------

def find_optimal_threshold():
    """
    Simplified cost model  C(t) = α · e^{-t²/2}  +  β · (1 − e^{-(t−δ)²/2})
    where
        FP rate ∝ exp(−t²/2)     (tail of the normal distribution)
        FN rate ∝ 1 − exp(−(t−δ)²/2)   (anomalies shifted by δ)
    """
    t = symbols("t", positive=True)
    alpha, beta, delta = symbols("alpha beta delta", positive=True)

    fp_rate = sym_exp(-t**2 / 2)
    fn_rate = 1 - sym_exp(-(t - delta)**2 / 2)
    cost = alpha * fp_rate + beta * fn_rate

    print("\nCost function")
    print(f"  C(t)   = {simplify(cost)}")
    print(f"  C'(t)  = {simplify(diff(cost, t))}")
    print(f"  C''(t) = {simplify(diff(cost, t, 2))}")

    # numeric evaluation with concrete clinical values
    concrete = {alpha: 1, beta: 5, delta: 3}
    cost_numeric = lambdify(t, cost.subs(concrete), "numpy")

    t_vals = np.linspace(0.5, 5.0, 500)
    costs  = cost_numeric(t_vals)
    t_opt  = t_vals[np.argmin(costs)]
    print(f"  Numerical optimum (α=1, β=5, δ=3): t* ≈ {t_opt:.3f}")

    return cost


# ---------------------------------------------------------------------------
# 4. Verify IQR outlier-fence formulas
# ---------------------------------------------------------------------------

def verify_iqr_fences():
    """Symbolically verify IQR fences and their normal-distribution equivalents."""
    x, q1, q3, iqr = symbols("x Q1 Q3 IQR", real=True)

    lower = q1 - Rational(3, 2) * iqr
    upper = q3 + Rational(3, 2) * iqr

    print("\nIQR outlier fences")
    print("  IQR         = Q3 − Q1")
    print(f"  Lower fence = {lower}")
    print(f"  Upper fence = {upper}")
    print(f"  Fence width = {simplify(upper - lower)}")

    # substitute normal-distribution quartiles  Q1 ≈ μ − 0.6745σ, Q3 ≈ μ + 0.6745σ
    mu, sigma = symbols("mu sigma", positive=True)
    norm = {
        q1:  mu - Rational(6745, 10000) * sigma,
        q3:  mu + Rational(6745, 10000) * sigma,
        iqr: Rational(6745, 5000) * sigma,
    }
    lower_n = simplify(lower.subs(norm))
    upper_n = simplify(upper.subs(norm))
    print("\n  For N(μ, σ²):")
    print(f"    Lower fence ≈ {lower_n}")
    print(f"    Upper fence ≈ {upper_n}")
    print("    → IQR method catches points ≈ 2.698σ from the mean")


# ---------------------------------------------------------------------------
# 5. Generate fast numerical function via lambdify
# ---------------------------------------------------------------------------

def generate_fast_scorer():
    """Use lambdify to convert the symbolic severity score to a NumPy func."""
    z_vars = symbols("z_HR z_O2 z_Temp z_SBP z_Resp", real=True)

    S = sqrt(sum(z**2 for z in z_vars) / len(z_vars))
    fast_S = lambdify(z_vars, S, "numpy")

    # test with random data
    rng = np.random.RandomState(42)
    zvals = rng.randn(5)
    result = fast_S(*zvals)
    print(f"\nLambdified scorer test: z={zvals.round(3)} → S={result:.4f}")
    return fast_S


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("=" * 70)
    print("PulseStream — Symbolic Clinical Analysis (SymPy)")
    print("=" * 70)

    derive_zscore()
    derive_severity_score()
    find_optimal_threshold()
    verify_iqr_fences()
    generate_fast_scorer()
