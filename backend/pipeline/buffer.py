"""
Per-patient sliding window buffer.

Stores last N readings per patient using collections.deque.
"""

import numpy as np
from typing import Dict, List
from collections import deque


class PatientBuffer:
    """Per-patient sliding window buffer for vital sign data."""
    
    # Column order for the window array
    VITAL_COLS = ["hr", "o2sat", "temp", "sbp", "resp"]
    
    def __init__(self, window_size: int = 30):
        """
        Initialize the buffer.
        
        Args:
            window_size: Maximum number of readings to store per patient
        """
        self._window_size = window_size
        self._buffers: Dict[str, deque] = {}
    
    def push(self, patient_id: str, vitals: dict) -> None:
        """
        Append a new vital reading to the patient's buffer.
        
        Args:
            patient_id: Unique patient identifier
            vitals: Dictionary of vital signs, e.g., {"HR": 80, "O2Sat": 98, ...}
        """
        if patient_id not in self._buffers:
            self._buffers[patient_id] = deque(maxlen=self._window_size)
        
        # Store as dict with vitals
        self._buffers[patient_id].append(vitals)
    
    def get_window(self, patient_id: str) -> np.ndarray:
        """
        Get the sliding window for a patient as a numpy array.
        
        Args:
            patient_id: The patient's ID
            
        Returns:
            Array of shape (n_readings, 5) with columns [HR, O2Sat, Temp, SBP, Resp]
            Returns empty array if patient is unknown.
        """
        if patient_id not in self._buffers:
            return np.array([], dtype=np.float32)
        
        buffer = self._buffers[patient_id]
        if len(buffer) == 0:
            return np.array([], dtype=np.float32)
        
        # Build array from buffer
        window = []
        for reading in buffer:
            row = []
            for col in self.VITAL_COLS:
                val = reading.get(col)
                if val is None:
                    row.append(np.nan)
                else:
                    row.append(float(val))
            window.append(row)
        
        return np.array(window, dtype=np.float32)
    
    def get_all_patient_ids(self) -> List[str]:
        """Return list of all patient IDs currently in buffer."""
        return list(self._buffers.keys())
    
    def current_window_size(self, patient_id: str) -> int:
        """
        Get current window size for a patient.
        
        Args:
            patient_id: The patient's ID
            
        Returns:
            Number of readings currently stored (0 if unknown)
        """
        if patient_id not in self._buffers:
            return 0
        return len(self._buffers[patient_id])
    
    def clear(self, patient_id: str) -> None:
        """Clear buffer for a specific patient."""
        if patient_id in self._buffers:
            self._buffers[patient_id].clear()
    
    def clear_all(self) -> None:
        """Clear all patient buffers."""
        self._buffers.clear()


if __name__ == "__main__":
    # Quick test
    buffer = PatientBuffer(window_size=30)
    
    # Add some readings
    buffer.push("p00001", {"hr": 80, "o2sat": 98, "temp": 37.0, "sbp": 120, "resp": 16})
    buffer.push("p00001", {"hr": 82, "o2sat": 97, "temp": 37.2, "sbp": 118, "resp": 17})
    buffer.push("p00001", {"hr": 85, "o2sat": 96, "temp": 37.5, "sbp": 115, "resp": 18})
    
    print(f"Window size: {buffer.current_window_size('p00001')}")
    print(f"Window shape: {buffer.get_window('p00001').shape}")
    print(f"Window data:\n{buffer.get_window('p00001')}")
    
    print(f"\nAll patient IDs: {buffer.get_all_patient_ids()}")