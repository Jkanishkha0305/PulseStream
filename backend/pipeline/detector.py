"""
Tiered anomaly detection for patient vital signs.

Tier 1: Statistical (Z-score + IQR)
Tier 2: Machine Learning (Isolation Forest)
"""

import numpy as np
from typing import Dict, List, Optional, cast
from sklearn.ensemble import IsolationForest

# Vital sign normal ranges
VITAL_RANGES = {
    "hr": (60, 100),
    "o2sat": (95, 100),
    "temp": (36.1, 37.2),
    "sbp": (90, 140),
    "resp": (12, 20),
}

VITAL_COLS = ["hr", "o2sat", "temp", "sbp", "resp"]


class AnomalyDetector:
    """Tiered anomaly detection system."""
    
    def __init__(self):
        """Initialize detector with empty model storage."""
        # Import optimizer functions
        from .optimizer import compute_zscore_numba, compute_iqr_flags_numba, to_float32
        self._compute_zscore = compute_zscore_numba
        self._compute_iqr_flags = compute_iqr_flags_numba
        self._to_float32 = to_float32
        
        # Storage for ML models
        self._iso_models: Dict[str, IsolationForest] = {}
        self._model_fit_counts: Dict[str, int] = {}
    
    def detect_tier1(
        self, 
        patient_id: str, 
        window: np.ndarray
    ) -> Optional[Dict]:
        """
        Detect anomalies using statistical methods (Z-score + IQR).
        
        Args:
            patient_id: Unique patient identifier
            window: Array of shape (n_readings, 5) with columns [HR, O2Sat, Temp, SBP, Resp]
            
        Returns:
            Dictionary with keys: patient_id, flags, severity, tier
            Returns None if no anomalies detected or insufficient data.
        """
        # Need at least 5 readings for reliable statistics
        if window.shape[0] < 5:
            return None
        
        # Convert to float32 (handle NaN, inf)
        window_f32 = self._to_float32(window)
        
        # Compute Z-scores per column
        zscores = self._compute_zscore(window_f32)
        
        # Compute IQR flags per column
        iqr_flags = self._compute_iqr_flags(window_f32)
        
        # Last row is current reading
        current_zscores = zscores[-1, :]
        current_iqr_flags = iqr_flags[-1, :]
        
        # Flag vitals where |zscore| > 3 OR IQR outlier
        flagged_vitals = []
        for i, col in enumerate(VITAL_COLS):
            if abs(current_zscores[i]) > 3 or current_iqr_flags[i]:
                flagged_vitals.append(col)
        
        # If no flags, return None
        if not flagged_vitals:
            return None
        
        # Calculate severity (fraction of vitals flagged)
        severity = len(flagged_vitals) / len(VITAL_COLS)
        
        return {
            "patient_id": patient_id,
            "flags": flagged_vitals,
            "severity": float(severity),
            "tier": 1
        }
    
    def detect_tier2(
        self, 
        patient_id: str, 
        window: np.ndarray
    ) -> Optional[Dict]:
        """
        Detect anomalies using Isolation Forest (ML-based).
        
        Args:
            patient_id: Unique patient identifier
            window: Array of shape (n_readings, 5)
            
        Returns:
            Dictionary with keys: patient_id, flags, severity, tier
            Returns None if normal or insufficient data.
        """
        # Need at least 10 readings for ML
        if window.shape[0] < 10:
            return None
        
        # Convert to float32
        window_f32 = self._to_float32(window)
        
        # Check if we need to fit/update model
        current_count = window.shape[0]
        last_fit_count = self._model_fit_counts.get(patient_id, 0)
        
        # Fit/update model if patient is new OR has 10+ new readings
        is_new = patient_id not in self._iso_models
        needs_refit = (current_count - last_fit_count) >= 10
        
        if is_new or needs_refit:
            # Create and fit IsolationForest
            model = IsolationForest(
                n_estimators=50,
                contamination=0.05,  # type: ignore[arg-type]
                random_state=42,
            )
            model.fit(window_f32)
            
            self._iso_models[patient_id] = model
            self._model_fit_counts[patient_id] = current_count
        
        # Predict on last row (current reading)
        model = self._iso_models[patient_id]
        last_row = window_f32[-1:, :]  # Keep 2D shape
        prediction = model.predict(last_row)
        
        # prediction == -1 means anomaly
        if prediction[0] == -1:
            # Get anomaly score (more negative = more anomalous)
            score = model.decision_function(last_row)[0]
            
            return {
                "patient_id": patient_id,
                "flags": ["multivariate"],  # ML detects overall anomaly pattern
                "severity": float(abs(score)),  # Convert to positive
                "tier": 2
            }
        
        # Normal - return None
        return None
    
    def detect(
        self, 
        patient_id: str, 
        window: np.ndarray, 
        tier1_threshold: float = 0.5
    ) -> Optional[Dict]:
        """
        Run full detection pipeline.
        
        Args:
            patient_id: Patient ID
            window: Vital signs window
            tier1_threshold: Severity threshold to escalate to Tier 2
            
        Returns:
            Highest tier result, or None if no anomalies
        """
        # Run Tier 1 first
        tier1_result = self.detect_tier1(patient_id, window)
        
        # If Tier 1 detects something above threshold, try Tier 2
        if tier1_result and tier1_result["severity"] > tier1_threshold:
            tier2_result = self.detect_tier2(patient_id, window)
            if tier2_result:
                return tier2_result
        
        # Return Tier 1 result if exists
        if tier1_result:
            return tier1_result
        
        return None


# Helper function to get column index
def get_vital_index(vital_name: str) -> int:
    """Get index for a vital in the array."""
    return VITAL_COLS.index(vital_name)


if __name__ == "__main__":
    # Test the detector
    from .optimizer import warmup
    
    # Warmup Numba
    warmup()
    
    # Create test data
    np.random.seed(42)
    
    # Normal window
    normal_window = np.random.randn(20, 5).astype(np.float32)
    normal_window[:, 0] = np.random.normal(80, 5, 20)   # HR ~80
    normal_window[:, 1] = np.random.normal(98, 1, 20)  # O2Sat ~98
    normal_window[:, 2] = np.random.normal(37, 0.3, 20)  # Temp ~37
    normal_window[:, 3] = np.random.normal(120, 10, 20)  # SBP ~120
    normal_window[:, 4] = np.random.normal(16, 2, 20)   # Resp ~16
    
    # Add anomaly to last row
    normal_window[-1, 0] = 150  # HR spike
    
    # Test detector
    detector = AnomalyDetector()
    
    print("Testing Tier 1 detection...")
    result = detector.detect_tier1("test_patient", normal_window)
    print(f"Result: {result}")
    
    print("\nTesting Tier 2 detection...")
    result2 = detector.detect_tier2("test_patient", normal_window)
    print(f"Result: {result2}")
    
    print("\nTesting full pipeline...")
    result3 = detector.detect("test_patient", normal_window, tier1_threshold=0.2)
    print(f"Result: {result3}")