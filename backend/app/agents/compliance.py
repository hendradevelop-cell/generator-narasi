from __future__ import annotations

import math
import re

from ..llm import LLMClient
from ..schemas import GenerateRequest, KepatuhanInfo
from ..textutil import canonical_number_matches, canonical_numbers, numbers_match, split_sentences

RULE_STOP = {
    "jangan", "tidak", "bukan", "harus", "dapat", "bisa", "wajib", "perlu", "agar", "supaya",
    "bahwa", "sebagai", "adalah", "ialah", "oleh", "dengan", "dalam", "pada", "akan", "sudah",
    "telah", "hanya", "juga", "masih", "kembali", "serta", "dan", "atau", "yang", "ini", "itu",
    "tersebut", "saat", "ketika", "bila", "jika", "karena", "sebab", "maka", "untuk", "dari",
    "demi", "kecuali", "menyebut", "menyebutkan", "sebut", "sebutkan", "menulis", "menuliskan",
    "tulis", "tuliskan", "menganggap", "menjadikan", "jadikan", "memakai", "memasukkan",
    "masukkan", "mencantumkan", "cantumkan", "memberikan", "berikan", "membuat", "gunakan",
    "tambahkan", "jumlah", "jumlahkan", "menjumlahkan", "angka", "nomor", "juta", "miliar",
    "triliun", "ribu", "rp", "merujuk", "mengacu", "merupakan", "tentang", "terhadap", "antara",
    "bagi", "tanpa", "sendiri", "lebih", "kurang", "sangat", "paling", "seperti", "yaitu",
    "yakni", "pun", "hal", "para", "secara", "semata", "lantas", "melulu", "seluruhnya",
}

NEGATION_HINTS = (
    "tidak semata", "bukan hanya", "tidak hanya", "bukan satu-satunya", "bukan berarti",
    "tidak lantas", "bukan semata", "tidak melulu", "bukan hanya karena", "tidak sepenuhnya",
)

QUOTED_RE = re.compile(r"[\"\u201c\u2018']([^\"\u201d\u2019']{10,})[\"\u201d\u2019']")

COMPLIANCE_SYSTEM = (
    'Anda Agen Kepatuhan (L4). Periksa naskah narasi terhadap daftar Do\'s dan Don\'ts. '
    'Balas JSON: {"pelanggaran": [string], "peringatan": [string]}. '
    "Isi pelanggaran HANYA bila naskah jelas melanggar salah satu Don'ts atau jelas gagal memenuhi Do's wajib."
)


def _token_positions(text: str) -> list[tuple[str, int]]:
    return [(m.group(0), m.start()) for m in re.finditer(r"\S+", text)]


def _last_token_index(tokens: list[tuple[str, int]], pos: int) -> int:
    idx = 0
    for i, (_, p) in enumerate(tokens):
        if p <= pos:
            idx = i
        else:
            break
    return idx


def _window_text(tokens: list[tuple[str, int]], center_idx: int, window: int = 5) -> str:
    lo, hi = max(0, center_idx - window), min(len(tokens), center_idx + window + 1)
    return " ".join(t for t, _ in tokens[lo:hi]).lower()


def _core_tokens(tokens: list[tuple[str, int]], number_pos: int, window: int = 5) -> list[str]:
    idx = _last_token_index(tokens, number_pos)
    lo, hi = max(0, idx - window), min(len(tokens), idx + window + 1)
    core: list[str] = []
    for tok, _ in tokens[lo:hi]:
        word = re.sub(r"[^\w]", "", tok.lower())
        if len(word) < 4 or word in RULE_STOP or any(ch.isdigit() for ch in word):
            continue
        core.append(word)
    return list(dict.fromkeys(core))


async def _llm_review(client: LLMClient, draft: str, req: GenerateRequest) -> dict | None:
    dos_txt = "\n".join(f"- {d}" for d in req.rules.dos) or "- (tidak ada)"
    donts_txt = "\n".join(f"- {d}" for d in req.rules.donts) or "- (tidak ada)"
    user = f"DO'S:\n{dos_txt}\n\nDON'TS:\n{donts_txt}\n\nNASKAH:\n{draft}"
    data = await client.chat_json(COMPLIANCE_SYSTEM, user, temperature=0.1)
    if not isinstance(data, dict):
        return None

    def _lst(value: object) -> list[str]:
        if isinstance(value, list):
            return [str(x) for x in value if str(x).strip()]
        return []

    return {"pelanggaran": _lst(data.get("pelanggaran")), "peringatan": _lst(data.get("peringatan"))}


async def check(
    draft: str,
    req: GenerateRequest,
    client: LLMClient | None = None,
) -> KepatuhanInfo:
    violations: list[str] = []
    warnings: list[str] = []
    sentences = split_sentences(draft)
    draft_numbers = canonical_numbers(draft)
    content_text = "\n".join([req.topik, req.brief_narasi, *req.headlines, *req.konteks])
    content_numbers = [v for v, _ in canonical_numbers(content_text)]

    # Don'ts: cari kalimat yang memuat angka + istilah inti aturan di sekitar angka → indikasi pelanggaran.
    for rule in req.rules.donts:
        rule_tokens = _token_positions(rule)
        for val, raw, pos in canonical_number_matches(rule):
            core = _core_tokens(rule_tokens, pos)
            if len(core) < 2:
                continue
            needed = max(2, math.ceil(len(core) * 0.5))
            for sentence in sentences:
                s_matches = canonical_number_matches(sentence)
                positions = [p for v, _, p in s_matches if numbers_match(v, val)]
                if not positions:
                    continue
                s_tokens = _token_positions(sentence)
                matched = 0
                for p in positions:
                    window = _window_text(s_tokens, _last_token_index(s_tokens, p))
                    matched = max(matched, sum(1 for token in core if token in window))
                if matched < needed:
                    continue
                lowered = sentence.lower()
                if any(hint in lowered for hint in NEGATION_HINTS):
                    warnings.append(
                        f'Kalimat memuat angka & istilah aturan tetapi bernuansa penyangkalan '
                        f'(perlu tinjau): "{sentence}"'
                    )
                    continue
                ringkas = rule[:90] + ("..." if len(rule) > 90 else "")
                violations.append(
                    f'Potensi pelanggaran Don\'ts — aturan: "{ringkas}" | kalimat: "{sentence}"'
                )

    # Do's: angka yang wajib muncul = angka aturan yang merupakan bagian fakta kasus;
    # frasa terkutip harus tercermin.
    for rule in req.rules.dos:
        for val, raw in canonical_numbers(rule):
            if not any(numbers_match(val, c) for c in content_numbers):
                continue
            if not any(numbers_match(val, v) for v, _ in draft_numbers):
                warnings.append(f'Do\'s belum tampak: angka "{raw}" dari aturan tidak muncul di narasi.')
        for phrase in QUOTED_RE.findall(rule):
            words = {w for w in re.findall(r"[a-zA-Z]+", phrase.lower()) if len(w) >= 4}
            if len(words) < 3:
                continue
            norm = draft.lower()
            found = sum(1 for w in words if w in norm)
            if found / len(words) < 0.7:
                warnings.append(
                    f'Do\'s belum tampak: frasa "{phrase[:60]}" kurang tercermin di narasi.'
                )

    if client is not None and client.available:
        review = await _llm_review(client, draft, req)
        if review:
            violations.extend(f"LLM: {item}" for item in review["pelanggaran"])
            warnings.extend(f"LLM: {item}" for item in review["peringatan"])

    return KepatuhanInfo(lolos=not violations, pelanggaran=violations, peringatan=warnings)
