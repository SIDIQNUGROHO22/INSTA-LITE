# INSTA-LITE

Aplikasi web media sosial ringan (Instagram Lite) berbasis **HTML, CSS, Vanilla JavaScript (ES Modules)** dan **Supabase** (Authentication, PostgreSQL Database, Realtime, & Storage — **100% gratis tanpa kartu kredit**).

🌐 **Website Live (GitHub Pages):** https://sidiqnugroho22.github.io/INSTA-LITE/  
📦 **Repository:** https://github.com/SIDIQNUGROHO22/INSTA-LITE

---

## Fitur Utama

- **Autentikasi & Profil Pengguna**
  - Daftar dan masuk menggunakan email & kata sandi (Supabase Auth).
  - Edit `username` (tersinkron otomatis ke postingan & komentar melalui trigger PostgreSQL), edit bio, unggah/hapus foto profil, serta hapus akun permanen dengan verifikasi kata sandi.
- **Upload Foto & Video (Gratis via Supabase Storage + Backup Rekomendasi)**
  - **Utama — Supabase Storage (`1 GB` gratis, tanpa kartu kredit):** Mendukung upload foto (`JPG/JPEG/PNG/WebP` maks 10 MB — otomatis dikompresi ringan agar hemat kuota Storage) dan video (`MP4/MOV/WebM` maks 50 MB).
  - **Backup Media Opsional (Cloudinary):** Jika kuota 1 GB Supabase Storage penuh, tersedia slot cadangan `CLOUDINARY_BACKUP_CONFIG` di `supabase.js` sebagai fallback otomatis.
- **Feed & Interaksi Sosial Real-time**
  - Feed publik real-time (`postgres_changes` via Supabase Realtime) dengan pencarian username/caption serta pengurutan (*Terbaru*, *Terlama*, *Username A–Z*, *Username Z–A*, *Paling Disukai*, *Paling Banyak Komentar*).
  - **Filter Ruang Lingkup Feed:** Beralih antara **Semua**, **Mengikuti**, dan **Mutualan**.
  - **Saling Like & Komentar:** Like/Unlike real-time, komentar real-time, serta hapus komentar milik sendiri.
  - **Follow & Mutualan:** Tombol `+ Ikuti`, `Ikuti Balik`, `Mengikuti`, dan `Mutual` pada postingan & profil pengguna; statistik **Pengikut / Mengikuti / Mutual**; serta modal **Koneksi & Mutualan** (tab *Mutual*, *Pengikut*, *Mengikuti*, dan *Temukan Orang*).
  - **Mention `@username` & Preview Profil:** Klik `@username`, avatar, atau nama penulis untuk melihat bio, statistik, tombol ikuti, serta tombol **Lihat Postingan di Feed**.
  - **Notifikasi Real-time:** Lonceng notifikasi untuk aktivitas `like`, `comment`, `mention`, dan `follow` (beserta tombol *Tandai Semua Dibaca*).
  - **Simpan (`Bookmark`) & Sembunyikan (`Hide`)** postingan di tab profil masing-masing.

---

## Akun Uji Coba (Demo)

Akun berikut tersedia untuk mengetes fitur masuk, posting, **+ Ikuti**, **Mutualan**, komentar, dan notifikasi real-time tanpa perlu daftar ulang:

| Username | Email | Kata Sandi |
| :--- | :--- | :--- |
| `prabowo` | `sidiqnugroho99o+prabowo@gmail.com` | `InstaLite123!` |
| `tedi` | `sidiqnugroho99o+tedi@gmail.com` | `InstaLite123!` |
| `mas_amba` | `sidiqnugroho99o+masamba@gmail.com` | `InstaLite123!` |
| `mas_gatot` | `sidiqnugroho99o+masgatot@gmail.com` | `InstaLite123!` |

> **Catatan:** Data pengguna baru dan aktivitas login tercatat di database **Supabase** (`Authentication → Users` dan tabel `public.profiles`), bukan ditulis otomatis ke `README.md` karena GitHub Pages bersifat statis dan demi menjaga keamanan repositori serta privasi pengguna.

---

## Struktur File & Backup

- `index.html` — Antarmuka aplikasi, dashboard profil, form posting, feed, dan modal dialog.
- `style.css` — Styling modern dan responsif (*Liquid Glass*).
- `app.js` — Logika aplikasi (Auth, Storage, Realtime feed, Like, Komentar, Mention, Notifikasi, Bookmark, Hide, Follow & Mutualan).
- `supabase.js` — Konfigurasi client Supabase (`SUPABASE_CONFIG`) dan cadangan media opsional (`CLOUDINARY_BACKUP_CONFIG`).
- `supabase_schema.sql` — Script SQL lengkap untuk membuat tabel, Row Level Security (RLS), trigger profil, RPC hapus akun/cek username, bucket Storage `instalite-media`, dan Realtime publication.
- `backup/firebase_cloudinary_backup/` — **Backup penuh versi Firebase + Cloudinary + Mutualan sebelumnya** (berisi `app.js`, `firebase.js`, `firestore.rules`, `index.html`, `style.css`, `README.md`) bila sewaktu-waktu ingin kembali ke Firebase.

---

## Cara Setup Supabase (Gratis, ~2 Menit)

1. Daftar / buat project gratis di **https://supabase.com** (tanpa kartu kredit).
2. Buka menu **SQL Editor** di dashboard Supabase Anda, salin seluruh isi file **`supabase_schema.sql`**, lalu klik **Run**.
   *(Script ini otomatis membuat 8 tabel, mengaktifkan RLS, membuat trigger profil otomatis, fungsi `is_username_available` & `delete_user_self`, bucket public `instalite-media`, serta Realtime).*
3. Buka **Project Settings → API**, salin **Project URL** dan **anon / publishable key**, lalu isi ke **`supabase.js`**:
   ```js
   export const SUPABASE_CONFIG = {
     url: "https://project-anda.supabase.co",
     anonKey: "anon_key_anda",
     storageBucket: "instalite-media"
   };
   ```
4. *(Opsional untuk testing langsung tanpa verifikasi email)*: Di dashboard Supabase buka **Authentication → Providers → Email** lalu matikan **Confirm email** agar akun baru langsung bisa login.
5. Commit dan push perubahan `supabase.js` ke branch `main`.

> **Catatan Paket Gratis Supabase:** Project gratis Supabase akan otomatis *pause* jika tidak ada aktivitas selama ±7 hari; cukup klik **Resume** di dashboard Supabase untuk mengaktifkannya kembali.

---

## Backup Media Tambahan yang Disarankan (Opsional)

Untuk cadangan media jika kapasitas 1 GB Supabase Storage mulai penuh, Anda dapat mengisi `CLOUDINARY_BACKUP_CONFIG` di `supabase.js` menggunakan akun gratis **Cloudinary** (25 GB/bulan, Preset *Unsigned*). Sistem akan otomatis memakai Cloudinary bila upload ke Supabase Storage gagal.

---

## Menjalankan di Komputer Lokal

Karena `index.html` memakai ES Modules (`<script type="module" src="app.js">`), jangan buka file langsung lewat `file://`. Jalankan melalui server lokal:

- **Menggunakan VS Code:** pasang ekstensi **Live Server**, buka `index.html`, lalu klik **Go Live**.
- **Atau melalui terminal (Node.js):**
  ```powershell
  npx.cmd serve .
  ```
  *(Gunakan `npx.cmd` pada Windows PowerShell jika eksekusi `npx.ps1` dibatasi policy).* Lalu buka `http://localhost:3000` di browser.
