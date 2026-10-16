from __future__ import annotations

import re

from ..llm import LLMClient
from ..schemas import GenerateRequest
from ..textutil import similarity

STYLES: list[dict] = [
    {
        "label": "Gaya Lugas",
        "opening": "{headline}",
        "leadins": ["", "Poin pentingnya, ", "Selain itu, ", "Sementara itu, ", "Yang perlu dicatat, "],
        "synonyms": [("diumumkan", "disampaikan")],
        "closing": "Perkembangan selanjutnya dapat diikuti melalui kanal informasi resmi.",
        "fillers": [
            "Kepastian ini menjadi acuan penting bagi seluruh pemangku kepentingan.",
            "Dengan begitu, masyarakat dapat mempersiapkan diri sejak dini.",
            "Kejelasan tahapan membantu mengurangi keraguan di lapangan.",
            "Informasi resmi menjadi rujukan utama dalam setiap tahapan.",
            "Kesiapan semua pihak menjadi kunci kelancaran pelaksanaan.",
        ],
    },
    {
        "label": "Gaya Bercerita",
        "opening": "Kabar penting hari ini. {headline}",
        "leadins": ["Yang menarik, ", "Tidak hanya itu, ", "Sebagai gambaran, ", "Perlu diketahui, ", "Di sisi lain, "],
        "synonyms": [
            ("menyepakati", "menyetujui"),
            ("ditopang", "ditunjang"),
            ("mencakup", "meliputi"),
            ("diimbangi", "diringi"),
        ],
        "closing": "Dengan kejelasan ini, langkah selanjutnya diharapkan berjalan lebih tenang.",
        "fillers": [
            "Bagi banyak pihak, kepastian ini sangat berarti dalam menyusun rencana.",
            "Setiap perubahan memang membutuhkan persiapan yang matang.",
            "Kabar ini memberi angin segar bagi mereka yang telah lama menanti.",
            "Setiap tahapan yang jelas membuat langkah terasa lebih ringan.",
        ],
    },
    {
        "label": "Fokus Rincian",
        "opening": "Rincian lengkapnya, {headline}",
        "leadins": ["Rinciannya, ", "Secara terperinci, ", "Detailnya, ", "Dalam keterangan resmi, ", "Lebih jauh, "],
        "synonyms": [
            ("ditetapkan(?= Rp)", "dipatok"),
            ("mencakup", "meliputi"),
            ("memantau", "mengikuti"),
            ("diimbangi", "diseimbangkan"),
        ],
        "closing": "Pantau terus pengumuman resmi agar seluruh tahapan dapat diikuti tanpa terlewat.",
        "fillers": [
            "Terobosan ini melengkapi rangkaian kebijakan sebelumnya.",
            "Dengan skema yang jelas, perencanaan keuangan menjadi lebih terukur.",
            "Rincian tersebut menjadi acuan dalam proses berikutnya.",
            "Pemahaman yang baik atas rincian membantu kelancaran tahapan selanjutnya.",
        ],
    },
]

WRITER_SYSTEM = (
    "Anda Agen Penulis Narasi (L3) dalam pipeline multi-agent untuk konten berita Indonesia. "
    "Tulis naskah narasi (untuk video/audio) dalam bahasa Indonesia yang mengalir, jelas, dan faktual. "
    "ATURAN KETAT:\n"
    "- Gunakan HANYA fakta dan angka yang ada di bahan/konten yang diberikan. Dilarang mengarang angka baru.\n"
    "- Patuhi seluruh daftar Do's dan hindari seluruh Don'ts.\n"
    "- Panjang naskah harus mendekati rentang kata yang diminta.\n"
    "- Jangan menyalin persis naskah contoh yang diberikan; buat kalimat yang berbeda.\n"
    'Kembalikan HANYA JSON: {"teks": string}.'
)


def _apply_synonyms(sentence: str, synonyms: list[tuple[str, str]]) -> str:
    out = sentence
    for pattern, replacement in synonyms:
        out = re.sub(rf"\b{pattern}\b", replacement, out, flags=re.IGNORECASE)
    return out


def _clean_sentence(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if text and text[-1] not in ".!?":
        text += "."
    return text


def _has_digit(text: str) -> bool:
    return bool(re.search(r"\d", text))


def _lower_first(text: str) -> str:
    """Huruf pertama jadi kecil, kecuali kata pertama berupa akronim (mis. BPIH)."""
    m = re.match(r"[A-Za-z]+", text)
    if m and m.group(0).isupper() and len(m.group(0)) > 1:
        return text
    return text[0].lower() + text[1:] if text else text


def _konteks_sentences(req: GenerateRequest) -> list[str]:
    out: list[str] = []
    for item in req.konteks:
        for part in re.split(r"(?<=[.!?])\s+", item.strip()):
            part = _clean_sentence(part)
            if len(part.split()) >= 3:
                out.append(part)
    return out


def variant_label(variant_idx: int) -> str:
    return f"Varian {variant_idx + 1} — {STYLES[variant_idx % len(STYLES)]['label']}"


def build_template(
    req: GenerateRequest,
    variant_idx: int,
    attempt: int,
    target_min: int,
    target_max: int,
) -> tuple[str, dict]:
    style = STYLES[variant_idx % len(STYLES)]
    headline = (req.headlines[0] if req.headlines else req.topik).strip()
    headline = _clean_sentence(headline)

    body_pool = _konteks_sentences(req)
    if not body_pool:
        body_pool = [headline]

    rotation = (variant_idx * 2 + attempt) % len(body_pool)
    ordered = body_pool[rotation:] + body_pool[:rotation]
    synonyms = style.get("synonyms") or []

    leadins = style["leadins"]
    li = attempt % len(leadins)
    prev_lead: str | None = None
    body: list[str] = []
    for sentence in ordered:
        sentence = _apply_synonyms(sentence, synonyms)
        for _ in range(len(leadins)):
            candidate = leadins[li % len(leadins)]
            li += 1
            if candidate != prev_lead or len(leadins) == 1:
                break
        lead = candidate
        prev_lead = lead or None
        if not lead:
            body.append(sentence)
            continue
        body.append(f"{lead}{_lower_first(sentence)}")

    opening = _clean_sentence(style["opening"].format(headline=headline))

    def wc(parts: list[str]) -> int:
        return len(" ".join(parts).split())

    # Kompresi saat pembuka + isi melewati batas atas: dahulukan kalimat tanpa angka.
    while wc([opening] + body) > target_max and len(body) > 3:
        drop_idx = next((i for i in range(len(body) - 1, -1, -1) if not _has_digit(body[i])), None)
        if drop_idx is None:
            break
        del body[drop_idx]

    used_fillers: list[str] = []
    for filler in style["fillers"]:
        if wc([opening] + body + used_fillers) >= target_min:
            break
        used_fillers.append(filler)

    mid = body + used_fillers
    paragraphs: list[str] = [opening]
    n = len(mid)
    n_paras = max(1, round(n / 3.2))
    base, rem = divmod(n, n_paras)
    idx = 0
    for p in range(n_paras):
        size = base + (1 if p < rem else 0)
        chunk = mid[idx : idx + size]
        idx += size
        if chunk:
            paragraphs.append(" ".join(chunk))

    closing = style["closing"]
    redundant = any(similarity(closing, sentence) > 0.6 for sentence in mid)
    if not redundant and wc([opening] + mid + [closing]) <= target_max:
        paragraphs.append(closing)

    return "\n\n".join(p for p in paragraphs if p), style


async def build_llm(
    req: GenerateRequest,
    client: LLMClient,
    variant_idx: int,
    attempt: int,
    target_min: int,
    target_max: int,
    avoid_texts: list[str],
) -> str | None:
    style = STYLES[variant_idx % len(STYLES)]
    headline = req.headlines[0] if req.headlines else req.topik
    konteks_txt = "\n".join(f"- {k}" for k in req.konteks) or "- (tidak ada)"
    dos_txt = "\n".join(f"- {d}" for d in req.rules.dos) or "- (tidak ada)"
    donts_txt = "\n".join(f"- {d}" for d in req.rules.donts) or "- (tidak ada)"
    bahan_txt = "\n".join(f"- {b.judul} ({b.url})" for b in req.bahan if b.dipilih) or "- (tidak ada)"

    avoid_block = ""
    if avoid_texts:
        gabungan = "\n\n---\n\n".join(t[:1200] for t in avoid_texts[:4])
        avoid_block = (
            "\n\nNaskah yang sudah ada (WAJIB berbeda pada pembuka, struktur kalimat, dan pilihan kata):\n"
            + gabungan
        )

    user = (
        f"TOPIK: {req.topik}\n\n"
        f"HEADLINE UTAMA: {headline}\n\n"
        f"KONTEKS PEMBAHASAN:\n{konteks_txt}\n\n"
        f"BAHAN TERPILIH:\n{bahan_txt}\n\n"
        f"BRIEF NARASI DARI USER: {req.brief_narasi or '(tidak ada)'}\n\n"
        f"GAYA VARIAN: {style['label']}\n"
        f"TARGET KATA: {target_min}-{target_max} kata\n\n"
        f"ATURAN DO'S:\n{dos_txt}\n\n"
        f"ATURAN DON'TS:\n{donts_txt}"
        f"{avoid_block}"
    )
    data = await client.chat_json(WRITER_SYSTEM, user, temperature=0.8)
    if not data:
        return None
    teks = str(data.get("teks") or "").strip()
    return teks or None
