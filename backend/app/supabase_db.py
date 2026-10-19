from __future__ import annotations

import httpx

from .config import settings
from .schemas import CreateUserRequest, GenerateRequest, NarrationVariant
from .textutil import normalize_text

_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class SupabaseError(RuntimeError):
    pass


class AuthError(SupabaseError):
    pass


def _require_config() -> None:
    if not settings.supabase_configured:
        raise SupabaseError(
            "Supabase belum dikonfigurasi. Isi SUPABASE_URL, SUPABASE_ANON_KEY, dan "
            "SUPABASE_SERVICE_ROLE_KEY di backend/.env."
        )


def _service_headers() -> dict[str, str]:
    headers = {
        "apikey": settings.supabase_service_key,
        "Content-Type": "application/json",
    }
    # Kunci legacy (JWT, diawali "eyJ") juga wajib dikirim sebagai Bearer.
    # Kunci baru (sb_secret_...) hanya boleh lewat header apikey.
    if settings.supabase_service_key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {settings.supabase_service_key}"
    return headers


def _db_error(action: str, response: httpx.Response) -> SupabaseError:
    return SupabaseError(f"{action} ({response.status_code}): {response.text[:200]}")


async def get_user(token: str) -> dict:
    """Validasi access token Supabase dan kembalikan identitas user."""
    _require_config()
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {token}",
            },
        )
    if response.status_code == 401:
        raise AuthError("Sesi login tidak valid atau kedaluwarsa.")
    if response.status_code >= 400:
        raise _db_error("Gagal memvalidasi sesi login", response)
    data = response.json()
    return {"id": data["id"], "email": data.get("email") or ""}


async def get_profile(user_id: str) -> dict | None:
    """Ambil profil (termasuk peran) milik user dari tabel profiles."""
    _require_config()
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers=_service_headers()
    ) as client:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/profiles",
            params={
                "id": f"eq.{user_id}",
                "select": "id,email,nama,role",
                "limit": "1",
            },
        )
    if response.status_code >= 400:
        raise _db_error("Gagal memuat profil pengguna", response)
    rows = response.json()
    return rows[0] if rows else None


def _create_user_error(response: httpx.Response) -> str:
    text = response.text.lower()
    if "already" in text and ("registered" in text or "exists" in text):
        return "Email sudah terdaftar."
    if "password" in text and (
        "characters" in text or "weak" in text or "should be" in text
    ):
        return "Password minimal 6 karakter."
    if "rate limit" in text:
        return "Terlalu banyak permintaan. Coba lagi beberapa saat."
    return f"Gagal membuat akun ({response.status_code}): {response.text[:200]}"


async def create_user(req: CreateUserRequest) -> dict:
    """Buat akun via Admin API Supabase (langsung terkonfirmasi) + profil perannya."""
    _require_config()
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers=_service_headers()
    ) as client:
        response = await client.post(
            f"{settings.supabase_url}/auth/v1/admin/users",
            json={
                "email": req.email,
                "password": req.password,
                "email_confirm": True,
                "user_metadata": {"nama": req.nama},
            },
        )
        if response.status_code >= 400:
            raise SupabaseError(_create_user_error(response))
        account = response.json()
        user_id = account["id"]

        profile = {
            "id": user_id,
            "email": req.email,
            "nama": req.nama,
            "role": req.role,
        }
        saved = await client.post(
            f"{settings.supabase_url}/rest/v1/profiles",
            params={"on_conflict": "id"},
            headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            json=profile,
        )
        if saved.status_code >= 400:
            # Hindari akun tanpa profil: batalkan pembuatan akun bila profil gagal.
            await client.delete(
                f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"
            )
            raise SupabaseError(
                "Akun gagal disiapkan profilnya. Pastikan migrasi "
                "supabase/migrations/0001_init.sql sudah dijalankan. "
                f"({saved.text[:160]})"
            )
    rows = saved.json() if saved.content else []
    data = rows[0] if rows else profile
    return {
        "id": data.get("id", user_id),
        "email": data.get("email") or req.email,
        "nama": data.get("nama") or "",
        "role": data.get("role") or req.role,
    }


async def recent_narrations(limit: int = 200) -> list[tuple[str, str]]:
    """Riwayat narasi global (semua user) untuk pemeriksaan anti-duplikat."""
    _require_config()
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers=_service_headers()
    ) as client:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/narrations",
            params={
                "select": "topik,teks",
                "order": "created_at.desc",
                "limit": str(limit),
            },
        )
    if response.status_code >= 400:
        raise _db_error("Gagal memuat riwayat narasi", response)
    return [
        (row.get("topik") or "", row.get("teks") or "")
        for row in response.json()
    ]


async def save_generation(
    user_id: str,
    req: GenerateRequest,
    mode: str,
    varian: list[NarrationVariant],
) -> str:
    """Simpan satu run generate (beserta seluruh varian) dan kembalikan id-nya."""
    _require_config()
    durasi_detik = req.durasi * 60 if req.durasi_unit == "menit" else req.durasi
    generation = {
        "user_id": user_id,
        "topik": req.topik,
        "headline": (req.headlines[0] if req.headlines else "") or "",
        "brief": req.brief_narasi,
        "durasi_detik": durasi_detik,
        "jumlah_varian_diminta": req.jumlah_varian,
        "jumlah_varian_hasil": len(varian),
        "anti_duplikat": req.anti_duplikat,
        "mode": mode,
        "payload": req.model_dump(mode="json"),
    }
    headers = {**_service_headers(), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=headers) as client:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/generations", json=generation
        )
        if response.status_code >= 400:
            raise _db_error("Gagal menyimpan riwayat generate", response)
        generation_id = response.json()[0]["id"]

        if varian:
            rows = [
                {
                    "generation_id": generation_id,
                    "user_id": user_id,
                    "topik": req.topik,
                    "label": item.label,
                    "teks": item.teks,
                    "teks_normal": normalize_text(item.teks),
                }
                for item in varian
            ]
            narrations = await client.post(
                f"{settings.supabase_url}/rest/v1/narrations", json=rows
            )
            if narrations.status_code >= 400:
                raise _db_error(
                    "Riwayat generate tersimpan, tetapi varian gagal disimpan",
                    narrations,
                )
    return generation_id


async def save_narration(user_id: str, topik: str, label: str, teks: str) -> None:
    """Simpan narasi hasil perbaikan (tanpa generation baru) ke riwayat anti-duplikat."""
    _require_config()
    async with httpx.AsyncClient(
        timeout=_TIMEOUT, headers=_service_headers()
    ) as client:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/narrations",
            json={
                "user_id": user_id,
                "topik": topik,
                "label": label,
                "teks": teks,
                "teks_normal": normalize_text(teks),
            },
        )
    if response.status_code >= 400:
        raise _db_error("Gagal menyimpan narasi hasil perbaikan", response)
