import asyncio
import json
import os
from secrets import compare_digest

import grpc
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .core import DecisionRequest, decide
from . import decision_pb2, decision_pb2_grpc


app = FastAPI(title="Servicio de decisiones crediticias Laya")


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": "La solicitud contiene campos no válidos"})


@app.get("/health")
async def health():
    return {"status": "ok", "model": "laya", "max_len": int(os.getenv("LAYA_MAX_LEN", "8192"))}


@app.post("/v1/decide")
async def rest_decide(payload: DecisionRequest, request: Request):
    key = os.getenv("MODEL_API_KEY", "")
    if not key or not compare_digest(request.headers.get("authorization", ""), f"Bearer {key}"):
        raise HTTPException(401, "La clave de API del modelo no es válida")
    return await decide(payload)


class DecisionServicer(decision_pb2_grpc.DecisionServiceServicer):
    async def Decide(self, request, context):
        try:
            key = os.getenv("MODEL_API_KEY", "")
            metadata = dict(context.invocation_metadata())
            if not key or not compare_digest(metadata.get("authorization", ""), f"Bearer {key}"):
                await context.abort(grpc.StatusCode.UNAUTHENTICATED, "La clave de API del modelo no es válida")
            payload = DecisionRequest(
                company=request.company or None,
                state=request.state or None,
                rules=request.rules or None,
                history=request.history or None,
                instruction_decision=request.instruction_decision or None,
                instruction_rank=request.instruction_rank or None,
                output=request.output or "both",
                options=list(request.options) or None,
                rank_limits=list(request.rank_limits) or None,
            )
            result = await decide(payload)
            return decision_pb2.DecideResponse(model_output_json=json.dumps(result))
        except HTTPException as exc:
            code = grpc.StatusCode.INVALID_ARGUMENT if exc.status_code == 422 else grpc.StatusCode.UNAVAILABLE
            await context.abort(code, str(exc.detail))


async def main():
    server = grpc.aio.server()
    decision_pb2_grpc.add_DecisionServiceServicer_to_server(DecisionServicer(), server)
    server.add_insecure_port("0.0.0.0:50051")
    await server.start()
    config = uvicorn.Config(app, host="0.0.0.0", port=8000, log_level="info")
    api = uvicorn.Server(config)
    try:
        await api.serve()
    finally:
        await server.stop(5)


if __name__ == "__main__":
    asyncio.run(main())
