from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Any, cast
from datetime import datetime, timezone

router = APIRouter()


class AlertResponse(BaseModel):
    id: str
    patient_id: str
    vital_flags: list[str]
    severity: float
    status: str
    tier: Optional[int] = None
    triggered_at: str
    acknowledged_at: Optional[str] = None
    notes: Optional[str] = None


class UpdateAlertRequest(BaseModel):
    status: str
    notes: Optional[str] = None


def _fetch_alerts(
    status: Optional[str] = None,
    patient_id: Optional[str] = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    from db.supabase_client import get_supabase
    supabase = get_supabase()
    q = supabase.table("alerts").select("*")
    if status:
        q = q.eq("status", status)
    if patient_id:
        q = q.eq("patient_id", patient_id)
    data: Any = q.order("triggered_at", desc=True).limit(limit).execute().data
    return list(data) if data else []


@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    status: Optional[str] = Query(None),
    patient_id: Optional[str] = Query(None),
    limit: int = Query(50),
):
    data = _fetch_alerts(status=status, patient_id=patient_id, limit=limit)
    return [AlertResponse(
        id=r["id"],
        patient_id=r["patient_id"],
        vital_flags=r.get("vital_flags") or [],
        severity=float(r.get("severity", 0)),
        status=r.get("status", "pending"),
        tier=r.get("tier"),
        triggered_at=r.get("triggered_at", ""),
        acknowledged_at=r.get("acknowledged_at"),
        notes=r.get("notes"),
    ) for r in data]


@router.patch("/alerts/{alert_id}", response_model=AlertResponse)
async def update_alert(alert_id: str, body: UpdateAlertRequest):
    from db.supabase_client import get_supabase

    supabase = get_supabase()
    update: dict[str, Any] = {"status": body.status}
    if body.notes is not None:
        update["notes"] = body.notes
    if body.status == "acknowledged":
        update["acknowledged_at"] = datetime.now(timezone.utc).isoformat()

    resp = supabase.table("alerts").update(update).eq("id", alert_id).execute()
    raw: Any = resp.data
    data: list[dict[str, Any]] = cast(list[dict[str, Any]], raw)
    if not data:
        raise HTTPException(status_code=404, detail="Alert not found")
    r = data[0]
    return AlertResponse(
        id=r["id"],
        patient_id=r["patient_id"],
        vital_flags=r.get("vital_flags") or [],
        severity=float(r.get("severity", 0)),
        status=r.get("status", "pending"),
        tier=r.get("tier"),
        triggered_at=r.get("triggered_at", ""),
        acknowledged_at=r.get("acknowledged_at"),
        notes=r.get("notes"),
    )
