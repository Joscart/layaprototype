import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from xml.etree.ElementTree import Element, SubElement, tostring

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company: str | None = None
    state: str | None = None
    rules: str | None = None
    history: str | None = None
    instruction_decision: str | None = None
    instruction_rank: str | None = None
    output: str = "both"
    options: list[str] | None = None
    rank_limits: list[str] | None = None


WEBUI_URL = os.getenv("WEBUI_URL", "http://localhost:4321")
INTERNAL_API_TOKEN = os.getenv("INTERNAL_API_TOKEN", "")
MAX_LEN = int(os.getenv("LAYA_MAX_LEN", "8192"))
HEAD_MAX_LEN = int(os.getenv("LAYA_HEAD_MAX_LEN", "512"))
_router = None
_executor = ThreadPoolExecutor(max_workers=1)
logger = logging.getLogger(__name__)


def validate_text(name: str, value: str | None, limit: int):
    if value is not None and len(value) > limit:
        labels = {"state": "estado", "rules": "reglas", "history": "historial", "instruction_decision": "instrucción de decisión", "instruction_rank": "instrucción de rango"}
        raise HTTPException(422, f"{labels.get(name, name)} supera el límite de {limit} caracteres")


def validate_request(req: DecisionRequest):
    for name, limit in (("state", 20000), ("rules", 5000), ("history", 15000),
                        ("instruction_decision", 250), ("instruction_rank", 250)):
        validate_text(name, getattr(req, name), limit)
    if req.output not in ("decision", "rank", "both"):
        raise HTTPException(422, "output debe ser decision, rank o both")
    if req.state is None and req.history is None:
        raise HTTPException(422, "Se requiere state o history")
    if req.options is not None and (len(req.options) < 2 or len(req.options) > 64 or any(not x.strip() for x in req.options) or len(set(req.options)) != len(req.options)):
        raise HTTPException(422, "options debe contener entre 2 y 64 etiquetas únicas y no vacías")
    if req.rank_limits is not None and (len(req.rank_limits) < 2 or len(req.rank_limits) > 32 or any(not x.strip() for x in req.rank_limits)):
        raise HTTPException(422, "rank_limits debe contener entre 2 y 32 niveles no vacíos")


async def webui_get_defaults(company: str | None):
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            response = await client.get(f"{WEBUI_URL}/api/internal/defaults", params={"company": company or "default"}, headers={"x-internal-token": INTERNAL_API_TOKEN})
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as exc:
            logger.exception("No se pudieron obtener los valores predeterminados de Webui")
            raise HTTPException(503, "No se pudieron obtener los valores predeterminados de Webui") from exc


async def send_telemetry(payload: dict):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(f"{WEBUI_URL}/api/internal/traffic", json=payload, headers={"x-internal-token": INTERNAL_API_TOKEN})
    except httpx.HTTPError:
        pass


def build_state(rules: str, history: str) -> str:
    root = Element("estado_crediticio")
    SubElement(root, "reglas").text = rules
    SubElement(root, "historial").text = history
    return tostring(root, encoding="unicode")


def get_router():
    global _router
    if _router is None:
        from laya import Router
        _router = Router()
    return _router


def infer(state: str, questions: dict):
    return get_router().predict(state, questions, model="multilingual", lang="es", max_len=MAX_LEN, head_max_len=HEAD_MAX_LEN)


def describe_label(label: str) -> str:
    return {"revision_manual": "revisión manual", "muy_bajo": "muy bajo", "muy_alto": "muy alto"}.get(label, label.replace("_", " "))


async def decide(req: DecisionRequest):
    started = time.perf_counter()
    company = req.company or "default"
    result = None
    error = None
    status = 200
    defaults = None
    try:
        defaults = await webui_get_defaults(company)
        validate_request(req)
        rules = req.rules if req.rules is not None else defaults["rules"]
        validate_text("rules", rules, 5000)
        instruction_decision = req.instruction_decision or defaults["instruction_decision"]
        instruction_rank = req.instruction_rank or defaults["instruction_rank"]
        validate_text("instruction_decision", instruction_decision, 250)
        validate_text("instruction_rank", instruction_rank, 250)
        options = req.options if req.options is not None else defaults["options"]
        ranks = req.rank_limits if req.rank_limits is not None else defaults["rank_limits"]
        if req.output in ("decision", "both") and len(options) < 2:
            raise HTTPException(422, "La decisión requiere al menos dos opciones")
        if req.output in ("rank", "both") and not 2 <= len(ranks) <= 32:
            raise HTTPException(422, "El rango requiere entre 2 y 32 niveles")
        if req.state is not None:
            state = req.state
        else:
            state = build_state(rules, req.history or "")
            validate_text("state", state, 20000)
        questions = {}
        if req.output in ("decision", "both"):
            questions["decision"] = {"type": "choice", "instructions": instruction_decision, "criteria": {label: describe_label(label) for label in options}}
        if req.output in ("rank", "both"):
            questions["rank"] = {"type": "score", "instructions": instruction_rank, "criteria": [describe_label(label) for label in ranks]}
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_executor, infer, state, questions)
        return result
    except HTTPException as exc:
        status, error = exc.status_code, str(exc.detail)
        raise
    except Exception as exc:
        logger.exception("Falló la inferencia de Laya")
        status, error = 503, "No se pudo ejecutar el modelo Laya"
        raise HTTPException(status, error) from exc
    finally:
        if defaults is not None:
            await send_telemetry({"company": defaults["company"], "mode": req.output, "status": status, "latency_ms": round((time.perf_counter() - started) * 1000, 2), "history": req.history, "model_output": result, "error": error, "input_tokens": (result or {}).get("usage", {}).get("input_tokens", 0)})

