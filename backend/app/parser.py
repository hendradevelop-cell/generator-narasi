from __future__ import annotations

import re
from urllib.parse import urlparse

from .llm import LLMClient
from .schemas import AgentLog, BahanItem, ParsedCase, RulesSet
from .textutil import split_sentences

BULLET_RE = re.compile(r"^\s*(?:[-–—•*]|\d+[.)])\s+(.*)$")
URL_RE = re.compile(r"https?://\S+")
_MD_PREFIX_RE = re.compile(r"^#{1,6}\s*")

_HEADERS: list[tuple[str, re.Pattern[str]]] = [
    ("donts", re.compile(r"^\s*(?:aturan\s+)?(?:don['’]?ts?|larangan)\b[^:：]*[:：]\s*(.*)$", re.IGNORECASE)),
    ("dos", re.compile(r"^\s*(?:aturan\s+)?do['’]?s?\b[^:：]*[:：]\s*(.*)$", re.IGNORECASE)),
    ("topik", re.compile(r"^\s*(?:topik|tema)\b[^:：]*[:：]\s*(.*)$", re.IGNORECASE)),
    ("headline", re.compile(r"^\s*(?:(?:rekomendasi|usulan|alternatif|pilihan|saran)\s+)?(?:headline|judul(?!\s+bahan))\b[^:：]*[:：]\s*(.*)$", re.IGNORECASE)),
    ("konteks", re.compile(r"^\s*konteks(?:\s+pembahasan)?\b[^:：]*[:：]\s*(.*)$", re.IGNORECASE)),
    ("bahan", re.compile(r"^\s*(?:bahan|sumber|referensi|tautan|link)\b[^:：]*[:：]\s*(.*)$", re.IGNORECASE)),
]

_BARE_HEADERS: list[tuple[str, re.Pattern[str]]] = [
    ("donts", re.compile(r"^\s*(?:aturan\s+)?(?:don['’]?ts?|larangan)\s*(?:\([^)]*\))?\s*$", re.IGNORECASE)),
    ("dos", re.compile(r"^\s*(?:aturan\s+)?do['’]?s?\s*(?:\([^)]*\))?\s*$", re.IGNORECASE)),
    ("topik", re.compile(r"^\s*(?:topik|tema)\s*(?:\([^)]*\))?\s*$", re.IGNORECASE)),
    ("headline", re.compile(r"^\s*(?:(?:rekomendasi|usulan|alternatif|pilihan|saran)\s+)?(?:headline|judul(?!\s+bahan))\s*(?:\([^)]*\))?\s*$", re.IGNORECASE)),
    ("konteks", re.compile(r"^\s*konteks(?:\s+pembahasan)?\s*(?:\([^)]*\))?\s*$", re.IGNORECASE)),
    ("bahan", re.compile(r"^\s*(?:bahan|sumber|referensi|tautan|link)\s*(?:\([^)]*\))?\s*$", re.IGNORECASE)),
]


def _clean(text: str) -> str:
    text = re.sub(r"\*\*|__|`", "", text)
    return text.strip(" \t-–—•*")


def _probe(line: str) -> str:
    return _clean(_MD_PREFIX_RE.sub("", line))


def _match_header(line: str) -> tuple[str, str] | None:
    probe = _probe(line)
    for key, rx in _HEADERS:
        m = rx.match(probe)
        if m:
            return key, _clean(m.group(1))
    for key, rx in _BARE_HEADERS:
        if rx.match(probe):
            return key, ""
    return None


def _has_headline_header(teks: str) -> bool:
    for raw_line in teks.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        hit = _match_header(line)
        if hit and hit[0] == "headline":
            return True
    return False


def _headline_from_topik(topik: str) -> str:
    parts = split_sentences(topik)
    head = parts[0] if parts else topik
    return head.rstrip(".")


def _label_from_url(url: str) -> str:
    p = urlparse(url)
    path = p.path.strip("/")
    slug = path.split("/")[-1] if path else ""
    slug = re.sub(r"[-_]+", " ", slug).strip()
    slug = re.sub(r"\s*\d{6,}$", "", slug).strip()
    return f"{p.netloc} — {slug}" if slug else p.netloc


def _bahan_from_line(line: str, index: int) -> BahanItem:
    m = URL_RE.search(line)
    if m:
        raw_url = m.group(0).rstrip(").,;")
        label = _clean(line.replace(m.group(0), ""))
        if not label:
            label = _label_from_url(raw_url)
        return BahanItem(id=f"B{index}", judul=label, url=raw_url, dipilih=True)
    return BahanItem(id=f"B{index}", judul=_clean(line), url="", dipilih=True)


def parse_heuristic(teks: str) -> ParsedCase:
    buckets: dict[str, list[str]] = {k: [] for k in ("topik", "headline", "konteks", "bahan", "dos", "donts")}
    current: str | None = None
    saw_any_header = False

    for raw_line in teks.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        hit = _match_header(line)
        if hit:
            current, inline = hit
            saw_any_header = True
            if inline:
                buckets[current].append(inline)
            continue
        if current is None:
            continue
        bm = BULLET_RE.match(line)
        if bm:
            buckets[current].append(_clean(bm.group(1)))
        elif buckets[current]:
            buckets[current][-1] = f"{buckets[current][-1]} {line}".strip()
        else:
            buckets[current].append(_clean(line))

    topik = buckets["topik"][0] if buckets["topik"] else ""
    headlines = [x for x in buckets["headline"] if x]
    konteks = [x for x in buckets["konteks"] if x]
    bahan = [_bahan_from_line(x, i + 1) for i, x in enumerate([x for x in buckets["bahan"] if x])]
    dos = [x for x in buckets["dos"] if x]
    donts = [x for x in buckets["donts"] if x]

    if not saw_any_header:
        lines = [_clean(l) for l in teks.splitlines() if l.strip()]
        topik = lines[0] if lines else ""
        konteks = lines[1:] if len(lines) > 1 else []
    elif not topik and konteks:
        topik = konteks[0]

    if not headlines and topik:
        headlines = [_headline_from_topik(topik)]

    return ParsedCase(
        topik=topik,
        headlines=headlines,
        konteks=konteks,
        bahan=bahan,
        rules=RulesSet(dos=dos, donts=donts),
        mode="heuristik",
    )


PARSE_SYSTEM = (
    "Anda Agen Ekstraksi Struktur pada sistem multi-agent untuk content pipeline berita Indonesia. "
    "Tugas: memilah teks kasus berita menjadi struktur JSON. "
    "Kembalikan HANYA JSON dengan bentuk: "
    '{"topik": string, "headlines": [string], "konteks": [string], '
    '"bahan": [{"judul": string, "url": string}], '
    '"rules": {"dos": [string], "donts": [string]}}. '
    "Salin isi sedekat mungkin dengan teks asli, jangan menambah atau mengarang fakta. "
    "Jika suatu bagian tidak ada, gunakan string kosong atau array kosong."
)


def _str_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [_clean(str(x)) for x in value if str(x).strip()]
    if isinstance(value, str) and value.strip():
        return [_clean(value)]
    return []


def _from_llm_dict(data: dict, fallback: ParsedCase) -> ParsedCase:
    topik = _clean(str(data.get("topik") or "")) or fallback.topik
    headlines = _str_list(data.get("headlines")) or fallback.headlines
    konteks = _str_list(data.get("konteks")) or fallback.konteks

    bahan: list[BahanItem] = []
    raw_bahan = data.get("bahan")
    if isinstance(raw_bahan, list):
        for i, item in enumerate(raw_bahan):
            if isinstance(item, dict):
                judul = _clean(str(item.get("judul") or ""))
                url = str(item.get("url") or "").strip()
                if not judul:
                    judul = _label_from_url(url) if url else f"Bahan {i + 1}"
                bahan.append(BahanItem(id=f"B{i + 1}", judul=judul, url=url, dipilih=True))
            elif isinstance(item, str) and item.strip():
                bahan.append(_bahan_from_line(_clean(item), i + 1))
    if not bahan:
        bahan = fallback.bahan

    rules_raw = data.get("rules")
    dos = _str_list(rules_raw.get("dos")) if isinstance(rules_raw, dict) else []
    donts = _str_list(rules_raw.get("donts")) if isinstance(rules_raw, dict) else []
    if not dos:
        dos = fallback.rules.dos
    if not donts:
        donts = fallback.rules.donts

    return ParsedCase(
        topik=topik,
        headlines=headlines,
        konteks=konteks,
        bahan=bahan,
        rules=RulesSet(dos=dos, donts=donts),
        mode="llm",
    )


async def parse_case(teks: str) -> ParsedCase:
    fallback = parse_heuristic(teks)
    logs: list[AgentLog] = []

    client = LLMClient()
    if client.available:
        data = await client.chat_json(PARSE_SYSTEM, teks, temperature=0.2)
        if isinstance(data, dict):
            parsed = _from_llm_dict(data, fallback)
            logs.append(
                AgentLog(
                    lapisan="L1",
                    agen="Agen Ekstraksi Struktur",
                    aksi="Pilah teks via LLM",
                    detail=(
                        f"{len(parsed.headlines)} headline, {len(parsed.konteks)} poin konteks, "
                        f"{len(parsed.bahan)} bahan, {len(parsed.rules.dos)} do's, {len(parsed.rules.donts)} don'ts."
                    ),
                )
            )
            parsed.log_agen = logs
            return parsed
        logs.append(
            AgentLog(
                lapisan="L1",
                agen="Agen Ekstraksi Struktur",
                aksi="LLM tidak merespons, beralih ke heuristik",
                status="catatan",
            )
        )

    catatan = ""
    if fallback.headlines and not _has_headline_header(teks):
        catatan = "Bagian headline tidak ditemukan di teks; rekomendasi headline disusun dari topik. "
    logs.append(
        AgentLog(
            lapisan="L1",
            agen="Agen Ekstraksi Struktur",
            aksi="Pilah teks via heuristik",
            detail=(
                catatan
                + f"{len(fallback.headlines)} headline, {len(fallback.konteks)} poin konteks, "
                f"{len(fallback.bahan)} bahan, {len(fallback.rules.dos)} do's, {len(fallback.rules.donts)} don'ts."
            ),
        )
    )
    fallback.log_agen = logs
    return fallback
