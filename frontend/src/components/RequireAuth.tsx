"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-800">{title}</h2>
        <div className="mt-2 space-y-3 text-sm text-slate-600">{children}</div>
      </div>
    </div>
  );
}

export default function RequireAuth({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { session, profile, loading, profileLoading, configured, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (configured && !loading && !session) router.replace("/login");
  }, [configured, loading, session, router]);

  if (!configured) {
    return (
      <Notice title="Supabase belum dikonfigurasi">
        <p>Isi variabel berikut di <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">frontend/.env.local</code>, lalu restart <code className="font-mono text-xs">npm run dev</code>:</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 px-3 py-2 text-xs text-slate-100">{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=...`}</pre>
      </Notice>
    );
  }

  if (loading || (session && profileLoading)) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16 text-center text-sm text-slate-500">
        Memuat sesi…
      </div>
    );
  }

  if (!session) return null;

  if (!profile) {
    return (
      <Notice title="Profil tidak ditemukan">
        <p>
          Akun berhasil login, tetapi profil belum ada. Pastikan migrasi SQL Supabase
          (<code className="font-mono text-xs">supabase/migrations/0001_init.sql</code>, termasuk trigger
          <code className="font-mono text-xs"> handle_new_user</code>) sudah dijalankan, lalu muat ulang halaman.
        </p>
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-red-300 hover:text-red-600"
        >
          Keluar
        </button>
      </Notice>
    );
  }

  if (adminOnly && profile.role !== "admin") {
    return (
      <Notice title="Akses khusus admin">
        <p>Halaman ini hanya bisa dibuka oleh admin.</p>
        <Link href="/" className="inline-block font-medium text-indigo-600 hover:text-indigo-700">
          ← Kembali ke Generator
        </Link>
      </Notice>
    );
  }

  return <>{children}</>;
}
