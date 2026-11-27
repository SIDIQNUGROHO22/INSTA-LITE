# INSTA-LITE

Aplikasi web media sosial ringan (Instagram Lite) berbasis **HTML, CSS, Vanilla JavaScript (ES Modules)**, **Firebase Authentication & Cloud Firestore**, serta dukungan opsional **Cloudinary** untuk media resolusi penuh dan video.

🌐 **Website Live (GitHub Pages):** https://sidiqnugroho22.github.io/INSTA-LITE/  
📦 **Repository:** https://github.com/SIDIQNUGROHO22/INSTA-LITE

---

## Fitur Utama

- **Autentikasi & Profil Pengguna**
  - Daftar dan masuk menggunakan email & kata sandi (Firebase Authentication).
  - Edit `username` (tersinkron otomatis ke seluruh postingan milik pengguna), edit bio, unggah/hapus foto profil, serta hapus akun dengan verifikasi ulang kata sandi.
- **Upload Foto & Video (Mode Hybrid)**
  - **Otomatis Gratis via Firestore (tanpa kartu kredit / tanpa setup tambahan):** Jika `CLOUDINARY_CONFIG` di `firebase.js` kosong, foto postingan (`JPG/JPEG/PNG/WebP`, maks 10 MB) dan foto profil (maks 5 MB) otomatis dikompresi di browser menjadi JPEG terkompresi dan disimpan langsung ke Firestore.
  - **Cloudinary (Utama & Disarankan untuk Video / Kualitas Asli):** Mendukung upload foto hingga 10 MB dan video (`MP4/MOV/WebM`) hingga 50 MB secara gratis menggunakan Upload Preset bertipe **Unsigned**.
- **Feed & Interaksi Sosial Real-time**
  - Feed publik real-time (`onSnapshot`) dengan pencarian berdasarkan username/caption serta pengurutan (*Terbaru*, *Terlama*, *Username A–Z*, *Username Z–A*, *Paling Disukai*, *Paling Banyak Komentar*).
  - **Filter Ruang Lingkup Feed:** Beralih antara **Semua**, **Mengikuti**, dan **Mutualan**.
  - **Saling Like & Komentar:** Like/Unlike postingan secara real-time, komentar real-time, serta hapus komentar milik sendiri.
  - **Follow & Mutualan:** Tombol `+ Ikuti`, `Ikuti Balik`, `Mengikuti`, dan `Mutual` pada postingan & modal profil; statistik **Pengikut / Mengikuti / Mutual**; serta modal **Koneksi & Mutualan** (tab *Mutual*, *Pengikut*, *Mengikuti*, dan *Temukan Orang*).
  - **Mention `@username` & Preview Profil:** Klik `@username`, avatar, atau nama penulis untuk melihat bio, statistik, tombol ikuti, serta tombol **Lihat Postingan di Feed**.
  - **Notifikasi Real-time:** Lonceng notifikasi untuk aktivitas `like`, `comment`, `mention`, dan `follow` (beserta tombol *Tandai Semua Dibaca*).
  - **Simpan (`Bookmark`) & Sembunyikan (`Hide`)** postingan di tab profil masing-masing.

---

## Struktur File Utama

- `index.html` — Antarmuka aplikasi, dashboard profil, form posting, feed, dan modal dialog.
- `style.css` — Styling modern dan responsif (*Liquid Glass*).
- `app.js` — Logika autentikasi, kompresi/upload media hybrid, feed real-time, like, komentar, mention, notifikasi, bookmark, hide, dan follow/mutualan.
- `firebase.js` — Konfigurasi Firebase (`instalite-7e4a2`) dan `CLOUDINARY_CONFIG`.
- `firestore.rules` — Aturan keamanan Cloud Firestore untuk seluruh koleksi (`users`, `following`, `followers`, `bookmarks`, `hiddenPosts`, `posts`, `likes`, `comments`, `notifications`).

---

## Setup Wajib di Firebase Console

Agar fitur upload foto, foto profil, like, komentar, simpan, sembunyikan, dan mutualan tidak terkena error `[permission-denied]`:

1. **Publish `firestore.rules`:**
   - Buka **Firebase Console → Firestore Database → Rules** untuk project `instalite-7e4a2`.
   - Salin seluruh isi file `firestore.rules` di repository ini, tempel menggantikan isi lama di editor Rules, lalu klik **Publish**.
2. **Tambahkan Authorized Domain (Disarankan):**
   - Buka **Firebase Console → Authentication → Settings → Authorized domains**.
   - Pastikan domain `sidiqnugroho22.github.io` sudah terdaftar.

---

## Mengaktifkan Upload Video & Foto Kualitas Asli (Cloudinary Gratis)

Secara default, **foto** sudah bisa langsung diupload tanpa konfigurasi Cloudinary. Jika ingin mengaktifkan upload **video (`MP4/MOV/WebM` maks 50 MB)** dan foto resolusi penuh:

1. Daftar akun gratis di https://cloudinary.com (tanpa kartu kredit).
2. Buka **Settings → Upload → Upload presets → Add upload preset**.
3. Ubah **Signing Mode** menjadi **`Unsigned`**, catat nama preset-nya, lalu klik **Save**.
4. Buka `firebase.js` dan isi `CLOUDINARY_CONFIG` *(jangan pernah memasukkan `API Secret` di kode frontend)*:
   ```js
   export const CLOUDINARY_CONFIG = {
     cloudName: "nama_cloud_anda",
     uploadPreset: "nama_preset_unsigned_anda"
   };
   ```
5. Commit dan push perubahan `firebase.js` ke branch `main`.

---

## Menjalankan di Komputer Lokal

Karena `index.html` menggunakan ES Modules (`<script type="module" src="app.js">`), membuka file langsung lewat `file://` akan diblokir browser. Jalankan melalui server lokal:

- **Menggunakan VS Code:** pasang ekstensi **Live Server**, buka `index.html`, lalu klik **Go Live**.
- **Atau melalui terminal (Node.js):**
  ```powershell
  npx.cmd serve .
  ```
  *(Gunakan `npx.cmd` pada Windows PowerShell jika eksekusi `npx.ps1` dibatasi policy).* Lalu buka `http://localhost:3000` di browser.
