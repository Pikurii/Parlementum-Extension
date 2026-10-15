# Parlementum Auto Worker — Roadmap & Pending Tasks

Dokumen ini mencatat fitur yang telah selesai diimplementasikan pada versi 5.11.0 serta daftar peningkatan yang masih dalam antrean (pending).

---

## 1. Status Selesai (v5.11.0)

- **Perbaikan Tampilan UI & Pencegahan Text Wrapping (Baru)**:
  - Memperluas lebar panel dari 285px menjadi 315px (`min-width: 310px; max-width: 325px`) agar seluruh baris teks memiliki ruang napas proporsional.
  - Memasang aturan `white-space: nowrap !important` dan `flex-shrink: 0` pada baris Waktu Server (`WAKTU SERVER: 00:00:00 UTC | Reset: --j --m`) dan baris Slot Makanan sehingga teks tidak akan pernah patah/menumpuk ke bawah (*wrapping*) lagi di layar peramban.

- **Sinkronisasi Slot Makanan Lintas-Tab (Cross-Tab Food Sync) (Baru)**:
  - Mengintegrasikan kuota makanan ke saluran `BroadcastChannel` (`aw_parlamentum_tabs`).
  - Pembaruan slot makanan (baik lewat makan roti di game, deteksi pop-up, maupun tombol manual) kini langsung terkirim dan tersinkronisasi instan ke seluruh tab Parlementum yang sedang terbuka (Dashboard, Pasar, Pasar Global, Profil, dll.) dengan 0ms jeda.

- **Dukungan Kuota Akun Premium (20 Slot) & Opsi di Pengaturan (Baru)**:
  - Menyediakan pilihan konfigurasi di modal Pengaturan: `10 Slot (Regular)` atau `20 Slot (Premium)`.
  - Auto-deteksi otomatis status Premium dari respon profil server game.
  - Indikator slot makanan dinamis menyesuaikan batas kuota yang dipilih (`X/10` atau `X/20`).

- **Energy Flush 00:00 UTC (Jam Emas)**:
  - Otomatis menurunkan threshold kerja 45 menit sebelum pergantian hari UTC (23:15 UTC) agar sisa energi tidak terbuang sia-sia sebelum reset server.
  - Ditandai dengan badge khusus `JAM EMAS` pada panel floating dan toolbar popup.

- **Dynamic Timing Jitter (Anti-Deteksi Pola Bot)**:
  - Penambahan variasi jeda acak 5-25 detik pada eksekusi shift kerja untuk menghindari pola kerja robotic/interval statis.

- **Circuit Breaker Perlindungan Akun**:
  - Deteksi otomatis Cloudflare Challenge, Cloudflare Turnstile/Verification, HTTP 502/503/504 Maintenance, dan Captcha interaktif.
  - Worker otomatis dijeda dengan banner peringatan merah dan tidak melakukan request hingga halaman game kembali normal.

- **Auto-Refresh Tab Higienis**:
  - Pembersihan memori otomatis setelah tab berjalan aktif lebih dari 12 jam (hanya dieksekusi saat energi < 20 EN dan countdown kerja masih > 20 menit) untuk mencegah memory leak browser saat ditinggal tidur/afk berhari-hari.

- **Pelacak Kuota Makanan Harian & Tombol Cepat**:
  - Pelacakan kuota makanan harian di panel utama dan toolbar popup dengan hitungan mundur reset 00:00 UTC.
  - Pemindai DOM aktif (MutationObserver) untuk menangkap notifikasi game *"Batas roti harian tercapai"* dan otomatis menyetel kuota ke batas maksimal.
  - Interceptor request payload untuk mendeteksi konsumsi item roti secara real-time.
  - Tombol penyesuaian manual langsung pada panel dan popup: `[-]` (kurang 1), `[+]` (tambah 1), dan `[Penuh]` (set kuota maksimal).

---

## 2. Status Antrean & Pengujian Lanjutan

Berikut adalah pengujian dan opsi opsional yang dapat dilakukan:

### A. Pengujian Real-Time Makan Roti Hari Ini (0/10)
- **Status**: Siap Diuji di Game.
- **Kondisi**:
  - Hari UTC telah berganti (`00:xx UTC`), slot makanan telah kembali kosong (`0/10`).
  - Interceptor kini memantau URL (`/eat`, `/food`, `/roti`, `/bread`, `/item/use`, `/inventory/use`, `/consume`) dan payload request yang mengandung item roti.
  - Pemain dapat langsung menguji makan 1 roti di game hari ini untuk melihat apakah kuota otomatis bertambah +1 dan tersinkronisasi di panel.

### B. Opsi Alarm Audio Sisa Makanan Menjelang Reset
- **Status**: Peringatan visual oranye sudah aktif (< 4 jam ke 00:00 UTC).
- **Pengembangan Lanjutan**:
  - Menambahkan suara notifikasi audio khusus jika sisa kuota makanan belum habis pada 1 jam sebelum server reset (23:00 UTC).
