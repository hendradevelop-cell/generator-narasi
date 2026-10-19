"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./AuthProvider";

const NAV = [
  { href: "/", label: "Generator" },
  { href: "/history", label: "Riwayat" },
];

export default function TopBar() {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const items = profile?.role === "admin" ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;

  const handleLogout = async () => {
    setBusy(true);
    await signOut();
    router.replace("/login");
    setBusy(false);
  };

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
              N
            </span>
            <span className="text-sm font-bold text-slate-900">
              Generator Narasi Multi-Agent
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  pathname === item.href
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-700">
              {profile?.nama || profile?.email || "…"}
            </p>
            <p className="text-[11px] text-slate-400">{profile?.email}</p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              profile?.role === "admin"
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {profile?.role === "admin" ? "Admin" : "User"}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
          >
            {busy ? "Keluar…" : "Keluar"}
          </button>
        </div>
      </div>
    </header>
  );
}
