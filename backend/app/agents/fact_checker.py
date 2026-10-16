from __future__ import annotations

from ..schemas import GenerateRequest, KepatuhanInfo
from ..textutil import canonical_numbers, numbers_match


def _source_text(req: GenerateRequest) -> str:
    parts = [req.topik, req.brief_narasi, *req.headlines, *req.konteks]
    parts += [f"{b.judul} {b.url}" for b in req.bahan if b.dipilih]
    parts += [*req.rules.dos, *req.rules.donts]
    return "\n".join(p for p in parts if p)


def check(draft: str, req: GenerateRequest) -> KepatuhanInfo:
    """Setiap angka di narasi wajib ada di sumber (topik/headline/konteks/bahan/rules/brief).
    Angka di luar sumber dianggap potensi halusinasi."""
    src = [v for v, _ in canonical_numbers(_source_text(req))]
    violations: list[str] = []
    for value, raw in canonical_numbers(draft):
        if not any(numbers_match(value, s) for s in src):
            violations.append(f'Angka "{raw}" tidak ditemukan di sumber (potensi halusinasi).')
    return KepatuhanInfo(lolos=not violations, pelanggaran=violations)
