import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ============================================================================
// KONFIGURASI SUPABASE (GRATIS TANPA KARTU KREDIT)
// 1. Buat project gratis di https://supabase.com
// 2. Jalankan file supabase_schema.sql di menu SQL Editor -> Run
// 3. Buka Project Settings -> API, lalu tempel Project URL dan anon/publishable key di bawah:
// ============================================================================
export const SUPABASE_CONFIG = {
  url: "",            // Contoh: "https://abcdefghijklmno.supabase.co"
  anonKey: "",        // Contoh: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  storageBucket: "instalite-media"
};

// ============================================================================
// BACKUP MEDIA OPSIONAL: CLOUDINARY (GRATIS 25GB/BULAN)
// Disarankan sebagai cadangan jika kuota Supabase Storage 1 GB Anda mulai penuh.
// Kosongkan jika hanya memakai Supabase Storage bawaan.
// ============================================================================
export const CLOUDINARY_BACKUP_CONFIG = {
  cloudName: "",      // Contoh: "dxyz123"
  uploadPreset: ""    // Preset bertipe Unsigned
};

export function hasSupabaseConfig() {
  const url = (SUPABASE_CONFIG?.url || "").trim().replace(/\/+$/, "");
  const key = (SUPABASE_CONFIG?.anonKey || "").trim();
  return /^https:\/\/[a-z0-9.-]+$/i.test(url.replace(/^https:\/\//i, "https://")) && url.startsWith("https://") && key.length > 20;
}

export function hasCloudinaryBackupConfig() {
  return Boolean(
    CLOUDINARY_BACKUP_CONFIG?.cloudName &&
    CLOUDINARY_BACKUP_CONFIG.cloudName.trim() &&
    CLOUDINARY_BACKUP_CONFIG?.uploadPreset &&
    CLOUDINARY_BACKUP_CONFIG.uploadPreset.trim()
  );
}

export const supabase = hasSupabaseConfig()
  ? createClient(SUPABASE_CONFIG.url.trim().replace(/\/+$/, ""), SUPABASE_CONFIG.anonKey.trim())
  : null;
