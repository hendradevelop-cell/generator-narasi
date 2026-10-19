import { createClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const supabaseConfigured = Boolean(url && anonKey);

// Placeholder hanya agar build tidak gagal saat env belum diisi; semua pemakaian
// dijaga oleh `supabaseConfigured` dan UI menampilkan panduan konfigurasi.
export const supabase = createClient(
  url || "http://127.0.0.1:54321",
  anonKey || "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
