from __future__ import annotations

import asyncio
import html
import json
import re
import time
from collections import Counter
from urllib.parse import quote

import httpx

from .schemas import MediaItem, MediaRequest, MediaResponse
from .textutil import keywords, split_sentences

_UA = "NarasiMediaFinder/1.0 (alat editorial lokal)"
_YT_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
_TTL_SECONDS = 30 * 60
_CACHE: dict[str, tuple[float, list[MediaItem]]] = {}
_INFLIGHT: dict[str, asyncio.Task] = {}

_YT_DATA_RE = re.compile(r"(?:var )?ytInitialData\s*=\s*(\{.*?\});\s*</script>", re.DOTALL)
_CURRENCY_RE = re.compile(r"[Rr][Pp]\.?[\d.,]+")
_PUNCT_EDGE = ".,;:!?\"'“”‘’…()[]–—-"


def _trim_words(text: str, limit: int) -> str:
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    return " ".join(words[:limit]).strip(_PUNCT_EDGE)


def anchor_phrase(text: str) -> str:
    """Frasa kunci singkat dari token menonjol (akronim), mis. "MRT Fase 2A"."""
    run: list[str] = []
    for raw in text.replace("(", " ").replace(")", " ").split():
        token = raw.strip(_PUNCT_EDGE)
        if not token:
            continue
        if _CURRENCY_RE.fullmatch(token):
            continue
        has_alpha = any(ch.isalpha() for ch in token)
        has_digit = any(ch.isdigit() for ch in token)
        starter = (token.isupper() and len(token) >= 2 and has_alpha) or (has_alpha and has_digit)
        continues = run and (has_digit or (token[0].isupper() and len(run) == 1))
        if starter or continues:
            run.append(token)
            if len(run) == 3:
                return " ".join(run)
        else:
            if len(run) >= 2:
                return " ".join(run)
            run = []
    return " ".join(run) if len(run) >= 2 else ""


def _youtube_queries(req: MediaRequest) -> list[str]:
    out: list[str] = []

    def add(value: str) -> None:
        value = _trim_words(value, 8)
        if len(value) >= 3 and value.lower() not in {v.lower() for v in out}:
            out.append(value)

    topik_first = split_sentences(req.topik)[0] if req.topik else ""
    add(req.headline)
    add(topik_first)
    return out[:2]


def _image_queries(req: MediaRequest) -> list[str]:
    out: list[str] = []

    def add(value: str) -> None:
        value = _trim_words(value, 5)
        if len(value) >= 3 and value.lower() not in {v.lower() for v in out}:
            out.append(value)

    topik_first = split_sentences(req.topik)[0] if req.topik else ""
    add(anchor_phrase(req.headline))
    add(anchor_phrase(req.topik))
    add(req.headline)
    add(topik_first)
    kw = keywords(f"{req.headline} {topik_first} {req.teks[:200]}", min_len=3)
    if kw:
        common = [word for word, _ in Counter(kw).most_common(2)]
        add(" ".join(common))
        add(common[0])
    return out[:6]


async def _safe(coro):
    try:
        return await coro
    except Exception:
        return []


async def _cached(key: str, factory) -> list[MediaItem]:
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL_SECONDS:
        return hit[1]
    task = _INFLIGHT.get(key)
    if task is None or task.done():
        task = asyncio.ensure_future(factory())
        _INFLIGHT[key] = task
    try:
        value = await task
    finally:
        if _INFLIGHT.get(key) is task and task.done():
            _INFLIGHT.pop(key, None)
    _CACHE[key] = (time.time(), value)
    return value


def _iter_video_renderers(node):
    if isinstance(node, dict):
        renderer = node.get("videoRenderer")
        if isinstance(renderer, dict):
            yield renderer
        for value in node.values():
            yield from _iter_video_renderers(value)
    elif isinstance(node, list):
        for value in node:
            yield from _iter_video_renderers(value)


def _runs_text(block) -> str:
    if not isinstance(block, dict):
        return ""
    runs = block.get("runs")
    if isinstance(runs, list) and runs:
        return "".join(str(r.get("text", "")) for r in runs if isinstance(r, dict))
    simple = block.get("simpleText")
    return str(simple) if simple else ""


async def _youtube_search(query: str) -> list[MediaItem]:
    async with httpx.AsyncClient(
        timeout=12,
        follow_redirects=True,
        headers={"User-Agent": _YT_UA, "Accept-Language": "id-ID,id;q=0.9,en;q=0.8"},
    ) as client:
        resp = await client.get(
            "https://www.youtube.com/results", params={"search_query": query, "hl": "id"}
        )
        resp.raise_for_status()
        page = resp.text
    match = _YT_DATA_RE.search(page)
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []
    items: list[MediaItem] = []
    seen: set[str] = set()
    for renderer in _iter_video_renderers(data):
        video_id = str(renderer.get("videoId") or "")
        if not video_id or video_id in seen:
            continue
        seen.add(video_id)
        items.append(
            MediaItem(
                judul=html.unescape(_runs_text(renderer.get("title")) or "Tanpa judul"),
                url=f"https://www.youtube.com/watch?v={video_id}",
                info=_runs_text(renderer.get("ownerText"))
                or _runs_text(renderer.get("longBylineText")),
                thumb=f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg",
            )
        )
        if len(items) >= 6:
            break
    return items


def _thumb_for(item: dict) -> str:
    source = str(item.get("source") or "")
    if source == "wikimedia":
        match = re.search(
            r"/([^/]+\.(?:jpe?g|png|gif|webp|svg|tiff?))$",
            str(item.get("url") or ""),
            re.IGNORECASE,
        )
        if match:
            return (
                "https://commons.wikimedia.org/wiki/Special:FilePath/"
                + quote(match.group(1), safe="")
                + "?width=480"
            )
    return str(item.get("thumbnail") or "")


async def _openverse(query: str) -> list[MediaItem]:
    async with httpx.AsyncClient(timeout=12, headers={"User-Agent": _UA}) as client:
        resp = await client.get(
            "https://api.openverse.org/v1/images/", params={"q": query, "page_size": 10}
        )
        resp.raise_for_status()
        data = resp.json()
    items: list[MediaItem] = []
    seen_titles: set[str] = set()
    for raw in data.get("results", []):
        if not isinstance(raw, dict):
            continue
        link = str(raw.get("foreign_landing_url") or raw.get("url") or "")
        if not link:
            continue
        title = str(raw.get("title") or "").strip() or "Tanpa judul"
        if title != "Tanpa judul":
            title_key = re.sub(r"\W+", " ", title.lower()).strip()
            if title_key in seen_titles:
                continue
            seen_titles.add(title_key)
        creator = str(raw.get("creator") or "Tanpa nama").strip()
        license_name = str(raw.get("license") or "").upper()
        version = str(raw.get("license_version") or "").strip()
        if version:
            license_name = f"{license_name} {version}".strip()
        source = str(raw.get("source") or raw.get("provider") or "").strip()
        info = f"{creator} · {license_name}" if license_name else creator
        if source:
            info += f" · via {source}"
        items.append(
            MediaItem(
                judul=title,
                url=link,
                info=info,
                thumb=_thumb_for(raw),
            )
        )
    return items


async def find_media(req: MediaRequest) -> MediaResponse:
    yt_queries = _youtube_queries(req)
    img_queries = _image_queries(req)
    yt_results, img_results = await asyncio.gather(
        asyncio.gather(
            *[_safe(_cached(f"yt:{q}", lambda q=q: _youtube_search(q))) for q in yt_queries]
        ),
        asyncio.gather(
            *[_safe(_cached(f"img:{q}", lambda q=q: _openverse(q))) for q in img_queries]
        ),
    )

    youtube: list[MediaItem] = []
    seen: set[str] = set()
    for items in yt_results:
        for item in items:
            if item.url in seen:
                continue
            seen.add(item.url)
            youtube.append(item)
    youtube = youtube[:6]

    gambar: list[MediaItem] = []
    for items in img_results:
        if items:
            gambar = items[:6]
            break

    return MediaResponse(
        kueri_youtube=yt_queries,
        kueri_gambar=img_queries,
        youtube=youtube,
        gambar=gambar,
        catatan=(
            "Pencarian langsung dari YouTube & Openverse (gambar berlisensi terbuka). "
            "Periksa lisensi sebelum dipublikasikan; tautan pencarian cadangan selalu tersedia."
        ),
    )
