"""Tests for multiprocessing-based detection."""
import pytest

from pipeline.benchmark import stage1_baseline, generate_test_data
from pipeline.multiprocess_detect import stage_multiprocess, stage_threadpool


@pytest.fixture
def data():
    return generate_test_data(n_patients=20, window_size=50)


class TestMultiprocessDetect:
    def test_returns_correct_length(self, data):
        result = stage_multiprocess(data, n_workers=2)
        assert len(result) == data.shape[0]

    def test_matches_baseline(self, data):
        baseline = stage1_baseline(data)
        mp_result = stage_multiprocess(data, n_workers=2)
        assert baseline == mp_result

    def test_threadpool_returns_correct_length(self, data):
        result = stage_threadpool(data, n_workers=2)
        assert len(result) == data.shape[0]

    def test_threadpool_matches_baseline(self, data):
        baseline = stage1_baseline(data)
        tp_result = stage_threadpool(data, n_workers=2)
        assert baseline == tp_result
