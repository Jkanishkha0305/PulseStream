from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Any, cast

router = APIRouter()


class PatientSummaryResponse(BaseModel):
    patient_id: str
    latest_vitals: Optional[dict[str, Any]] = None
    severity: Optional[float] = None
    has_active_alert: bool


class VitalReadingResponse(BaseModel):
    patient_id: str
    timestamp: float
    hr: Optional[float] = None
    o2sat: Optional[float] = None
    temp: Optional[float] = None
    sbp: Optional[float] = None
    resp: Optional[float] = None
    anomaly_detected: bool = False
    anomaly_severity: Optional[float] = None
    anomaly_tier: Optional[int] = None
    anomaly_flags: list[str] = []


def _fetch(tablename: str, **kwargs) -> list[dict[str, Any]]:
    from db.supabase_client import get_supabase
    supabase = get_supabase()
    q = supabase.table(tablename).select("*")
    for k, v in kwargs.items():
        if k == "order":
            continue
        q = q.eq(k, v)
    raw: Any = q.execute().data
    return cast(list[dict[str, Any]], raw) if raw else []


@router.get("/patients", response_model=list[PatientSummaryResponse])
async def list_patients():
    all_readings = _fetch("vital_readings", order="timestamp.desc")

    seen: set[str] = set()
    pids: list[str] = []
    for r in all_readings:
        pid = str(r.get("patient_id", ""))
        if pid and pid not in seen:
            seen.add(pid)
            pids.append(pid)

    results: list[PatientSummaryResponse] = []
    for pid in pids:
        readings = _fetch("vital_readings", patient_id=pid, order="timestamp.desc")
        latest = readings[0] if readings else {}

        alerts = _fetch("alerts", patient_id=pid, status="pending", order="triggered_at.desc")

        has_active = bool(alerts)
        severity: Optional[float] = float(alerts[0]["severity"]) if alerts else None

        latest_vitals: Optional[dict[str, Any]] = None
        if latest:
            latest_vitals = {
                "hr": latest.get("hr"),
                "o2sat": latest.get("o2sat"),
                "temp": latest.get("temp"),
                "sbp": latest.get("sbp"),
                "resp": latest.get("resp"),
            }

        results.append(
            PatientSummaryResponse(
                patient_id=pid,
                latest_vitals=latest_vitals,
                severity=severity,
                has_active_alert=has_active,
            )
        )

    return results


@router.get("/patients/{patient_id}", response_model=list[VitalReadingResponse])
async def get_patient(patient_id: str):
    readings = _fetch("vital_readings", patient_id=patient_id, order="timestamp.desc")

    if not readings:
        raise HTTPException(status_code=404, detail="Patient not found")

    limited = readings[:30]
    return [VitalReadingResponse(
        patient_id=r.get("patient_id", patient_id),
        timestamp=float(r.get("timestamp", 0)),
        hr=r.get("hr"),
        o2sat=r.get("o2sat"),
        temp=r.get("temp"),
        sbp=r.get("sbp"),
        resp=r.get("resp"),
        anomaly_detected=bool(r.get("anomaly_detected", False)),
        anomaly_severity=r.get("anomaly_severity"),
        anomaly_tier=r.get("anomaly_tier"),
        anomaly_flags=r.get("anomaly_flags", []) or [],
    ) for r in limited]
