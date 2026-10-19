from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .agents.fixer import fix_narration
from .config import settings
from .media import find_media
from .parser import parse_case
from .pipeline import generate_narrations
from .schemas import (
    CreateUserRequest,
    FixRequest,
    FixResponse,
    GenerateRequest,
    GenerateResponse,
    MediaRequest,
    MediaResponse,
    ParsedCase,
    ParseRequest,
    UserAccount,
)
from .supabase_db import (
    AuthError,
    SupabaseError,
    create_user,
    get_profile,
    get_user,
)

app = FastAPI(title="Generator Narasi Multi-Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    # Akses dari perangkat lain di LAN (rentang privat: 10.x, 192.168.x, 172.16–31.x)
    allow_origin_regex=(
        r"https?://(?:"
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}"
        r")(?::\d+)?"
    ),
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
        "supabase": settings.supabase_configured,
    }


async def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Login diperlukan.")
    try:
        return await get_user(authorization.split(" ", 1)[1].strip())
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


async def current_admin(user: dict = Depends(current_user)) -> dict:
    try:
        profile = await get_profile(user["id"])
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not profile or profile.get("role") != "admin":
        raise HTTPException(
            status_code=403, detail="Hanya admin yang dapat menambah pengguna."
        )
    return user


@app.post("/api/admin/users", response_model=UserAccount, status_code=201)
async def api_create_user(
    req: CreateUserRequest, _admin: dict = Depends(current_admin)
) -> UserAccount:
    try:
        return UserAccount(**await create_user(req))
    except SupabaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/parse", response_model=ParsedCase)
async def api_parse(req: ParseRequest, _user: dict = Depends(current_user)) -> ParsedCase:
    return await parse_case(req.teks)


@app.post("/api/generate", response_model=GenerateResponse)
async def api_generate(
    req: GenerateRequest, user: dict = Depends(current_user)
) -> GenerateResponse:
    try:
        return await generate_narrations(req, user)
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/fix", response_model=FixResponse)
async def api_fix(req: FixRequest, user: dict = Depends(current_user)) -> FixResponse:
    try:
        return await fix_narration(req, user)
    except SupabaseError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.post("/api/media", response_model=MediaResponse)
async def api_media(req: MediaRequest, _user: dict = Depends(current_user)) -> MediaResponse:
    return await find_media(req)
