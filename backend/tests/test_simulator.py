"""Tests for stream simulator behavior."""

import pandas as pd
import pytest

from pipeline.simulator import StreamSimulator


class TestStreamSimulator:
    @pytest.mark.asyncio
    async def test_real_data_stream_advances_without_replaying(self):
        sim = StreamSimulator()
        sim._use_real_data = True
        sim.patients = {
            "p00001": pd.DataFrame(
                [
                    {"timestamp": 0.0, "hr": 80.0, "o2sat": 98.0, "temp": 37.0, "sbp": 120.0, "resp": 16.0},
                    {"timestamp": 1.0, "hr": 82.0, "o2sat": 97.0, "temp": 37.1, "sbp": 118.0, "resp": 17.0},
                ]
            )
        }
        sim._current_indices["p00001"] = 0

        first = [reading async for reading in sim.stream("p00001")]
        second = [reading async for reading in sim.stream("p00001")]
        third = [reading async for reading in sim.stream("p00001")]

        assert [reading["timestamp"] for reading in first + second] == [0.0, 1.0]
        assert third == []

    @pytest.mark.asyncio
    async def test_synthetic_stream_still_produces_single_reading_per_call(self):
        sim = StreamSimulator(num_patients=1, seed=1)
        sim.load_all_patients()
        patient_id = sim.get_all_patient_ids()[0]

        first = [reading async for reading in sim.stream(patient_id)]
        second = [reading async for reading in sim.stream(patient_id)]

        assert len(first) == 1
        assert len(second) == 1
        assert second[0]["timestamp"] > first[0]["timestamp"]
