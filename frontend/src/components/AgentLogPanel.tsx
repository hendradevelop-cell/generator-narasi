"use client";

import { useState } from "react";
import type { AgentLog } from "@/lib/types";

const STATUS_STYLE: Record<AgentLog["status"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  revisi: "bg-amber-100 text-amber-700",
  catatan: "bg-slate-100 text-slate-600",
};

export default function AgentLogPanel({
  logs,
  title = "Log Agen (Sistem Berlapis)",
}: {
  logs: AgentLog[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!logs.length) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-slate-500">
          {logs.length} aktivitas {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? (
        <div className="max-h-96 space-y-1.5 overflow-y-auto border-t border-slate-100 px-5 py-4">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 font-mono font-semibold text-indigo-600">
                {log.lapisan}
              </span>
              <span
                className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[log.status]}`}
              >
                {log.status}
              </span>
              <span className="text-slate-700">
                <span className="font-medium">{log.agen}</span> — {log.aksi}
                {log.detail ? <span className="text-slate-500"> · {log.detail}</span> : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
