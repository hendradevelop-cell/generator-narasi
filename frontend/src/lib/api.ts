import { supabase } from "./supabase";
import type {
  CreateUserRequest,
  FixRequest,
  FixResponse,
  GenerateRequest,
  GenerateResponse,
  Health,
  MediaRequest,
  MediaResponse,
  ParsedCase,
  UserAccount,
} from "./types";

// Prioritas: NEXT_PUBLIC_API_URL (override eksplisit) → host yang sama dengan
// halaman dibuka (mendukung akses dari perangkat lain di LAN) → localhost.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "http://localhost:8000");

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      // respons bukan JSON — pakai teks apa adanya
    }
    throw new Error(detail || `HTTP ${res.status} ${res.statusText}`);
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

export const createUser = (payload: CreateUserRequest) =>
  request<UserAccount>("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
