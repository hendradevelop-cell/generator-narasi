from __future__ import annotations

import re
import uuid

from ..llm import LLMClient
from ..schemas import AgentLog, FixRequest, FixResponse, NarrationVariant
from ..store import recent_narrations, save_narration
from ..textutil import normalize_text, split_sentences
from . import compliance, editor, fact_checker, orchestrator, uniqueness, writer

FIX_SYSTEM = (
    "Anda Agen Penyunting (L5). Tulis ULANG naskah narasi berita berbahasa Indonesia agar "
    "memenuhi seluruh Do's dan bebas dari pelanggaran Don'ts yang dilampirkan. "
    "ATURAN KETAT:\n"
    "- Pertahankan seluruh fakta dan angka persis seperti sumber; dilarang menambah angka baru.\n"
    "- Panjang naskah harus mendekati rentang kata yang diminta dan tidak berubah jauh.\n"
    "- Ubah struktur kalimat dan pembuka agar berbeda dari naskah asal.\n"
    'Kembalikan HANYA JSON: {"teks": string}.'
)

SURGERY_RE = re.compile(r'kalimat: "([^"]+)"')


def _violated_sentences(violations: list[str]) -> list[str]:
    out: list[str] = []
    for item in violations:
        m = SURGERY_RE.search(item)
        if m:
            out.append(m.group(1))
    return out


def _surgery(text: str, violations: list[str]) -> tuple[str, int]:
    targets = {re.sub(r"\s+", " ", s).strip().lower() for s in _violated_sentences(violations)}
    if not targets:
        return text, 0
    removed = 0
    paras: list[str] = []
    for para in text.split("\n\n"):
        kept: list[str] = []
        for sentence in split_sentences(para):
            if re.sub(r"\s+", " ", sentence).strip().lower() in targets:
                removed += 1
            else:
                kept.append(sentence)
        if kept:
            paras.append(" ".join(kept))
    return ("\n\n".join(paras), removed) if removed else (text, 0)


async def _llm_rewrite(
    client: LLMClient,
    fx: FixRequest,
    temuan: list[str],
    target_min: int,
    target_max: int,
) -> str | None:
    konteks_txt = "\n".join(f"- {k}" for k in fx.konteks) or "- (tidak ada)"
    dos_txt = "\n".join(f"- {d}" for d in fx.rules.dos) or "- (tidak ada)"
    donts_txt = "\n".join(f"- {d}" for d in fx.rules.donts) or "- (tidak ada)"
    temuan_txt = "\n".join(f"- {t}" for t in temuan) or "- (tidak ada temuan eksplisit)"
    user = (
        f"TOPIK: {fx.topik}\n\n"
        f"KONTEKS SUMBER (jangan tambah angka di luar ini):\n{konteks_txt}\n\n"
        f"ATURAN DO'S:\n{dos_txt}\n\n"
        f"ATURAN DON'TS:\n{donts_txt}\n\n"
        f"TEMUAN PADA NASKAH ASAL YANG WAJIB DIPERBAIKI:\n{temuan_txt}\n\n"
        f"NASKAH ASAL:\n{fx.teks}\n\n"
        f"TARGET KATA: {target_min}-{target_max} kata."
    )
    data = await client.chat_json(FIX_SYSTEM, user, temperature=0.5)
    teks = str((data or {}).get("teks") or "").strip()
    return teks or None


async def fix_narration(fx: FixRequest) -> FixResponse:
    client = LLMClient()
    logs: list[AgentLog] = []

    plan, _ = orchestrator.plan(fx)
    target_detik: float = plan["target_detik"]
    target_min: int = plan["target_kata_min"]
    target_max: int = plan["target_kata_max"]
    style = writer.STYLES[fx.variant_idx % len(writer.STYLES)]

    # Naskah asal dikecualikan dari riwayat: varian ini memang sedang ditulis ulang,
    # bukan dibandingkan dengan dirinya sendiri.
    norm_asal = normalize_text(fx.teks)
    history = [
        (topik, teks)
        for topik, teks in recent_narrations(200)
        if normalize_text(teks) != norm_asal
    ]
    others = [
        ("varian lain", teks)
        for teks in fx.teks_lain
        if normalize_text(teks) != norm_asal
    ]

    base_comp = await compliance.check(fx.teks, fx, client)
    temuan = [*base_comp.pelanggaran, *base_comp.peringatan]

    logs.append(
        AgentLog(
            lapisan="L0",
            agen="Orkestrator",
            aksi="Mulai perbaikan narasi",
            detail=(
                f"{fx.label or 'Varian'}: target perbaikan {len(base_comp.pelanggaran)} pelanggaran "
                f"dan {len(base_comp.peringatan)} peringatan rules. Target durasi tetap "
                f"{target_detik:.0f} detik ({target_min}-{target_max} kata)."
            ),
        )
    )
    if history:
        logs.append(
            AgentLog(
                lapisan="L2",
                agen="Basis Riwayat",
                aksi="Muat riwayat anti-duplikat",
                detail=(
                    f"{len(history)} narasi lama dimuat; naskah asal dikecualikan agar tidak "
                    "dianggap duplikat dengan dirinya sendiri."
                ),
            )
        )

    candidates: list[tuple[str, str]] = []
    if client.available:
        llm_text = await _llm_rewrite(client, fx, temuan, target_min, target_max)
        if llm_text:
            candidates.append(("llm", editor.fit_duration(llm_text, target_min, target_max, style["fillers"])))
            logs.append(
                AgentLog(
                    lapisan="L5",
                    agen="Agen Penyunting",
                    aksi="Tulis ulang naskah (LLM)",
                    detail="Naskah asal ditulis ulang mengikuti daftar temuan rules.",
                )
            )
    for attempt in (1, 2, 3):
        cand, _ = writer.build_template(fx, fx.variant_idx, attempt, target_min, target_max)
        candidates.append(
            (f"template putaran {attempt}", editor.fit_duration(cand, target_min, target_max, style["fillers"]))
        )
    if not client.available:
        logs.append(
            AgentLog(
                lapisan="L5",
                agen="Agen Penyunting",
                aksi="Rakit ulang naskah (mode offline)",
                detail=f"{len(candidates)} susunan alternatif dibangun dari template varian.",
            )
        )

    best: tuple[tuple, str, str, object, object, object] | None = None

    async def evaluate(sumber: str, teks: str) -> tuple:
        fact = fact_checker.check(teks, fx)
        comp = await compliance.check(teks, fx, client)
        uniq = uniqueness.check(teks, others, history)
        score = (
            comp.lolos and fact.lolos,
            comp.lolos,
            fact.lolos,
            uniq.unik,
            -len(comp.pelanggaran),
            -uniq.similaritas_tertinggi,
        )
        return score, sumber, teks, fact, comp, uniq

    for sumber, cand in candidates:
        result = await evaluate(sumber, cand)
        if best is None or result[0] > best[0]:
            best = result
        if result[0][0]:
            break

    if best is not None and not best[0][0]:
        comp = best[4]
        surg_text, removed = _surgery(best[2], comp.pelanggaran)
        if removed:
            surg_text = editor.fit_duration(surg_text, target_min, target_max, style["fillers"])
            surg = await evaluate(f"surgery ({removed} kalimat dihapus)", surg_text)
            if surg[0] > best[0]:
                best = surg
            logs.append(
                AgentLog(
                    lapisan="L5",
                    agen="Agen Penyunting",
                    aksi="Bedah kalimat pemicu pelanggaran",
                    status="revisi",
                    detail=(
                        f"{removed} kalimat pemicu dihapus, panjang dikembalikan dengan kalimat "
                        "netral tanpa angka; hasil dievaluasi ulang."
                    ),
                )
            )

    assert best is not None
    _, sumber, teks_final, fact, comp, uniq = best
    berhasil = bool(comp.lolos and fact.lolos)
    words, est, selisih, status_durasi = editor.metrics(teks_final, target_detik)

    logs.append(
        AgentLog(
            lapisan="L4",
            agen="Agen Verifikator",
            aksi=f"{fx.label or 'Varian'}: verifikasi hasil perbaikan",
            status="ok" if berhasil else "revisi",
            detail=(
                f"Kandidat terbaik: {sumber}. Kepatuhan rules {'✓ lolos' if comp.lolos else f'✗ {len(comp.pelanggaran)} pelanggaran tersisa'}; "
                f"fakta angka {'✓' if fact.lolos else '✗'}; keunikan {uniq.similaritas_tertinggi:.0%}."
            ),
        )
    )

    berubah = normalize_text(teks_final) != norm_asal
    if berubah:
        save_narration(fx.topik, teks_final)
    logs.append(
        AgentLog(
            lapisan="L5",
            agen="Agen Penyunting",
            aksi="Finalisasi hasil perbaikan",
            status="ok" if berhasil else "catatan",
            detail=(
                (
                    "Rules kini lolos; narasi telah diperbarui"
                    + (" dan disimpan ke basis riwayat anti-duplikat." if berubah else ".")
                )
                if berhasil
                else (
                    "Batas perbaikan tercapai tetapi masih ada temuan; versi terbaik ditampilkan "
                    "agar dapat ditinjau manual atau diperbaiki ulang."
                )
            ),
        )
    )

    varian = NarrationVariant(
        id=fx.id or uuid.uuid4().hex[:8],
        label=fx.label or "Varian",
        teks=teks_final,
        jumlah_kata=words,
        estimasi_durasi_detik=est,
        selisih_persen=selisih,
        status_durasi=status_durasi,
        keunikan=uniq,
        kepatuhan=comp,
        cek_fakta=fact,
    )

    return FixResponse(
        mode="llm" if client.available else "mock",
        berhasil=berhasil,
        varian=varian,
        log_agen=logs,
    )
