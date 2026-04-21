"""Tests for itertools-based utilities."""
import numpy as np

from pipeline.itertools_utils import (
    sliding_window,
    batch_patients,
    chain_vital_streams,
    repeat_baseline,
    filter_anomalous_windows,
    pairwise_vital_combos,
    accumulate_alert_counts,
    generate_patient_vital_product,
)


class TestSlidingWindow:
    def test_basic(self):
        result = list(sliding_window([1, 2, 3, 4, 5], 3))
        assert result == [(1, 2, 3), (2, 3, 4), (3, 4, 5)]

    def test_window_equals_length(self):
        result = list(sliding_window([1, 2, 3], 3))
        assert result == [(1, 2, 3)]

    def test_window_larger_than_input(self):
        result = list(sliding_window([1, 2], 5))
        assert result == []

    def test_single_element_window(self):
        result = list(sliding_window([1, 2, 3], 1))
        assert result == [(1,), (2,), (3,)]


class TestBatchPatients:
    def test_even_split(self):
        result = list(batch_patients(["p1", "p2", "p3", "p4"], 2))
        assert result == [("p1", "p2"), ("p3", "p4")]

    def test_remainder(self):
        result = list(batch_patients(["p1", "p2", "p3"], 2))
        assert result == [("p1", "p2"), ("p3",)]

    def test_empty(self):
        result = list(batch_patients([], 3))
        assert result == []


class TestChainVitalStreams:
    def test_merge_streams(self):
        s1 = iter([{"hr": 80}, {"hr": 82}])
        s2 = iter([{"hr": 90}])
        result = list(chain_vital_streams(s1, s2))
        assert len(result) == 3


class TestRepeatBaseline:
    def test_repeat_count(self):
        reading = {"hr": 75, "o2sat": 98}
        result = list(repeat_baseline(reading, 5))
        assert len(result) == 5
        assert all(r == reading for r in result)


class TestPairwiseCombos:
    def test_five_vitals(self):
        vitals = ["hr", "o2sat", "temp", "sbp", "resp"]
        combos = list(pairwise_vital_combos(vitals))
        assert len(combos) == 10
        assert ("hr", "o2sat") in combos


class TestAccumulateAlertCounts:
    def test_basic(self):
        assert accumulate_alert_counts([1, 0, 2, 1, 0]) == [1, 1, 3, 4, 4]

    def test_all_zeros(self):
        assert accumulate_alert_counts([0, 0, 0]) == [0, 0, 0]


class TestPatientVitalProduct:
    def test_cartesian(self):
        result = list(generate_patient_vital_product(["p1", "p2"], ["hr", "temp"]))
        assert len(result) == 4
        assert ("p1", "hr") in result
        assert ("p2", "temp") in result


class TestFilterAnomalousWindows:
    def test_filters_normal(self):
        normal = np.ones((50, 5))
        windows = [("p1", normal)]
        result = list(filter_anomalous_windows(iter(windows)))
        assert len(result) == 0

    def test_keeps_anomalous(self):
        window = np.ones((50, 5))
        window[-1, 0] = 1000.0
        windows = [("p1", window)]
        result = list(filter_anomalous_windows(iter(windows)))
        assert len(result) == 1
