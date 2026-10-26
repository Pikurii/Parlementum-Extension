# Spesifikasi Lengkap UI/UX — Parlamentum Auto Worker

Dokumen ini adalah **Product & Design Specification (PRD / UI-UX Brief)** resmi yang mencakup seluruh arsitektur tampilan, fitur, data, dan alur interaksi untuk ekstensi browser **Parlementum Auto Worker**. Dokumen ini dirancang agar dapat langsung dijadikan acuan oleh desainer UI/UX atau AI (Gemini Aragon) untuk merancang antarmuka yang bersih, profesional, modern, dan ergonomis di monitor desktop.

---

## 1. Identitas Produk & Visi Desain

* **Nama Produk**: Parlamentum Auto Worker (Browser Extension)
* **Target Pengguna**: Pemain game simulasi politik-ekonomi *Parlementum.org* yang membutuhkan automasi cerdas (bekerja otomatis, latihan stats, manajemen makanan, dan stealth scheduling).
* **Visi Estetika**:
  * **Tema**: *Modern Cyberpunk / Fintech Glassmorphism Dark Mode*.
  * **Karakter**: Bersih, presisi, minimalis, profesional layaknya *trading terminal* atau *developer tool* modern.
  * **Aturan Kritis**: **0 EMOJI**. Seluruh ikon wajib menggunakan **Vector Line Icon (SVG)** bergaya *Lucide / Feather Icons* yang konsisten (stroke 1.75px – 2px).
  * **Keterbacaan Monitor**: Dioptimalkan untuk monitor desktop (1080p, 1440p, 4K) — tidak ada font mikro yang membuat mata lelah (teks utama $\ge 12\text{px}$, judul $\ge 13\text{px}$, metrik/angka $\ge 13-14\text{px}$ dengan font monospace tabular-nums).

---

## 2. Arsitektur Antarmuka (4 Permukaan UI)

Ekstensi ini memiliki 4 permukaan antarmuka utama:
1. **Floating In-Game Panel** (Widget melayang di dalam halaman game).
2. **Browser Toolbar Popup** (Jendela pop-up saat mengklik ikon ekstensi di browser).
3. **Modal Pengaturan (Settings Modal)** (Menu preferensi mendalam dengan sistem tab).
4. **Modal Activity Log** (Pusat riwayat aktivitas bot *real-time*).

---

## 3. Detail Permukaan 1: Floating In-Game Panel

Panel yang disuntikkan (*injected*) langsung ke halaman web game. Memiliki 2 mode tampilan yang dapat di-toggle secara mulus: **Mode Penuh (Expanded)** dan **Mode Ringkas (Pill Capsule)**.

### A. Mode Penuh (Expanded Mode)
* **Dimensi**: Lebar $350\text{px} - 360\text{px}$, tinggi dinamis, *border-radius* $12\text{px}$, latar belakang semi-transparan dengan efek *backdrop blur* ($14\text{px}$).
* **Perilaku**: Dapat diseret (*draggable*) ke mana saja di layar, posisinya tersimpan otomatis, dan memiliki opsi *pin* (mengunci posisi) serta *auto-docking* ke tepi layar.

#### Komponen di dalam Mode Penuh:
1. **Header Bar**:
   * *Kiri*: Ikon Robot (SVG), Label judul "AUTO WORKER" (bold, uppercase, letter-spacing), dan Status Dot berdenyut (*pulsing dot*) yang menunjukkan status aktif (Hijau = Berjalan, Merah = Dijeda, Oranye = Rekonsiliasi, Abu-abu = Tidur).
   * *Kanan*: 4 Tombol Ikon Header:
     * Minimize (Mode Ringkas / Pill).
     * Pin / Lock (Kunci koordinat agar tidak sengaja terseret).
     * Settings (Membuka modal pengaturan).
     * Close / Hide (Sembunyikan panel dengan hotkey pembuka kembali).
2. **Baris Info Wilayah (Region & Buff Bar)**:
   * Menampilkan nama wilayah saat ini (contoh: `Jakarta` atau `Jawa Barat`) dengan ikon pin lokasi.
   * Badge Buff Regenerasi (contoh: `+50% Regen` warna hijau zamrud, atau `Normal (1.0x)`).
3. **Baris Waktu Server UTC & Reset Harian**:
   * Menampilkan jam digital `SERVER UTC: HH:MM:SS` (font monospace).
   * Waktu hitung mundur reset harian game (`Reset: Xj Ym` menuju pukul 00:00 UTC).
   * Badge indikator `FLUSH` aktif jika berada di 45 menit sebelum reset server.
4. **Pelacak Kuota Makanan (Daily Food Slots Tracker)**:
   * Ikon sendok/garpu atau roti (SVG).
   * Label: `MAKANAN: X/20` (atau `X/10` jika akun non-premium).
   * Status kuota sisa (contoh: `11 sisa` atau `Kuota habis`).
   * Tombol koreksi manual kuota: `[-]`, `[+]`, `[Max]` untuk sinkronisasi cepat jika pemain makan dari HP.
5. **Kartu Live Energi & Pemulihan (Live Energy Card)**:
   * Header kartu: Ikon Petir (SVG) + Label "ENERGI" + Nilai angka real-time `44/210` (warna neon mint, font monospace tebal).
   * Progress Bar Energi: Baris progress halus dengan gradasi warna (biru ke hijau mint).
   * Sub-info dua kolom:
     * *Next*: Hitung mundur menuju giliran kerja berikutnya (`37m 19s` atau `Siap Kerja`).
     * *Full*: Estimasi waktu energi terisi penuh $100\%$ (`~1 j 47 mnt`).
6. **Kartu Status Auto Kerja (Focus Work Mode Card)**:
   * Menampilkan status kerja otomatis (`Auto Kerja: AKTIF` / `DIJEDA` / `ISTIRAHAT`).
   * Target ambang batas energi yang ditentukan (`Target: ≥ 100 EN`).
   * Hitung mundur giliran kerja dengan angka besar di sebelah kanan.
7. **Kartu Auto Latihan Stats (Auto Training Card)**:
   * Header kartu: Ikon Dumbbell (SVG) + Label "LATIHAN STATS" + Badge sakelar instan (`AKTIF` / `OFF` yang bisa diklik langsung).
   * Baris 3 Badge Mini Stat:
     * **STR (Kekuatan)**: Ikon pedang + Level saat ini (`82`).
     * **EDU (Pendidikan)**: Ikon buku + Level saat ini (`50`).
     * **EKO (Ekonomi)**: Ikon tren naik + Level saat ini (`51`).
   * Status Latihan Aktif:
     * Menampilkan stat yang sedang dilatih beserta level target dan sisa timer real-time (contoh: `Latih Kekuatan Lv 83` dengan hitung mundur `1j 13m`).
     * Jika tidak ada yang sedang berlatih: menampilkan stat antrean berikutnya (`Siap Latih Pendidikan Lv 51`).
8. **Baris Sesi Autentikasi (Auth Session Row)**:
   * Ikon Perisai (SVG) + Label `Sesi Auth: VALID` (atau `EXPIRED` warna merah jika token habis).
   * Sisa masa aktif token keamanan game (contoh: `167h 24m`).
9. **Grid Tombol Aksi Cepat (3-Button Action Grid)**:
   * Tombol 1: **Kerja Sekarang (Work Now)** — Gradasi biru, mengeksekusi shift manual seketika.
   * Tombol 2: **Jeda / Lanjut (Pause/Resume)** — Gradasi merah saat aktif (Jeda) atau hijau saat dijeda (Lanjut).
   * Tombol 3: **Activity Log** — Gradasi slate gray, membuka modal riwayat log.

---

### B. Mode Ringkas (Floating Pill Capsule Mode)
* **Konsep**: Kapsul melayang ultra-ramping horizontal untuk pemain yang ingin layar game bersih tanpa tertutup panel besar.
* **Elemen**:
  * Ikon Robot + Status Dot hidup (hijau/merah/oranye).
  * Badge Energi mini: `[⚡ 44/210]`.
  * Badge Countdown mini: `[🕒 37m 19s]` (berubah menjadi `[⚡ Siap]` warna hijau neon saat energi cukup).
  * Tombol Play/Pause mini (lingkaran $22\text{px}$).
  * Tombol Expand mini (lingkaran $22\text{px}$) untuk kembali ke panel penuh.
* **Interaksi**: Double-click untuk memperbesar, drag untuk memindahkan.

---

## 4. Detail Permukaan 2: Toolbar Popup Ekstensi

Jendela pop-up standar browser yang muncul saat pemain mengklik ikon ekstensi di browser toolbar.
* **Dimensi**: Lebar $360\text{px}$, tinggi fleksibel ($520\text{px} - 580\text{px}$).
* **Fungsi**: Memungkinkan pemain memantau dan mengontrol bot **tanpa harus membuka atau berada di tab game**.
* **Tata Letak**:
  * Header identik dengan panel game.
  * Status Wilayah & Buff.
  * Waktu Server UTC & Reset Countdown.
  * Pelacak Makanan (Roti).
  * Kartu Live Energi & Countdown.
  * Kartu Fokus Kerja.
  * Kartu Latihan Stats lengkap (STR, EDU, EKO + Timer Aktif + Badge Toggle).
  * Status Sesi Auth.
  * 3 Tombol Utama: `[Kerja]`, `[Jeda]`, `[Log]`.
  * Tombol Tautan Cepat: `[Buka Tab Dashboard Parlementum]` (ikon globe external link).
  * Footer: Indikator status koneksi tab game (contoh: `● Tab game aktif (2 tab)` + versi bot `v5.12.0`).

---

## 5. Detail Permukaan 3: Modal Pengaturan (Settings Modal)

Modal pop-up elegan di tengah layar (*glassmorphic dark backdrop blur*) dengan sistem navigasi tab di bagian atas:

### Tab 1: Kerja & Energi
* **Slider Ambang Batas Energi (Energy Threshold)**:
  * Slider rentang interaktif ($10 - 200\text{ EN}$) + input angka presisi.
  * *Quick Preset Chips*: Tombol pintas cepat `[10 EN]`, `[20 EN]`, `[50 EN]`, `[100 EN]`, `[Maksimal]`.
* **Maksimal Kuota Makanan Harian**:
  * Pilihan radio/switch antara 10 slot (Akun Reguler) atau 20 slot (Akun Premium).
* **Pengingat Reset Makanan**:
  * Sakelar untuk memberi peringatan jika sisa waktu menuju reset harian server tinggal sedikit tapi kuota makanan belum habis dimakan.
* **Optimasi Energi Akhir Hari (Energy Flush)**:
  * Sakelar untuk otomatis memaksa kerja di energi rendah pada 45 menit sebelum reset server UTC (mencegah ada sisa energi terbuang percuma saat pergantian hari).

### Tab 2: Latihan Stats (Auto Training & Kalkulator Biaya)
* **Sakelar Utama**: `Aktifkan Auto Latihan Stats` (iOS-style switch toggle).
* **Fokus Prioritas Latihan (Dropdown)**:
  * *Pendidikan Dulu* (Mengejar diskon durasi waktu latihan).
  * *Ekonomi Dulu* (Mengejar hasil bonus produksi barang).
  * *Kekuatan Dulu* (Mengejar damage perang).
  * *Seimbang* (Rotasi otomatis melatih level stat yang paling rendah terlebih dahulu).
* **Grid Target Level & Tampilan Level Saat Ini (3 Kolom Card)**:
  * Kolom 1 (Kekuatan): Ikon Pedang, `Level Saat Ini: 82`, Input Angka `Target: [100]`.
  * Kolom 2 (Pendidikan): Ikon Buku, `Level Saat Ini: 50`, Input Angka `Target: [100]`.
  * Kolom 3 (Ekonomi): Ikon Grafik Naik, `Level Saat Ini: 51`, Input Angka `Target: [100]`.
* **Kalkulator Kebutuhan Biaya Emas Real-Time**:
  * Box ringkasan yang menghitung otomatis biaya deret aritmatika emas dari level saat ini menuju level target.
  * Rincian: Biaya Kekuatan, Biaya Pendidikan, Biaya Ekonomi.
  * Saldo Dompet Emas Saat Ini (terdeteksi otomatis dari akun game, misal: `4.531 Emas`).
  * Total Emas Dibutuhkan (misal: `9.146 Emas`).
  * Status Keuangan Otomatis:
    * `Status: AMAN (Sisa: X Emas)` jika saldo cukup.
    * `Status: Kurang X Emas` (warna merah peringatan) jika saldo dompet di bawah target + cadangan.
* **Batas Minimal Cadangan Emas**:
  * Input angka cadangan emas aman (default: `50 Emas`). Bot menolak memulai latihan jika sisa emas di dompet akan turun di bawah angka ini.

### Tab 3: Stealth & Jadwal (Humanisasi & Anti-Banned)
* **Threshold Jitter (Anti-Pola)**:
  * Mengacak sedikit ambang batas energi ($\pm 2\text{ EN}$) di setiap siklus agar interval kerja tidak terbaca kaku layaknya mesin.
* **Jadwal Istirahat Malam (Sleep Schedule)**:
  * Sakelar on/off + pemilihan jam mulai dan jam bangun (contoh: `01:00 s/d 06:00 WIB`).
  * Bot otomatis berhenti kerja dan istirahat total pada jam tersebut menyerupai manusia normal.
* **Peredam Log Energi Rendah (Quiet Mode)**:
  * Mencegah log dibanjiri pesan "Energi tidak cukup" saat menunggu regenerasi.

### Tab 4: Notifikasi & Suara
* **Notifikasi Pop-up Desktop**:
  * Sakelar notifikasi sistem browser saat shift berhasil dikerjakan.
* **Alert Desktop Saat Energi Penuh**:
  * Notifikasi peringatan saat energi menyentuh kapasitas maksimal agar tidak idle.
* **Efek Suara Audio**:
  * Sakelar audio saat selesai kerja + slider volume ($0 - 100\%$).
  * Alarm audio khusus saat energi penuh + slider volume.
  * Tombol `[Uji Coba Bunyi Suara (Test Sound)]`.

### Tab 5: Tampilan & Pintasan Keyboard
* **Tampilkan Hanya di Dashboard (`/dashboard`)**: Sembunyikan panel di halaman pasar/peta.
* **Tampilkan Hanya di Tab Utama (Standby Hidden)**: Jika membuka 5 tab game sekaligus, panel hanya muncul di tab yang memimpin kerja.
* **Responsive Viewport**: Menjaga panel agar tidak keluar layar saat ukuran browser diperkecil.
* **Tombol Reset Posisi**: Mengembalikan panel ke koordinat default pojok kanan atas.
* **Kustomisasi Pintasan Tombol Keyboard (Hotkeys)**:
  * Tombol Sembunyikan/Tampilkan Panel (default: `Alt + H`).
  * Tombol Kerja Manual (default: `Alt + W`).
  * Tombol Jeda/Lanjut (default: `Alt + P`).
  * Tombol Buka Log (default: `Alt + L`).
  * Tombol Buka Pengaturan (default: `Alt + S`).

---

## 6. Detail Permukaan 4: Activity Log Modal

Modal penampil log aktivitas dan riwayat transaksi bot:
* **Header**: Judul "Activity Log", Badge total baris log (`128 items`), Tombol Refresh, Tombol Bersihkan (`Clear Logs`), Tombol Tutup (`X`).
* **Bilah Filter**:
  * Pilihan Chip Kategori: `[Semua]`, `[Sukses (Hijau)]`, `[Info (Biru)]`, `[Peringatan (Kuning)]`, `[Error (Merah)]`.
  * Kolom Pencarian Teks (*Search Input*): Pencarian cepat kata kunci tertentu (misal: "makan", "latih", "token", "xp").
* **Daftar Entri Log**:
  * Format tiap baris: `[HH:MM:SS]` + Ikon Tipe + Pesan Aktivitas (misal: `Kerja sukses! +4 XP | +1 unit`, atau `Latih Kekuatan Lv 83 dimulai (-51 Emas)`).
  * Desain monospace rapi dengan warna teks sesuai tingkat urgensi.

---

## 7. Kamus Status Sistem (System States)

Antarmuka harus mampu menampilkan 6 status utama bot secara intuitif:
1. **Running (Aktif Normal)**: Warna aksen `#00ff88` (Neon Mint). Status dot berdenyut halus, tombol bertuliskan "Jeda".
2. **Paused (Dijeda Manual)**: Warna aksen `#ff4757` (Coral Red). Countdown terhenti dan tombol bertuliskan "Lanjut".
3. **Sleeping (Jadwal Tidur Malam)**: Warna aksen `#94a3b8` (Muted Slate). Teks: `Auto Kerja: ISTIRAHAT`, timer menampilkan jam bangun.
4. **Ready to Work (Energi Cukup)**: Efek glow berdenyut (*pulse glow animation*) di sekeliling panel, teks countdown berubah menjadi hijau terang `Siap Kerja`.
5. **Token Expired / Auth Invalid**: Warna aksen `#ef4444` gelap. Teks: `EXPIRED`, bot otomatis pause demi keamanan akun hingga token baru didapatkan.
6. **Uncertain / Network Lag**: Warna aksen `#f59e0b` (Amber Gold). Meminta konfirmasi rekonsiliasi jika koneksi internet sempat terputus saat request shift dikirim.

---

## 8. Spesifikasi Warna & Tipografi Rekomendasi

### Palet Warna (Tailored Dark Theme):
* **Background Deep**: `#0a0e1a` (Background utama browser/modal overlay).
* **Background Surface / Cards**: `rgba(22, 27, 42, 0.75)` (Glassmorphic panel surface).
* **Borders / Separators**: `rgba(255, 255, 255, 0.08)` hingga `0.15`.
* **Primary Text**: `#f8fafc` (Putih bersih, kontras tinggi).
* **Secondary Text**: `#cbd5e1` (Abu-abu terang, sangat mudah dibaca).
* **Muted Labels**: `#94a3b8` (Abu-abu sedang untuk teks sekunder/satuan).
* **Accents**:
  * Hijau Mint (Sukses / Energi): `#00ff88` / `#10b981`.
  * Biru Langit (Countdown / Info / Token): `#38bdf8` / `#0ea5e9`.
  * Emas / Amber (Dompet / Biaya / Latihan): `#fbbf24` / `#f59e0b`.
  * Merah / Coral (Jeda / Kurang Emas / Error): `#ef4444` / `#ff4757`.

### Tipografi:
* **Teks Umum**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif`.
* **Timer, Angka, Level & Jam**: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace` (memiliki lebar angka yang sama / *tabular figures* agar antarmuka tidak bergetar saat angka berganti).

---

## 9. Yang Diharapkan dari Desain UI/UX Baru
1. **Tata Letak Kartu yang Seimbang (Balanced Spacing)**: Menghindari kesan padat/berdesakan (*claustrophobic*).
2. **Keterbacaan Instan (Glanceability)**: Pengguna hanya perlu melihat 1 detik untuk mengetahui: berapa sisa energi, berapa menit lagi kerja, apakah bot sedang berjalan, dan apakah latihan sedang aktif.
3. **Sentuhan Interaktif Modern**: Hover effects halus (naik 1px, sedikit lebih terang), tombol switch animasi elastis, dan transisi tab mulus (*smooth tab transition*).
