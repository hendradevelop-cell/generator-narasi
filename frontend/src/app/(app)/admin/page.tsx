"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import RequireAuth from "@/components/RequireAuth";
import { createUser } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function friendlyError(message: string) {
  const low = message.toLowerCase();
  if (low.includes("does not exist") || low.includes("could not find the table")) {
    return "Tabel belum ada. Jalankan migrasi supabase/migrations/0001_init.sql di Supabase SQL Editor.";
  }
  if (low.includes("permission denied") || low.includes("row-level security")) {
    return "Akses ditolak oleh kebijakan RLS. Pastikan migrasi (termasuk policy) sudah dijalankan.";
  }
  return message;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth adminOnly>
      <AdminContent />
    </RequireAuth>
  );
}

function AdminContent() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [stats, setStats] = useState({ profiles: 0, generations: 0, narrations: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingId, setSavingId] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const [form, setForm] = useState({
    nama: "",
    email: "",
    password: "",
    role: "user" as "user" | "admin",
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase
        .from("profiles")
        .select("id,email,nama,role,created_at")
        .order("created_at", { ascending: true }),
      supabase.from("generations").select("id", { count: "exact", head: true }),
      supabase.from("narrations").select("id", { count: "exact", head: true }),
    ]).then(([u, g, n]) => {
      if (!alive) return;
      const firstError = u.error || g.error || n.error;
      if (firstError) {
        setError(friendlyError(firstError.message));
      } else {
        setError("");
        setUsers((u.data as Profile[]) ?? []);
        setStats({
          profiles: u.data?.length ?? 0,
          generations: g.count ?? 0,
          narrations: n.count ?? 0,
        });
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

  const changeRole = async (user: Profile, role: "user" | "admin") => {
    if (user.role === role) return;
    setSavingId(user.id);
    setError("");
    setNotice("");
    const { error: err } = await supabase.from("profiles").update({ role }).eq("id", user.id);
    if (err) {
      setError(friendlyError(err.message));
    } else {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
      setNotice(
        `${user.nama || user.email} sekarang menjadi ${role === "admin" ? "Admin" : "User"}.`
      );
    }
    setSavingId("");
  };

  const submitAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setFormError("");
    setNotice("");
    try {
      const account = await createUser({
        email: form.email.trim(),
        password: form.password,
        nama: form.nama.trim(),
        role: form.role,
      });
      setNotice(
        `Akun ${account.email} dibuat sebagai ${
          account.role === "admin" ? "Admin" : "User"
        }. Akun langsung aktif tanpa verifikasi email.`
      );
      setForm({ nama: "", email: "", password: "", role: "user" });
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal membuat akun.");
    } finally {
      setCreating(false);
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Admin</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Kelola peran pengguna dan pantau aktivitas generate di seluruh tim.
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
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pengguna"
          value={loading ? "…" : String(stats.profiles)}
          hint={`${adminCount} admin`}
        />
        <StatCard label="Generate" value={loading ? "…" : String(stats.generations)} />
        <StatCard
          label="Narasi tersimpan"
          value={loading ? "…" : String(stats.narrations)}
          hint="Sumber riwayat anti-duplikat global"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Tambah Pengguna</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Akun dibuat langsung aktif tanpa verifikasi email. Pendaftaran mandiri tidak tersedia.
          </p>
        </div>
        <form onSubmit={submitAccount} className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Nama</label>
              <input
                type="text"
                value={form.nama}
                onChange={(e) => setForm((prev) => ({ ...prev, nama: e.target.value }))}
                placeholder="Nama tampilan"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="nama@redaksi.id"
                className={inputCls}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Minimal 6 karakter"
                className={inputCls}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-700">Peran</label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, role: e.target.value as "user" | "admin" }))
                }
                className={inputCls}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {creating ? "Membuat akun…" : "Buat Akun"}
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Manajemen Peran</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Akun dibuat admin lewat formulir di atas. Peran sendiri tidak dapat diubah dari halaman
            ini.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Terdaftar</th>
                <th className="px-4 py-3 font-semibold">Peran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    Memuat pengguna…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    Belum ada pengguna terdaftar.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelf = user.id === profile?.id;
                  return (
                    <tr key={user.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {user.nama || "—"}
                          {isSelf ? (
                            <span className="ml-1.5 text-xs font-normal text-indigo-600">
                              (Anda)
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{user.email || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString("id-ID", {
                              dateStyle: "medium",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select
                            value={user.role}
                            onChange={(e) => changeRole(user, e.target.value as "user" | "admin")}
                            disabled={isSelf || savingId === user.id}
                            title={isSelf ? "Peran akun sendiri tidak dapat diubah" : undefined}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                          {savingId === user.id ? (
                            <span className="text-xs text-slate-400">Menyimpan…</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
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
