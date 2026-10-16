from __future__ import annotations

from ..config import settings
from ..schemas import KeunikanInfo
from ..textutil import normalize_text, similarity, split_sentences


def _opening_signature(text: str) -> str:
    sentences = split_sentences(text)
    first = sentences[0] if sentences else text
    return " ".join(normalize_text(first).split()[:12])


def check(
    text: str,
    others: list[tuple[str, str]],
    history: list[tuple[str, str]],
) -> KeunikanInfo:
    """Bandingkan narasi dengan varian lain di run ini dan riwayat narasi lama.
    Duplikat = kemiripan ≥ ambang atau kalimat pembuka identik."""
    best = 0.0
    best_label = ""
    opening_dup = ""
    norm = normalize_text(text)
    sig = _opening_signature(text)
    sig_valid = len(sig.split()) >= 5

    def evaluate(label: str, other: str) -> None:
        nonlocal best, best_label, opening_dup
        if normalize_text(other) == norm:
            sim = 1.0
        else:
            sim = similarity(text, other)
        if sig_valid and _opening_signature(other) == sig:
            sim = max(sim, 1.0)
            opening_dup = label
        if sim > best:
            best, best_label = sim, label

    for label, other in others:
        evaluate(label, other)
    for topik, other in history:
        evaluate(f"riwayat ({topik[:40]})", other)

    unik = best < settings.dup_threshold
    if best_label:
        catatan = (
            f"Similaritas tertinggi {best:.0%} terhadap {best_label} "
            f"(ambang duplikat {settings.dup_threshold:.0%})."
        )
    else:
        catatan = (
            f"Belum ada varian/riwayat lain sebagai pembanding; kemiripan 0% "
            f"(ambang duplikat {settings.dup_threshold:.0%})."
        )
    if opening_dup:
        catatan = f"Pembuka identik dengan {opening_dup}. {catatan}"
    return KeunikanInfo(
        unik=unik,
        similaritas_tertinggi=round(best, 4),
        dibanding=best_label,
        catatan=catatan,
    )
