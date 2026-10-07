# 🗺️ Roadmap & Agenda Pembaruan (Open Beta)

Dokumen ini mencatat rencana fitur dan peningkatan untuk **Parlementum Auto Worker** yang akan diimplementasikan dan diuji langsung saat server **Open Beta** resmi dibuka (Target: **Minggu, 11 Oktober 2026, 00:00 WIB / Sabtu, 10 Oktober 17:00 UTC**).

---

## 📋 Daftar Agenda Pembaruan

### 1. 🌟 Golden Hours Optimizer (Meta-Gaming & 2x XP)
* **Dasar Mekanik Game**: 
  Setiap hari pukul **18:00 – 20:00 UTC (01:00 – 03:00 WIB)**, server game memberikan **2× XP giliran kerja** dan **2× kecepatan regenerasi energi pasif**.
* **Rencana Implementasi**:
  - [ ] **Indikator & Countdown Live**: Badge visual di panel bot dan popup (`🔥 Golden Hours: Aktif (2x XP)` atau countdown hitung mundur menuju jam event).
  - [ ] **Kalkulasi Akurat 2× Regen**: Otomatis menggandakan kecepatan regenerasi energi di kalkulator timer saat periode Golden Hours berlangsung.
  - [ ] **Mode Taktis "Timbun Energi" (Opsional)**: Pengaturan agar bot menahan energi ~1–2 jam sebelum Golden Hours dimulai, sehingga saat Golden Hours aktif, energi sudah maksimal (100+) dan langsung dieksekusi untuk memaksimalkan perolehan XP.

---

### 2. 🏋️ Pengingat & Pemantau Training Stat (Strength, Education, Economy)
* **Dasar Mekanik Game**: 
  Pemain melatih salah satu stat (Kekuatan, Pendidikan, atau Ekonomi). Biaya dan durasi waktu tunggu mengikuti rumus:
  $$\text{cost}(n) = n\text{ gold}, \quad \text{time}(n) = \text{round}\left(10 \cdot n \cdot 1.1^{n-1} \cdot \frac{1}{1 + 0.01 S_{edu}}\right)\text{ detik}$$
* **Rencana Implementasi**:
  - [ ] Membaca status dan countdown latihan yang sedang berlangsung dari halaman Stats/Training.
  - [ ] Notifikasi audio / toast desktop saat latihan selesai agar pemain tidak membuang waktu cooldown nganggur.

---

### 3. 📱 Kompatibilitas Mobile Penuh (Mobile-Ready & Touch Support)
* **Target Pengguna**: 
  Pemain yang memainkan Parlementum di smartphone (Android via **Kiwi Browser** / **Lemur Browser**, atau via userscript).
* **Rencana Implementasi**:
  - [ ] **Dukungan Touch Gestures**: Tambahkan event `touchstart`, `touchmove`, dan `touchend` dengan `passive: false` agar panel bot dan mode pill bisa digeser (*drag & drop*) dengan jari secara mulus tanpa men-scroll halaman web.
  - [ ] **Auto Mobile Detection (`isMobile`)**:
    - Jika terdeteksi layar HP (< 600px atau layar sentuh), panel otomatis mulai dalam **Mode Ringkas (Pill / Bubble)** agar tidak menutupi tampilan game.
    - Pembatasan posisi geser (*screen clamp*) disesuaikan dengan lebar dan tinggi layar HP.
  - [ ] **Touch Target Ramah Jari**: Memperbesar ukuran tombol interaktif (min 36–44px) agar nyaman ditekan menggunakan ibu jari tanpa salah pencet.
  - [ ] **Modal Responsif**: Memastikan jendela Pengaturan, Statistik, dan Log Viewer pas di layar HP (*bottom sheet* atau modal adaptif).
  - [ ] **Dokumentasi Mobile**: Tambahkan panduan 1 menit cara pasang ekstensi di HP Android (via Kiwi Browser) pada `README.md`.

---

## 🧪 Rencana Pengujian saat Open Beta Rilis

Begitu gerbang Open Beta dibuka:
1. **Verifikasi Tata Letak Baru (DOM Check)**: Memastikan elemen dashboard, navbar energi, dan tombol kerja tidak mengalami perubahan drastis dari versi Closed Beta.
2. **Live Test Fitur Sentuhan (Mobile)**: Menguji coba drag panel dengan mode responsive / touch di HP.
3. **Uji Efisiensi & Eco Mode**: Memastikan konsumsi RAM dan baterai di HP tetap hemat dan tidak membuat browser lag.
4. **Rilis Versi Baru (v5.12.0)**: Kompilasi bundle, perbarui `.zip`, dan unggah rilis ke GitHub.
