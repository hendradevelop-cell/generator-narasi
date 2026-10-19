"use client";

import { useEffect, useRef, useState } from "react";
import AgentLogPanel from "@/components/AgentLogPanel";
import EditableList from "@/components/EditableList";
import RequireAuth from "@/components/RequireAuth";
import ResultsPanel from "@/components/ResultsPanel";
import { generateNarration, getHealth, parseCase } from "@/lib/api";
import type {
  AgentLog,
  BahanItem,
  FixResponse,
  GenerateRequest,
  GenerateResponse,
  Health,
} from "@/lib/types";

const SAMPLE_CASE = `Topik: Biaya yang Ditanggung Jemaah Haji 2027 Turun Rp3,4 Juta melalui Kesepakatan DPR dan Pemerintah.

Rekomendasi Headline (Kembangkan):
- Beban Biaya Haji Jemaah Turun Rp3,4 Juta, DPR dan Pemerintah Sepakati Skema BPIH 2027
- Biaya Haji yang Dibayar Jemaah Turun Rp3,4 Juta, DPR Sepakati Skema Pembiayaan melalui BPIH 2027

Konteks Pembahasan:
- Besarnya biaya haji menjadi beban calon jemaah, sehingga penurunan biaya yang dibayar langsung menjadi perhatian dalam penetapan BPIH 2027.
- Pada 7 Oktober 2026, DPR dan Pemerintah menyepakati rata-rata BPIH 2027 sebesar Rp98,47 juta per jemaah. Kesepakatan diumumkan Wakil Ketua DPR RI Dasco di Kompleks Parlemen.
- Bipih atau biaya yang ditanggung langsung jemaah ditetapkan Rp54,65 juta, turun sekitar Rp3,4 juta dibandingkan tahun sebelumnya.
- Bipih terdiri atas setoran awal Rp25 juta, Nilai Manfaat Virtual Account Rp3,4 juta, subsidi pemerintah Rp3,2 juta, dan pelunasan Rp23,05 juta.
- Sisanya ditopang Nilai Manfaat pengelolaan dana haji.
- BPIH mencakup biaya penerbangan, akomodasi, konsumsi, transportasi, dan pelayanan jemaah di Indonesia maupun Arab Saudi.
- Keringanan biaya tetap perlu diimbangi kualitas layanan.
- BPIH 2027 ditetapkan untuk kuota 221.000 jemaah. Calon jemaah perlu memantau informasi resmi terkait pelunasan dan tahapan keberangkatan.

Bahan:
- https://haji.go.id/berita/pemerintah-dpr-sepakati-bpih-2027-biaya-yang-ditanggung-jemaah-turun-rp34-juta-1791372846701
- https://bpkh.go.id/publikasi/siaran-pers/bpih-2027-ditetapkan-rata-rata-rp9847-juta-per-jemaah-4450-persen-bersumber-dari-nilai-manfaat

Do's:
- Jadikan penurunan beban biaya yang ditanggung jemaah sekitar Rp3,4 juta sebagai pesan utama di headline dan narasi.
- Bedakan BPIH Rp98,47 juta sebagai total biaya penyelenggaraan dan Bipih Rp54,65 juta sebagai biaya yang ditanggung langsung jemaah.
- Pastikan rincian Bipih konsisten: setoran awal Rp25 juta + Nilai Manfaat Virtual Account Rp3,4 juta + subsidi pemerintah Rp3,2 juta + pelunasan Rp23.048.825 = total Bipih Rp54.648.825.
- Gunakan frasa "beban biaya yang ditanggung jemaah turun sekitar Rp3,4 juta" karena penurunan Rp3.384.981,58 merujuk pada perbandingan Bipih antartahun, bukan penurunan total BPIH.

Don'ts:
- Jangan menyebut Rp98,47 juta sebagai nominal yang harus dibayar langsung oleh jemaah.
- Jangan menulis bahwa total BPIH turun Rp3,4 juta; angka tersebut merujuk pada penurunan beban yang ditanggung langsung jemaah dibandingkan tahun sebelumnya.
- Jangan menjumlahkan setoran awal, Nilai Manfaat Virtual Account, subsidi, dan pelunasan sebagai biaya tambahan di luar Bipih. Keempat komponen tersebut sudah membentuk Bipih Rp54.648.825.
- Jangan menyebut subsidi Rp3,2 juta sebagai satu-satunya penyebab penurunan Rp3,4 juta karena angka penurunan merupakan perbandingan beban Bipih antartahun.`;

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const btnPrimary =
  "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const btnSecondary =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-indigo-400 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60";

function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs text-white">
          {n}
        </span>
        {title}
      </h2>
      {hint ? <p className="mt-1 pl-8 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-slate-700">{label}</label>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <RequireAuth>
      <GeneratorContent />
    </RequireAuth>
  );
}

function GeneratorContent() {
  const [raw, setRaw] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [parseLogs, setParseLogs] = useState<AgentLog[]>([]);

  const [topik, setTopik] = useState("");
  const [headlines, setHeadlines] = useState<string[]>([]);
  const [headlineUtama, setHeadlineUtama] = useState(0);
  const [konteks, setKonteks] = useState("");
  const [bahan, setBahan] = useState<BahanItem[]>([]);
  const [dos, setDos] = useState<string[]>([]);
  const [donts, setDonts] = useState<string[]>([]);

  const [durasi, setDurasi] = useState(60);
  const [unit, setUnit] = useState<"detik" | "menit">("detik");
  const [brief, setBrief] = useState("");
  const [jumlahVarian, setJumlahVarian] = useState(3);
  const [antiDup, setAntiDup] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [lastPayload, setLastPayload] = useState<GenerateRequest | null>(null);
  const [error, setError] = useState("");
  const [backendDown, setBackendDown] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setHealth(h);
        setBackendDown(false);
      })
      .catch(() => setBackendDown(true));
  }, []);

  const handleParse = async () => {
    if (!raw.trim()) {
      setError("Tempel dulu teks kasusnya sebelum memilah.");
      return;
    }
    setParsing(true);
    setError("");
    try {
      const data = await parseCase(raw);
      setTopik(data.topik);
      setHeadlines(data.headlines.length ? data.headlines : [""]);
      setHeadlineUtama(0);
      setKonteks(data.konteks.join("\n"));
      setBahan(data.bahan);
      setDos(data.rules.dos.length ? data.rules.dos : [""]);
      setDonts(data.rules.donts.length ? data.rules.donts : [""]);
      setParseLogs(data.log_agen);
      setParsed(true);
      setResult(null);
    } catch (e) {
      setError(`Gagal memilah konten: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setParsing(false);
    }
  };

  const handleHeadlinesChange = (items: string[]) => {
    setHeadlines(items);
    if (headlineUtama >= items.length) setHeadlineUtama(0);
  };

  const toggleBahan = (index: number) =>
    setBahan(bahan.map((b, i) => (i === index ? { ...b, dipilih: !b.dipilih } : b)));

  const updateBahan = (index: number, patch: Partial<BahanItem>) =>
    setBahan(bahan.map((b, i) => (i === index ? { ...b, ...patch } : b)));

  const removeBahan = (index: number) => setBahan(bahan.filter((_, i) => i !== index));

  const addBahan = () =>
    setBahan([
      ...bahan,
      { id: `B${bahan.length + 1}-${Date.now()}`, judul: "", url: "", dipilih: true },
    ]);

  const handleGenerate = async () => {
    if (!topik.trim()) {
      setError("Topik masih kosong. Pilah konten atau isi manual dulu.");
      return;
    }
    setGenerating(true);
    setError("");
    setResult(null);
    try {
      const indexed = headlines.map((h, i) => ({ text: h.trim(), i })).filter((x) => x.text);
      const ordered = [
        ...indexed.filter((x) => x.i === headlineUtama).map((x) => x.text),
        ...indexed.filter((x) => x.i !== headlineUtama).map((x) => x.text),
      ];
      const payload: GenerateRequest = {
        topik,
        headlines: ordered,
        konteks: konteks
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        bahan,
        rules: {
          dos: dos.map((s) => s.trim()).filter(Boolean),
          donts: donts.map((s) => s.trim()).filter(Boolean),
        },
        durasi,
        durasi_unit: unit,
        brief_narasi: brief,
        jumlah_varian: jumlahVarian,
        anti_duplikat: antiDup,
      };
      const res = await generateNarration(payload);
      setLastPayload(payload);
      setResult(res);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setError(`Gagal generate narasi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Generator Narasi</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Pilah kasus → sunting konten → generate narasi sesuai durasi.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
            backendDown
              ? "bg-red-100 text-red-700"
              : health
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {backendDown
            ? "Backend offline"
            : health
              ? health.mode === "llm"
                ? `LLM: ${health.llm_model}`
                : "Mode Mock (offline)"
              : "Menghubungkan..."}
        </span>
      </div>

      {backendDown ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Backend tidak terdeteksi. Jalankan:{" "}
            <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-xs">
              cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000
            </code>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <StepTitle
            n={1}
            title="Tempel Teks Kasus"
            hint="Tempel contoh kasus lengkap (topik, rekomendasi headline, konteks pembahasan, bahan, do's & don'ts)."
          />
          <textarea
            rows={10}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Tempel teks kasus di sini..."
            className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={handleParse} disabled={parsing} className={btnPrimary}>
              {parsing ? "Memilah..." : "Pilah Konten"}
            </button>
            <button
              type="button"
              onClick={() => setRaw(SAMPLE_CASE)}
              disabled={parsing}
              className={btnSecondary}
            >
              Isi Contoh Kasus
            </button>
          </div>
          {parseLogs.length > 0 ? (
            <div className="mt-4">
              <AgentLogPanel logs={parseLogs} title="Log Agen Pemilah (L1)" />
            </div>
          ) : null}
        </section>

        {parsed ? (
          <>
            <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <StepTitle
                n={2}
                title="Sunting Hasil Pilah"
                hint="Semua kolom bisa diedit: perbaiki typo, tambah/hapus item, atau centang bahan yang dipakai."
              />

              <Field label="Topik">
                <input
                  type="text"
                  value={topik}
                  onChange={(e) => setTopik(e.target.value)}
                  placeholder="Topik kasus"
                  className={inputCls}
                />
              </Field>

              <Field label="Rekomendasi Headline" hint="Pilih satu sebagai headline utama untuk narasi.">
                <EditableList
                  items={headlines}
                  onChange={handleHeadlinesChange}
                  placeholder="Tulis headline..."
                  addLabel="Tambah headline"
                  selectName="headline-utama"
                  selectTitle="Jadikan headline utama"
                  selectedIndex={headlineUtama}
                  onSelect={setHeadlineUtama}
                />
              </Field>

              <Field label="Konteks Pembahasan" hint="Satu baris satu poin.">
                <textarea
                  rows={7}
                  value={konteks}
                  onChange={(e) => setKonteks(e.target.value)}
                  placeholder="Satu baris satu poin konteks..."
                  className={`${inputCls} resize-y`}
                />
              </Field>

              <Field label="Bahan" hint="Centang 1 atau lebih bahan yang dipakai sebagai sumber.">
                <div className="space-y-2">
                  {bahan.map((b, i) => (
                    <div
                      key={b.id}
                      className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5"
                    >
                      <input
                        type="checkbox"
                        checked={b.dipilih}
                        onChange={() => toggleBahan(i)}
                        title="Pakai bahan ini"
                        className="mt-2.5 h-4 w-4 shrink-0 accent-indigo-600"
                      />
                      <div className="flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={b.judul}
                          onChange={(e) => updateBahan(i, { judul: e.target.value })}
                          placeholder="Judul bahan"
                          className={inputCls}
                        />
                        <input
                          type="text"
                          value={b.url}
                          onChange={(e) => updateBahan(i, { url: e.target.value })}
                          placeholder="https://..."
                          className={`${inputCls} font-mono text-xs`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBahan(i)}
                        className="mt-1 shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-red-300 hover:text-red-600"
                      >
                        Hapus
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addBahan}
                    className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600"
                  >
                    + Tambah bahan
                  </button>
                </div>
              </Field>

              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Rules — Do's" hint="Wajib dipenuhi agen penulis.">
                  <EditableList
                    items={dos}
                    onChange={setDos}
                    placeholder="Tulis aturan do's..."
                    addLabel="Tambah do's"
                  />
                </Field>
                <Field label="Rules — Don'ts" hint="Dilarang dilanggar agen penulis.">
                  <EditableList
                    items={donts}
                    onChange={setDonts}
                    placeholder="Tulis aturan don'ts..."
                    addLabel="Tambah don'ts"
                  />
                </Field>
              </div>
            </section>

            <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <StepTitle
                n={3}
                title="Pengaturan Narasi"
                hint="Atur durasi target dan deskripsikan narasi yang ingin dibuat."
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Durasi yang Diinginkan">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={5}
                      value={durasi}
                      onChange={(e) => setDurasi(Number(e.target.value))}
                      className={inputCls}
                    />
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as "detik" | "menit")}
                      className={`${inputCls} w-32`}
                    >
                      <option value="detik">detik</option>
                      <option value="menit">menit</option>
                    </select>
                  </div>
                </Field>
                <Field
                  label="Jumlah Varian"
                  hint="Pilih 1–10 varian. Jaminan berbeda satu dengan lainnya berlaku selama aturan anti-duplikat aktif."
                >
                  <select
                    value={jumlahVarian}
                    onChange={(e) => setJumlahVarian(Number(e.target.value))}
                    className={inputCls}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} varian
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <input
                  type="checkbox"
                  checked={antiDup}
                  onChange={(e) => setAntiDup(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-700">
                    Terapkan aturan anti-duplikat
                  </span>
                  <span className="block text-xs text-slate-500">
                    Jika aktif, varian yang mirip/identik dengan varian lain atau narasi lama akan
                    ditolak otomatis. Matikan bila ingin bebas menghasilkan narasi yang mirip
                    (kemiripan tetap ditampilkan sebagai informasi).
                  </span>
                </span>
              </label>

              <Field
                label="Narasi yang Akan Dibuat"
                hint="Contoh: narasi berita TV gaya lugas dan padat; atau versi bercerita untuk media sosial."
              >
                <textarea
                  rows={3}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Deskripsikan sudut pandang, gaya, dan target platform narasi..."
                  className={`${inputCls} resize-y`}
                />
              </Field>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className={btnPrimary}
              >
                {generating ? "Menjalankan agen..." : "Generate Narasi"}
              </button>
            </section>
          </>
        ) : null}

        <div ref={resultsRef}>
          {result ? (
            <div className="space-y-4">
              <ResultsPanel
                result={result}
                payload={lastPayload}
                onFixed={(id: string, fx: FixResponse) =>
                  setResult((prev) =>
                    prev
                      ? {
                          ...prev,
                          varian: prev.varian.map((v) => (v.id === id ? fx.varian : v)),
                          log_agen: [...prev.log_agen, ...fx.log_agen],
                        }
                      : prev
                  )
                }
              />
              <AgentLogPanel logs={result.log_agen} />
            </div>
          ) : null}
        </div>
    </div>
  );
}
