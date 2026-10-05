# Parlementum Auto Worker (v5.11.0) 🤖⚡

Ekstensi browser canggih (*Chrome / Opera GX / Brave / Edge*) untuk otomatisasi cerdas, pemantauan energi real-time, dan manajemen giliran kerja pada game geopolitik online **[Parlementum.org](https://parlamentum.org)**.

Didesain dengan arsitektur modular modern, estetika *glassmorphism*, fitur anti-deteksi bot (*humanizer jitter*), dan **Mode Eco** yang sangat hemat penggunaan RAM & CPU.

---

## ✨ Fitur Utama

* **⚡ Auto Work Presisi**:
  * Otomatis mengeksekusi giliran kerja begitu energi mencapai target ambang batas (*threshold*).
  * Menghitung regenerasi pasif wilayah (*Health Buff*) secara otomatis (misal: Jawa Barat +50% Regen).
* **🍃 Mode Eco (Hemat RAM & CPU)**:
  * Menghentikan repaint visual DOM ketika tab game ditinggal di latar belakang (*background*).
  * Pemulihan energi menggunakan kalkulasi matematis instan $O(1)$ tanpa membebani browser.
  * *Instant Wakeup* dalam 0 ms saat tab kembali dibuka.
* **🎲 Humanizer Jitter (Anti-Deteksi Bot)**:
  * Mengacak sedikit batas energi kerja (±2⚡) di setiap giliran kerja agar interval waktu tidak kaku dan tidak terbaca sebagai bot server.
* **🌙 Jam Istirahat / Mode Tidur**:
  * Bot dapat dijadwalkan istirahat pada jam tertentu (misal: 01:00 - 06:00 WIB) layaknya kebiasaan manusia normal.
* **📊 Dashboard Statistik & Analytics**:
  * Grafik bar performa 7 hari terakhir (total shift, perolehan XP, dan konsumsi energi).
  * Perbandingan KPI dengan hari kemarin.
  * Fitur Backup / Export & Import data riwayat (*JSON*).
* **📋 Real-time Activity Log Viewer**:
  * Riwayat aktivitas lengkap dengan pencarian dan filter kategori (*Success, Info, Warn, Error*).
* **📱 Toolbar Popup Canggih**:
  * Panel kontrol instan dari icon ekstensi browser untuk cek energi, jeda/lanjutkan worker, kerja manual, dan pantau countdown tanpa membuka tab game.
* **🔐 Auto Re-Login**:
  * Otomatis memperbarui sesi saat token kedaluwarsa (HTTP 401) dengan penyimpanan kredensial 100% lokal dan aman.

---

## 📂 Struktur Proyek

```text
Parlementum/
├── extension-parlementum/          # [Source Code] Folder pengembangan & modul kode
│   ├── src/                       # Modul ES6 (work, energy, panel, settings, analytics, dll)
│   ├── popup/                     # UI popup toolbar ekstensi
│   ├── icons/                     # Aset ikon ekstensi
│   ├── background.js              # Service Worker latar belakang
│   ├── interceptor.js             # Penangkap token & respon API
│   ├── package.json               # Konfigurasi dependensi Vite
│   └── vite.config.mjs            # Konfigurasi bundler Vite
│
├── extension-parlementum-release/  # [Production] Folder siap pasang ke Opera GX / Chrome
│   ├── dist/                      # Bundle terkompilasi (content.js)
│   ├── manifest.json              # Manifest V3 extension
│   ├── background.js
│   ├── interceptor.js
│   ├── popup/
│   └── icons/
│
└── README.md
```

---

## 🚀 Panduan Pemasangan (Opera GX / Google Chrome)

1. Unduh atau clone repositori ini:
   ```bash
   git clone <URL_REPOSITORY_ANDA>
   ```
2. Buka browser **Opera GX** atau **Chrome**, lalu buka halaman ekstensi:
   * Opera GX: `opera://extensions`
   * Google Chrome: `chrome://extensions`
3. Aktifkan **Developer mode** di pojok kanan atas.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar).
5. Pilih folder: **`extension-parlementum-release`**.
6. Buka halaman game di [parlamentum.org/dashboard](https://parlamentum.org/dashboard). Ekstensi akan otomatis aktif melayang di pojok kanan layar!

---

## 🛠️ Pengembangan (Development)

Jika Anda ingin mengubah kode di dalam folder `extension-parlementum`:

1. Masuk ke folder pengembangan:
   ```bash
   cd extension-parlementum
   ```
2. Install dependensi developer:
   ```bash
   npm install
   ```
3. Lakukan perubahan pada kode di folder `src/`.
4. Kompilasi dan perbarui folder rilis:
   ```bash
   npm run release
   ```
   *Perintah ini otomatis mengkompilasi file dengan Vite dan memperbarui folder `extension-parlementum-release`.*
5. Di browser, klik tombol **Refresh / Reload** pada ekstensi Parlementum Auto Worker.

---

## ⚖️ Lisensi & Disclaimer
Proyek ini dibuat untuk tujuan edukasi dan kemudahan manajemen akun pribadi. Gunakan secara bijak sesuai ketentuan platform game terkait.
