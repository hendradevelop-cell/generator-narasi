export type BahanItem = {
  id: string;
  judul: string;
  url: string;
  dipilih: boolean;
};

export type RulesSet = {
  dos: string[];
  donts: string[];
};

export type AgentLog = {
  lapisan: string;
  agen: string;
  aksi: string;
  status: "ok" | "revisi" | "catatan";
  detail: string;
};

export type ParsedCase = {
  topik: string;
  headlines: string[];
  konteks: string[];
  bahan: BahanItem[];
  rules: RulesSet;
  mode: "llm" | "heuristik";
  log_agen: AgentLog[];
};

export type GenerateRequest = {
  topik: string;
  headlines: string[];
  konteks: string[];
  bahan: BahanItem[];
  rules: RulesSet;
  durasi: number;
  durasi_unit: "detik" | "menit";
  brief_narasi: string;
  jumlah_varian: number;
  anti_duplikat: boolean;
};

export type KeunikanInfo = {
  unik: boolean;
  similaritas_tertinggi: number;
  dibanding: string;
  catatan: string;
};

export type KepatuhanInfo = {
  lolos: boolean;
  pelanggaran: string[];
  peringatan: string[];
};

export type NarrationVariant = {
  id: string;
  label: string;
  teks: string;
  jumlah_kata: number;
  estimasi_durasi_detik: number;
  selisih_persen: number;
  status_durasi: "sesuai" | "melenceng";
  keunikan: KeunikanInfo;
  kepatuhan: KepatuhanInfo;
  cek_fakta: KepatuhanInfo;
};

export type GenerateResponse = {
  mode: "llm" | "mock";
  target_detik: number;
  target_kata_min: number;
  target_kata_max: number;
  varian: NarrationVariant[];
  log_agen: AgentLog[];
};

export type FixRequest = GenerateRequest & {
  id: string;
  teks: string;
  label: string;
  variant_idx: number;
  teks_lain: string[];
};

export type FixResponse = {
  mode: "llm" | "mock";
  berhasil: boolean;
  varian: NarrationVariant;
  log_agen: AgentLog[];
};

export type MediaItem = {
  judul: string;
  url: string;
  info: string;
  thumb: string;
};

export type MediaRequest = {
  topik: string;
  headline: string;
  teks: string;
};

export type MediaResponse = {
  kueri_youtube: string[];
  kueri_gambar: string[];
  youtube: MediaItem[];
  gambar: MediaItem[];
  catatan: string;
};

export type Health = {
  status: string;
  mode: string;
  llm_model: string | null;
  words_per_minute: number;
  dup_threshold: number;
  supabase?: boolean;
};

export type Profile = {
  id: string;
  email: string;
  nama: string;
  role: "user" | "admin";
  created_at?: string;
};

export type CreateUserRequest = {
  email: string;
  password: string;
  nama: string;
  role: "user" | "admin";
};

export type UserAccount = {
  id: string;
  email: string;
  nama: string;
  role: "user" | "admin";
};

export type GenerationRecord = {
  id: string;
  user_id: string;
  topik: string;
  headline: string;
  brief: string;
  durasi_detik: number;
  jumlah_varian_diminta: number;
  jumlah_varian_hasil: number;
  anti_duplikat: boolean;
  mode: string;
  created_at: string;
  profiles?: { email: string; nama: string } | null;
};

export type NarrationRecord = {
  id: string;
  generation_id: string | null;
  label: string;
  teks: string;
  created_at: string;
};
