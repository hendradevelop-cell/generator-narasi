import type {
  FixRequest,
  FixResponse,
  GenerateRequest,
  GenerateResponse,
  Health,
  MediaRequest,
  MediaResponse,
  ParsedCase,
} from "./types";

// Prioritas: NEXT_PUBLIC_API_URL (override eksplisit) → host yang sama dengan
// halaman dibuka (mendukung akses dari perangkat lain di LAN) → localhost.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text.slice(0, 200) || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const getHealth = () => request<Health>("/api/health");

export const parseCase = (teks: string) =>
  request<ParsedCase>("/api/parse", {
    method: "POST",
    body: JSON.stringify({ teks }),
  });

export const generateNarration = (payload: GenerateRequest) =>
  request<GenerateResponse>("/api/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fixNarration = (payload: FixRequest) =>
  request<FixResponse>("/api/fix", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchMedia = (payload: MediaRequest) =>
  request<MediaResponse>("/api/media", {
    method: "POST",
    body: JSON.stringify(payload),
  });
