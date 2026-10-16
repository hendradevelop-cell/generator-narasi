from __future__ import annotations

import uuid

from .agents import compliance, editor, fact_checker, orchestrator, uniqueness, writer
from .agents.base import log as agent_log
from .config import settings
from .llm import LLMClient
from .schemas import AgentLog, GenerateRequest, GenerateResponse, KeunikanInfo, NarrationVariant
from .store import recent_narrations, save_narration


async def generate_narrations(req: GenerateRequest) -> GenerateResponse:
    client = LLMClient()
    logs: list[AgentLog] = []

    plan, plan_logs = orchestrator.plan(req)
    logs.extend(plan_logs)
    target_detik: float = plan["target_detik"]
    target_min: int = plan["target_kata_min"]
    target_max: int = plan["target_kata_max"]
    jumlah_varian: int = plan["jumlah_varian"]

    history = recent_narrations(200) if req.anti_duplikat else []
    if history:
        logs.append(
            agent_log(
                "L2",
                "Basis Riwayat",
                "Muat riwayat narasi",
                detail=f"{len(history)} narasi lama dimuat untuk pemeriksaan anti-duplikat.",
            )
        )

    accepted: list[tuple[str, str]] = []
    varian: list[NarrationVariant] = []
    max_attempts = 3 if client.available else 2

    for idx in range(jumlah_varian):
        label = writer.variant_label(idx)
        style = writer.STYLES[idx % len(writer.STYLES)]
        teks_final = ""
        fact = comp = uniq = None
        accepted_flag = False

        for attempt in range(max_attempts):
            if client.available:
                avoid = [t for _, t in accepted] + [t for _, t in history[:5]]
                draft = await writer.build_llm(req, client, idx, attempt, target_min, target_max, avoid)
                if not draft:
                    draft, _style = writer.build_template(req, idx, attempt, target_min, target_max)
            else:
                draft, _style = writer.build_template(req, idx, attempt, target_min, target_max)

            draft = editor.fit_duration(draft, target_min, target_max, style["fillers"])

            fact = fact_checker.check(draft, req)
            comp = await compliance.check(draft, req, client)
            uniq = uniqueness.check(draft, accepted, history)
            if not req.anti_duplikat:
                # Aturan opsional dimatikan: kemiripan tetap dihitung (informasi di badge),
                # tetapi tidak pernah menggugurkan varian.
                uniq = KeunikanInfo(
                    unik=True,
                    similaritas_tertinggi=uniq.similaritas_tertinggi,
                    dibanding=uniq.dibanding,
                    catatan=(
                        f"Aturan anti-duplikat nonaktif — kemiripan "
                        f"{uniq.similaritas_tertinggi:.0%} hanya sebagai informasi."
                    ),
                )
            teks_final = draft

            if fact.lolos and comp.lolos and uniq.unik:
                accepted_flag = True
                logs.append(
                    agent_log(
                        "L4",
                        "Agen Verifikator",
                        f"{label}: verifikasi lolos",
                        detail=(
                            f"Fakta angka ✓, kepatuhan rules ✓, keunikan "
                            f"{uniq.similaritas_tertinggi:.0%} < ambang {settings.dup_threshold:.0%}."
                        ),
                    )
                )
                break

            reasons: list[str] = []
            if not fact.lolos:
                reasons.append("angka di luar sumber")
            if not comp.lolos:
                reasons.append("pelanggaran don'ts")
            if not uniq.unik:
                reasons.append(f"mirip {uniq.similaritas_tertinggi:.0%}")
            logs.append(
                agent_log(
                    "L4",
                    "Agen Verifikator",
                    f"{label}: revisi putaran {attempt + 1}",
                    status="revisi",
                    detail="; ".join(reasons) or "tidak memenuhi syarat",
                )
            )

        if not accepted_flag and uniq is not None and not uniq.unik:
            logs.append(
                agent_log(
                    "L3",
                    "Agen Penulis",
                    f"{label}: dibatalkan karena duplikat",
                    status="catatan",
                    detail=(
                        f"Keunikan {uniq.similaritas_tertinggi:.0%} ≥ ambang "
                        f"{settings.dup_threshold:.0%}; varian tidak ditampilkan agar tidak ada narasi yang sama."
                    ),
                )
            )
            continue

        words, est, selisih, status_durasi = editor.metrics(teks_final, target_detik)
        if accepted_flag:
            logs.append(
                agent_log(
                    "L5",
                    "Agen Penyunting",
                    f"{label}: finalisasi",
                    detail=f"{words} kata, estimasi {est:.0f} detik ({selisih:+.0f}% dari target).",
                )
            )
        else:
            logs.append(
                agent_log(
                    "L5",
                    "Agen Penyunting",
                    f"{label}: ditampilkan dengan tanda tinjauan",
                    status="catatan",
                    detail="Verifikasi belum sepenuhnya lolos setelah batas revisi; perlu tinjauan manual.",
                )
            )

        accepted.append((label, teks_final))
        varian.append(
            NarrationVariant(
                id=uuid.uuid4().hex[:8],
                label=label,
                teks=teks_final,
                jumlah_kata=words,
                estimasi_durasi_detik=est,
                selisih_persen=selisih,
                status_durasi=status_durasi,
                keunikan=uniq,
                kepatuhan=comp,
                cek_fakta=fact,
            )
        )
        save_narration(req.topik, teks_final)

    logs.append(
        agent_log(
            "L5",
            "Agen Penyunting",
            "Rakit hasil akhir",
            detail=(
                f"{len(varian)} varian lolos dan disimpan ke basis riwayat anti-duplikat."
                if req.anti_duplikat
                else f"{len(varian)} varian dihasilkan (aturan anti-duplikat nonaktif) dan tetap disimpan ke riwayat."
            ),
        )
    )

    return GenerateResponse(
        mode="llm" if client.available else "mock",
        target_detik=target_detik,
        target_kata_min=target_min,
        target_kata_max=target_max,
        varian=varian,
        log_agen=logs,
    )
