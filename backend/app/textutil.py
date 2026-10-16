from __future__ import annotations

import math
import re
from collections import Counter

NUMBER_RE = re.compile(r"(?:Rp\.?\s?)?(\d[\d.,]*)\s*(juta|miliar|triliun|ribu)?", re.IGNORECASE)
MULTIPLIER = {"juta": 1e6, "miliar": 1e9, "triliun": 1e12, "ribu": 1e3}

STOPWORDS = {
    "yang", "dan", "atau", "untuk", "dari", "dalam", "dengan", "pada", "ke", "di", "tidak",
    "bukan", "jangan", "adalah", "sebagai", "bahwa", "ini", "itu", "juga", "akan", "sudah",
    "telah", "agar", "bila", "jika", "oleh", "secara", "para", "hal", "dapat", "harus", "perlu",
    "wajib", "serta", "karena", "maka", "ketika", "saat", "hingga", "sampai", "tentang",
    "terhadap", "antara", "bagi", "demi", "tanpa", "kecuali", "hanya", "sendiri", "kembali",
    "masih", "belum", "lebih", "kurang", "sangat", "paling", "seperti", "yaitu", "yakni",
    "tersebut", "mereka", "kita", "kami", "saya", "anda", "pun", "lah",
}


def parse_number(raw: str) -> float:
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", raw):
        return float(raw.replace(".", ""))
    if re.fullmatch(r"\d{1,3}(,\d{3})+", raw):
        return float(raw.replace(",", ""))
    if "," in raw and "." in raw:
        return float(raw.replace(".", "").replace(",", "."))
    if "," in raw:
        return float(raw.replace(",", "."))
    return float(raw)


def canonical_number_matches(text: str) -> list[tuple[float, str, int]]:
    out: list[tuple[float, str, int]] = []
    for m in NUMBER_RE.finditer(text):
        raw, unit = m.group(1), (m.group(2) or "").lower()
        try:
            value = parse_number(raw)
        except ValueError:
            continue
        out.append((value * MULTIPLIER.get(unit, 1.0), m.group(0).strip(), m.start()))
    return out


def canonical_numbers(text: str) -> list[tuple[float, str]]:
    return [(v, r) for v, r, _ in canonical_number_matches(text)]


def numbers_match(a: float, b: float) -> bool:
    return abs(a - b) <= max(abs(b) * 0.001, 0.5)


def normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", " ", text.lower()).strip()


def char_ngrams(text: str, n: int = 4) -> Counter:
    t = re.sub(r"\s+", " ", normalize_text(text))
    if not t:
        return Counter()
    if len(t) < n:
        return Counter([t])
    return Counter(t[i : i + n] for i in range(len(t) - n + 1))


def similarity(text_a: str, text_b: str) -> float:
    ca, cb = char_ngrams(text_a), char_ngrams(text_b)
    if not ca or not cb:
        return 0.0
    common = set(ca) & set(cb)
    dot = sum(ca[k] * cb[k] for k in common)
    na = math.sqrt(sum(v * v for v in ca.values()))
    nb = math.sqrt(sum(v * v for v in cb.values()))
    if not na or not nb:
        return 0.0
    return dot / (na * nb)


def count_words(text: str) -> int:
    return len(text.split())


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]


def keywords(text: str, min_len: int = 4) -> list[str]:
    words = re.findall(r"[a-zA-Z]+", text.lower())
    return [w for w in words if len(w) >= min_len and w not in STOPWORDS]
