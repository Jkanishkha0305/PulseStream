import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from dotenv import load_dotenv

from db.supabase_client import get_supabase
from pipeline.simulator import StreamSimulator
from pipeline.buffer import PatientBuffer
from pipeline.detector import AnomalyDetector
from pipeline.optimizer import warmup

# Load .env from the directory this file lives in, regardless of CWD
load_dotenv(Path(__file__).parent / ".env")

DATA_DIR = os.getenv("DATA_DIR", "/tmp/pulsestream/data")
WINDOW_SIZE = int(os.getenv("WINDOW_SIZE", "30"))
TIER1_SEVERITY_ESCALATION = float(os.getenv("TIER1_SEVERITY_ESCALATION", "0.5"))
TIER2_MIN_READINGS = int(os.getenv("TIER2_MIN_READINGS", "10"))


async def pipeline_loop(sim: StreamSimulator):
    supabase = get_supabase()
    buf: PatientBuffer = PatientBuffer(window_size=WINDOW_SIZE)
    det: AnomalyDetector = AnomalyDetector()
    patient_ids = sim.get_all_patient_ids()

    if not patient_ids:
        print("[pipeline] No patients loaded. Pipeline will retry after DATA_DIR becomes available.")
        await asyncio.sleep(5)
        patient_ids = sim.get_all_patient_ids()

    print(f"[pipeline] Starting with {len(patient_ids)} patients")

    while True:
        try:
            for pid in patient_ids:
                async for reading in sim.stream(pid, delay=0):
                    ts = reading["timestamp"]
                    vitals = reading["vitals"]

                    buf.push(pid, vitals)
                    window = buf.get_window(pid)

                    if window.size == 0:
                        continue

                    tier1 = det.detect_tier1(pid, window)

                    tier_result = tier1
                    if tier1 and tier1.get("severity", 0) > TIER1_SEVERITY_ESCALATION:
                        tier2 = det.detect_tier2(pid, window)
                        if tier2:
                            tier_result = tier2

                    vital_reading = {
                        "patient_id": pid,
                        "timestamp": ts,
                        "hr": vitals.get("hr"),
                        "o2sat": vitals.get("o2sat"),
                        "temp": vitals.get("temp"),
                        "sbp": vitals.get("sbp"),
                        "resp": vitals.get("resp"),
                        "anomaly_flags": tier_result.get("flags", []) if tier_result else [],
                        "anomaly_detected": tier_result is not None,
                        "anomaly_severity": tier_result.get("severity") if tier_result else None,
                        "anomaly_tier": tier_result.get("tier") if tier_result else None,
                    }

                    try:
                        supabase.table("vital_readings").insert(vital_reading).execute()
                    except Exception as e:
                        print(f"[pipeline] Failed to insert vital reading for {pid}: {e}")

                    if tier_result and tier_result.get("severity", 0) > 0.5:
                        alert = {
                            "patient_id": pid,
                            "timestamp": ts,
                            "vital_flags": tier_result.get("flags", []),
                            "severity": tier_result.get("severity", 0),
                            "tier": tier_result.get("tier", 1),
                            "status": "pending",
                            # Alerts should reflect when the system raised them, not the ICU
                            # elapsed-hour timestamp attached to the patient reading.
                            "triggered_at": datetime.now(timezone.utc).isoformat(),
                        }
                        try:
                            supabase.table("alerts").insert(alert).execute()
                        except Exception as e:
                            print(f"[pipeline] Failed to insert alert for {pid}: {e}")

        except Exception as e:
            print(f"[pipeline] Error in pipeline loop: {e}")

        await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(app: FastAPI):
    warmup()
    sim = StreamSimulator(data_dir=DATA_DIR, num_patients=int(os.getenv("N_PATIENTS", "10")))
    sim.load_all_patients()
    asyncio.create_task(pipeline_loop(sim))
    yield


app = FastAPI(
    title="PulseStream API",
    description="Real-Time ICU Patient Anomaly Detection Pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from api.routes import patients, alerts, benchmark

app.include_router(patients.router, prefix="/api", tags=["patients"])
app.include_router(alerts.router, prefix="/api", tags=["alerts"])
app.include_router(benchmark.router, prefix="/api", tags=["benchmark"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "PulseStream API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
