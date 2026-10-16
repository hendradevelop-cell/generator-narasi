from __future__ import annotations

import re

from ..config import settings
from ..textutil import split_sentences


def _wc(text: str) -> int:
    return len(text.split())


def _has_digit(text: str) -> bool:
    return bool(re.search(r"\d", text))


def fit_duration(text: str, min_words: int, max_words: int, fillers: list[str]) -> str:
    teks = text.strip()

    if _wc(teks) > max_words:
        paras = [p for p in teks.split("\n\n") if p.strip()]
        if len(paras) > 2:
            # dahulukan membuang paragraf tengah tanpa angka agar fakta tetap utuh
            changed = True
            while _wc("\n\n".join(paras)) > max_words and len(paras) > 2 and changed:
                changed = False
                for i in range(1, len(paras) - 1):
                    if _wc("\n\n".join(paras)) <= max_words:
                        break
                    if not _has_digit(paras[i]):
                        del paras[i]
                        changed = True
                        break
            while _wc("\n\n".join(paras)) > max_words and len(paras) > 2:
                idx = min(range(1, len(paras) - 1), key=lambda i: _wc(paras[i]))
                del paras[idx]
            teks = "\n\n".join(paras)
        if _wc(teks) > max_words:
            sents = split_sentences(teks)
            while len(sents) > 3 and _wc(" ".join(sents)) > max_words:
                removed = False
                for i in range(len(sents) - 2, 0, -1):
                    if not _has_digit(sents[i]):
                        del sents[i]
                        removed = True
                        break
                if not removed:
                    del sents[-2]
            teks = " ".join(sents)

    if _wc(teks) < min_words:
        paras = [p for p in teks.split("\n\n") if p.strip()]
        for filler in fillers:
            if _wc("\n\n".join(paras)) >= min_words:
                break
            if filler.lower() in teks.lower():
                continue
            if len(paras) >= 2:
                paras[-2] = (paras[-2] + " " + filler).strip()
            else:
                paras.append(filler)
        teks = "\n\n".join(paras)

    return teks


def metrics(text: str, target_seconds: float) -> tuple[int, float, float, str]:
    words = _wc(text)
    est = words / settings.words_per_minute * 60
    selisih = (est - target_seconds) / target_seconds * 100 if target_seconds else 0.0
    status = "sesuai" if abs(selisih) <= 15 else "melenceng"
    return words, round(est, 1), round(selisih, 1), status
