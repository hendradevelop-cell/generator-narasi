from __future__ import annotations

from ..config import settings
from ..schemas import AgentLog, GenerateRequest


def plan(req: GenerateRequest) -> tuple[dict, list[AgentLog]]:
    detik = req.durasi * 60 if req.durasi_unit == "menit" else req.durasi
    detik = max(5.0, float(detik))
    target_kata = round(detik * settings.words_per_minute / 60)
    min_kata = max(10, round(target_kata * 0.85))
    max_kata = max(min_kata + 5, round(target_kata * 1.15))
    jumlah_varian = max(1, min(10, req.jumlah_varian))
    bahan_dipilih = [b for b in req.bahan if b.dipilih]

    plan_data = {
        "target_detik": detik,
        "target_kata_min": min_kata,
        "target_kata_max": max_kata,
        "jumlah_varian": jumlah_varian,
        "bahan_dipilih": bahan_dipilih,
    }
    logs = [
        AgentLog(
            lapisan="L0",
            agen="Orkestrator",
            aksi="Susun rencana produksi",
            detail=(
                f"Target {detik:.0f} detik ≈ {min_kata}-{max_kata} kata "
                f"({settings.words_per_minute:.0f} kata/menit). {jumlah_varian} varian, "
                f"{len(bahan_dipilih)} bahan dipilih. Aturan anti-duplikat "
                f"{'aktif' if req.anti_duplikat else 'nonaktif'}."
            ),
        ),
        AgentLog(
            lapisan="L0",
            agen="Orkestrator",
            aksi="Tentukan alur segmen",
            detail="Pembuka → fakta utama → rincian → penutup.",
        ),
    ]
    return plan_data, logs
