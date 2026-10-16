from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .agents.fixer import fix_narration
from .config import settings
from .media import find_media
from .parser import parse_case
from .pipeline import generate_narrations
from .schemas import (
    FixRequest,
    FixResponse,
    GenerateRequest,
    GenerateResponse,
    MediaRequest,
    MediaResponse,
    ParsedCase,
    ParseRequest,
)

app = FastAPI(title="Generator Narasi Multi-Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    return {
        "status": "ok",
        "mode": settings.mode,
        "llm_model": settings.llm_model if settings.llm_available() else None,
        "words_per_minute": settings.words_per_minute,
        "dup_threshold": settings.dup_threshold,
    }


@app.post("/api/parse", response_model=ParsedCase)
async def api_parse(req: ParseRequest) -> ParsedCase:
    return await parse_case(req.teks)


@app.post("/api/generate", response_model=GenerateResponse)
async def api_generate(req: GenerateRequest) -> GenerateResponse:
    return await generate_narrations(req)


@app.post("/api/fix", response_model=FixResponse)
async def api_fix(req: FixRequest) -> FixResponse:
    return await fix_narration(req)


@app.post("/api/media", response_model=MediaResponse)
async def api_media(req: MediaRequest) -> MediaResponse:
    return await find_media(req)
