"""
Supabase client and CRUD operations for PulseStream.

Provides async functions for interacting with Supabase database.
"""

import os
from typing import Optional, List, Dict, Any
from supabase import create_client, Client


def get_supabase() -> Client:
    """
    Create and return a Supabase client.
    
    Requires environment variables:
    - SUPABASE_URL
    - SUPABASE_SERVICE_KEY (service role key for admin access)
    
    Returns:
        Supabase Client instance
    """
    return create_client(
        os.environ.get("SUPABASE_URL", ""),
        os.environ.get("SUPABASE_SERVICE_KEY", "")
    )


# ============================================================================
# Vital Readings CRUD
# ============================================================================

async def insert_vital_reading(
    patient_id: str,
    timestamp: float,
    hr: Optional[float] = None,
    o2sat: Optional[float] = None,
    temp: Optional[float] = None,
    sbp: Optional[float] = None,
    resp: Optional[float] = None,
    anomaly_flags: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Insert a vital reading into the database.
    
    Args:
        patient_id: Unique patient identifier
        timestamp: ICULOS timestamp (hours since ICU admission)
        hr: Heart rate (bpm)
        o2sat: Oxygen saturation (%)
        temp: Temperature (°C)
        sbp: Systolic blood pressure (mmHg)
        resp: Respiration rate (breaths/min)
        anomaly_flags: List of flagged vital names
        
    Returns:
        The inserted record
    """
    client = get_supabase()
    
    data = {
        "patient_id": patient_id,
        "timestamp": timestamp,
        "hr": hr,
        "o2sat": o2sat,
        "temp": temp,
        "sbp": sbp,
        "resp": resp,
        "anomaly_flags": anomaly_flags or []
    }
    
    response = client.table("vital_readings").insert(data).execute()
    return response.data[0] if response.data else {}


async def get_patient_vitals(
    patient_id: str,
    limit: int = 30
) -> List[Dict[str, Any]]:
    """
    Get vital readings for a specific patient.
    
    Args:
        patient_id: The patient's ID
        limit: Maximum number of records to return
        
    Returns:
        List of vital reading records, newest first
    """
    client = get_supabase()
    
    response = (
        client.table("vital_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    
    return response.data or []


# ============================================================================
# Alerts CRUD
# ============================================================================

async def insert_alert(
    patient_id: str,
    timestamp: float,
    vital_flags: List[str],
    severity: float,
    tier: int
) -> Dict[str, Any]:
    """
    Insert a new alert into the database.
    
    Args:
        patient_id: Unique patient identifier
        timestamp: Time of alert
        vital_flags: List of vital signs that triggered the alert
        severity: Severity score (0-1)
        tier: Detection tier (1=statistical, 2=ML)
        
    Returns:
        The inserted alert record
    """
    client = get_supabase()
    
    data = {
        "patient_id": patient_id,
        "timestamp": timestamp,
        "vital_flags": vital_flags,
        "severity": severity,
        "tier": tier,
        "status": "pending"  # Default status
    }
    
    response = client.table("alerts").insert(data).execute()
    return response.data[0] if response.data else {}


async def update_alert(
    alert_id: str,
    status: str,
    notes: Optional[str] = None,
    acknowledged_by: Optional[str] = None
) -> Dict[str, Any]:
    """
    Update an alert's status and optionally add notes.
    
    Args:
        alert_id: The alert's UUID
        status: New status ('pending', 'acknowledged', 'escalated', 'resolved')
        notes: Optional notes text
        acknowledged_by: Username of person acknowledging
        
    Returns:
        The updated alert record
    """
    client = get_supabase()
    
    data = {"status": status}
    
    if notes is not None:
        data["notes"] = notes
    
    if acknowledged_by is not None:
        data["acknowledged_by"] = acknowledged_by
    
    # Set acknowledged_at if status is 'acknowledged'
    if status == "acknowledged":
        data["acknowledged_at"] = "now()"  # Supabase will handle timestamp
    
    response = (
        client.table("alerts")
        .update(data)
        .eq("id", alert_id)
        .execute()
    )
    
    return response.data[0] if response.data else {}


async def get_alerts(
    status: Optional[str] = None,
    patient_id: Optional[str] = None,
    limit: int = 50
) -> List[Dict[str, Any]]:
    """
    Get alerts with optional filtering.
    
    Args:
        status: Filter by status (pending/acknowledged/escalated/resolved)
        patient_id: Filter by patient ID
        limit: Maximum number of records
        
    Returns:
        List of alert records
    """
    client = get_supabase()
    
    query = client.table("alerts").select("*")
    
    if status:
        query = query.eq("status", status)
    
    if patient_id:
        query = query.eq("patient_id", patient_id)
    
    response = (
        query
        .order("timestamp", desc=True)
        .limit(limit)
        .execute()
    )
    
    return response.data or []


async def get_patient_latest(patient_id: str) -> Dict[str, Any]:
    """
    Get a patient's most recent vital reading and alert severity.
    
    Args:
        patient_id: The patient's ID
        
    Returns:
        Dict with latest vitals and latest alert severity
    """
    client = get_supabase()
    
    # Get latest vital
    vitals_response = (
        client.table("vital_readings")
        .select("*")
        .eq("patient_id", patient_id)
        .order("timestamp", desc=True)
        .limit(1)
        .execute()
    )
    
    # Get latest alert
    alert_response = (
        client.table("alerts")
        .select("severity, status")
        .eq("patient_id", patient_id)
        .order("timestamp", desc=True)
        .limit(1)
        .execute()
    )
    
    latest_vitals = vitals_response.data[0] if vitals_response.data else None
    latest_alert = alert_response.data[0] if alert_response.data else None
    
    return {
        "latest_vitals": latest_vitals,
        "severity": latest_alert["severity"] if latest_alert else 0.0,
        "has_active_alert": latest_alert and latest_alert["status"] == "pending"
    }


# ============================================================================
# Query Helpers
# ============================================================================

async def get_all_patients() -> List[Dict[str, Any]]:
    """
    Get all distinct patient IDs with their latest vitals and alert severity.
    
    Returns:
        List of patient summaries
    """
    client = get_supabase()
    
    # Get distinct patient IDs with latest info
    response = (
        client.table("vital_readings")
        .select("patient_id, timestamp, hr, o2sat, temp, sbp, resp")
        .execute()
    )
    
    if not response.data:
        return []
    
    # Group by patient, get latest per patient
    patients_map: Dict[str, Dict] = {}
    
    for row in response.data:
        pid = row["patient_id"]
        if pid not in patients_map or row["timestamp"] > patients_map[pid].get("timestamp", 0):
            patients_map[pid] = row
    
    # Get alert statuses for each patient
    result = []
    for patient_id, vitals in patients_map.items():
        alert_response = (
            client.table("alerts")
            .select("severity, status")
            .eq("patient_id", patient_id)
            .eq("status", "pending")
            .order("timestamp", desc=True)
            .limit(1)
            .execute()
        )
        
        severity = 0.0
        has_alert = False
        if alert_response.data:
            severity = alert_response.data[0]["severity"]
            has_alert = True
        
        result.append({
            "patient_id": patient_id,
            "latest_vitals": {
                "hr": vitals.get("hr"),
                "o2sat": vitals.get("o2sat"),
                "temp": vitals.get("temp"),
                "sbp": vitals.get("sbp"),
                "resp": vitals.get("resp")
            },
            "severity": severity,
            "has_active_alert": has_alert
        })
    
    return result