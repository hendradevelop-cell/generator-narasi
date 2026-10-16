# Generator Narasi Multi-Agent

Aplikasi web untuk mengubah **teks kasus** (topik, rekomendasi headline, konteks, bahan, rules Do's & Don'ts) menjadi **narasi unik**:
- Teks kasus dipilah otomatis menjadi field terstruktur yang bisa diedit (termasuk perbaikan typo).
- Bahan/sumber bisa dipilih satu atau banyak lewat checkbox.
- Narasi digenerate sesuai **durasi target** dan **brief** yang diminta, hingga **10 varian** per run.
- **Aturan anti-duplikat opsional** (default aktif): saat aktif, tidak ada narasi yang sama — baik antar varian dalam satu run maupun dengan narasi lama. Bisa dimatikan bila narasi yang mirip tetap diizinkan.
- Setiap varian dilengkapi **Media Pendukung**: daftar link video YouTube terkait + gambar berlisensi terbuka (Openverse), lengkap dengan tautan pencarian cadangan.

- Frontend: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 → `frontend/`
- Backend: Python FastAPI + pipeline agen berlapis → `backend/`

---

## Menjalankan

### Cara cepat (Windows)

Klik dua kali **`start.bat`** di root proyek. Script akan:
1. Membuat virtualenv + install dependensi backend dan `npm install` frontend (hanya bila belum ada).
2. Menjalankan backend (`--host 0.0.0.0`, siap diakses dari perangkat lain) dan frontend di dua jendela terpisah (`Narasi-Backend`, `Narasi-Frontend`).
3. Mendeteksi IP LAN komputer, menampilkan alamat akses jaringan, dan membuka `http://localhost:3000` di browser.

Bila dijalankan **sebagai Administrator**, script otomatis membuka port 8000/3000 di Windows
Firewall (profil domain/privat, berlaku terus). Tanpa admin, cukup klik **"Allow access"** bila
Windows menanyakan izin firewall saat server pertama kali berjalan.

Bila port 8000 / 3000 sudah terpakai, langkah terkait dilewati (server dianggap sudah berjalan).
Tutup kedua jendela `Narasi-*` untuk menghentikan server.

### Akses dari perangkat lain di jaringan (LAN)

Frontend dan backend sudah siap jaringan:

- Backend bind ke `0.0.0.0:8000` (semua antarmuka); frontend dev juga melayani origin jaringan.
- Frontend otomatis memanggil backend di **host yang sama dengan halaman dibuka**
  (dibuka dari perangkat lain → API ikut mengarah ke mesin ini). `NEXT_PUBLIC_API_URL`
  hanya perlu diisi bila backend berada di host/port berbeda.
- CORS backend mengizinkan origin lokal + rentang IP privat (10.x, 192.168.x, 172.16–31.x),
  dan Next.js mengizinkan aset dev untuk origin tersebut (`allowedDevOrigins`).
- `start.bat` mencetak alamat LAN, contoh `http://10.10.10.60:3000` dan
  `http://10.10.10.60:8000/docs`; jendela `Narasi-Frontend` juga menampilkan baris `Network:`.

Dari HP/laptop lain di jaringan yang sama, buka `http://<IP-LAN>:3000`.
Bila tidak bisa dibuka: pastikan perangkat berada di jaringan yang sama dan izinkan
python/node lewat Windows Firewall (atau jalankan `start.bat` sebagai Administrator sekali saja).

### Manual

#### 1. Backend (FastAPI, port 8000)

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # Linux/macOS

.venv/Scripts/python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
# Ganti ke --host 127.0.0.1 bila cukup diakses dari komputer ini saja.
```

Cek: `http://localhost:8000/api/health` → `{"status":"ok","mode":"mock",...}`

#### 2. Frontend (Next.js, port 3000)

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:3000`. Frontend otomatis memanggil backend di **host yang sama dengan
halaman dibuka** (port 8000). `frontend/.env.local` hanya perlu diisi sebagai override eksplisit
bila backend berada di host/port lain:

```env
# NEXT_PUBLIC_API_URL=http://192.168.1.10:8000
```

#### 3. Alur pemakaian

1. **Tempel Teks Kasus** — paste teks mentah (seperti `backend/../SAMPLE` di halaman: tombol "Isi Contoh Kasus" mengisi contoh kasus BPIH 2027). Klik **Pilah Konten**.
   Pemilah mengenali variasi label bagian (mis. "Rekomendasi Judul", "Sumber", "Larangan", heading markdown `###`, teks tebal) — dan bila teks kasus tidak memuat bagian headline, rekomendasi headline otomatis disusun dari topik (tercatat di Log Agen L1).
2. **Sunting Hasil Pilah** — semua field bisa diedit: topik, daftar headline (pilih satu sebagai headline utama), konteks per baris, daftar bahan dengan checkbox, Do's/Don'ts. Perbaiki typo langsung di sini.
3. **Pengaturan Narasi** — isi durasi target (detik/menit), jumlah varian (1–10), dan brief narasi.
   Centang/hilangkan **Terapkan aturan anti-duplikat** sesuai kebutuhan. Klik **Generate Narasi**.

Hasil menampilkan tiap varian dengan gaya penulisan berbeda, lengkap dengan badge
estimasi durasi, skor kemiripan tertinggi, status rules, dan verifikasi angka.
Panel **Log Agen** menampilkan seluruh aktivitas tiap lapisan agen.
4. **Media Pendukung** — setiap kartu varian otomatis menampilkan daftar link video YouTube
   (dengan thumbnail + kanal) dan gambar terkait dari Openverse (berlisensi terbuka; klik
   gambar untuk melihat sumber & lisensi). Chip **YouTube: … / Gambar: …** selalu tersedia
   sebagai tautan pencarian cadangan, termasuk bila hasil langsung kosong atau server offline.
5. **Perbaiki (Rewrite)** — bila sebuah varian punya temuan/peringatan rules, kartunya
   menampilkan tombol **Perbaiki**. Agen menulis ulang narasi itu agar temuan hilang
   (tanpa menambah angka di luar sumber) dan otomatis diverifikasi ulang.

---

## Arsitektur agen berlapis

```
Teks kasus mentah
      │
 L1   Agen Pemilah ──────── heuristik struktur toleran label (Headline/Judul,
      │                     Konteks, Bahan/Sumber, Do's/Larangan, heading markdown)
      │                     atau LLM bila API key diisi
      │                     → field terstruktur + log;
      │                     headline kosong → direkomendasikan dari topik
      ▼  (diedit user di UI)
 Generasi narasi (POST /api/generate)
      │
 L0   Orkestrator ───────── rencana produksi: target kata dari durasi,
      │                     alur segmen, jumlah varian, bahan terpilih
 L2   Basis Riwayat ─────── muat narasi lama (SQLite) untuk cek duplikat
      │                     (dilewati bila aturan anti-duplikat nonaktif)
      │
      ├─ per varian (maks 2–3 percobaan):
 L3   Agen Penulis ──────── template gaya (Lugas / Bercerita / Fokus Rincian)
      │                     atau LLM; menerima daftar teks yang harus dihindari
 L5   Agen Penyunting ───── potong/padatkan agar muat target durasi (±15%),
      │                     pola kalimat tanpa angka dipotong lebih dulu
 L4   Agen Verifikator ──── 3 pemeriksa independen:
      │                       • Fakta angka — semua angka harus ada di sumber
      │                       • Kepatuhan rules — Do's wajib, Don'ts dilarang
      │                       • Keunikan — kemiripan < ambang duplikat
      │                         (informatif saja bila anti-duplikat nonaktif)
      │                     gagal → revisi (ulang percobaan) → dibatalkan bila tetap mirip
      ▼
 Hasil akhir + log agen lengkap   (hanya varian lolos yang disimpan ke riwayat)
```

### Anti-duplikat (opsional, default aktif)

Diatur lewat checkbox **"Terapkan aturan anti-duplikat"** di langkah 3 (field API `anti_duplikat`, default `true`).

**Saat aktif** (jaminan "jangan ada narasi yang sama"):

- Kemiripan diukur dengan **cosine similarity char-4-gram** terhadap semua varian
  lain di run yang sama **dan** seluruh riwayat tersimpan (`backend/data/history.sqlite`).
- Bila pembuka (12 kata pertama, dinormalisasi) identik → langsung dianggap duplikat.
- Ambang default `0.92` (aturan ketat: hanya menangkap yang benar-benar identik/hampir identik);
  setiap gaya punya pembuka, lead-in, dan substitusi sinonim berbeda agar tetap unik.
- Varian yang tetap mirip setelah percobaan ulang **tidak ditampilkan** dan tidak disimpan —
  log mencatat "dibatalkan karena duplikat".
- Konsekuensi: generate ulang dengan input persis sama akan menghasilkan 0 varian.
  Ini disengaja; ubah durasi, brief, atau konten untuk mendapat narasi baru.

**Saat nonaktif**:

- Riwayat tidak dimuat; kemiripan tetap dihitung terhadap varian lain di run yang sama
  hanya sebagai **informasi** (badge menampilkan caption
  "Aturan anti-duplikat nonaktif — kemiripan X% hanya sebagai informasi.").
- Tidak ada varian yang digugurkan karena kemiripan; semua hasil tetap disimpan ke riwayat.

Catatan: pada mode mock (template gaya terbatas), jumlah besar varian unik sulit dicapai
saat aturan aktif — varian yang mirip otomatis digugurkan sehingga hasil bisa jauh di bawah
yang diminta. Untuk variasi lebih kaya, pakai mode LLM.

### Estimasi durasi

`estimasi_detik = jumlah_kata / WORDS_PER_MINUTE × 60` (default 150 kata/menit).
Target kata = durasi × kata/menit, toleransi penerimaan ±15% (badge "sesuai").

### Pemeriksaan angka (anti-halusinasi)

Setiap angka di draf (termasuk format Indonesia `Rp98,47 juta` → `98470000`) harus
ditemukan di sumber: topik, headline, konteks, bahan terpilih, Do's/Don'ts, atau brief.
Angka karangan agen langsung memicu revisi.

### Pemeriksaan rules

- **Don'ts**: kalimat pelanggaran dideteksi dengan pencocokan token inti aturan di sekitar
  kemunculan angka dalam satu jendela teks (bukan sekadar kata kunci di mana pun),
  sehingga frasa yang sah tidak ikut tertuduh.
- **Do's**: frasa yang dikutip harus hadir (≥70% kata), angka wajib ikut hanya bila angka
  tersebut memang ada di konten kasus.

### Perbaiki narasi (fix temuan rules)

Tombol **Perbaiki (Rewrite)** muncul pada varian yang masih punya pelanggaran atau
peringatan rules. Alur `POST /api/fix` (lapisan L5 → L4):

1. **L5 rewrite** — mode LLM: naskah ditulis ulang mengikuti daftar temuan; mode mock:
   beberapa susunan alternatif dirakit ulang dari template varian.
2. **Bedah kalimat** (bila masih ada pelanggaran) — kalimat pemicu yang teridentifikasi
   dihapus dan panjang dikembalikan dengan kalimat netral tanpa angka.
3. **L4 verifikasi ulang** — kandidat terbaik dipilih berdasarkan lolos-tidaknya fakta
   angka + rules + keunikan (dibanding varian lain dan riwayat, naskah asal dikecualikan
   agar tidak dianggap duplikat dengan dirinya sendiri).
4. Hasil terbaik ditampilkan dan disimpan ke basis riwayat; bila temuan belum habis,
   tombol bisa diklik lagi (log mencatat status "catatan").

### Media Pendukung (pencarian otomatis)

Setiap kartu varian memanggil `POST /api/media` (modul `backend/app/media.py`) untuk mencari
materi pendukung narasi — tanpa API key tambahan:

- **Video YouTube** — hasil pencarian langsung dari halaman hasil YouTube (`ytInitialData`),
  thumbnail dari `i.ytimg.com`, kanal ditampilkan di bawah judul.
- **Gambar** — Openverse API (foto/gambar berlisensi terbuka; atribusi kreator + lisensi
  ditampilkan). Thumbnail Wikimedia Commons diambil via `Special:FilePath` agar selalu
  memakai ukuran sah.
- **Kueri** disusun dari headline utama + topik (frasa kunci berakronim/angka diprioritaskan,
  mis. "MRT Fase 2A"), dengan cadangan kata kunci paling sering; kueri pertama yang berisi
  hasil yang dipakai.
- Hasil di-cache 30 menit per kueri; bila jaringan/di luar jangkauan gagal, bagian media
  menampilkan pesan + chip tautan pencarian cadangan (YouTube/Google Images) sehingga
  selalu ada jalan untuk mencari manual.

---

## Mode Mock vs Mode LLM

Default berjalan **offline (mock)** — deterministik, tanpa API key, cocok untuk demo dan uji alur.
Template gaya mock bersifat netral untuk semua topik (tanpa frasa khusus kasus tertentu).

Untuk memakai LLM (OpenAI-compatible), salin `backend/.env.example` → `backend/.env` dan isi:

```env
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
WORDS_PER_MINUTE=150
DUP_THRESHOLD=0.92
```

Bila `LLM_API_KEY` terisi, L1 (pemilah) dan L3 (penulis) memakai LLM dengan fallback
otomatis ke heuristik/template bila panggilan gagal.

---

## API

| Endpoint | Fungsi |
|---|---|
| `GET /api/health` | Status server + mode (mock/llm), pengaturan durasi & ambang duplikat |
| `POST /api/parse` | `{teks}` → field terstruktur (topik, headlines, konteks, bahan, rules) + log L1 |
| `POST /api/generate` | Konten terpilih + durasi + brief → varian narasi + log semua lapisan |
| `POST /api/fix` | Teks varian + konteks kasus + rules → naskah ditulis ulang bebas temuan (rewrite + verifikasi ulang) |
| `POST /api/media` | `{topik, headline, teks}` → video YouTube + gambar Openverse terkait + daftar kueri (UI menyusun tautan pencarian cadangan) |

Dokumentasi interaktif: `http://localhost:8000/docs`.

## Struktur repo

```
backend/
  app/
    main.py            # FastAPI + CORS
    schemas.py         # model Pydantic (kontrak API)
    parser.py          # L1 pemilah heuristik + LLM
    pipeline.py        # orkestrasi L0–L5 + loop revisi
    store.py           # riwayat narasi (SQLite)
    media.py           # pencari media pendukung (YouTube + Openverse) + cache
    textutil.py        # normalisasi angka/teks, similarity, kata kunci
    llm.py             # klien LLM (opsional)
    agents/            # orchestrator, writer, fixer, fact_checker, compliance, uniqueness, editor
frontend/
  src/app/page.tsx     # alur 3 langkah + contoh kasus
  src/components/      # EditableList, ResultsPanel, AgentLogPanel
  src/lib/             # types (mirror schema backend), api client
```
