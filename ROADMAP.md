# Parlementum Auto Worker — Roadmap & Pending Tasks

Dokumen ini mencatat fitur yang telah selesai diimplementasikan pada versi 5.11.0 serta daftar pekerjaan dan peningkatan yang masih dalam antrean (belum selesai / pending).

---

## 1. Status Selesai (v5.11.0)

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

- **Pelacak Kuota Makanan Harian (10 Slot Roti)**:
  - Pelacakan kuota makanan harian di panel utama dan toolbar popup dengan hitungan mundur reset 00:00 UTC.
  - Pemindai DOM aktif (MutationObserver) untuk menangkap notifikasi game *"Batas roti harian tercapai"* dan otomatis menyetel kuota ke `10/10 (Kuota habis)`.
  - Interceptor respon jaringan untuk mendeteksi pesan batas kuota makanan dari API server.
  - Tombol penyesuaian manual langsung pada panel dan popup: `[-]` (kurang 1), `[+]` (tambah 1), dan `[Penuh]` (set 10/10).

---

## 2. Daftar Pekerjaan Yang Belum Selesai (Pending Tasks)

Berikut adalah daftar fitur dan perbaikan yang masih perlu diselesaikan:

### A. Deteksi Otomatis Real-Time Per Item Makan Roti (1 s/d 10)
- **Status**: Sebagian (Pending endpoint API pasti).
- **Kondisi Saat Ini**:
  - Ekstensi mendeteksi batas penuh `10/10` via notifikasi pop-up game dan menyediakan tombol manual `[+]` / `[Penuh]`.
  - Pola URL umum (`/eat`, `/food`, `/roti`, `/item/use`, `/inventory/use`) sudah dipasang di interceptor.
- **Yang Belum Selesai**:
  - Mengonfirmasi endpoint URL dan method HTTP pasti saat pemain mengklik tombol "Makan Roti" di layar inventori game (memerlukan pengecekan tab Network saat 1 kali makan roti dilakukan).
  - Sinkronisasi instan penambahan counter +1 per roti yang berhasil dimakan sebelum mencapai kuota 10/10.

### B. Dukungan Akun Premium (Kuota 20 Slot Makanan)
- **Status**: Pending.
- **Kondisi Saat Ini**:
  - Notifikasi game menyatakan *"Premium menaikkan batas harian jadi 20"*.
  - Ekstensi saat ini menerapkan batas standar 10 slot makanan.
- **Yang Belum Selesai**:
  - Membaca status keanggotaan Premium pemain dari respon profil API game.
  - Opsi pengaturan manual di modal Settings untuk memilih kuota harian (10 slot untuk Regular / 20 slot untuk Premium).

### C. Sinkronisasi Slot Makanan Lintas-Tab (Cross-Tab Food Sync)
- **Status**: Pending.
- **Kondisi Saat Ini**:
  - `BroadcastChannel` (`aw_parlamentum_tabs`) menyinkronkan energi, shift kerja, dan status tab Dashboard.
- **Yang Belum Selesai**:
  - Menyertakan perubahan `foodEatenToday` ke dalam pesan `DASHBOARD_HEARTBEAT` agar ketika roti dimakan di tab Dashboard, tab lain (misalnya tab Pasar atau Pasar Global) langsung ter-update tanpa perlu reload.

### D. Pengingat / Alarm Aktif Menjelang Reset 00:00 UTC
- **Status**: Pending.
- **Kondisi Saat Ini**:
  - Teks sisa slot makanan berubah menjadi oranye jika sisa waktu menuju reset UTC < 4 jam.
- **Yang Belum Selesai**:
  - Menambahkan toggle notifikasi desktop atau audio pengingat opsional pada 1-2 jam sebelum 00:00 UTC jika pemain masih memiliki sisa slot makanan yang belum digunakan.
