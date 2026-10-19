# Generator Narasi Multi-Agent

Aplikasi web untuk mengubah **teks kasus** (topik, rekomendasi headline, konteks, bahan, rules Do's & Don'ts) menjadi **narasi unik**:
- Teks kasus dipilah otomatis menjadi field terstruktur yang bisa diedit (termasuk perbaikan typo).
- Bahan/sumber bisa dipilih satu atau banyak lewat checkbox.
- Narasi digenerate sesuai **durasi target** dan **brief** yang diminta, hingga **10 varian** per run.
- **Aturan anti-duplikat opsional** (default aktif): saat aktif, tidak ada narasi yang sama — baik antar varian dalam satu run maupun dengan narasi lama. Bisa dimatikan bila narasi yang mirip tetap diizinkan.
- Setiap varian dilengkapi **Media Pendukung**: daftar link video YouTube terkait + gambar berlisensi terbuka (Openverse), lengkap dengan tautan pencarian cadangan.
- **Login multi-user** dengan peran **user/admin** (Supabase Auth). Tidak ada pendaftaran mandiri: akun hanya dibuat admin dari halaman **Admin** dan langsung aktif tanpa verifikasi email.
- **Riwayat generate tersimpan di Supabase** dan dapat dibuka di halaman **Riwayat** (user melihat miliknya, admin melihat semua). Admin dapat membuat akun dan mengelola peran di halaman **Admin**.
- **Anti-duplikat bersifat global**: riwayat narasi seluruh pengguna dipakai sebagai pembanding.

- Frontend: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + `@supabase/supabase-js` → `frontend/`
- Backend: Python FastAPI + pipeline agen berlapis → `backend/`
- Database & Auth: **Supabase** (Postgres + Auth + RLS) → `supabase/migrations/`
- Deployment: **Docker Compose** (opsional) → `docker-compose.yml`

---

## Setup Supabase (wajib)

1. Buat project di [supabase.com](https://supabase.com), lalu buka **SQL Editor**.
2. Salin seluruh isi `supabase/migrations/0001_init.sql` → **Run**. Migrasi membuat tabel,
   trigger profil otomatis, fungsi `is_admin()`, dan policy RLS. Aman dijalankan ulang.
3. Isi kredensial dari **Project Settings → API**:

   `backend/.env` (sudah tersedia sebagai template):

   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<anon/public key>
   SUPABASE_SERVICE_ROLE_KEY=<service role / secret key>
   ```

   `frontend/.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/public key>
   ```

   Kunci legacy (`anon`, `service_role`) maupun kunci baru (publishable `sb_publishable_...`,
   secret `sb_secret_...`) didukung. Di frontend isi **publishable/anon**, di backend isi
   **secret/service_role** pada `SUPABASE_SERVICE_ROLE_KEY`.

4. **Akun pertama (admin).** Pendaftaran mandiri sudah dihapus, jadi sediakan admin pertama dengan
   salah satu cara:
   - Bila project sudah punya akun auth (mis. dari percobaan sebelumnya), migrasi otomatis
     mempromosikan akun paling awal menjadi **admin**.
   - Untuk project benar-benar baru, jalankan dari folder `backend` (venv aktif):

     ```bash
     python create_admin.py admin@redaksi.id "password-ku" --nama "Admin"
     ```

   Setelah itu masuk di `/login`; akun berikutnya dibuat admin lewat halaman **Admin**.
5. Akun yang dibuat dari halaman **Admin** (dan script di atas) langsung aktif — `email_confirm`
   disetel `true`, jadi **tidak ada email verifikasi** dan tidak bergantung pada pengaturan
   **Confirm email** di Supabase.

> **Keamanan:** `SUPABASE_SERVICE_ROLE_KEY` hanya untuk backend dan melewati RLS — jangan pernah
> memasukkannya ke frontend atau commit ke git. `backend/.env` dan `frontend/.env.local` sudah
> di-ignore oleh `.gitignore`.

### Tabel yang dibuat

| Tabel | Isi | Akses baca (RLS) |
|---|---|---|
| `profiles` | 1 baris per akun: email, nama, peran (`user`/`admin`) | Sendiri; admin semua. Update peran hanya admin. |
| `generations` | 1 baris per klik Generate: topik, headline, durasi, jumlah varian, mode, payload permintaan | Sendiri; admin semua. |
| `narrations` | 1 baris per varian tersimpan (teks + teks normal) — juga sumber riwayat anti-duplikat global | Sendiri; admin semua. |

Penulisan riwayat dilakukan backend dengan service role (tanpa policy insert/update/delete untuk
user biasa), sehingga konsistensi data tetap terkendali.

---

## Menjalankan

### Cara cepat (Windows)

Selesaikan **Setup Supabase** di atas terlebih dahulu (migrasi SQL + isi `backend/.env` dan
`frontend/.env.local`). Lalu klik dua kali **`start.bat`** di root proyek. Script akan:
1. Membuat virtualenv + install dependensi backend dan `npm install` frontend (hanya bila belum ada).
2. Memperingatkan bila kredensial Supabase belum lengkap.
3. Menjalankan backend (`--host 0.0.0.0`, siap diakses dari perangkat lain) dan frontend di dua jendela terpisah (`Narasi-Backend`, `Narasi-Frontend`).
4. Mendeteksi IP LAN komputer, menampilkan alamat akses jaringan, dan membuka `http://localhost:3000` di browser.

Bila dijalankan **sebagai Administrator**, script otomatis membuka port 8000/3000 di Windows
Firewall (profil domain/privat, berlaku terus). Tanpa admin, cukup klik **"Allow access"** bila
Windows menanyakan izin firewall saat server pertama kali berjalan.

Bila port 8000 / 3000 sudah terpakai, langkah terkait dilewati (server dianggap sudah berjalan).
Tutup kedua jendela `Narasi-*` untuk menghentikan server.

### Cara Docker (frontend + backend)

Prasyarat: **Docker Desktop** (Compose v2). Supabase tetap layanan eksternal — tidak ada database
di dalam container, jadi data tidak hilang saat container dihapus.

1. Pastikan `backend/.env` dan `frontend/.env.local` sudah terisi (lihat **Setup Supabase**).
2. Dari root proyek, jalankan:

   ```bash
   docker compose --env-file frontend/.env.local up -d --build
   ```

   Di Windows, bisa juga klik dua kali **`start-docker.bat`**.

   `--env-file` wajib karena `NEXT_PUBLIC_*` ditanam ke bundle **saat build** image frontend,
   bukan dibaca saat container berjalan.

3. Buka:
   - Aplikasi: `http://localhost:3000`
   - API docs: `http://localhost:8000/docs`
   - Health: `http://localhost:8000/api/health`

Perintah lain:

```bash
docker compose logs -f                 # lihat log
docker compose down                    # hentikan container
docker compose --env-file frontend/.env.local up -d --build   # rebuild setelah kode/env frontend berubah
docker compose exec backend python create_admin.py admin@redaksi.id "password" --nama "Admin"
```

Catatan Docker:

- `backend/.env` dibaca sebagai environment **runtime**; setelah mengubahnya cukup
  `docker compose up -d` (tanpa rebuild).
- `frontend/.env.local` dibaca saat **build**; setelah mengubahnya wajib rebuild image frontend.
- Akses LAN: buka `http://<IP-LAN>:3000`, lalu pastikan port **3000** dan **8000** terbuka di
  firewall host. Frontend otomatis memanggil backend di host yang sama, port 8000.
- Bila dipasang di balik reverse proxy/domain, gunakan **satu domain** dengan path `/api/`
  diteruskan ke backend (lihat **Deploy ke Ubuntu Server**). Isi `NEXT_PUBLIC_API_URL=https://domain-anda`
  di `frontend/.env.local` sebelum build, supaya frontend memanggil `/api/...` di origin yang sama.

### Deploy ke Ubuntu Server

Prasyarat: Ubuntu 22.04/24.04, akses SSH + sudo, dan kode sudah di-push ke Git (atau disalin via
`rsync`/`scp`). Supabase tetap eksternal.

1. **Install Docker Engine + Compose plugin** (repo resmi Docker):

   ```bash
   sudo apt update && sudo apt install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
   https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
     | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker "$USER"   # logout/login agar berlaku
   ```

2. **Ambil kode dan isi env**:

   ```bash
   git clone https://github.com/hendradevelop-cell/generator-narasi.git
   cd generator-narasi
   cp backend/.env.example backend/.env
   nano backend/.env                 # LLM_API_KEY, SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY
   nano frontend/.env.local          # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
                                     # NEXT_PUBLIC_API_URL=https://domain-anda
   chmod 600 backend/.env frontend/.env.local
   ```

   `SUPABASE_SERVICE_ROLE_KEY` hanya boleh ada di `backend/.env` — jangan pernah di frontend.
   Migrasi SQL (`supabase/migrations/0001_init.sql`) cukup dijalankan sekali dari SQL Editor Supabase.

3. **Jalankan** (bind ke loopback karena di balik Nginx):

   ```bash
   BIND_ADDR=127.0.0.1 docker compose --env-file frontend/.env.local up -d --build
   docker compose ps
   curl http://127.0.0.1:8000/api/health
   ```

   Bootstrap admin pertama (bila belum ada):

   ```bash
   docker compose exec backend python create_admin.py admin@domain-anda "PasswordKuat" --nama "Admin"
   ```

4. **Nginx + HTTPS** (satu domain, `/api/` ke backend):

   ```nginx
   server {
       server_name narasi.domain-anda;
       client_max_body_size 10m;

       location /api/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   sudo ln -s /etc/nginx/sites-available/narasi /etc/nginx/sites-enabled/narasi
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d narasi.domain-anda
   sudo ufw allow "Nginx Full"   # port 80/443 saja; 3000/8000 tidak perlu dibuka
   ```

   Catatan: port Docker yang di-publish bisa menembus UFW, karena itu gunakan
   `BIND_ADDR=127.0.0.1` (langkah 3) sehingga 3000/8000 hanya bisa diakses dari server itu sendiri.

5. **Update aplikasi**:

   ```bash
   git pull
   BIND_ADDR=127.0.0.1 docker compose --env-file frontend/.env.local up -d --build
   docker compose logs -f --tail=100
   ```

   Data tetap aman di Supabase — `docker compose down` tidak menghapus data. Ubah env backend →
   `docker compose up -d`; ubah env frontend → rebuild (`up -d --build`).

Untuk LAN tanpa domain, lewati Nginx dan jalankan tanpa `BIND_ADDR` (default `0.0.0.0`), lalu buka
`http://<IP-server>:3000` dan izinkan port 3000/8000 di UFW.

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

Pastikan `backend/.env` sudah berisi kredensial Supabase (lihat **Setup Supabase**).

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt        # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # Linux/macOS

.venv/Scripts/python -m uvicorn app.main:app --port 8000 --host 0.0.0.0
# Ganti ke --host 127.0.0.1 bila cukup diakses dari komputer ini saja.
```

Cek: `http://localhost:8000/api/health` → `{"status":"ok",...,"supabase":true}`

#### 2. Frontend (Next.js, port 3000)

Pastikan `frontend/.env.local` sudah berisi URL + anon key Supabase.

```bash
cd frontend
npm install
npm run dev
```

Buka `http://localhost:3000` → diarahkan ke `/login` bila belum masuk. Frontend otomatis memanggil
backend di **host yang sama dengan halaman dibuka** (port 8000). Isi `NEXT_PUBLIC_API_URL` hanya
sebagai override eksplisit bila backend berada di host/port lain:

```env
# NEXT_PUBLIC_API_URL=http://192.168.1.10:8000
```

#### 3. Alur pemakaian

0. **Masuk** — gunakan akun yang dibuat admin. Tidak ada pendaftaran mandiri. Admin membuat akun
   baru (langsung aktif, tanpa verifikasi email) lewat halaman **Admin**. Halaman **Riwayat**
   menampilkan hasil generate yang tersimpan.
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
 L2   Basis Riwayat ─────── muat narasi lama dari Supabase (global semua user)
      │                     untuk cek duplikat
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
 Hasil akhir + log agen lengkap   (varian + run tersimpan ke Supabase bila berhasil)
```

### Anti-duplikat (opsional, default aktif)

Diatur lewat checkbox **"Terapkan aturan anti-duplikat"** di langkah 3 (field API `anti_duplikat`, default `true`).

**Saat aktif** (jaminan "jangan ada narasi yang sama"):

- Kemiripan diukur dengan **cosine similarity char-4-gram** terhadap semua varian
  lain di run yang sama **dan** 200 narasi terbaru dari tabel `narrations` di Supabase
  (global lintas pengguna).
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

Halaman **Riwayat** mencatat setiap klik Generate sebagai satu baris `generations`
(termasuk run dengan 0 varian), sedangkan tabel `narrations` menyimpan teks tiap varian.
Riwayat ini yang dipakai sebagai pembanding anti-duplikat pada run berikutnya — oleh karena itu
generate ulang dengan input persis sama dapat menghasilkan 0 varian.

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
4. Hasil terbaik ditampilkan dan disimpan ke tabel `narrations` Supabase; bila temuan belum
   habis, tombol bisa diklik lagi (log mencatat status "catatan").

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

Untuk memakai LLM (OpenAI-compatible), isi `backend/.env`:

```env
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
WORDS_PER_MINUTE=150
DUP_THRESHOLD=0.92

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon/public key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

Bila `LLM_API_KEY` terisi, L1 (pemilah) dan L3 (penulis) memakai LLM dengan fallback
otomatis ke heuristik/template bila panggilan gagal. Kredensial Supabase tetap wajib diisi
agar login dan riwayat berfungsi.

---

## API

Semua endpoint `POST` memerlukan **Bearer access token** dari Supabase Auth
(dikirim otomatis oleh frontend). Tanpa token valid → `401 Login diperlukan.`

| Endpoint | Auth | Fungsi |
|---|---|---|
| `GET /api/health` | publik | Status server + mode (mock/llm), pengaturan durasi & ambang duplikat, status konfigurasi Supabase |
| `POST /api/parse` | bearer | `{teks}` → field terstruktur (topik, headlines, konteks, bahan, rules) + log L1 |
| `POST /api/generate` | bearer | Konten terpilih + durasi + brief → varian narasi + log semua lapisan; run disimpan ke `generations` + `narrations` |
| `POST /api/fix` | bearer | Teks varian + konteks kasus + rules → naskah ditulis ulang bebas temuan; hasil disimpan ke `narrations` |
| `POST /api/media` | bearer | `{topik, headline, teks}` → video YouTube + gambar Openverse terkait + daftar kueri (UI menyusun tautan pencarian cadangan) |
| `POST /api/admin/users` | admin | `{email, password, nama, role}` → akun Supabase langsung terkonfirmasi + profil dengan peran yang diminta; hanya berlaku untuk `profiles.role = 'admin'` |

Dokumentasi interaktif: `http://localhost:8000/docs` (klik **Authorize** dan tempel access token
bila ingin mencoba endpoint ber-auth dari Swagger).

## Halaman

| Rute | Akses | Isi |
|---|---|---|
| `/login` | publik | Masuk (tanpa pendaftaran; akun dibuat admin) |
| `/` | login | Generator narasi (alur 3 langkah) |
| `/history` | login | Tabel riwayat generate; user melihat miliknya, admin melihat semua; klik **Lihat** untuk naskah tiap varian |
| `/admin` | admin | Statistik + manajemen peran user/admin (peran sendiri tidak dapat diubah) |

## Struktur repo

```
backend/
  app/
    main.py            # FastAPI + CORS + dependency auth (Bearer token) + endpoint admin
    schemas.py         # model Pydantic (kontrak API)
    parser.py          # L1 pemilah heuristik + LLM
    pipeline.py        # orkestrasi L0–L5 + loop revisi + simpan riwayat
    supabase_db.py     # validasi token, profil/peran, buat akun admin, simpan riwayat
    media.py           # pencari media pendukung (YouTube + Openverse) + cache
    textutil.py        # normalisasi angka/teks, similarity, kata kunci
    llm.py             # klien LLM (opsional)
    agents/            # orchestrator, writer, fixer, fact_checker, compliance, uniqueness, editor
  create_admin.py      # bootstrap admin pertama (project baru)
  Dockerfile           # image backend (python:3.12-slim)
frontend/
  src/app/
    (auth)/login/      # halaman masuk
    (app)/             # route terproteksi: generator, history, admin
  src/components/      # AuthProvider, RequireAuth, TopBar, EditableList, ResultsPanel, AgentLogPanel
  src/lib/             # types (mirror schema backend), api client, supabase client
  Dockerfile           # image frontend (Next.js standalone, node:22-alpine)
supabase/
  migrations/0001_init.sql  # profiles, generations, narrations, RLS, trigger profil + backfill admin pertama
docker-compose.yml     # orkestrasi backend + frontend
start.bat              # launcher Windows (lokal + LAN)
start-docker.bat       # launcher Windows untuk Docker Compose
```
