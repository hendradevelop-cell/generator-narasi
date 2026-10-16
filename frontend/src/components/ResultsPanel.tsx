"use client";

import { useEffect, useState } from "react";
import { fetchMedia, fixNarration } from "@/lib/api";
import type {
  FixResponse,
  GenerateRequest,
  GenerateResponse,
  MediaResponse,
  NarrationVariant,
} from "@/lib/types";

function Badge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "red" | "slate";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function VariantCard({
  variant,
  index,
  payload,
  others,
  onFixed,
}: {
  variant: NarrationVariant;
  index: number;
  payload: GenerateRequest | null;
  others: string[];
  onFixed: (id: string, fx: FixResponse) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixNote, setFixNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [fixError, setFixError] = useState("");
  const [media, setMedia] = useState<MediaResponse | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");

  useEffect(() => {
    if (!payload) return;
    let alive = true;
    setMediaLoading(true);
    setMediaError("");
    fetchMedia({
      topik: payload.topik ?? "",
      headline: payload.headlines[0] ?? "",
      teks: variant.teks.slice(0, 400),
    })
      .then((m) => {
        if (alive) setMedia(m);
      })
      .catch((e) => {
        if (alive) setMediaError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setMediaLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [payload, variant.id, variant.teks]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(variant.teks);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleFix = async () => {
    if (!payload) return;
    setFixing(true);
    setFixError("");
    try {
      const fx = await fixNarration({
        ...payload,
        id: variant.id,
        teks: variant.teks,
        label: variant.label,
        variant_idx: index,
        teks_lain: others,
      });
      onFixed(variant.id, fx);
      setFixNote({
        ok: fx.berhasil,
        text: fx.berhasil
          ? "Narasi ditulis ulang — rules kini lolos."
          : "Perbaikan selesai, tetapi masih ada temuan rules. Bisa diperbaiki ulang.",
      });
    } catch (e) {
      setFixError(e instanceof Error ? e.message : String(e));
    } finally {
      setFixing(false);
    }
  };

  const sim = Math.round(variant.keunikan.similaritas_tertinggi * 100);
  const selisih = `${variant.selisih_persen > 0 ? "+" : ""}${variant.selisih_persen.toFixed(0)}%`;
  const jumlahTemuan = variant.kepatuhan.pelanggaran.length + variant.kepatuhan.peringatan.length;
  const adaTemuanRules = jumlahTemuan > 0;
  const fallbackQuery = (payload?.topik ?? "").split(/\s+/).slice(0, 8).join(" ");

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">{variant.label}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={variant.status_durasi === "sesuai" ? "green" : "amber"}>
            {variant.estimasi_durasi_detik.toFixed(0)} dtk ({selisih})
          </Badge>
          <Badge tone={variant.keunikan.unik ? "green" : "red"}>Kemiripan maks {sim}%</Badge>
          <Badge tone={variant.kepatuhan.lolos ? "green" : "red"}>
            {variant.kepatuhan.lolos
              ? "Rules lolos"
              : `Rules: ${variant.kepatuhan.pelanggaran.length} temuan`}
          </Badge>
          <Badge tone={variant.cek_fakta.lolos ? "green" : "red"}>
            {variant.cek_fakta.lolos
              ? "Angka dari sumber"
              : `Angka: ${variant.cek_fakta.pelanggaran.length} temuan`}
          </Badge>
        </div>
      </header>

      <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
        {variant.teks}
      </div>

      {variant.cek_fakta.pelanggaran.length > 0 || variant.kepatuhan.pelanggaran.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-700">
          {[...variant.cek_fakta.pelanggaran, ...variant.kepatuhan.pelanggaran].map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      ) : null}

      {variant.kepatuhan.peringatan.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          {variant.kepatuhan.peringatan.map((item, i) => (
            <li key={i}>• {item}</li>
          ))}
        </ul>
      ) : null}

      {adaTemuanRules ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleFix}
            disabled={fixing || !payload}
            title="Tulis ulang narasi agar temuan rules diperbaiki (L5 rewrite → verifikasi ulang L4)"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fixing ? "Memperbaiki..." : `Perbaiki (Rewrite)${jumlahTemuan ? ` — ${jumlahTemuan} temuan` : ""}`}
          </button>
          <span className="text-xs text-slate-500">
            Agen akan menulis ulang narasi ini agar bebas dari temuan rules, tanpa menambah angka
            di luar sumber.
          </span>
        </div>
      ) : null}

      {fixNote ? (
        <p className={`mt-2 text-xs font-medium ${fixNote.ok ? "text-emerald-600" : "text-amber-600"}`}>
          {fixNote.text}
        </p>
      ) : null}
      {fixError ? (
        <p className="mt-2 text-xs text-red-600">Gagal memperbaiki: {fixError}</p>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Media Pendukung
          </h4>
          <span className="text-[11px] text-slate-400">YouTube · Openverse</span>
        </div>

        {mediaLoading ? (
          <p className="mt-2 text-xs text-slate-500">Mencari video &amp; gambar terkait narasi ini…</p>
        ) : null}
        {mediaError ? (
          <p className="mt-2 text-xs text-amber-600">
            Pencarian media gagal: {mediaError}. Gunakan tautan pencarian di bawah.
          </p>
        ) : null}

        {media && media.youtube.length > 0 ? (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-500">
              YouTube ({media.youtube.length})
            </p>
            {media.youtube.map((item) => (
              <a
                key={item.url}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-slate-100 transition hover:ring-indigo-300"
              >
                {item.thumb ? (
                  <img
                    src={item.thumb}
                    alt=""
                    className="h-11 w-[76px] shrink-0 rounded-lg bg-slate-100 object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-slate-700">
                    {item.judul}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {item.info || "YouTube"}
                  </span>
                </span>
              </a>
            ))}
          </div>
        ) : null}

        {media && media.gambar.length > 0 ? (
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-slate-500">
              Gambar terkait ({media.gambar.length})
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {media.gambar.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${item.judul} — ${item.info}`}
                  className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-100 transition hover:ring-indigo-300"
                >
                  {item.thumb ? (
                    <img
                      src={item.thumb}
                      alt={item.judul}
                      loading="lazy"
                      className="h-20 w-full bg-slate-100 object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                  <span className="block truncate px-1.5 py-1 text-[10px] text-slate-500">
                    {item.judul}
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Klik gambar untuk membuka sumber &amp; info lisensi.
            </p>
          </div>
        ) : null}

        {media && !mediaLoading && media.youtube.length === 0 && media.gambar.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            Tidak ada hasil langsung untuk narasi ini — gunakan tautan pencarian di bawah.
          </p>
        ) : null}

        {media ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {media.kueri_youtube.map((q) => (
              <a
                key={`yt-${q}`}
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Cari di YouTube: ${q}`}
                className="max-w-[220px] truncate rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-100"
              >
                YouTube: {q}
              </a>
            ))}
            {media.kueri_gambar.map((q) => (
              <a
                key={`img-${q}`}
                href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Cari gambar: ${q}`}
                className="max-w-[220px] truncate rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-600 transition hover:bg-sky-100"
              >
                Gambar: {q}
              </a>
            ))}
          </div>
        ) : null}

        {media && media.catatan ? (
          <p className="mt-2 text-[10px] text-slate-400">{media.catatan}</p>
        ) : null}

        {!media && mediaError && fallbackQuery ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(fallbackQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[220px] truncate rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-100"
            >
              YouTube: {fallbackQuery}
            </a>
            <a
              href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(fallbackQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[220px] truncate rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-600 transition hover:bg-sky-100"
            >
              Gambar: {fallbackQuery}
            </a>
          </div>
        ) : null}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="truncate">
          {variant.jumlah_kata} kata · {variant.keunikan.catatan}
        </span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
        >
          {copied ? "Tersalin ✓" : "Salin Narasi"}
        </button>
      </footer>
    </article>
  );
}

export default function ResultsPanel({
  result,
  payload,
  onFixed,
}: {
  result: GenerateResponse;
  payload: GenerateRequest | null;
  onFixed: (id: string, fx: FixResponse) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h2 className="text-base font-bold text-slate-800">Hasil Narasi</h2>
        <p className="mt-1 text-xs text-slate-500">
          Mode: {result.mode === "llm" ? "LLM" : "Mock (offline)"} · Target{" "}
          {result.target_detik.toFixed(0)} detik ({result.target_kata_min}–{result.target_kata_max}{" "}
          kata) · {result.varian.length} varian
        </p>
      </div>

      {result.varian.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Semua kandidat terkena aturan anti-duplikat: terlalu mirip (atau identik) dengan varian
          lain di run ini maupun dengan narasi yang pernah dibuat sebelumnya. Ubah durasi, brief,
          atau konten, lalu generate lagi — atau matikan opsi{" "}
          <span className="font-semibold">&quot;Terapkan aturan anti-duplikat&quot;</span> di
          Pengaturan Narasi bila narasi yang mirip tetap diizinkan.
        </div>
      ) : (
        result.varian.map((v, i) => (
          <VariantCard
            key={v.id}
            variant={v}
            index={i}
            payload={payload}
            others={result.varian.filter((o) => o.id !== v.id).map((o) => o.teks)}
            onFixed={onFixed}
          />
        ))
      )}
    </div>
  );
}
