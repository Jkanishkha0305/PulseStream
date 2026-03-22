from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pathlib import Path
import json

router = APIRouter()

DEFAULT_MSG = {"message": "Run 'make benchmark' first"}


@router.get("/benchmark")
async def get_benchmark_results():
    results_path = Path(__file__).parent.parent.parent / "benchmark_results.json"
    if not results_path.exists() or results_path.stat().st_size == 0:
        return JSONResponse(content=DEFAULT_MSG, status_code=200)

    with open(results_path) as f:
        raw = f.read().strip()

    if not raw or raw == "{}":
        return JSONResponse(content=DEFAULT_MSG, status_code=200)

    data = json.loads(raw)
    return data
