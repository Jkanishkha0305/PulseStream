"""
PhysioNet data loader and stream simulator.

Loads real PhysioNet 2019 .psv files OR generates synthetic data
when files are not available.
"""
import os
import glob
import asyncio
import numpy as np
import pandas as pd
from typing import Dict, Iterator, AsyncIterator, Optional, Any

VITAL_COLS = ["hr", "o2sat", "temp", "sbp", "resp"]


def load_patient(filepath: str) -> pd.DataFrame:
    df = pd.read_csv(filepath, sep="|")
    vital_map = {"HR": "hr", "O2Sat": "o2sat", "Temp": "temp", "SBP": "sbp", "Resp": "resp"}
    cols = ["ICULOS"] + [c for c in ["HR", "O2Sat", "Temp", "SBP", "Resp"] if c in df.columns]
    df_wide = df[cols].copy()
    df_wide.columns = ["timestamp"] + [vital_map[c] for c in df_wide.columns if c != "ICULOS"]
    df_wide = df_wide.ffill().dropna(subset=VITAL_COLS, how="all").sort_values("timestamp").reset_index(drop=True)
    for col in VITAL_COLS:
        if col not in df_wide.columns:
            df_wide[col] = np.nan
    return df_wide


class StreamSimulator:
    VITAL_RANGES = {
        "hr": (60, 100),
        "o2sat": (95, 100),
        "temp": (36.5, 37.5),
        "sbp": (90, 140),
        "resp": (12, 20),
    }
    SEPSIS_THRESHOLDS = {
        "hr": 90, "o2sat": 92, "temp": 38.0, "sbp": 100, "resp": 22,
    }

    def __init__(self, data_dir: Optional[str] = None, num_patients: int = 10, seed: Optional[int] = 42):
        self.data_dir = data_dir
        self.num_patients = num_patients
        self.rng = np.random.default_rng(seed)
        self.patients: Dict[str, pd.DataFrame] = {}
        self._current_indices: Dict[str, int] = {}
        self._baseline: Dict[str, Dict[str, float]] = {}
        self._syn_timestep: Dict[str, int] = {}
        self._use_real_data = False

    def load_all_patients(self) -> Dict[str, pd.DataFrame]:
        if self.data_dir:
            pattern1 = os.path.join(self.data_dir, "*.psv")
            pattern2 = os.path.join(self.data_dir, "**", "*.psv")
            files = glob.glob(pattern1) or glob.glob(pattern2, recursive=True)

            if files:
                self.patients = {}
                for filepath in files:
                    pid = os.path.splitext(os.path.basename(filepath))[0]
                    try:
                        df = load_patient(filepath)
                        if len(df) > 0:
                            self.patients[pid] = df
                            self._current_indices[pid] = 0
                    except Exception as e:
                        print(f"[sim] Error loading {pid}: {e}")

                if self.patients:
                    self._use_real_data = True
                    print(f"[sim] Loaded {len(self.patients)} patients from {self.data_dir}")
                    return self.patients

        self._use_real_data = False
        self.patients = {}
        self._baseline = {}
        pids = [f"P{i:03d}" for i in range(1, self.num_patients + 1)]
        for pid in pids:
            self._baseline[pid] = {v: self.rng.uniform(*r) for v, r in self.VITAL_RANGES.items()}
        print(f"[sim] Using synthetic data for {len(pids)} patients")
        return {}

    def get_all_patient_ids(self) -> list[str]:
        if self._use_real_data:
            return list(self.patients.keys())
        return list(self._baseline.keys())

    def get_patient_ids(self) -> list[str]:
        return self.get_all_patient_ids()

    def _generate_synthetic_reading(self, patient_id: str) -> Dict:
        if patient_id not in self._syn_timestep:
            self._syn_timestep[patient_id] = 0
        ts = self._syn_timestep[patient_id]
        base = self._baseline.get(patient_id)
        if not base:
            return {}
        row: Dict[str, Any] = {"patient_id": patient_id, "timestamp": float(ts)}
        for vital, bval in base.items():
            thresh = self.SEPSIS_THRESHOLDS.get(vital, bval * 1.5)
            drift = self.rng.normal(0, 0.5)
            if ts > 30 and self.rng.random() < 0.15:
                drift += self.rng.normal(3, 1)
            row[vital] = round(float(np.clip(bval + drift, 0, 300)), 2)
        self._syn_timestep[patient_id] = ts + 1
        return row

    async def stream(self, patient_id: str, delay: float = 0) -> AsyncIterator[Dict]:
        if self._use_real_data:
            if patient_id not in self.patients:
                return
            df = self.patients[patient_id]
            for idx in range(len(df)):
                row = df.iloc[idx]
                vitals: Dict[str, float] = {}
                for col in VITAL_COLS:
                    if col in df.columns and pd.notna(row.get(col)):
                        vitals[col] = float(row[col])
                if not vitals:
                    continue
                yield {
                    "patient_id": patient_id,
                    "timestamp": float(row["timestamp"]),
                    "vitals": vitals,
                }
                if delay > 0:
                    await asyncio.sleep(delay)
        else:
            row = self._generate_synthetic_reading(patient_id)
            if row:
                yield {
                    "patient_id": patient_id,
                    "timestamp": float(row["timestamp"]),
                    "vitals": {v: row[v] for v in VITAL_COLS},
                }
                if delay > 0:
                    await asyncio.sleep(delay)
