import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPyMr9XosLOdStnSqY3y0_E_vsrImDmeo",
  authDomain: "instalite-7e4a2.firebaseapp.com",
  projectId: "instalite-7e4a2",
  storageBucket: "instalite-7e4a2.firebasestorage.app",
  messagingSenderId: "39532118193",
  appId: "1:39532118193:web:38b2d1ef452feb637da290",
  measurementId: "G-LRX1DBY8C7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Konfigurasi Cloudinary untuk upload foto dan video gratis (Paket Spark / tanpa kartu kredit)
// 1. Buat akun gratis di https://cloudinary.com
// 2. Buka Settings -> Upload -> Add upload preset -> Signing Mode: Unsigned -> Save
// 3. Masukkan Cloud Name dan Upload Preset di bawah ini:
export const CLOUDINARY_CONFIG = {
  cloudName: "",    // Contoh: "dxyz123" (kosongkan jika belum ada akun)
  uploadPreset: ""  // Contoh: "instalite_preset" (tipe Unsigned)
};
