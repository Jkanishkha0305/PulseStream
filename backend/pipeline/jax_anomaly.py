"""
JAX-based Differentiable Anomaly Detection
===========================================
Demonstrates: jax.grad, jax.hessian, jax.jit, jax.vmap,
              jax.jacfwd, jax.jacrev  (forward- vs reverse-mode autodiff)
Course reference: Lecture 08 — Automatic Differentiation with JAX

Implements a differentiable anomaly scoring function and uses JAX autodiff
to compute gradients / Hessians for gradient-based threshold tuning.
"""

import numpy as np

try:
    import jax
    import jax.numpy as jnp
    from jax import jit, grad, hessian, vmap, jacfwd, jacrev
    JAX_AVAILABLE = True
except (ImportError, Exception) as e:
    JAX_AVAILABLE = False
    print(f"[jax_anomaly] JAX not available: {e}")


VITALS = ["HR", "O2Sat", "Temp", "SBP", "Resp"]


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

def generate_data(n_patients=100, n_readings=50, seed=42):
    """Synthetic patient data with injected anomalies."""
    if not JAX_AVAILABLE:
        return None, None
    rng = np.random.RandomState(seed)
    data = rng.randn(n_patients, n_readings, len(VITALS)).astype(np.float32)
    data[:15, :, :2] += 4.0          # anomalies in first 15 patients
    labels = np.zeros(n_patients, dtype=np.float32)
    labels[:15] = 1.0
    return jnp.array(data), jnp.array(labels)


# ---------------------------------------------------------------------------
# Differentiable anomaly score (smooth sigmoid thresholding)
# ---------------------------------------------------------------------------

def anomaly_score_single(patient_window, thresholds):
    """
    Smooth anomaly score for one patient.

    Uses sigmoid soft-thresholding so the function is differentiable:
        score = mean( sigmoid( steepness · (|z| - threshold) ) )
    """
    means = jnp.mean(patient_window, axis=0)
    stds  = jnp.std(patient_window, axis=0)
    stds  = jnp.where(stds < 1e-6, 1.0, stds)
    zscores = jnp.abs((patient_window - means) / stds)

    steepness = 5.0
    exceedances = jax.nn.sigmoid(steepness * (zscores - thresholds))
    return jnp.mean(exceedances)


def loss_fn(thresholds, data, labels, fp_weight=1.0, fn_weight=5.0):
    """
    Weighted binary cross-entropy between predicted scores and true labels.

    vmap vectorises anomaly_score_single over the patient axis.
    """
    scores = vmap(anomaly_score_single, in_axes=(0, None))(data, thresholds)
    scores = jnp.clip(scores, 1e-7, 1 - 1e-7)

    bce = -(fn_weight * labels * jnp.log(scores) +
            fp_weight * (1 - labels) * jnp.log(1 - scores))
    return jnp.mean(bce)


# ---------------------------------------------------------------------------
# Demonstrate autodiff
# ---------------------------------------------------------------------------

def demonstrate_autodiff(data, labels):
    """Show grad, hessian, jit, vmap, jacfwd, jacrev."""

    thresholds = jnp.array([3.0] * len(VITALS))

    # 1. JIT-compiled loss
    jit_loss = jit(loss_fn)
    loss_val = jit_loss(thresholds, data, labels)
    print(f"Loss at default thresholds : {loss_val:.6f}")

    # 2. Gradient via reverse-mode autodiff  (∇L)
    grad_fn = jit(grad(loss_fn))
    gradient = grad_fn(thresholds, data, labels)
    print(f"Gradient  (∇L)             : {gradient}")

    # 3. Hessian matrix  (∂²L / ∂θ_i ∂θ_j)
    hessian_fn = jit(hessian(loss_fn))
    H = hessian_fn(thresholds, data, labels)
    print(f"Hessian diagonal           : {jnp.diag(H)}")

    # 4. Forward-mode vs reverse-mode Jacobian comparison
    def score_fn(t):
        return vmap(
            anomaly_score_single, in_axes=(0, None)
        )(data[:10], t)

    J_fwd = jacfwd(score_fn)(thresholds)
    J_rev = jacrev(score_fn)(thresholds)
    print(f"\nJacobian (jacfwd) shape    : {J_fwd.shape}")
    print(f"Jacobian (jacrev) shape    : {J_rev.shape}")
    print(f"Forward ≈ Reverse          : "
          f"{bool(jnp.allclose(J_fwd, J_rev, atol=1e-4))}")

    # 5. Gradient-descent optimisation loop
    print("\n--- Gradient descent on thresholds ---")
    params = jnp.array([3.0] * len(VITALS))
    lr = 0.1

    for step in range(21):
        g = grad_fn(params, data, labels)
        params = params - lr * g
        if step % 5 == 0:
            loss_step = jit_loss(params, data, labels)
            print(f"  step {step:3d}  loss={loss_step:.6f}  θ={params.round(4)}")

    print(f"\nOptimised thresholds: {params.round(4)}")

    # 6. jax.jvp — Hessian-vector product (HW05 2.2 pattern)
    print("\n--- jax.jvp (Hessian-vector product) ---")
    def grad_fn_wrapper(t):
        return grad_fn(t, data, labels)

    # jvp computes (primals_out, tangents_out) — the tangent is the
    # Hessian-vector product when applied to the gradient function
    test_point = jnp.array([3.0] * len(VITALS))
    test_vector = jnp.ones(len(VITALS))

    primals_out, hvp = jax.jvp(grad_fn_wrapper, (test_point,), (test_vector,))
    print(f"  Point             : {test_point}")
    print(f"  Vector            : {test_vector}")
    print(f"  Gradient at point : {primals_out.round(6)}")
    print(f"  Hessian-vector prd: {hvp.round(6)}")
    print("  (jvp avoids building the full Hessian matrix — O(n) vs O(n^2))")

    return params


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not JAX_AVAILABLE:
        print("JAX not available — skipping.")
    else:
        print("=" * 70)
        print("PulseStream — JAX Automatic Differentiation")
        print("=" * 70)
        data, labels = generate_data()
        print(f"Data: {data.shape}, Labels: {labels.shape}\n")
        demonstrate_autodiff(data, labels)
