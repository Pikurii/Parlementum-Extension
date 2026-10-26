# Parlementum Auto Worker — Master Roadmap & Technical Specification

Dokumen ini adalah panduan tunggal (Single Source of Truth) untuk pengembangan fitur, arsitektur data, perbaikan bug referensi UI/UX, dan implementasi teknis pada **Parlamentum Auto Worker**.

---

## ⚠️ ATURAN ALUR KERJA (WORKFLOW CONSTRAINTS)

1. **JANGAN MEMBUAT FILE ZIP SECARA OTOMATIS**:
   - Saat melakukan proses build/compile kode, **JANGAN** menjalankan generator file ZIP (`--zip` atau pembuatan `parlementum-auto-worker-*.zip`).
   - Membuat zip di setiap perubahan kecil membuang-buang waktu dan memperlambat iterasi.
   - Alur build standar hanya: `npm run build` (Vite) dan sinkronisasi berkas ke folder release `node sync-release.cjs` (tanpa flag `--zip`).
   - **File ZIP HANYA dibuat jika dan hanya jika pengguna memintanya secara eksplisit.**

2. **KONSOLIDASI 8 REFERENSI DARI ARGON (MENGATASI KODE HILANG)**:
   - Terdapat 8 berkas referensi di folder `Referensi UI UX dari Argon/`:
     - `parlementum_auto_worker_ui_ux_design.html`
     - `parlementum_auto_worker_ui_ux_design (1).html` s/d `(7).html`
   - **Penyebab Masalah**: Setiap kali pengguna meminta perbaikan bug kepada Argon, output kode terbentur batas panjang token (context limit), sehingga kode awal yang sudah lengkap sering kali hilang atau terpotong pada file-file revisi berikutnya (misalnya file `(7).html` menyusut drastis ke 88 KB dibanding `(1).html` yang 167 KB dan `(3).html` yang 185 KB).
   - **Aturan Solusi**: Jangan hanya mengambil satu file terakhir. Ambil inti sari dari awal referensi hingga akhir, gabungkan kembali kode-kode yang hilang dengan perbaikan bug terbaru, serta eliminasi bug-bug visual yang sempat muncul di referensi.

3. **100% VECTOR SVG ICONS (ZERO EMOJI)**:
   - Seluruh elemen antarmuka dilarang menggunakan karakter emotikon Unicode (seperti ⚙️, 🔒, ⏸, ⚡).
   - Wajib menggunakan inline SVG path monokrom/tema yang bersih, tajam, dan dapat diwarnai lewat CSS `currentColor`.

---

## 📌 MASTER VISUAL BENCHMARK: GAMBAR 1 (TARGET FINAL) VS GAMBAR 2 (ELEMEN HILANG DARI ARGON)

Bagian ini mendokumentasikan komparasi visual presisi antara **Gambar 1** (visi akhir estetika) dan **Gambar 2** (elemen/tombol fungsional yang terpotong saat penulisan kode oleh Argon):

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 KOMPARASI VISUAL DESAIN                                      │
├──────────────────────────────────────────────┬───────────────────────────────────────────────┤
│        GAMBAR 1: BENTUK AKHIR (AESTHETIC)    │    GAMBAR 2: TOMBOL HILANG (FUNCTIONAL)       │
├──────────────────────────────────────────────┼───────────────────────────────────────────────┤
│ • Benchmark estetika Cyber Abyss Glassmorphism│ • Restorasi komponen yang terpotong token Argon│
│ • Permukaan A (Expanded Panel 356px)         │ • Mode 2: Floating Pill Capsule (Tinggi 36px) │
│ • Permukaan B (Toolbar Popup 368px)          │ • 4 Tombol Aksi Header Bar Permukaan A        │
│ • Permukaan C (Desktop Modal 620px Lega)     │   (Minimize, Pin Lock, Settings, Close)       │
│ • ⚠️ Kurang: Mode 2 Kapsul & Tombol Header   │ • Stepper [-] [+] Target Level                │
└──────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

### A. Detail Gambar 1: Visi Estetika Bentuk Akhir (Aesthetic Benchmark)
Gambar 1 merepresentasikan standar visual premium yang ingin dicapai:
* **Nuansa Cyber Abyss Dark Mode**:
  * Latar belakang gelap pekat `#0a0e1a` dengan radial glow bertingkat (Cyan `#38bdf8`, Indigo `#6366f1`, Emerald `#10b981`) dan aksen grid halus.
  * Komponen `.paw-shell` dengan backdrop-filter blur 20px, border semi-transparan `rgba(255, 255, 255, 0.08)`, dan garis kilau cahaya atas (*Top Subtle Accent Glow Line*).
* **Harmonisasi 3 Permukaan (Three Surfaces)**:
  * **Permukaan A (Floating Panel 356px - Mode 1 Expanded)**: Ringkas, teratur, menyajikan metrik esensial (Lokasi & buff regen, jam UTC & countdown reset FLUSH, kuota roti harian, bar energi animasi shimmer, auto kerja, kartu mini latihan stat STR/EDU/EKO, masa aktif token auth, dan 3 tombol aksi bawah `[Kerja]`, `[Jeda Bot]`, `[Log Bot]`).
  * **Permukaan B (Toolbar Popup 368px)**: Desain identik dengan Floating Panel untuk sinkronisasi instan, dilengkapi tombol `[Pengaturan]` di header bar yang langsung memfokuskan tab game dan membuka modal setting.
  * **Permukaan C (Spacious Desktop Settings Modal 620px)**: Modal dialog lega 5-tab di tengah layar game. Tab *Stats & Emas* menampilkan sakelar master auto latihan, pill status *Fokus Tunggal: Kekuatan*, 3 kartu stat lega (Kekuatan aktif menyala rose glow, Pendidikan & Ekonomi dimmed dengan badge `[ Dilewati ]`), serta kalkulator biaya emas 2 kolom seimbang dengan badge kelayakan keuangan hijau `AMAN • Sisa +2.528 Emas`.

### B. Komponen & Tombol yang Hilang di Gambar 1 (Direstorasi dari Gambar 2)
Akibat limitasi konteks penulisan Argon, Gambar 1 kehilangan beberapa komponen fungsional vital yang terlihat jelas pada Gambar 2:

#### 1. Mode 2: Floating Pill Capsule (Tinggi 36px) [Fokus Kapsul]
* **Kondisi di Gambar 1**: Hanya terdapat teks *"Mode 1: Expanded Panel (356px) Ubah ke Kapsul Ramping"*, namun bentuk fisik kapsulnya sama sekali tidak ditampilkan / terpotong.
* **Wujud Lengkap di Gambar 2**:
  * Kapsul oval ramping dengan tinggi tepat **36px** (`height: 36px; border-radius: 9999px;`).
  * **Ikon Robot & Live Pulse Dot**: Robot mini SVG beraksen cyan didampingi dot hijau berkedip dinamis (`status-dot-active`).
  * **Badge Energi Ringkas**: Kapsul mini `⚡ 44/210` bergaris cyan tipis dengan angka tabular monospaced.
  * **Badge Countdown**: Kapsul gelap beraksen indigo `🕒 33m` (atau format jam/menit).
  * **Tombol Cepat Jeda/Lanjut (Pause/Play)**: Tombol lingkaran merah/rose `⏸` untuk menghentikan bot dalam kondisi darurat secara instan tanpa harus membuka panel penuh.
  * **Tombol Perbesar / Pulihkan (Expand)**: Tombol lingkaran abu-abu `⤢` untuk mengembalikan panel ke Mode 1 Expanded (356px).

#### 2. Empat Tombol Aksi Lengkap pada Header Bar Permukaan A (Mode 1 Expanded)
* **Kondisi di Gambar 1**: Header bar sebelah kanan hanya memiliki 2 tombol kecil samar (`[ ⤢ ]` dan `[ o ]`), tombol Pin, Settings, dan Close hilang terpotong.
* **Wujud Lengkap di Gambar 2**: Header bar wajib memiliki **4 tombol aksi mandiri (ukuran 24px x 24px inline SVG vector)**:
  1. **Tombol 1 — Minimize to Pill (`⤢` / Collapse)**:
     - Ikon 2 panah menguncup ke dalam.
     - Fungsi: Mengubah tampilan panel penuh menjadi kapsul mini Mode 2 (tinggi 36px).
  2. **Tombol 2 — Pin / Lock Position (`🔒` / `🔓`)**:
     - Ikon gembok terkunci / terbuka.
     - Fungsi: Mengunci koordinat panel agar tidak bergeser saat scrolling halaman game atau tersenggol drag mouse. Saat terkunci, tombol menyala cyan aktif dengan label status *"Posisi Terkunci (Pinned)"*.
  3. **Tombol 3 — Settings Gear (`⚙️`)**:
     - Ikon roda gigi / settings.
     - Fungsi: Memunculkan modal dialog pengaturan desktop lengkap (Permukaan C) melayang di tengah layar game.
  4. **Tombol 4 — Close / Hide Panel (`✕`)**:
     - Ikon silang / cross tipis.
     - Fungsi: Menyembunyikan floating panel dari layar game sementara waktu (dapat dimunculkan kembali dengan shortcut keyboard `Alt+H` atau melalui popup toolbar).

#### 3. Kontrol Stepper Input Target Level `[-]` dan `[+]` pada Kartu Stat Settings
* **Kondisi di Gambar 1**: Kartu stat hanya menampilkan kotak input `103` tanpa tombol stepper `[-]` dan `[+]`.
* **Kebutuhan Ekstensi**: Mempertahankan input angka bersih tanpa panah spinner bawaan browser (`-webkit-appearance: none;`) yang didampingi tombol stepper `[-]` dan `[+]` agar pemain dapat menaikkan/menurunkan target level per satu poin dengan klik cepat atau mengetik angka secara langsung.

---

## 📜 ARSIP MASTER PROMPT: DOKUMENTASI PROMPT GENERASI UI/UX DARI ARGON

Seluruh prompt yang digunakan dalam merancang dan menyempurnakan UI/UX bersama Argon didokumentasikan di bawah ini sebagai **referensi baku permanen**, sehingga tidak ada lagi kebingungan saat melakukan regenerasi kode atau ekstensi di masa mendatang:

### Prompt 1: Sistem Pemilihan Stat Mandiri (Stat Card Checkbox & Dimming System)
> **Tujuan**: Menggantikan sistem kaku di mana pemain harus menyamakan target level dengan level saat ini hanya untuk melewatkan stat.

```markdown
Halo Gemini Argon, terima kasih banyak atas desain mockup sebelumnya. Tampilan fintech cyberpunk dark-mode-nya sudah sangat keren dan mewah!

Namun, ada perbaikan UX krusial pada bagian "Stats & Emas" (Latihan Stats):

### Masalah UX:
Sebelumnya, ketiga stat selalu aktif dan hanya mengandalkan dropdown "Fokus Prioritas". Jika pemain hanya ingin menaikkan 1 stat saja (misalnya HANYA Kekuatan), pemain terpaksa harus mengubah angka target Pendidikan dan Ekonomi menjadi sama persis dengan level saat ini agar bot tidak melatihnya. Ini merepotkan dan tidak praktis!

### Solusi yang Diinginkan: "Stat Card Checkbox & Dimming System"
Tolong desainkan ulang kartu stat (Kekuatan, Pendidikan, Ekonomi) menggunakan sistem Checkbox / Switch Toggle per kartu:

1. Checkbox / Toggle di Setiap Kartu:
   - Setiap kartu stat memiliki Checkbox atau Switch mini di sudut atas kartu (misal: [✓] Aktif).
   
2. Dua Status Visual Kartu (Active vs Dimmed):
   - Status Aktif (Dicentang):
     * Kartu menyala penuh (opacity 100%, border glowing halus sesuai warna tema stat: Rose/Merah untuk STR, Sky Blue untuk EDU, Emerald/Hijau untuk EKO).
     * Input Target Level aktif dan dapat diedit.
     * Biaya emas stat tersebut dihitung ke kalkulator.
   - Status Nonaktif (Tidak Dicentrang / Dimmed):
     * Kartu mengalami fade out / dimm (opacity 40% - 45%, border redup, grayscale subtle).
     * Input Target Level terkunci (disabled) dan redup.
     * Muncul badge/teks halus: "[ Dilewati ]" atau "Tidak Dilatih".
     * Biaya emas stat ini otomatis dianggap 0 Emas dan dikeluarkan dari kalkulator.

3. Logika Prioritas yang Cerdas (Smart Priority):
   - Jika hanya 1 stat yang dicentang (misal hanya STR): Dropdown prioritas otomatis menampilkan pill ringkas: "Fokus Tunggal: Kekuatan" (tanpa opsi rotasi yang membingungkan).
   - Jika 2 atau 3 stat dicentang: Opsi prioritas baru muncul untuk menentukan stat mana yang didahulukan atau rotasi seimbang.

4. Kalkulator Biaya Emas Dinamis:
   - Label kalkulator otomatis menyesuaikan jumlah stat terpilih, misalnya: "Total Emas Dibutuhkan (1 Stat)" atau "(2 Stat)".

Berikan mockup visual layout (contoh Kekuatan aktif, Pendidikan & Ekonomi dimmed) dan kode CSS & HTML untuk styling .stat-card.active dan .stat-card.dimmed.
```

---

### Prompt 2: Layout Spacious Desktop Settings Modal (Pelebaran Modal ke 620px)
> **Tujuan**: Menghilangkan tampilan modal yang sumpek/sempit (lebar 350px membuat kolom kartu hanya 95px sehingga teks patah dan menimpa checkbox).

```markdown
Halo Gemini Aragon, terima kasih atas pembaruan desainnya!

Permukaan A (Floating Panel 356px) dan Permukaan B (Popup 360px) sudah sangat proporsional. Namun, ada satu masalah layout besar pada PERMUKAAN C (Settings Modal):
Bentuknya terasa "rumpek, sumbek, dan sangat sempit", terjadi text-overlapping dan teks patah-patah di dalam kartu stat.

### Akar Masalah:
Settings Modal saat ini didesain menggunakan lebar sempit (~350px/360px) seperti widget toolbar. Ketika 3 kartu stat dipaksakan masuk ke dalam 3 kolom pada lebar 350px, lebar tiap kartu hanya tersisa ~95px.
Akibatnya:
1. Teks menimpa checkbox (misal: "STRAktif" bertumpuk dengan kotak centang).
2. Kata "Pendidikan" tidak muat dan kata "Lv. 50" terdorong ke bawah.
3. Tombol stepper "[-]" "[+]" gepeng dan terjepit.
4. Kata "Emas" jatuh ke baris bawah angka (contoh: "1.953" di atas, "Emas" di bawah).

### Aturan Solusi:
Di desktop, Settings Modal adalah dialog modal di tengah layar, BUKAN widget ponsel atau toolbar mini. Tolong perbaiki dengan aturan berikut:

1. Perlebar Ukuran Modal ke Standar Desktop:
   - Ubah lebar modal Permukaan C menjadi 580px – 640px (default 620px) layaknya modal setting desktop modern di Figma, Discord, atau VS Code.
   - Dengan modal 620px, setiap kartu stat memiliki ruang lega sebesar 175px – 190px!

2. Tata Letak Kartu Stat yang Bernapas & Rapi (Spacious 3-Column Grid):
   - Header Kartu: Ikon stat di kiri, nama stat jelas ("Kekuatan", "Pendidikan", "Ekonomi"), dan Checkbox toggle bersih di pojok kanan atas dengan jarak aman (tanpa tumpang tindih!).
   - Baris Level Saat Ini: Teks jelas dalam 1 baris: "Level Saat Ini: Lv. 82".
   - Baris Input Target Level: Input angka modern yang bersih (width: 70px, height: 32px, text-align: center, font monospace bold) didampingi label "Target Level".
   - Baris Estimasi Biaya: Wajib dalam 1 baris utuh rapi, contoh: "Biaya: 1.953 Emas".
   - Kartu Dimmed: Beri badge pill minimalis di tengah: "[ Dilewati ]" dengan opacity 40% dan border redup yang elegan.

3. Kalkulator Biaya Emas yang Rapi:
   - Manfaatkan lebar 620px untuk membuat layout kalkulator yang seimbang:
     * Baris 1: Rincian biaya stat terpilih (STR: 1.953 Emas | EDU: [ Dilewati ] | EKO: [ Dilewati ]).
     * Baris 2: 2 Kolom lega (Kiri: Saldo Dompet & Batas Cadangan, Kanan: Total Biaya & Status Kelayakan Keuangan).
```

---

### Prompt 3: Eliminasi Spinner Arrow, Custom Select Chevron, & Progressive Disclosure (Accordion)
> **Tujuan**: Menghilangkan spinner bawaan browser pada input angka, menghilangkan kotak abu-abu kaku pada dropdown, dan membuat kartu latihan bisa melipat saat OFF.

```markdown
Halo Gemini Aragon, ada 3 perbaikan detail antarmuka yang sangat penting:

1. Hilangkan Arrow Spinner Bawaan di Input Angka Kalkulator:
   - Hilangkan total arrow spinner bawaan browser (::-webkit-inner-spin-button) pada semua input type="number" menggunakan CSS:
     input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
     input[type=number] { -moz-appearance: textfield; }
   - Gantikan dengan input kotak angka monospace yang bersih, rapi, dan elegan.

2. Selaraskan Dropdown "Urutan Prioritas Multi-Stat":
   - Hilangkan kotak abu-abu kaku dan panah default browser pada elemen <select>.
   - Gunakan appearance: none; -webkit-appearance: none; dan pasang custom SVG line chevron tipis (stroke="#38bdf8" atau "#94a3b8") yang menyatu rapi dengan tema dark glassmorphism.

3. Sistem Menguncup Otomatis (Accordion / Progressive Disclosure) untuk Latihan Stats:
   - Pada Floating In-Game Panel (Permukaan A):
     * KONDISI OFF: Jika sakelar Latihan Stats di-klik OFF, kartu otomatis menguncup (collapse fold-up) menjadi 1 baris ramping saja: [ 🏋️ LATIHAN STATS ] ---------- [ OFF ]. Baris STR, EDU, EKO, bar progress, dan hitung mundur timer otomatis tersembunyi ke atas sehingga panel pendek dan bersih.
     * KONDISI AKTIF: Saat sakelar di-klik AKTIF, kartu membuka meluncur ke bawah (smooth slide-down transition) menampilkan kembali 3 badge stat dan timer aktif.
   - Pada Modal Pengaturan Tab Stats & Emas (Permukaan C):
     * KONDISI OFF: Seluruh sub-panel di bawah sakelar master otomatis meredup/menguncup rapi.
     * KONDISI ON: Semua sub-panel terbuka penuh.
```

---

### Prompt 4: Solusi Anti-Gepeng & Anti-Menempel Border pada Kondisi OFF
> **Tujuan**: Mencegah kartu menciut gepeng atau menempel ke garis border kiri/kanan saat status di-OFF-kan.

```markdown
Halo Gemini Aragon, ada revisi styling penting terkait tampilan ketika status "LATIHAN STATS" dalam kondisi OFF:

### Masalah Visual Saat Kondisi OFF:
1. Kartu Menggepeng: Tinggi kartu menyusut terlalu tipis dan gepeng karena padding vertikal hilang.
2. Menempel Border: Ikon di kiri dan badge OFF di kanan menempel rapat ke garis border luar kartu (kurang padding horizontal).
3. Terlalu Menjauh & Kosong: Elemen terlempar ke ujung kiri dan kanan dengan ruang kosong canggung di tengahnya.
4. Modal Settings Bolong: Di Permukaan C saat OFF, area bawahnya menyisakan ruang hitam kosong yang janggal.

### Solusi Styling yang Harus Diperbaiki:
1. Perbaiki Kartu Collapsed di Permukaan A & B (Floating Panel & Popup):
   - Berikan min-height: 44px; dan padding: 10px 14px; yang konsisten (sama persis dengan padding kartu lainnya!). Sudut border tetap membulat halus (border-radius: 10px;).
   - Tata Letak: Sisi kiri Ikon Dumbbell SVG + Teks "LATIHAN STATS" (font-weight: 700, 12px, warna #94a3b8). Di tengah/samping judul beri label pill halus: [ Nonaktif ] agar tidak ada jurang kosong. Sisi kanan: Badge pill [ • OFF ] dengan padding dalam proporsional.

2. Perbaiki Tampilan Modal Settings Permukaan C Saat OFF:
   - Jangan biarkan modal settings menjadi bolong melompong ke bawah saat master OFF.
   - Biarkan Urutan Prioritas, 3 Kartu Stat, dan Kalkulator Biaya tetap tampil di posisinya dalam kondisi Disabled / Dimmed State (opacity: 0.25; filter: grayscale(80%); pointer-events: none;).
   - Beri banner keterangan halus: "Auto Latihan dinonaktifkan. Aktifkan sakelar di atas untuk mengubah konfigurasi."
   - Dengan cara ini, layout modal tetap kokoh, simetris, dan tidak meninggalkan kekosongan hitam.
```

---

### Prompt Master Konsolidasi (All-In-One Unified Prompt)
> **Tujuan**: Master prompt gabungan untuk digunakan kembali kapan pun dibutuhkan untuk menginstruksikan AI merender ulang seluruh komponen secara utuh tanpa ada yang terpotong.

```markdown
Buatkan desain antarmuka lengkap (UI/UX Design System & Interactive Component) untuk ekstensi browser game "Parlementum Auto Worker" dengan tema "Cyber Abyss Glassmorphism" (Background #0a0e1a, radial glow cyan/indigo/emerald, border white/10, backdrop blur 20px, Google Fonts Inter untuk teks dan JetBrains Mono tabular-nums untuk angka dan timer).

Antarmuka terdiri dari 3 Permukaan yang terintegrasi penuh:

1. PERMUKAAN A: Floating In-Game Panel (Lebar 356px)
   - Memiliki 2 Mode Tampilan yang dapat di-toggle:
     * Mode 1 (Expanded Panel 356px):
       - Header: Ikon robot cyber, judul "AUTO WORKER", live status pulse dot emerald, dan 4 tombol aksi (Minimize ke Kapsul, Pin/Lock posisi, Settings modal opener, dan Close/Hide panel). Dilarang memotong 4 tombol ini!
       - Body: Widget Wilayah & Buff, Waktu UTC & Countdown Jam Emas (Flush), Kuota Roti Harian (dengan stepper [-] [+] [Max]), Bar Energi berkilau dengan shimmer animation, Status Auto Kerja & Countdown, Kartu Latihan Stats (STR, EDU, EKO mini interactive pills, progress bar aktif), Status Token Auth JWT.
       - Footer: 3 tombol aksi utama [Kerja], [Jeda Bot], [Log Bot].
     * Mode 2 (Floating Pill Capsule - Tinggi 36px):
       - Kapsul oval 36px mengapung ramping berisi: Ikon robot + live dot, Badge Energi (⚡ 44/210), Badge Countdown (🕒 33m), Tombol Lingkaran Jeda (⏸), dan Tombol Lingkaran Pulihkan Panel (⤢).
   - Fitur Progressive Disclosure: Jika Latihan Stats OFF, kartu menguncup rapi (min-height 44px, padding 10px 14px, berlabel [ Nonaktif ] dan pill [ • OFF ]).

2. PERMUKAAN B: Toolbar Extension Popup (Lebar 368px)
   - Layout identik dan tersinkronisasi dengan Permukaan A.
   - Memiliki tombol [Pengaturan] di header bar yang otomatis memfokuskan tab game dan membuka Modal Settings di tengah layar.

3. PERMUKAAN C: Spacious Desktop Settings Modal (Lebar Lega 620px)
   - Dialog modal desktop elegan di tengah layar game dengan 5 tab menu: [Kerja], [Stats & Emas] (aktif), [Stealth], [Suara], [Pintasan].
   - Tab Stats & Emas memuat:
     * Sakelar Master Auto Latihan Stats (ON / OFF).
     * Dropdown / Pill Pintar Urutan Prioritas (Otomatis menampilkan "Fokus Tunggal: [Stat]" jika 1 stat dicentang, atau dropdown prioritas terfilter dinamis jika multi-stat dicentang).
     * 3 Kartu Stat (Kekuatan, Pendidikan, Ekonomi) dalam grid 3-kolom lega (lebar tiap kartu ~180px):
       - Masing-masing dilengkapi Checkbox toggle mandiri.
       - Kartu dicentang (Aktif): Opacity 100%, border glowing bertema, input Target Level aktif, biaya emas terhitung.
       - Kartu tidak dicentang (Dimmed): Opacity 40%, grayscale subtle, target level disabled, badge "[ Dilewati ]", biaya 0 emas.
       - Input Target Level: Bebas dari panah spinner browser (::-webkit-inner-spin-button: none), disertai stepper [-] [+].
     * Kalkulator Biaya Emas Real-Time 2-Kolom:
       - Baris Rincian Biaya per Stat (STR / EDU / EKO).
       - Kolom Kiri: Saldo Dompet Emas & Batas Cadangan Minimal Emas.
       - Kolom Kanan: Total Emas Dibutuhkan & Badge Status Finansial Real-Time (misal: "AMAN • Sisa +X Emas" atau "KURANG X EMAS • Melatih Bertahap").
     * Saat Master Sakelar OFF: Bagian konfigurasi di bawahnya berubah menjadi Dimmed Preview rapi dengan banner pemberitahuan halus, tanpa menyisakan lubang hitam kosong.

Gunakan 100% SVG line icons murni tanpa karakter emoji. Pastikan seluruh struktur rapi, proporsional, dan tidak ada teks yang menimpa checkbox atau terpotong border.
```

---

## 1. FITUR-FITUR BARU & SPESIFIKASI FUNGSIONAL

### A. Auto Latihan Stat (Auto Train System)
* **Sistem Pemilihan Stat Fleksibel (Checkbox & Dimming)**:
  * Menggantikan sistem lama yang kaku (di mana pemain harus menyetel target level sama dengan level saat ini hanya untuk melewatkan stat).
  * Pemain bebas memilih stat mana yang ingin dinaikkan: **Kekuatan (STR)**, **Pendidikan (EDU)**, dan/atau **Ekonomi (EKO)** menggunakan Checkbox mandiri.
  * Stat yang tidak dicentang otomatis mengalami efek **redup (*dimmed / grayscale 80% / opacity 0.38*)**, dinonaktifkan inputnya, dan dilewati (*skipped*) oleh bot tanpa menghabiskan emas.
* **Target Level Dinamis Per Stat**:
  * Pengaturan target level masing-masing stat menggunakan kontrol stepper `[-]` dan `[+]` serta input angka bersih tanpa panah spinner.
  * Target minimal terkunci di level saat ini (tidak bisa lebih rendah dari level sekarang).
* **Dropdown Urutan Prioritas Cerdas (Dynamic Filtering)**:
  * Dropdown urutan latihan (misal: *Pendidikan Dulu*, *Ekonomi Dulu*, *Kekuatan Dulu*, atau *Seimbang/Balanced*).
  * **Wajib difilter dinamis**: hanya menampilkan pilihan dari stat yang sedang dicentang aktif. Jika hanya Kekuatan & Ekonomi yang dicentang, opsi Pendidikan otomatis disembunyikan dari dropdown.
* **Eksekusi Bot Otomatis**:
  * Bot memantau giliran latihan dan mengeksekusi latihan otomatis secara cerdas (klik elemen DOM atau fallback API request).
  * Bot tidak akan pernah menyentuh stat yang statusnya dinonaktifkan/dilewati.

### B. Deteksi Level & Estimasi Menuju Level Tujuan
* **Deteksi Level Saat Ini Secara Real-Time**:
  * Mendeteksi level stat akun pemain saat ini langsung dari DOM halaman Dashboard game maupun respon interceptor API.
* **Kalkulasi Delta Level Menuju Tujuan**:
  * Menghitung selisih level: $\Delta\text{Level} = \text{Target Level} - \text{Level Saat Ini}$.
  * Menampilkan badge delta seperti `+18 Lv` pada kartu stat aktif, atau `Terkunci / Dilewati` pada kartu yang redup.
* **Menghitung Estimasi Durasi Waktu Upgrade**:
  * **Countdown Sesi Aktif**: Menampilkan sisa waktu sesi latihan yang sedang berjalan di game (misal: `1j 13m 20s`) dengan bar progres gradasi halus.
  * **Estimasi Total Waktu Menuju Target**: Menghitung akumulasi total durasi jam/hari yang dibutuhkan untuk mencapai target level yang diinginkan berdasarkan durasi cooldown per level latihan.

### C. Kalkulator Biaya Emas Real-Time (Cost Calculator)
* **Rumus Deret Aritmatika Game**:
  * Di game Parlementum, biaya naik ke level $N$ adalah $N$ Emas.
  * Rumus akumulasi biaya dari Level $A$ ke Level $B$:
    $$\text{Total Emas} = \sum_{i = A + 1}^{B} i = \frac{(B - A) \times (A + 1 + B)}{2}$$
* **Breakdown Biaya Emas Per Stat**:
  * Rincian biaya ditampilkan mandiri untuk STR, EDU, dan EKO.
  * Jika stat dinonaktifkan/dilewati, biayanya otomatis bernilai `0 / Dilewati (0)` dan kartunya meredup.
* **Sinkronisasi Saldo Dompet Emas Akun**:
  * Membaca saldo emas yang dimiliki akun saat ini secara real-time.
* **Evaluasi Status Finansial Akun**:
  * Menampilkan badge status real-time:
    * `AMAN • Sisa +X Emas`: Saldo dompet mencukupi total biaya ditambah cadangan minimal.
    * `KURANG X EMAS • Melatih Bertahap`: Saldo belum cukup, bot akan melatih satu per satu level sesuai ketersediaan emas tanpa memaksakan.
    * `SIAGA • 0 Stat Dipilih`: Tidak ada stat yang dicentang.
* **Batas Cadangan Minimal Emas (Safety Gold Reserve)**:
  * Menjaga agar bot tidak melatih stat jika saldo emas di dompet akan tersisa di bawah angka cadangan minimal (misal default: 50 Emas), melindungi aset untuk perang, pasar, atau kebutuhan darurat.

### D. Modernisasi UI/UX (Sesuai Referensi Argon)
* Mengadopsi bahasa desain **Cyber Abyss Glassmorphism**:
  * Background `#0a0e1a` dengan 3 radial glow highlights (cyan, indigo, emerald) dan grid halus.
  * Glass shell container **`.paw-shell`** (radius 16px, blur 20px, border highlight lembut).
  * Kartu dalam **`.paw-card`** dan recessed box **`.paw-well`**.
  * Tipografi ganda: **Google Fonts Inter** untuk teks antarmuka dan **JetBrains Mono (`.tabular-nums`)** untuk seluruh angka, timer, dan metrik agar rapi dan tidak goyang saat angka bertambah/berkurang.
  * Garis aksen cahaya atas (*Top Subtle Accent Glow Line*).
* **Mode Buka/Tutup (*Collapse & Expand*) pada Panel & Popup**:
  * Jika Latihan Stats berstatus **OFF**, bagian tubuh latihan otomatis melipat/menciut (*collapsed*, tinggi 0px) sehingga tampilan tidak sempit/sumpek.
  * Saat di-**ON**-kan, bagian latihan meluncur terbuka (*expanded*) menampilkan pills dan status bar.
* **Mini Stat Pills Interaktif (STR, EDU, EKO)**:
  * 3 pill mini pada Floating Panel dan Toolbar Popup dapat diklik langsung oleh pemain untuk menyalakan/mematikan stat tanpa perlu repot membuka modal pengaturan.

---

## 2. BANK DATA & SELEKTOR DARI INSPECT ELEMENT GAME

Berikut adalah seluruh data konkret yang berhasil diekstrak dari halaman game `parlamentum.org` dan jaringan API:

### A. Elemen & Teks Latihan Stat
* **Bagian Latihan**:
  * Header teks: `LATIHAN` (pada elemen `h1`–`h6`, `div`, `span`).
  * Atribut container: `[data-testid="dash-training"]`.
* **Identifikasi Level Stat**:
  * Atribut `data-testid`:
    * Kekuatan: `[data-testid="stat-strength"]`, `[data-testid="stat-kekuatan"]`
    * Pendidikan: `[data-testid="stat-education"]`, `[data-testid="stat-pendidikan"]`
    * Ekonomi: `[data-testid="stat-economy"]`, `[data-testid="stat-production"]`, `[data-testid="stat-ekonomi"]`
  * Pola Teks Tombol di Kartu:
    * Tombol Idle: `LATIH - LV (\d+)` $\rightarrow$ Level saat ini = $\text{Angka} - 1$.
    * Tombol Sesi Aktif: `BERLATIH KE LV (\d+)` $\rightarrow$ Target level = $\text{Angka}$, Level saat ini = $\text{Angka} - 1$.
* **Timer Hitung Mundur Sesi Aktif**:
  * Atribut: `[data-testid^="train-timer-"]` (misal `train-timer-strength`).
  * Pola regex waktu: `(\d+)\s*j` (jam), `(\d+)\s*mnt` (menit), `(\d+)\s*dtk` (detik).
* **Tombol Aksi Latihan**:
  * Atribut: `[data-testid="train-strength"]`, `[data-testid="train-education"]`, `[data-testid="train-economy"]`.
* **Endpoint API Latihan**:
  * URL: `POST https://parlamentum.org/api/player/train` atau `/api/train`
  * Request Body: `{"stat": "strength" | "education" | "economy"}`
  * Response Body:
    ```json
    {
      "endsAt": "2026-10-25T02:45:00.000Z",
      "targetLevel": 83,
      "costGold": 83,
      "stat": "strength"
    }
    ```

### B. Saldo Dompet Emas (Wallet Gold)
* **Elemen Teks DOM**: Label teks berdekatan dengan teks `EMAS`.
* **Pola Regex**: `([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]{1,7})` (mengonversi titik pemisah ribuan `4.531 Emas` $\rightarrow$ `4531`).
* **Field JSON API**: `gold`, `walletGold`, `wallet_gold`.

### C. Energi & Shift Kerja (Energy & Work)
* **Elemen Teks DOM**: Pola pecahan `(\d+)\s*\/\s*(\d+)` (misal: `44/210` atau `0/210`).
* **Field JSON API**: `currentEnergy`, `maxEnergy`, `energy`.
* **Endpoint Kerja**: `POST /api/player/work` atau `POST /api/player/shift`
  * Response: `{ energyUsed, xpEarned, produced, wageNet, leveledUp }`.

### D. Kuota Makanan Harian (Roti)
* **Mutasi URL / Request**: Intersepsi request `POST/PUT/PATCH` ke URL yang memuat `/api/player/eat`, `/inventory/use`, `/item/use`.
* **Deteksi DOM Batas Maksimal**: Menangkap string pesan *"Batas roti harian tercapai"* (*Daily bread limit*).
* **Deteksi Akun Premium**: Field `isPremium` atau `is_premium` pada profil akun (`10 slot` untuk Reguler vs `20 slot` untuk Premium).

### E. Wilayah, Buff, & Jam Server
* **Nama Wilayah**: Pembacaan string wilayah domisili (misal `Jakarta`).
* **Buff Wilayah**: Pembacaan persentase bonus regen (misal `+50% Regen` atau `Normal (1.0x)`).
* **Waktu Server**: Jam server UTC game (`00:00:00 UTC`).
* **Energy Flush (Jam Emas)**: Waktu reset server harian Parlementum tepat pukul `00:00 UTC`. Bot mengaktifkan Jam Emas pada `23:15 UTC` (45 menit sebelum reset) untuk menghabiskan sisa energi akun.

### F. Sesi Token Autentikasi
* Header HTTP: `Authorization: Bearer <JWT Token>` yang ditangkap otomatis oleh `interceptor.js` dari execution context game.

---

## 3. DAFTAR BUG REFERENSI ARGON & SOLUSI PENYELESAIANNYA

Berikut adalah daftar bug yang terjadi pada iterasi-iterasi file referensi Argon beserta cara mengatasinya:

| Masalah / Bug di Referensi | Penyebab di Kode Referensi | Solusi & Aturan Perbaikan |
| :--- | :--- | :--- |
| **1. Panah Spinner Input Angka** | Tag `input[type="number"]` memunculkan panah spinner default browser yang merusak estetika kartu. | Tambahkan CSS `-webkit-appearance: none; margin: 0; -moz-appearance: textfield;` pada seluruh input angka kalkulator. |
| **2. Tampilan Menggepeng Menatap Border Saat OFF** | Mengubah teks atau menghapus padding saat mode OFF menyebabkan lebar kartu menciut dan menabrak sisi container. | Gunakan transisi halus `max-height: 0px; opacity: 0; overflow: hidden;` dengan struktur flexbox yang terkunci lebar tetapnya (*fixed width / box-sizing*). |
| **3. Dropdown Prioritas Memunculkan Stat Nonaktif** | Opsi dropdown statis dan tidak sinkron dengan checkbox status aktif. | Buat regenerasi opsi `<option>` secara dinamis via JavaScript: dropdown hanya me-render stat yang memiliki status dicentang aktif. |
| **4. Tombol OFF Masih Menyala Hijau / Outline Putih** | Class CSS `.active` dan warna inline-style hijau tidak dibersihkan saat switch diubah ke posisi OFF. | Pisahkan styling secara tegas: status OFF menggunakan badge abu-abu gelap dengan dot abu-abu, status AKTIF menggunakan emerald glow. |
| **5. Tombol Close / Silang Hilang Saat Ganti Mode** | Argon lupa menyertakan tombol close ketika me-render ulang template mode ringkas/penuh akibat terpotong limit token. | Satukan template HTML dengan container tetap `#aw-panel`, pertahankan seluruh 4 tombol header (`aw-minimize`, `aw-pin`, `aw-settings`, `aw-hide`). |
| **6. Titik Ganda (Double Bullet) di Teks** | Terdapat karakter bullet `•` ganda di dalam baris status makanan / timer. | Bersihkan karakter ganda, gunakan satu pemisah rapi `•` dengan warna abu-abu netral (`#64748b`). |
| **7. Kode Terpotong / Hilang di File Revisi Lanjutan** | File `(4).html` s/d `(7).html` kehilangan kode Surface B (Popup) dan Surface C (Modal Tab) karena Argon kehabisan token saat fokus memperbaiki satu elemen. | Gunakan struktur modular: satukan Surface A (Panel), Surface B (Popup), dan Surface C (Settings Modal) secara mandiri di berkas ekstensi masing-masing (`panel.js`, `popup.html`, `settings.js`). |

---

## 4. TIGA PERMUKAAN UTAMA ANTARMUKA (THREE SURFACES)

Sistem antarmuka terbagi menjadi 3 permukaan yang harus selalu selaras:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PARLEMENTUM AUTO WORKER                         │
├────────────────────┬────────────────────┬──────────────────────────────┤
│    PERMUKAAN A     │    PERMUKAAN B     │         PERMUKAAN C          │
│ Floating In-Game   │ Toolbar Extension  │        Settings Modal        │
│   Panel (356px)    │   Popup (360px)    │        (5 Tabbed Menu)       │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ • Mode 1: Expanded │ • Dipicu dari ikon │ • Tab 1: Umum & Ambang EN    │
│   (356px glass)    │   ekstensi browser │ • Tab 2: Auto Latihan Stats  │
│ • Mode 2: Floating │ • Sinkronisasi tab │   (Checkbox + Kalkulator)    │
│   Pill (36px oval) │ • Tombol pintas    │ • Tab 3: Stealth & Jadwal    │
│ • Mini stat pills  │   buka tab game    │ • Tab 4: Tampilan Panel      │
│   interaktif       │ • Activity Log     │ • Tab 5: Notifikasi & Suara  │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

---

## 5. STATUS IMPLEMENTASI SAAT INI & RENCANA TINDAKAN (ACTION PLAN)

### Status Komponen Saat Ini:
* [x] **Core Config & State**: Ditambahkan opsi `trainStrengthEnabled`, `trainEducationEnabled`, `trainEconomyEnabled` di [`config.js`](file:///f:/Parlementum/extension-parlementum/src/config.js).
* [x] **Training Engine**: Logika filter stat aktif, pencegahan latihan stat nonaktif, integrasi API, serta formula resmi estimasi waktu akumulasi ($0.2894 \cdot n^{2.5} / (1 + 0.01 \cdot S_{edu})$) di [`training.js`](file:///f:/Parlementum/extension-parlementum/src/training.js).
* [x] **Settings Tab 2 (Surface C - 620px Desktop Width)**: Mengadopsi 100% desain dari prototype `(7).html` & tangkapan layar referensi: 5 tab segmented (`Kerja`, `Stats & Emas`, `Stealth`, `Suara`, `Pintasan`), Master Switch dengan status AKTIF / • OFF, smart priority bar (0-stat siaga amber, single-stat rose focus, multi-stat sky dropdown), 3 kartu stat terpisah dengan checkbox dan level stepper 1-500, serta Kalkulator Biaya Emas Real-Time terpadu (3 breakdown pill, input Saldo Dompet & Cadangan Minimal, dan status badge kelayakan keuangan `AMAN` / `KURANG`).
* [x] **Floating Panel (Surface A - 356px)**: Sesuai referensi prototype `(7).html`: Mode 1 Expanded (356px) & Mode 2 Floating Pill Capsule (36px), kuota roti harian dengan stepper `[-] [+] [Max]`, energi dengan % readout, status sesi auth valid, tombol `Kerja`, `Jeda Bot`, `Log Bot`, serta penjaminan anti-hilang (clamped viewport coordinates & auto-recovery button).
* [x] **Toolbar Popup (Surface B - 360px)**: Sesuai referensi prototype `(7).html`: Header sinkronisasi lintas tab dengan tombol Pengaturan di kanan atas, kuota roti harian, readout energi %, kartu latihan stats dengan sub-well fokus, dan tombol aksi terpadu (`Kerja`, `Jeda Bot`, `Log Bot`).
* [x] **Penyelarasan UI/UX Modern Aragon & Perbaikan Bug (Gambar 1, 2, 3, 4, 5)**:
  - **Gambar 1 (Perbaikan Bug Overflow & Scrollbar Horizontal di Stats & Emas)**: Mengeliminasi tombol stepper bulky `[-] [+]` di dalam kartu stat yang menyebabkan overflow horizontal dan pemotongan teks `3.724 E...`. Kartu stat kini menggunakan input target level bersih (`stat-target-input`, 62px) dengan padding proporsional sehingga ketiga kolom stat (STR, EDU, EKO) dan kalkulator emas muat 100% sempurna tanpa scrollbar horizontal.
  - **Gambar 2 (Pembersihan Label Showcase In-Game Widget)**: Menghapus seluruh label teks prototype `Mode 1: Expanded Panel (356px) Ubah ke Kapsul Ramping` dan `Mode 2: Floating Pill Capsule (36px) Buka Panel Penuh` dari floating widget in-game agar tampilan permainan 100% bersih, rapi, dan imersif.
  - **Gambar 3 (Pembaruan Tab 1 Kerja)**: Mengadopsi slider ambang batas energi presisi 10–210 EN dengan readout badge `${val} EN`, 5 chip preset cepat (`10`, `20`, `50`, `100`, `Max (210)`), tombol segmented kuota roti harian (`10 Slot` / `20 Slot`), toggle pengingat roti sebelum reset, serta toggle Energy Flush akhir hari dengan badge `FLUSH`.
  - **Gambar 4 (Pembaruan Tab 3 Stealth)**: Menyelaraskan switch Acak Jitter Ambang Energi dengan badge `±2 EN`, Jadwal Istirahat Malam (Sleep Mode) dengan input waktu presisi menit `Jam Mulai Istirahat` (default `23:30`) dan `Jam Bangun Aktif` (default `05:45`), serta Peredam Log Energi Rendah.
  - **Gambar 5 (Pembaruan Tab 5 Pintasan & Tampilan)**: Menyematkan toggle Panel Hanya di Dashboard, Eksekusi Multi-Tab Leader-Only, tombol `Reset Posisi Panel` untuk memulihkan panel ke sudut kanan atas, serta daftar Pintasan Keyboard interaktif bergaya keycap (`paw-hotkey-btn`) yang dapat langsung diklik untuk merekam hotkey baru secara real-time.
* [x] **Auto Konfirmasi Pop Up "MULAI PELATIHAN" (`data-testid="train-confirm-start"`)**:
  - Menyelesaikan masalah bot terhenti (stuck) ketika pop up modal konfirmasi latihan muncul di layar game:
    - **Multi-Event Synthetic Click (`clickElement`)**: Mengirimkan rangkaian event lengkap (`pointerover` -> `mouseover` -> `pointerdown` -> `mousedown` -> `pointerup` -> `mouseup` -> `.click()` -> pemanggilan handler `__reactProps$...onClick` React Fiber) sehingga komponen Radix UI Dialog / Next.js merespons klik sintetis tanpa gagal.
    - **Pengawas Real-Time (`setupTrainingModalObserver`)**: Memasang `MutationObserver` pada `document.body` yang secara instan (<50ms) mendeteksi node modal begitu dimuat ke DOM dan langsung memicu konfirmasi otomatis.
    - **Selektor Berlapis & Tahan Guncangan (`getTrainingConfirmStartButton`)**: Memeriksa `[data-testid="train-confirm-start"]`, `[data-testid*="confirm-start"]`, `button.btn-gold` di dalam wrapper modal, hingga pemindaian global teks "Mulai Pelatihan" di seluruh dokumen (kebal terhadap perubahan wrapper DOM).
    - **Perpanjangan Jeda Tunggu & Interval Cepat**: Meningkatkan jeda tunggu pembukaan modal menjadi 6000ms dengan polling tiap 60ms untuk mengantisipasi latensi kalkulasi diskon stat dari server game.
    - **Pemeriksaan Status Aktif Tepat**: Memastikan `isTrainingActive` selalu mengembalikan `false` jika pop up konfirmasi sedang ada di DOM agar bot tidak menganggap latihan sudah berjalan sebelum konfirmasi selesai.
* [x] **Auto-Sinkronisasi Kuota Roti & Status Makanan Resmi (`data-testid="bread-today"`)**:
  - Menghapus ketergantungan tebakan manual / lonjakan energi untuk pencatatan roti harian, memanfaatkan elemen UI resmi game hasil pembaruan website:
    - **Ekstraksi Presisi Ground Truth DOM ([`readBreadQuotaFromDom`](file:///f:/Parlementum/extension-parlementum/src/energy.js))**: Membaca langsung elemen `<span data-testid="bread-today">Sisa roti hari ini 9/20</span>`. Mengurai otomatis kapasitas total (Standar `10` / Premium `20`) dan sisa roti harian secara matematis: `eaten = maxCap - remaining`.
    - **Deteksi Otomatis Kapasitas Premium/Standar**: Pengguna tidak perlu lagi memilih manual tombol 10/20 di Pengaturan. Ekstensi langsung menyesuaikan `CONFIG.maxFoodDaily` ke `20` (Premium) atau `10` (Standar) begitu membuka dashboard.
    - **Sinkronisasi Reaktif Instan**: Terhubung ke `MutationObserver` dan event klik game. Setiap kali pemain mengonsumsi roti (T1–T5 di dashboard atau inventory), hitungan sisa dan konsumsi slot di panel in-game langsung sinkron seketika tanpa selisih.
    - **Tampilan Tab Pengaturan Interaktif**: Menambahkan label badge `AUTO-SYNC` pada opsi Kapasitas Roti Harian di tab Pengaturan, menampilkan status deteksi game aktif secara transparan.
* [x] **Validasi Alur Build Cepat**: Memastikan alur build hanya menggunakan `vite build && node sync-release.cjs` tanpa membuat file ZIP otomatis, seluruh aset SVG mandiri bebas emoji Unicode, dan langsung terdistribusi ke `extension-parlementum-release/`.

### Langkah Selanjutnya (Action Items):
1. **Pengujian Integrasi Game Asli**:
   - Memastikan pembacaan DOM saat sesi latihan berjalan di `parlamentum.org` menangkap waktu countdown dan memperbarui progress bar secara mulus.
2. **Umpan Balik Pemain**:
   - Memvalidasi kenyamanan pengguna saat beralih antara Mode 1 (Expanded) dan Mode 2 (Kapsul 36px) serta interaksi klik cepat mini pills di in-game panel.

---

### Update Desain UI/UX & Visual Polish (v5.13.0)

1. **Latihan Stats & Energy Bar (Gambar 2)**:
   - **Progress Bar Fokus Naik Level**: Menambahkan `#aw-train-progress-bar` dan `#popup-train-progress-bar` dengan animasi gradien dinamis (`statGradientShimmer` dari rose ke amber) di bawah teks label fokus level.
   - **Animasi Gradien Energi**: Bar energi kini menggunakan animasi shimmer linear-gradient (`shimmerBar`) aktif 4s yang mengalir mulus.
   - **Aksen Warna Mini-Pill Stats**: Tombol mini STR, EDU, dan EKO kini memiliki aksen garis vertikal kiri permanen:
     - STR: Merah/Rose (`#f43f5e`)
     - EDU: Biru/Sky (`#38bdf8`)
     - EKO: Hijau/Emerald (`#10b981`)
     - Saat nonaktif/dimmed, garis warna tetap dipertahankan dengan penurunan opasitas elegan (tanpa efek grayscale pudar abu-abu).

2. **Tombol Aksi In-Game (Gambar 3)**:
   - **Kerja**: Gradien biru bercahaya dengan ikon SVG petir (`⚡`).
   - **Jeda Bot**: Latar burgundy/rose dengan border halus dan ikon SVG pause (`⏸`).
   - **Log Bot**: Latar slate gelap dengan ikon SVG terminal prompt (`>_`).

3. **Header Panel In-Game (Gambar 4)**:
   - Ikon robot modern dalam wadah rounded-square berlatar biru transparan, teks tebal `AUTO WORKER`, dan titik status hijau berdenyut 10px.
   - Empat tombol ikon header konsisten:
     1. Mode Ringkas / Minimalkan (ikon diagonal shrink arrows `⤢`).
     2. Kunci Posisi / Pin (ikon gembok `🔒`, menyala biru saat terkunci).
     3. Pengaturan (ikon gear `⚙`).
     4. Sembunyikan Panel (ikon silang `✕`).

4. **Bagian Bawah Extension Popup (Gambar 5)**:
   - Baris 1: Sesi Token Auth dengan badge `VALID`.
   - Baris 2: Tiga tombol aksi (`Kerja`, `Jeda Bot`, `Log Bot`) bersimbol SVG identik dengan in-game.
   - Baris 3: Tombol lebar penuh `Buka Tab Dashboard Game` dengan ikon tautan eksternal (`↗`) di sebelah kanan.

5. **Pembersihan Scrollbar Popup (Gambar 1)**:
   - Menghilangkan scrollbar vertikal bawaan browser yang tampak kaku di sisi kanan popup menggunakan `scrollbar-width: none;` dan `::-webkit-scrollbar { display: none; }`.
   - Mengoptimalkan jarak dan padding kartu agar seluruh antarmuka tampil pas dan rapi tanpa scrollbar yang mengganggu.

6. **Perbaikan Indikator Mini-Pill Stats (STR, EDU, EKO) Sesuai Gambar 2 & 3**:
   - **Border Kiri Aktif (In-Game & Popup)**: Memperbaiki aturan CSS sehingga garis vertikal warna aksen (`border-left: 2.5px solid`) muncul tegas saat stat dipilih (Merah untuk STR `#f43f5e`, Biru untuk EDU `#38bdf8`, Hijau untuk EKO `#10b981`), dengan teks label yang menyala terang (`#f43f5e`, `#38bdf8`, `#10b981`) dan angka putih (`#ffffff`).
   - **Mode Tidak Dipilih / Nonaktif (Gambar 2)**: Ketika stat tidak dipilih (`dimmed`), border kiri warna aksen sepenuhnya dinonaktifkan menjadi border abu-abu netral tipis yang seragam (`1px solid rgba(255, 255, 255, 0.08)`), warna teks label dan angka berubah menjadi abu-abu redup (`#64748b`), dan opasitas diturunkan menjadi 0.55 tanpa meninggalkan sisa warna merah, hijau, ataupun biru.
   - **Badge Status Pelatihan**: Menyelaraskan badge hitungan stat aktif (misal `0/3 Aktif`, `1/3 Aktif`, `2/3 Aktif`) dengan latar rose transparan dan teks `#fda4af` konsisten di panel floating dan popup.

7. **Perbaikan Perhitungan Bar Progres Latihan Stats (Training Progress Bar)**:
   - **Akar Masalah**: Sebelumnya durasi total latihan diasumsikan secara statis sebesar 1 jam (3.600.000 ms). Ketika target latihan memiliki sisa waktu > 1 jam (seperti pada screenshot: Level 91 dengan sisa 1j 10m dari total ~4j 8m), perhitungannya menghasilkan angka negatif dan terpotong ke nilai minimum 5%, sehingga bar tampak macet/nyangkut di ujung kiri.
   - **Solusi Rumus Game Resmi**: Mengimplementasikan fungsi `getTrainingProgressPercentage()` yang menggunakan rumus resmi durasi latihan game: `time(n) = round(0.2894 * (n ^ 2.5) * (1 / (1 + 0.01 * Sedu)))` untuk menghitung total waktu level latihan secara akurat berdasarkan level target dan level Pendidikan (EDU).
   - **Deteksi Otomatis Bar DOM**: Menambahkan pembacaan bar progres langsung dari kartu elemen game (`BERLATIH`) via rasio lebar rendered bar atau atribut `style="width"` bila tersedia.
   - **Hasil**: Bar progres kini terisi secara proporsional dan akurat (pada screenshot terisi ~72%) dan bergerak maju secara mulus seiring berjalannya waktu.

8. **Pemberian Garis Penanda Warna & Tag Konteks pada Activity Log**:
   - **Penanda Garis Warna di Kiri (`border-left: 3px solid`)**: Setiap baris log pada modal popup (dan viewer in-game) kini memiliki garis penanda vertikal dengan warna yang disesuaikan secara dinamis menurut konteks aktivitasnya:
     - **Hijau Zamrud (`#10b981`)**: Aktivitas Sukses (`SUKSES`) seperti shift/kerja selesai, XP diperoleh, latihan selesai aktif.
     - **Ungu / Indigo (`#818cf8`)**: Aktivitas Latihan Stats (`LATIHAN`) seperti konfirmasi modal latihan, memulai latihan level, toggle target STR/EDU/EKO.
     - **Oranye Hangat (`#f97316`)**: Aktivitas Konsumsi Makanan (`ROTI`) seperti makan roti terdeteksi, kuota roti harian, dan penyetelan slot.
     - **Cyan / Biru Muda (`#06b6d4`)**: Aktivitas Shift & Worker (`KERJA`) seperti giliran kerja dipicu atau pemindaian shift.
     - **Kuning / Amber (`#f59e0b`)**: Peringatan (`WARN`) seperti jeda bot, energi belum cukup, atau penundaan latihan karena emas kurang.
     - **Merah / Rose (`#f43f5e`)**: Kesalahan (`ERROR`) seperti token kedaluwarsa, error jaringan HTTP, atau majikan kehabisan saldo.
     - **Biru Langit (`#38bdf8`)**: Aktivitas Sistem / Server (`SISTEM` / `INFO`) seperti reset UTC 00:00, hari berganti, atau token valid.
   - **Micro-Badge Tag Konteks**: Menambahkan badge label ringkas (`[SUKSES]`, `[LATIHAN]`, `[ROTI]`, `[KERJA]`, `[WARN]`, `[ERROR]`, `[SISTEM]`) di samping timestamp.
   - **Pembaruan Toolbar Filter Sesuai Gambar 2**: Menambahkan titik indikator warna (`pill-dot`) dan angka penghitung jumlah aktivitas (`pill-count`) pada tombol filter `Semua`, `Sukses`, `Peringatan`, `Error`, dan `Info`.

9. **Perbaikan Responsivitas & Keterpotongan Tombol Kategori Log pada Popup Ekstensi**:
   - **Akar Masalah**: Lebar popup ekstensi sebelumnya ditetapkan 360px dengan padding tombol filter log yang cukup lebar (`padding: 3px 8px`, `gap: 5px`, dan teks label panjang seperti `Peringatan 0`), sehingga total lebar 5 tombol kategori melampaui lebar container (mencapai ~364px dibanding ~336px ruang yang tersedia). Akibatnya, tombol filter ke-5 (`Info`) terdorong keluar batas layar dan terpotong/hilang dari pandangan.
   - **Pelebaran & Optimalisasi Tata Letak**:
     - Memperluas lebar popup dari `360px` menjadi `380px` (standar ergonomis modern untuk ekstensi peramban desktop).
     - Menyesuaikan padding toolbar horizontal menjadi `8px` (`padding: 6px 8px 8px 8px;`).
     - Mengoptimalkan ukuran dan padding pill filter (`padding: 3px 5px`, `font-size: 10px`, `gap: 3px`, `flex: 1 1 auto`) serta ukuran micro-dot `5px` dan badge hitungan `9px`.
   - **Hasil**: Kelima kategori pill filter (`Semua`, `Sukses`, `Peringatan`, `Error`, dan `Info`) kini tertata rapi, simetris, dan pas dalam 1 baris penuh tanpa terpotong, tanpa overflow horizontal, dan tetap mempertahankan micro-badge count serta titik indikator warna.

10. **Audit Kualitas Komprehensif, Pembersihan Kode & Evaluasi Akhir (v5.12.0)**:
   - **Pembersihan Duplicate Listener & Anti-Memory-Leak**: Menghilangkan pendaftaran ganda `chrome.storage.onChanged.addListener` di dalam fungsi `loadData()` pada `popup.js`, menyatukannya ke dalam satu *unified top-level listener* sehingga tidak terjadi tumpukan listener dan re-render ganda saat tombol kerja manual atau sinkronisasi berulang dipicu.
   - **Eliminasi Karakter Emotikon Tersisa**: Mengonversi sisa karakter emotikon literal `⚡` pada regex dan komentar di `src/energy.js` menjadi urutan kode escape `\u26A1`, memastikan 100% kepatuhan aturan 'Zero Unicode Emoji' di seluruh basis kode ekstensi.
   - **Verifikasi Sintaks & Lintas Modul**:
     - Validasi sintaks seluruh 23 file JavaScript (`node --check`) 100% lulus tanpa error atau warning.
     - Verifikasi alur integrasi BroadcastChannel, Atomic Mutex, Network Interceptor (Main World), Background Worker Service Worker, Floating Panel In-Game, Settings Modal (620px), dan Extension Popup Toolbar.
   - **Hasil Build & Rilis**: Bundle Vite terkompilasi optimal (307.56 kB) dan disinkronkan secara mulus ke folder `extension-parlementum-release`.

11. **Peningkatan Menuju Kesempurnaan 10/10 (v5.12.0 - Milestone Final)**:
   - **Humanisasi Perilaku Organik (Stealth & Anti-Detection)**:
     - *Organic Micro-Breaks*: Menambahkan simulasi istirahat alami berkala (default tiap 4 jam selama 8-15 menit dengan variasi acak Gaussian) di mana bot menunda aktivitas otomatis seperti manusia sungguhan yang sedang beranjak dari layar komputer.
     - *Dynamic Energy Threshold Jitter*: Menerapkan variasi acak pada ambang batas energi (±3 EN) menggunakan distribusi Gaussian terpusat agar bot tidak selalu memicu kerja pada angka energi yang identik dan mudah diprediksi.
     - Pengaturan interaktif lengkap disediakan pada tab `Stealth & Humanizer` di modal Pengaturan in-game.
   - **Efisiensi Daya & Sumber Daya Sistem (Zero-Cost Inactive Tabs)**:
     - *Background Animation Suspension (`.aw-tab-hidden`)*: Menambahkan pendeteksi visibilitas tab (`visibilitychange`). Ketika tab permainan tidak sedang aktif dilihat (berada di latar belakang atau jendela terminimalkan), seluruh animasi gradien shimmer dan efek pulse otomatis dihentikan sementara, menurunkan beban GPU/CPU compositing hingga mendekati 0%.
     - *Popup Polling Optimization*: Interval polling popup ekstensi disesuaikan dari 2 detik menjadi 4 detik, dan polling dihentikan sepenuhnya ketika popup diminimalkan atau disembunyikan.
   - **Ketahanan Jaringan Cerdas (Adaptive Exponential Backoff)**:
     - Mengganti jeda kaku langsung saat terjadi gangguan server (HTTP 502/503/504 Bad Gateway, Cloudflare challenge, atau koneksi terputus) dengan mekanisme *Adaptive Exponential Backoff* cerdas (45 detik dengan progressive multiplier hingga 8 menit) ditambah random human jitter. Bot secara otomatis mencoba kembali secara anggun tanpa memerlukan intervensi manual pengguna.
   - **Rangkaian Pengujian Otomatis Mandiri (Automated Unit Testing Suite)**:
     - Membangun suite pengujian unit berbasis native test runner Node.js (`tests/*.test.js`) yang dapat dijalankan secara instan lewat `npm test`.
     - Menguji 16 skenario krusial: kalkulasi biaya emas deret aritmatika, rumus eksponensial durasi latihan resmi Parlementum, proyeksi regenerasi energi, batasan konfigurasi aman, Gaussian randomness, koordinat klik organik, serta manajemen micro-break dan exponential backoff. 16/16 pengujian lulus dengan 0 kegagalan.
   - *Catatan Khusus*: Fitur analitik grafik riwayat tren XP 7 hari dan ekspor CSV ditunda sesuai instruksi pengguna untuk difokuskan pada fondasi performa, stealth, dan stabilitas operasional.

12. **Perbaikan Sinkronisasi Bar Latihan & Deteksi Energi Instan (v5.12.1)**:
   - **Sinkronisasi 100% Bar Latihan Stats dengan In-Game**:
     - *Akar Masalah*: Pada DevTools terlihat bahwa game memiliki elemen progress bar aktif langsung di bawah timer dengan atribut `style="width: 5%;"`. Sebelumnya, `readActiveTrainingFromDom()` pada Strategy 1 hanya mencatat timer dan mengembalikan `domProgressPct: null`, sehingga kalkulasi jatuh ke rumus teoritis durasi latihan yang menghasilkan persentase ~60% (tidak sinkron dengan tampilan game yang baru berjalan 5%).
     - *Solusi Presisi*: Strategy 1 dan Strategy 2 kini membaca persentase lebar rendered bar game secara langsung (`style="width: X%"`) dari kartu aktif `dash-training`. Nilai `domProgressPct` ini diprioritaskan 100% oleh `getTrainingProgressPercentage()` baik pada in-game panel maupun popup, sehingga progress bar ekstensi selalu identik persis dengan progres asli game.
     - Selain itu, durasi total latihan (`totalSeconds`) diinferensikan secara akurat dari rasio sisa waktu terhadap persentase DOM yang terisi.
   - **Deteksi Energi Instan Tanpa Glitch Loading / Zero-Dip**:
     - *Akar Masalah*: Saat tab game dimuat ulang (refresh), React SPA mengalami hidrasi awal di mana skeleton atau state awal DOM sempat bernilai `0/215` selama beberapa milidetik sebelum API profil merespons. Pemindai DOM sebelumnya membaca angka 0 tersebut dan menimpa energi yang telah diproyeksikan, menyebabkan bar energi sempat merosot ke 0 dan menampilkan tulisan loading/sinkronisasi.
     - *Solusi Multi-Lapisan*:
       1. Menambahkan pemindai instan berlapis di `getCurrentEnergy()`: mendeteksi `data-testid` energi, kartu bertanda khusus `"Penuh dalam"`, heading `"ENERGI"`, serta bilah status bawah `⚡ (\d+)/(\d+)`.
       2. Polling percepatan awal di `waitForEnergyElement()` (50ms interval pada 1,5 detik pertama).
       3. Perlindungan Zero-Dip Hidrasi: Nilai energi positif yang telah diproyeksikan secara matematis tidak akan ditimpa menjadi 0 oleh pembacaan skeleton sementara selama proses bootstrapping.

13. **Pembersihan Antarmuka Kuota Roti Harian & Penghapusan Tombol Redundan (v5.12.2)**:
    - **Latar Belakang & Analisis UX**:
      - Sistem pelacakan kuota roti dan konsumsi makanan telah didukung oleh sinkronisasi otomatis 100% dari respons jaringan (PREMIUM_STATUS, token interceptor) dan pembacaan DOM game secara real-time (readBreadQuotaFromDom).
      - Keberadaan tombol manual [-], [+], [Max] serta pilihan tombol segmented [ 10 Slot ] / [ 20 Slot ] di modal pengaturan menjadi redundan, memakan ruang horizontal yang berharga, dan menimbulkan kesan padat/ramai pada antarmuka.
    - **Penyederhanaan & Tata Letak Lebih Lega (Spacious Aesthetic)**:
      - **Floating Panel In-Game (src/ui/panel.js)**:
        - Menghapus tombol [-], [+], [Max] (#aw-food-dec, #aw-food-inc, #aw-food-max) dan seluruh event listener-nya.
        - Mendesain ulang baris Kuota Roti Harian menjadi 2 sisi yang lapang dan simetris:
          - Sisi Kiri: Ikon sendok & garpu amber + judul "Kuota Roti Harian" dengan subtitle halus "Sinkron Otomatis".
          - Sisi Kanan: Teks kuota presisi (misal 17/20) bersanding dengan pil status modern dinamis ("3 sisa", "Sisa 3!", atau "Kuota habis") dengan warna dan border semi-transparan yang selaras dengan tema Cyber Abyss.
      - **Popup Ekstensi (popup/popup.html & popup/popup.js)**:
        - Menghapus tombol #popup-food-dec, #popup-food-inc, #popup-food-max dan fungsi setPopupFood().
        - Menyelaraskan kartu kuota roti popup dengan desain panel in-game: lega, bersih, dan berorientasi otomatis.
      - **Modal Pengaturan (src/ui/settings.js)**:
        - Menghilangkan tombol toggle manual [ 10 Slot ] (#bread-cap-10) dan [ 20 Slot ] (#bread-cap-20).
        - Menggantikannya dengan badge status terbaca otomatis (#aw-bread-cap-badge, misal 20 Slot atau 10 Slot) dengan aksen warna HSL menyesuaikan status akun (emas amber untuk Premium 20 Slot, biru cyan untuk Standar 10 Slot).
    - **Hasil Akhir**: Antarmuka menjadi jauh lebih lega, bersih, dan modern tanpa mengurangi akurasi fitur atau kehandalan sinkronisasi otomatis kuota roti game.
