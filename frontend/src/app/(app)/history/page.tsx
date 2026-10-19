"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RequireAuth from "@/components/RequireAuth";
import { supabase } from "@/lib/supabase";
import type { GenerationRecord, NarrationRecord } from "@/lib/types";

const GENERATION_SELECT =
  "id,user_id,topik,headline,brief,durasi_detik,jumlah_varian_diminta,jumlah_varian_hasil,anti_duplikat,mode,created_at,profiles!generations_user_id_fkey(nama,email)";

function fmtWaktu(iso: string) {
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function fmtDurasi(detik: number) {
  if (detik >= 60) {
    const menit = detik / 60;
    return `${menit.toLocaleString("id-ID", { maximumFractionDigits: 1 })} menit`;
  }
  return `${Math.round(detik)} detik`;
}

function friendlyError(message: string) {
  const low = message.toLowerCase();
  if (low.includes("does not exist") || low.includes("could not find the table")) {
    return "Tabel riwayat belum ada. Jalankan migrasi supabase/migrations/0001_init.sql di Supabase SQL Editor.";
  }
  if (low.includes("permission denied") || low.includes("row-level security")) {
    return "Akses ditolak oleh kebijakan RLS. Pastikan migrasi (termasuk policy) sudah dijalankan.";
  }
  return message;
}

export default function HistoryPage() {
  return (
    <RequireAuth>
      <HistoryContent />
    </RequireAuth>
  );
}

function HistoryContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [rows, setRows] = useState<GenerationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, NarrationRecord[]>>({});
  const [detailLoading, setDetailLoading] = useState("");
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    let alive = true;
    supabase
      .from("generations")
      .select(GENERATION_SELECT)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) {
          setError(friendlyError(err.message));
          setRows([]);
        } else {
          setError("");
          setRows((data as unknown as GenerationRecord[]) ?? []);
        }
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshTick]);

  const load = () => {
    setLoading(true);
    setError("");
    setRefreshTick((tick) => tick + 1);
  };

  const toggle = async (row: GenerationRecord) => {
    if (openId === row.id) {
      setOpenId(null);
      return;
    }
    setOpenId(row.id);
    setDetailError("");
    if (details[row.id]) return;
    setDetailLoading(row.id);
    const { data, error: err } = await supabase
      .from("narrations")
      .select("id,generation_id,label,teks,created_at")
      .eq("generation_id", row.id)
      .order("created_at", { ascending: true });
    if (err) {
      setDetailError(friendlyError(err.message));
    } else {
      setDetails((prev) => ({
        ...prev,
        [row.id]: (data as NarrationRecord[]) ?? [],
      }));
    }
    setDetailLoading("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Riwayat Generate</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {isAdmin
              ? "Semua generate narasi dari seluruh pengguna, terbaru di atas."
              : "Generate narasi milik akun Anda, terbaru di atas."}{" "}
            Tersimpan di Supabase.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Memuat…" : "Muat ulang"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Waktu</th>
                {isAdmin ? <th className="px-4 py-3 font-semibold">Pengguna</th> : null}
                <th className="px-4 py-3 font-semibold">Topik</th>
                <th className="px-4 py-3 font-semibold">Varian</th>
                <th className="px-4 py-3 font-semibold">Durasi</th>
                <th className="px-4 py-3 font-semibold">Anti-duplikat</th>
                <th className="px-4 py-3 font-semibold">Mode</th>
                <th className="px-4 py-3 text-right font-semibold">Naskah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-slate-500">
                    Memuat riwayat…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-10 text-center text-slate-500">
                    {error
                      ? "Riwayat tidak dapat dimuat."
                      : "Belum ada riwayat. Jalankan Generate Narasi untuk mencatat riwayat pertama."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const open = openId === row.id;
                  const user = row.profiles;
                  const isSelf = row.user_id === profile?.id;
                  return (
                    <FragmentRow
                      key={row.id}
                      row={row}
                      open={open}
                      isAdmin={isAdmin}
                      isSelf={isSelf}
                      user={user}
                      onToggle={() => toggle(row)}
                      detail={details[row.id]}
                      detailLoading={detailLoading === row.id}
                      detailError={open ? detailError : ""}
                      colSpan={isAdmin ? 8 : 7}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FragmentRow({
  row,
  open,
  isAdmin,
  isSelf,
  user,
  onToggle,
  detail,
  detailLoading,
  detailError,
  colSpan,
}: {
  row: GenerationRecord;
  open: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  user: GenerationRecord["profiles"];
  onToggle: () => void;
  detail: NarrationRecord[] | undefined;
  detailLoading: boolean;
  detailError: string;
  colSpan: number;
}) {
  return (
    <>
      <tr className={open ? "bg-indigo-50/40" : undefined}>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtWaktu(row.created_at)}</td>
        {isAdmin ? (
          <td className="px-4 py-3">
            <p className="font-medium text-slate-800">
              {user?.nama || user?.email || "—"}
              {isSelf ? <span className="ml-1.5 text-xs font-normal text-indigo-600">(Anda)</span> : null}
            </p>
            {user?.nama ? <p className="text-xs text-slate-400">{user.email}</p> : null}
          </td>
        ) : null}
        <td className="max-w-[260px] px-4 py-3">
          <p className="truncate font-medium text-slate-800" title={row.topik}>
            {row.topik || "—"}
          </p>
          {row.headline ? (
            <p className="truncate text-xs text-slate-400" title={row.headline}>
              {row.headline}
            </p>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          <span
            className={
              row.jumlah_varian_hasil < row.jumlah_varian_diminta
                ? "font-medium text-amber-600"
                : "font-medium text-slate-700"
            }
          >
            {row.jumlah_varian_hasil}
          </span>
          <span className="text-slate-400"> / {row.jumlah_varian_diminta}</span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
          {fmtDurasi(row.durasi_detik)}
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              row.anti_duplikat ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {row.anti_duplikat ? "Aktif" : "Nonaktif"}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              row.mode === "llm" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {row.mode}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
          >
            {open ? "Tutup" : "Lihat"}
          </button>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={colSpan} className="bg-slate-50/70 px-4 py-4">
            {detailLoading ? (
              <p className="text-sm text-slate-500">Memuat naskah…</p>
            ) : detailError ? (
              <p className="text-sm text-red-600">{detailError}</p>
            ) : detail && detail.length > 0 ? (
              <div className="space-y-3">
                {detail.map((nar) => (
                  <div
                    key={nar.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                        {nar.label || "Varian"}
                      </p>
                      <span className="text-[11px] text-slate-400">
                        {nar.teks.split(/\s+/).filter(Boolean).length} kata
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {nar.teks}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Tidak ada naskah tersimpan untuk run ini.</p>
            )}
            {row.brief ? (
              <p className="mt-3 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Brief:</span> {row.brief}
              </p>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}
