# Parlementum Auto Worker (v5.11.0) 🤖⚡

[![Version](https://img.shields.io/badge/version-5.11.0-blue.svg?style=for-the-badge)](https://github.com/Pikurii/Parlementum-Extension)
[![Manifest](https://img.shields.io/badge/manifest-v3-purple.svg?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Opera%20GX%20%7C%20Brave%20%7C%20Edge-orange.svg?style=for-the-badge)](https://github.com/Pikurii/Parlementum-Extension)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)

Ekstensi browser canggih (*Opera GX / Chrome / Brave / Edge*) untuk otomatisasi kerja, pemantauan energi real-time, dan manajemen akun pada game geopolitik online **[Parlementum.org](https://parlamentum.org)**.

Didesain dengan arsitektur modern, UI *glassmorphism* futuristik, sistem anti-deteksi bot (*humanizer jitter*), dan **Mode Eco** yang sangat hemat penggunaan RAM & CPU saat ditinggal AFK.

---

## 📥 Unduh Langsung (Siap Pakai)

Klik tombol di bawah ini untuk mengunduh ekstensi siap pakai (tanpa perlu koding atau instalasi tambahan):

<div align="center">

[![Download Extension ZIP](https://img.shields.io/badge/DOWNLOAD-Extension%20v5.11.0%20(.ZIP)-00ff88?style=for-the-badge&logo=googlechrome&logoColor=black)](https://github.com/Pikurii/Parlementum-Extension/raw/main/parlementum-auto-worker-v5.11.0.zip)

👉 **[Klik Disini untuk Mengunduh `parlementum-auto-worker-v5.11.0.zip`](https://github.com/Pikurii/Parlementum-Extension/raw/main/parlementum-auto-worker-v5.11.0.zip)**

</div>

---

## 🚀 Panduan Pemasangan Cepat (Hanya 1 Menit)

Pemasangan sangat mudah, ikuti langkah berikut:

### 1. Unduh & Ekstrak File
1. Klik tautan unduh di atas untuk mengunduh file `parlementum-auto-worker-v5.11.0.zip`.
2. Klik kanan file `.zip` tersebut di komputer Anda, lalu pilih **Extract All...** (Ekstrak Semua).
3. Anda akan mendapatkan folder hasil ekstrak (pastikan di dalam folder tersebut terdapat file `manifest.json`).

### 2. Buka Halaman Ekstensi di Browser Anda
Ketik alamat berikut di address bar browser Anda lalu tekan **Enter**:
* **Opera GX / Opera**: `opera://extensions`
* **Google Chrome**: `chrome://extensions`
* **Brave Browser**: `brave://extensions`
* **Microsoft Edge**: `edge://extensions`

### 3. Aktifkan Mode Pengembang (Developer Mode)
* Di pojok kanan atas halaman ekstensi browser, geser tombol **Developer mode** ke posisi **Aktif (ON)**.

### 4. Pasang Ekstensi (Load Unpacked)
1. Klik tombol **Load unpacked** (Muat yang belum dibongkar) yang muncul di pojok kiri atas.
2. Cari dan pilih folder hasil ekstrak tadi (folder yang berisi `manifest.json`).
3. Ekstensi **Parlementum Auto Worker** akan langsung terpasang di browser Anda!

### 5. Mulai Bermain! 🎉
1. Buka situs game: **[parlamentum.org/dashboard](https://parlamentum.org/dashboard)**.
2. Panel bot melayang (*floating widget*) akan otomatis muncul di pojok kanan layar.
3. Anda juga dapat menyematkan (*pin*) ikon ekstensi di toolbar browser untuk memantau energi dan status kapan saja.

---

## ✨ Fitur Unggulan

* **⚡ Auto Work Presisi & Cerdas**:
  * Otomatis mengeksekusi shift kerja ketika energi mencapai ambang batas (*threshold*).
  * Menghitung regenerasi pasif wilayah (*Health Buff*) secara akurat (misal: Jawa Barat +50% Regen).
* **🍃 Mode Eco (Hemat RAM & CPU)**:
  * Menghentikan animasi dan perulangan DOM saat tab game berjalan di latar belakang (*background tab*).
  * Pemulihan energi menggunakan kalkulasi matematis instan $O(1)$ tanpa membebani browser.
  * Tab game tidak akan lag dan penggunaan memori browser tetap stabil meski ditinggal berhari-hari.
* **🎲 Humanizer Jitter (Anti-Deteksi Bot)**:
  * Mengacak sedikit batas energi kerja (±2⚡) di setiap giliran kerja agar interval waktu dinamis dan tidak terbaca sebagai bot kaku oleh server game.
* **🌙 Jam Istirahat / Mode Tidur Otomatis**:
  * Bot dapat dijadwalkan istirahat pada jam tertentu (misal: 01:00 - 06:00 WIB) layaknya kebiasaan pemain manusia.
* **📊 Dashboard Statistik & Analytics**:
  * Grafik visual performa kerja 7 hari terakhir (total shift, perolehan XP, dan konsumsi energi).
  * Fitur Backup / Export & Import data riwayat (*JSON*).
* **📱 Toolbar Popup Canggih**:
  * Cek sisa energi, countdown giliran kerja berikutnya, dan jeda/lanjutkan worker langsung dari ikon toolbar browser tanpa perlu berpindah ke tab game.
* **📋 Real-time Activity Log**:
  * Riwayat aktivitas interaktif dengan pencarian instan dan filter kategori (*Success, Info, Warn, Error*).
* **🔐 Auto Re-Login Sesi**:
  * Otomatis memperbarui sesi saat token kedaluwarsa (HTTP 401). Kredensial disimpan 100% lokal di browser Anda dengan aman.

---

## 🔄 Cara Memperbarui ke Versi Baru

Jika ada pembaruan versi di repositori ini:
1. Unduh file `.zip` versi terbaru dari repositori ini.
2. Ekstrak dan timpa (*replace*) isi folder ekstensi yang lama dengan isi yang baru.
3. Buka halaman ekstensi browser (`opera://extensions` atau `chrome://extensions`).
4. Klik tombol **Reload / Refresh** (ikon panah melingkar 🔄) pada kartu ekstensi Parlementum.

---

## 📂 Struktur Repositori

```text
Parlementum-Extension/
├── parlementum-auto-worker-v5.11.0.zip # File distribusi siap pakai (1-klik pasang)
├── extension-parlementum-release/      # Folder produksi siap dimuat ke browser (Load unpacked)
│   ├── dist/content.js                # Bundle terkompilasi
│   ├── manifest.json                  # Manifest V3 extension
│   ├── background.js                  # Service Worker latar belakang
│   ├── interceptor.js                 # Penangkap sesi API game
│   ├── popup/                         # UI toolbar browser
│   └── icons/                         # Aset icon
│
├── extension-parlementum/              # Source code pengembangan (untuk developer)
│   ├── src/                           # Modul kode ES6
│   ├── package.json                   # Dependensi Vite
│   └── vite.config.mjs                # Konfigurasi build
│
├── .gitignore
└── README.md
```

---

## 🛠️ Pengembangan (Untuk Developer)

Jika Anda seorang pengembang dan ingin memodifikasi atau berkontribusi pada kode sumber:

1. Clone repositori ini:
   ```bash
   git clone https://github.com/Pikurii/Parlementum-Extension.git
   cd Parlementum-Extension/extension-parlementum
   ```
2. Pasang dependensi:
   ```bash
   npm install
   ```
3. Lakukan modifikasi kode di dalam folder `src/`.
4. Kompilasi dan sinkronkan rilis:
   ```bash
   npm run release
   ```
   *Perintah ini otomatis mengkompilasi file dengan Vite, menyinkronkan folder rilis, dan memperbarui arsip zip.*

---

## ❓ Pertanyaan yang Sering Diajukan (FAQ)

<details>
<summary><b>1. Mengapa widget bot belum muncul di layar game?</b></summary>
Pastikan Anda sudah login ke akun Anda dan membuka halaman <a href="https://parlamentum.org/dashboard">parlamentum.org/dashboard</a>. Jika belum muncul, coba segarkan halaman browser (tekan F5).
</details>

<details>
<summary><b>2. Apakah ekstensi ini aman dari banned?</b></summary>
Ekstensi ini dilengkapi fitur <b>Humanizer Jitter</b> (mengacak waktu kerja agar tidak terbaca sebagai mesin) dan <b>Jam Istirahat</b>. Namun, selalu gunakan secara wajar dan bijak sesuai ketentuan platform game.
</details>

<details>
<summary><b>3. Apakah browser harus selalu terbuka?</b></summary>
Ya, tab browser yang membuka game harus tetap berjalan. Berkat <b>Mode Eco</b>, tab dapat Anda minimize atau biarkan di latar belakang tanpa memakan banyak penggunaan RAM maupun CPU.
</details>

---

## ⚖️ Lisensi & Disclaimer

Proyek ini dibuat untuk tujuan edukasi dan otomasi akun pribadi. Gunakan secara bijak. Penulis tidak bertanggung jawab atas penyalahgunaan atau sanksi yang mungkin timbul dari penggunaan ekstensi ini.
