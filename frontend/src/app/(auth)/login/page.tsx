"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase, supabaseConfigured } from "@/lib/supabase";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function friendly(message: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "Email atau password salah.",
    "Email not confirmed": "Akun belum aktif. Hubungi admin untuk mengaktifkan.",
    "Too many requests": "Terlalu banyak percobaan. Coba lagi beberapa saat.",
  };
  return map[message] ?? message;
}

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && session) router.replace("/");
  }, [loading, session, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(friendly(signInError.message));
    } else {
      router.replace("/");
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-lg font-bold text-white">
            N
          </div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">
            Generator Narasi Multi-Agent
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Masuk untuk membuat narasi dan mengelola riwayat.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {!supabaseConfigured ? (
            <div className="space-y-3 text-sm text-slate-600">
              <h2 className="text-base font-bold text-slate-800">Supabase belum dikonfigurasi</h2>
              <p>
                Isi variabel berikut di{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                  frontend/.env.local
                </code>
                , lalu restart <code className="font-mono text-xs">npm run dev</code>:
              </p>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=...`}</pre>
              <p className="text-xs text-slate-500">
                Jalankan juga{" "}
                <code className="font-mono text-xs">supabase/migrations/0001_init.sql</code> di SQL
                Editor Supabase.
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-800">Masuk</h2>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@redaksi.id"
                    className={inputCls}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password akun"
                    className={inputCls}
                    autoComplete="current-password"
                  />
                </div>

                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Memproses…" : "Masuk"}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-400">
                Akun dibuat oleh admin. Belum punya akun? Hubungi admin tim Anda.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
