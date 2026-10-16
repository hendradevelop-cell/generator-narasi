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

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
