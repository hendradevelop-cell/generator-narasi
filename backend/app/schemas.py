from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BahanItem(BaseModel):
    id: str
    judul: str
    url: str = ""
    dipilih: bool = True


class RulesSet(BaseModel):
    dos: list[str] = Field(default_factory=list)
    donts: list[str] = Field(default_factory=list)


class AgentLog(BaseModel):
    lapisan: str
    agen: str
    aksi: str
    status: Literal["ok", "revisi", "catatan"] = "ok"
    detail: str = ""


class ParseRequest(BaseModel):
    teks: str


class ParsedCase(BaseModel):
    topik: str = ""
    headlines: list[str] = Field(default_factory=list)
    konteks: list[str] = Field(default_factory=list)
    bahan: list[BahanItem] = Field(default_factory=list)
    rules: RulesSet = Field(default_factory=RulesSet)
    mode: Literal["llm", "heuristik"] = "heuristik"
    log_agen: list[AgentLog] = Field(default_factory=list)


class GenerateRequest(BaseModel):
    topik: str
    headlines: list[str] = Field(default_factory=list)
    konteks: list[str] = Field(default_factory=list)
    bahan: list[BahanItem] = Field(default_factory=list)
    rules: RulesSet = Field(default_factory=RulesSet)
    durasi: float = 60
    durasi_unit: Literal["detik", "menit"] = "detik"
    brief_narasi: str = ""
    jumlah_varian: int = 3
    anti_duplikat: bool = True


class KeunikanInfo(BaseModel):
    unik: bool
    similaritas_tertinggi: float
    dibanding: str = ""
    catatan: str = ""


class KepatuhanInfo(BaseModel):
    lolos: bool
    pelanggaran: list[str] = Field(default_factory=list)
    peringatan: list[str] = Field(default_factory=list)


class NarrationVariant(BaseModel):
    id: str
    label: str
    teks: str
    jumlah_kata: int
    estimasi_durasi_detik: float
    selisih_persen: float
    status_durasi: Literal["sesuai", "melenceng"]
    keunikan: KeunikanInfo
    kepatuhan: KepatuhanInfo
    cek_fakta: KepatuhanInfo


class GenerateResponse(BaseModel):
    mode: Literal["llm", "mock"]
    target_detik: float
    target_kata_min: int
    target_kata_max: int
    varian: list[NarrationVariant]
    log_agen: list[AgentLog]


class FixRequest(GenerateRequest):
    id: str = ""
    teks: str
    label: str = ""
    variant_idx: int = 0
    teks_lain: list[str] = Field(default_factory=list)


class FixResponse(BaseModel):
    mode: Literal["llm", "mock"]
    berhasil: bool
    varian: NarrationVariant
    log_agen: list[AgentLog] = Field(default_factory=list)


class CreateUserRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    nama: str = ""
    role: Literal["user", "admin"] = "user"

    @field_validator("email")
    @classmethod
    def _validasi_email(cls, value: str) -> str:
        email = value.strip().lower()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise ValueError("Format email tidak valid.")
        return email

    @field_validator("nama")
    @classmethod
    def _rapikan_nama(cls, value: str) -> str:
        return value.strip()


class UserAccount(BaseModel):
    id: str
    email: str
    nama: str = ""
    role: Literal["user", "admin"]


class MediaRequest(BaseModel):
    topik: str = ""
    headline: str = ""
    teks: str = ""


class MediaItem(BaseModel):
    judul: str
    url: str
    info: str = ""
    thumb: str = ""


class MediaResponse(BaseModel):
    kueri_youtube: list[str] = Field(default_factory=list)
    kueri_gambar: list[str] = Field(default_factory=list)
    youtube: list[MediaItem] = Field(default_factory=list)
    gambar: list[MediaItem] = Field(default_factory=list)
    catatan: str = ""
