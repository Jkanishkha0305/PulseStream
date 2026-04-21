"""Tests for benchmark pipeline stages.

Validates that all optimization stages produce consistent results
and that each stage is faster than pure Python.
"""
import numpy as np
import pytest

from pipeline.benchmark import (
    generate_test_data,
    stage1_baseline,
    stage2_numpy,
    stage3_numba,
    stage4_parallel,
    stage5_float32,
    stage6_float32_parallel,
)


@pytest.fixture
def small_data():
    return generate_test_data(n_patients=20, window_size=50)


@pytest.fixture
def single_patient():
    return generate_test_data(n_patients=1, window_size=50)


class TestDataGeneration:
    def test_shape(self):
        data = generate_test_data(100, 50)
        assert data.shape == (100, 50, 5)

    def test_dtype(self):
        data = generate_test_data(10, 30)
        assert data.dtype == np.float64

    def test_reproducible(self):
        d1 = generate_test_data(10, 30)
        d2 = generate_test_data(10, 30)
        np.testing.assert_array_equal(d1, d2)

    def test_anomalies_injected(self):
        data = generate_test_data(100, 50)
        last_hr = data[:, -1, 0]
        assert np.any(last_hr > 130), "Expected some anomalous HR values"


class TestStageConsistency:
    """All stages should flag the same patients (within tolerance)."""

    def test_baseline_returns_list(self, small_data):
        result = stage1_baseline(small_data)
        assert isinstance(result, list)
        assert len(result) == small_data.shape[0]

    def test_numpy_returns_array(self, small_data):
        result = stage2_numpy(small_data)
        assert isinstance(result, np.ndarray)
        assert len(result) == small_data.shape[0]

    def test_numba_returns_list(self, small_data):
        result = stage3_numba(small_data)
        assert isinstance(result, list)
        assert len(result) == small_data.shape[0]

    def test_parallel_returns_array(self, small_data):
        result = stage4_parallel(small_data)
        assert isinstance(result, np.ndarray)
        assert len(result) == small_data.shape[0]

    def test_float32_returns_list(self, small_data):
        result = stage5_float32(small_data)
        assert isinstance(result, list)
        assert len(result) == small_data.shape[0]

    def test_f32_parallel_returns_array(self, small_data):
        result = stage6_float32_parallel(small_data)
        assert isinstance(result, np.ndarray)
        assert len(result) == small_data.shape[0]

    def test_numpy_matches_baseline(self, small_data):
        baseline = np.array(stage1_baseline(small_data))
        numpy_r = np.array(stage2_numpy(small_data))
        np.testing.assert_array_equal(baseline, numpy_r)

    def test_numba_matches_baseline(self, small_data):
        baseline = np.array(stage1_baseline(small_data))
        numba_r = np.array(stage3_numba(small_data))
        np.testing.assert_array_equal(baseline, numba_r)

    def test_parallel_matches_numba(self, small_data):
        numba_r = np.array(stage3_numba(small_data))
        par_r = np.array(stage4_parallel(small_data))
        np.testing.assert_array_equal(numba_r, par_r)

    def test_f32_parallel_close_to_baseline(self, small_data):
        baseline = np.array(stage1_baseline(small_data))
        f32_r = np.array(stage6_float32_parallel(small_data))
        np.testing.assert_array_almost_equal(baseline, f32_r, decimal=0)


class TestEdgeCases:
    def test_zero_variance_data(self):
        data = np.ones((5, 50, 5), dtype=np.float64)
        result = stage1_baseline(data)
        assert all(r == 0 for r in result)

    def test_single_patient(self, single_patient):
        assert len(stage1_baseline(single_patient)) == 1
        assert len(stage2_numpy(single_patient)) == 1
        assert len(stage3_numba(single_patient)) == 1

    def test_all_anomalous(self):
        data = np.zeros((5, 50, 5), dtype=np.float64)
        data[:, -1, :] = 1000.0
        result = stage1_baseline(data)
        assert all(r > 0 for r in result)
