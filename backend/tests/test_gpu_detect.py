"""Tests for GPU detection (runs CPU fallback if no GPU)."""
import numpy as np
import pytest

from pipeline.benchmark import stage2_numpy, generate_test_data
from pipeline.gpu_detect import detect_gpu, GPU_AVAILABLE


@pytest.fixture
def data():
    return generate_test_data(n_patients=20, window_size=50)


class TestGpuDetect:
    def test_returns_correct_length(self, data):
        result = detect_gpu(data)
        assert len(result) == data.shape[0]

    def test_matches_numpy_stage(self, data):
        numpy_result = np.array(stage2_numpy(data))
        gpu_result = np.array(detect_gpu(data))
        np.testing.assert_array_equal(numpy_result, gpu_result)

    def test_gpu_availability_flag(self):
        assert isinstance(GPU_AVAILABLE, bool)
