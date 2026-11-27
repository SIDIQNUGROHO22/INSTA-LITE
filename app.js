import {
  supabase,
  SUPABASE_CONFIG,
  CLOUDINARY_BACKUP_CONFIG,
  hasSupabaseConfig,
  hasCloudinaryBackupConfig
} from "./supabase.js";

// Helper pemilih elemen DOM
const $ = id => document.getElementById(id);

// State Aplikasi
let currentUser = null;
let currentProfile = null;
let activeSessionUserId = null;
let isRegister = false;
let isRegistering = false;
let isSubmittingPost = false;
let isUpdatingProfile = false;
let isDeletingAccount = false;
let realtimeChannel = null;
let postToDeleteId = null;
let selectedMediaObjectUrl = null;

// State Foto Profil & Feed Controls
let pendingProfilePhotoFile = null;
let removeProfilePhotoPending = false;
let selectedProfilePhotoObjectUrl = null;
let rawFeedPosts = [];
const userProfilesCache = new Map();
let feedSearchKeyword = "";
let feedSortCriteria = "newest";
let feedScopeFilter = "all"; // "all" | "following" | "mutual"

// State Interaksi Sosial, Notifikasi, Bookmark, Hide & Mutualan
let activeProfileTab = "my"; // "my" | "saved" | "hidden"
let userBookmarksSet = new Set();
let userHiddenPostsSet = new Set();
let userFollowingSet = new Set();
let userFollowersSet = new Set();
let rawNotifications = [];
let activeCommentPost = null;
const postLikesCache = new Map(); // postId => { count: number, userLiked: boolean }
const postCommentsCache = new Map(); // postId => { count: number }
const likingPostsSet = new Set();
const bookmarkingPostsSet = new Set();
const hidingPostsSet = new Set();
const followingInFlightSet = new Set();
let activeConnectionsTab = "mutual";
let previewedProfileUid = "";
let previewedProfileUsername = "";

// Batasan format foto profil
const ALLOWED_PROFILE_PHOTO = {
  extensions: [".jpg", ".jpeg", ".png", ".webp"],
  mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
  maxSize: 5 * 1024 * 1024,
  label: "JPG/JPEG/PNG/WebP (maksimal 5 MB)"
};

// Batasan format dan ukuran file media postingan
const ALLOWED_MEDIA = {
  images: {
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    mimeTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
    maxSize: 10 * 1024 * 1024,
    label: "JPG/JPEG/PNG/WebP (maksimal 10 MB)"
  },
  videos: {
    extensions: [".mp4", ".mov", ".webm"],
    mimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    maxSize: 50 * 1024 * 1024,
    label: "MP4/MOV/WebM (maksimal 50 MB)"
  }
};

/* ==========================================================================
   1. KOMPONEN TOAST NOTIFICATION MODERN (TOP CENTER)
   ========================================================================== */
function showToast(message, type = "info", customTitle = "") {
  const container = $("toastContainer");
  if (!container) return;

  const defaultTitles = {
    success: "Berhasil",
    error: "Terjadi Kesalahan",
    warning: "Perhatian",
    info: "Informasi"
  };

  const icons = {
    success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const iconEl = document.createElement("div");
  iconEl.className = "toast-icon";
  iconEl.innerHTML = icons[type] || icons.info;

  const bodyEl = document.createElement("div");
  bodyEl.className = "toast-body";

  const titleEl = document.createElement("div");
  titleEl.className = "toast-title";
  titleEl.textContent = customTitle || defaultTitles[type] || "Informasi";

  const msgEl = document.createElement("div");
  msgEl.className = "toast-msg";
  msgEl.textContent = message;

  bodyEl.append(titleEl, msgEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.type = "button";
  closeBtn.innerHTML = "&times;";
  closeBtn.setAttribute("aria-label", "Tutup Notifikasi");

  toast.append(iconEl, bodyEl, closeBtn);
  container.append(toast);

  const srStatus = $("status");
  if (srStatus) srStatus.textContent = message;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add("is-removing");
    setTimeout(() => toast.remove(), 220);
  };

  closeBtn.addEventListener("click", dismiss);
  setTimeout(dismiss, 4500);
}

/* ==========================================================================
   2. KONTROL MODAL DIALOG MODERN (SMOOTH & RELIABLE DISMISS)
   ========================================================================== */
const MODAL_ANIMATION_DURATION = 220;

function openModal(modalId) {
  const modal = $(modalId);
  if (!modal) return;

  if (modal._closeTimer) {
    clearTimeout(modal._closeTimer);
    modal._closeTimer = null;
  }

  modal.classList.remove("is-closing");
  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  void modal.offsetHeight;

  let rafHandled = false;
  const activate = () => {
    if (rafHandled) return;
    rafHandled = true;
    modal.classList.add("is-open");
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(activate);
  }
  setTimeout(activate, 40);
}

function closeModal(modalOrId) {
  const modal = typeof modalOrId === "string" ? $(modalOrId) : modalOrId;
  if (!modal || modal.hidden || modal.classList.contains("is-closing")) return;

  if (modal._closeTimer) {
    clearTimeout(modal._closeTimer);
    modal._closeTimer = null;
  }

  if (modal.id === "deletePostModal") {
    postToDeleteId = null;
  }
  if (modal.id === "deleteAccountModal") {
    const pwdInput = $("deleteAccountPassword");
    if (pwdInput) pwdInput.value = "";
  }
  if (modal.id === "commentModal") {
    activeCommentPost = null;
  }

  modal.classList.remove("is-open");
  modal.classList.add("is-closing");
  modal.setAttribute("aria-hidden", "true");

  modal._closeTimer = setTimeout(() => {
    modal.hidden = true;
    modal.setAttribute("hidden", "");
    modal.classList.remove("is-closing");
    modal._closeTimer = null;

    const stillOpen = document.querySelectorAll(".modal-backdrop.is-open:not([hidden])");
    if (stillOpen.length === 0) {
      document.body.style.overflow = "";
    }
  }, MODAL_ANIMATION_DURATION);
}

let modalMouseDownTarget = null;
document.addEventListener("mousedown", event => {
  modalMouseDownTarget = event.target;
});

document.addEventListener("click", event => {
  const closeTrigger = event.target.closest("[data-close-modal], .modal-close-btn, .modal-close-btn-bottom");
  if (closeTrigger) {
    event.preventDefault();
    const modalId = closeTrigger.getAttribute("data-close-modal");
    if (modalId) {
      closeModal(modalId);
    } else {
      const parentModal = closeTrigger.closest(".modal-backdrop");
      if (parentModal) closeModal(parentModal);
    }
    return;
  }

  if (event.target.classList.contains("modal-backdrop") && modalMouseDownTarget === event.target) {
    closeModal(event.target);
  }
});

window.addEventListener("keydown", event => {
  if (event.key === "Escape" || event.key === "Esc") {
    const openModals = Array.from(document.querySelectorAll(".modal-backdrop.is-open:not([hidden])"));
    if (openModals.length > 0) {
      closeModal(openModals[openModals.length - 1]);
    }
  }
});

/* ==========================================================================
   3. HELPER TEKS, TANGGAL, MEDIA & VALIDASI
   ========================================================================== */
function safeText(value) {
  return String(value ?? "");
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getPostTimestamp(post) {
  if (!post?.created_at) return 0;
  const parsed = Date.parse(post.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(value) {
  if (!value) return "Baru saja";
  const ms = typeof value === "string" ? Date.parse(value) : (value instanceof Date ? value.getTime() : 0);
  if (!ms || Number.isNaN(ms)) return "Baru saja";

  const date = new Date(ms);
  const diffSec = Math.floor((Date.now() - ms) / 1000);

  if (diffSec < 60) return "Baru saja";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m lalu`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}j lalu`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}h lalu`;

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getAuthErrorMessage(err) {
  const msg = safeText(err?.message || err);
  if (/invalid login credentials/i.test(msg)) return "Email atau kata sandi salah.";
  if (/email not confirmed/i.test(msg)) return "Email belum dikonfirmasi. Cek kotak masuk Anda (atau matikan Confirm Email di Supabase Auth).";
  if (/already registered|already exists/i.test(msg)) return "Email ini sudah terdaftar. Silakan masuk.";
  if (/password should be at least/i.test(msg)) return "Kata sandi minimal 6 karakter.";
  if (/invalid email|unable to validate email/i.test(msg)) return "Format alamat email tidak valid.";
  if (/rate limit|too many requests/i.test(msg)) return "Terlalu banyak percobaan. Coba lagi sebentar.";
  if (/network|failed to fetch/i.test(msg)) return "Koneksi jaringan bermasalah. Periksa internet Anda.";
  return msg || "Autentikasi gagal.";
}

function normalizeMimeType(mime) {
  return String(mime || "").toLowerCase().split(";")[0].trim();
}

function isSafeMediaUrl(url) {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) return true;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed);
}

function isVideoFile(file) {
  if (!file) return false;
  const mime = normalizeMimeType(file.type);
  const name = (file.name || "").toLowerCase();
  return mime.startsWith("video/") || name.endsWith(".mp4") || name.endsWith(".mov") || name.endsWith(".webm");
}

function validateMediaFile(file) {
  const fileName = file.name || "";
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) {
    return { valid: false, message: "File tidak memiliki ekstensi. Gunakan JPG, PNG, WebP, MP4, MOV, atau WebM." };
  }

  const ext = fileName.slice(lastDot).toLowerCase();
  const mime = normalizeMimeType(file.type);

  const isImageExt = ALLOWED_MEDIA.images.extensions.includes(ext);
  const isVideoExt = ALLOWED_MEDIA.videos.extensions.includes(ext);

  if (!isImageExt && !isVideoExt) {
    return { valid: false, message: "Format tidak didukung. Gunakan JPG, PNG, WebP, MP4, MOV, atau WebM." };
  }

  if (isImageExt) {
    if (mime && !ALLOWED_MEDIA.images.mimeTypes.includes(mime)) {
      return { valid: false, message: "Tipe file gambar tidak valid. Gunakan file JPG, PNG, atau WebP." };
    }
    if (file.size > ALLOWED_MEDIA.images.maxSize) {
      return { valid: false, message: "Ukuran file foto melebihi batas maksimal 10 MB." };
    }
    return { valid: true, mediaType: "image" };
  }

  if (isVideoExt) {
    if (mime && !ALLOWED_MEDIA.videos.mimeTypes.includes(mime)) {
      return { valid: false, message: "Tipe file video tidak valid. Gunakan file video MP4, MOV, atau WebM." };
    }
    if (file.size > ALLOWED_MEDIA.videos.maxSize) {
      return { valid: false, message: "Ukuran file video melebihi batas maksimal 50 MB." };
    }
    return { valid: true, mediaType: "video" };
  }

  return { valid: false, message: "File tidak memenuhi syarat." };
}

/* ==========================================================================
   4. UPLOAD MEDIA: SUPABASE STORAGE UTAMA + KOMPRESI FOTO + BACKUP CLOUDINARY
   ========================================================================== */
async function compressImageToBlob(file, { maxDimension = 1440, maxBytes = 650 * 1024 } = {}) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("File gambar rusak atau tidak dapat dibaca browser."));
      image.src = objectUrl;
    });

    const srcWidth = img.naturalWidth || img.width;
    const srcHeight = img.naturalHeight || img.height;
    if (!srcWidth || !srcHeight) {
      throw new Error("Dimensi gambar tidak valid.");
    }

    // Jika ukuran asli sudah ringkas dan dimensinya kecil, gunakan apa adanya
    if (file.size <= maxBytes && Math.max(srcWidth, srcHeight) <= maxDimension) {
      return { blob: file, ext: "jpg", contentType: normalizeMimeType(file.type) || "image/jpeg" };
    }

    const baseRatio = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
    const scaleSteps = [1, 0.8, 0.65];
    const qualitySteps = [0.86, 0.75, 0.62];

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { blob: file, ext: "jpg", contentType: normalizeMimeType(file.type) || "image/jpeg" };
    }

    let lastBlob = null;
    for (const scale of scaleSteps) {
      const targetWidth = Math.max(1, Math.round(srcWidth * baseRatio * scale));
      const targetHeight = Math.max(1, Math.round(srcHeight * baseRatio * scale));
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      for (const quality of qualitySteps) {
        const blob = await new Promise(res => canvas.toBlob(res, "image/jpeg", quality));
        if (blob) {
          lastBlob = blob;
          if (blob.size <= maxBytes) {
            return { blob, ext: "jpg", contentType: "image/jpeg" };
          }
        }
      }
    }

    return {
      blob: lastBlob || file,
      ext: lastBlob ? "jpg" : "bin",
      contentType: lastBlob ? "image/jpeg" : (normalizeMimeType(file.type) || "application/octet-stream")
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadToCloudinaryBackup(file, onProgress) {
  const cloudName = (CLOUDINARY_BACKUP_CONFIG?.cloudName || "").trim();
  const uploadPreset = (CLOUDINARY_BACKUP_CONFIG?.uploadPreset || "").trim();
  if (!cloudName || !uploadPreset) {
    throw new Error("Backup Cloudinary belum dikonfigurasi.");
  }

  const resourceType = isVideoFile(file) ? "video" : "image";
  const url = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve({
            url: data.secure_url,
            path: "",
            mediaType: resourceType
          });
        } else {
          reject(new Error(data?.error?.message || `HTTP ${xhr.status}`));
        }
      } catch {
        reject(new Error("Gagal membaca respon backup Cloudinary."));
      }
    };

    xhr.onerror = () => reject(new Error("Gagal terhubung ke backup Cloudinary."));
    xhr.send(formData);
  });
}

async function uploadMediaAsset(file, { isProfilePhoto = false, onProgress } = {}) {
  if (!supabase || !currentUser) {
    throw new Error("Sesi Supabase belum aktif.");
  }

  const bucket = (SUPABASE_CONFIG?.storageBucket || "instalite-media").trim();
  const isVideo = isVideoFile(file);
  let uploadBody = file;
  let contentType = normalizeMimeType(file.type) || (isVideo ? "video/mp4" : "image/jpeg");
  const rawExt = (file.name || "").split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
  let ext = rawExt.replace(/[^a-z0-9]/g, "") || (isVideo ? "mp4" : "jpg");

  onProgress?.(15);

  if (!isVideo) {
    const compressed = await compressImageToBlob(file, {
      maxDimension: isProfilePhoto ? 512 : 1440,
      maxBytes: isProfilePhoto ? 220 * 1024 : 650 * 1024
    });
    uploadBody = compressed.blob;
    contentType = compressed.contentType;
    if (compressed.ext && compressed.ext !== "bin") ext = compressed.ext;
  }

  onProgress?.(45);

  const folder = isProfilePhoto ? "avatars" : "posts";
  const randomTag = Math.random().toString(36).slice(2, 8);
  const objectPath = `${currentUser.id}/${folder}/${Date.now()}_${randomTag}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, uploadBody, {
      contentType,
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    // Jika Supabase Storage gagal (misal kuota penuh) dan backup Cloudinary terisi, gunakan Cloudinary
    if (hasCloudinaryBackupConfig()) {
      const backupRes = await uploadToCloudinaryBackup(uploadBody instanceof File ? uploadBody : file, onProgress);
      return backupRes;
    }
    throw new Error(
      uploadError.message.includes("Bucket not found")
        ? `Bucket "${bucket}" belum dibuat. Jalankan supabase_schema.sql di SQL Editor Supabase.`
        : uploadError.message
    );
  }

  const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  onProgress?.(100);

  if (!pubData?.publicUrl) {
    throw new Error("Gagal mendapatkan URL publik media dari Supabase Storage.");
  }

  return {
    url: pubData.publicUrl,
    path: objectPath,
    mediaType: isVideo ? "video" : "image"
  };
}

async function deleteStoragePaths(paths) {
  if (!supabase) return;
  const cleanPaths = (paths || []).filter(p => typeof p === "string" && p.trim().length > 0);
  if (cleanPaths.length === 0) return;

  const bucket = (SUPABASE_CONFIG?.storageBucket || "instalite-media").trim();
  const { error } = await supabase.storage.from(bucket).remove(cleanPaths);
  if (error) {
    console.warn("Storage cleanup notice:", error.message);
  }
}

/* ==========================================================================
   5. INISIALISASI SETUP BANNER & SISTEM AUTENTIKASI
   ========================================================================== */
function checkSupabaseReady() {
  const ready = hasSupabaseConfig();
  const banner = $("supabaseConfigBanner");
  if (banner) banner.hidden = ready;
  return ready;
}

$("openSupabaseGuideBannerBtn")?.addEventListener("click", () => {
  openModal("supabaseGuideModal");
});

$("mediaStorageHelpBtn")?.addEventListener("click", () => {
  openModal("supabaseGuideModal");
});

$("dismissSupabaseGuideBtn")?.addEventListener("click", () => {
  closeModal("supabaseGuideModal");
});

checkSupabaseReady();

function setAuthMode(registerMode) {
  isRegister = registerMode;
  const tabLogin = $("tabLogin");
  const tabRegister = $("tabRegister");
  const regGroup = $("registerUsernameGroup");
  const authTitle = $("authTitle");
  const authSubtitle = $("authSubtitle");
  const submitBtnText = $("authSubmit")?.querySelector(".btn-text");
  const toggleBtn = $("toggleAuth");
  const regInput = $("regUsername");

  if (tabLogin) {
    tabLogin.classList.toggle("active", !isRegister);
    tabLogin.setAttribute("aria-selected", !isRegister ? "true" : "false");
  }
  if (tabRegister) {
    tabRegister.classList.toggle("active", isRegister);
    tabRegister.setAttribute("aria-selected", isRegister ? "true" : "false");
  }

  if (regGroup) regGroup.hidden = !isRegister;
  if (regInput) regInput.required = isRegister;

  if (authTitle) authTitle.textContent = isRegister ? "Buat Akun Baru" : "Selamat datang";
  if (authSubtitle) authSubtitle.textContent = isRegister
    ? "Lengkapi data diri Anda untuk mulai berbagi momen."
    : "Masuk ke akun InstaLite Anda untuk terhubung.";

  if (submitBtnText) submitBtnText.textContent = isRegister ? "Daftar Sekarang" : "Masuk";
  if (toggleBtn) {
    toggleBtn.innerHTML = isRegister
      ? `<span class="auth-prompt-text">Sudah punya akun?</span> <strong class="auth-action-text">Masuk</strong>`
      : `<span class="auth-prompt-text">Belum punya akun?</span> <strong class="auth-action-text">Daftar sekarang</strong>`;
  }
}

$("tabLogin")?.addEventListener("click", () => setAuthMode(false));
$("tabRegister")?.addEventListener("click", () => setAuthMode(true));
$("toggleAuth")?.addEventListener("click", () => setAuthMode(!isRegister));

$("togglePasswordVisibility")?.addEventListener("click", () => {
  const pwd = $("password");
  const btn = $("togglePasswordVisibility");
  if (!pwd || !btn) return;
  if (pwd.type === "password") {
    pwd.type = "text";
    btn.textContent = "Sembunyikan";
  } else {
    pwd.type = "password";
    btn.textContent = "Lihat";
  }
});

$("authForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  if (!hasSupabaseConfig() || !supabase) {
    openModal("supabaseGuideModal");
    showToast("Isi SUPABASE_CONFIG di supabase.js terlebih dahulu.", "warning");
    return;
  }

  const email = $("email").value.trim();
  const password = $("password").value;
  const regUsernameInput = $("regUsername");
  const submitBtn = $("authSubmit");
  const spinner = submitBtn?.querySelector(".spinner");

  if (!email || !password) {
    showToast("Email dan kata sandi wajib diisi.", "warning");
    return;
  }

  if (password.length < 6) {
    showToast("Kata sandi minimal harus 6 karakter.", "warning");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (spinner) spinner.hidden = false;

  try {
    if (isRegister) {
      const regUsername = regUsernameInput ? regUsernameInput.value.trim() : "";

      if (!/^[a-zA-Z0-9_.]{3,30}$/.test(regUsername)) {
        showToast("Username harus 3–30 karakter: hanya huruf, angka, titik, atau garis bawah.", "warning");
        return;
      }

      // Cek keunikan username lewat RPC
      const { data: available, error: rpcError } = await supabase.rpc("is_username_available", {
        p_username: regUsername
      });

      if (rpcError) {
        console.warn("Cek username RPC error:", rpcError.message);
      } else if (available === false) {
        showToast(`Username "${regUsername}" sudah digunakan. Silakan pilih username lain.`, "warning");
        return;
      }

      isRegistering = true;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username: regUsername }
        }
      });

      if (error) throw error;

      if (!data.session) {
        isRegistering = false;
        setAuthMode(false);
        showToast("Akun dibuat! Cek email untuk konfirmasi sebelum masuk (atau matikan Confirm Email di Supabase Auth).", "info");
        return;
      }

      isRegistering = false;
      await handleSignedInSession(data.user, regUsername);
      setAuthMode(false);
      showToast("Selamat datang di InstaLite! Akun Anda berhasil dibuat.", "success");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data?.user) {
        await handleSignedInSession(data.user);
      }
      showToast("Berhasil masuk. Selamat datang kembali!", "success");
    }
  } catch (error) {
    console.error("Auth error detail:", error);
    isRegistering = false;
    showToast(getAuthErrorMessage(error), "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
});

/* ==========================================================================
   6. MANAJEMEN SESI AUTH, PROFIL & REALTIME SUBSCRIPTION
   ========================================================================== */
async function ensureProfileForUser(user, preferredUsername = "") {
  const { data: existing, error: selectErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (selectErr) throw selectErr;
  if (existing) return existing;

  const metaUsername = (preferredUsername || user.user_metadata?.username || "").trim();
  const safeUsername = /^[a-zA-Z0-9_.]{3,30}$/.test(metaUsername)
    ? metaUsername
    : `user_${user.id.replace(/-/g, "").slice(0, 8)}`;

  const { data: created, error: insertErr } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      username: safeUsername,
      bio: "",
      photo_url: "",
      photo_path: ""
    })
    .select("*")
    .single();

  if (insertErr) throw insertErr;
  return created;
}

function resetAppToLoggedOut() {
  if (realtimeChannel && supabase) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  activeSessionUserId = null;
  currentUser = null;
  currentProfile = null;
  userProfilesCache.clear();
  rawFeedPosts = [];
  rawNotifications = [];
  userBookmarksSet.clear();
  userHiddenPostsSet.clear();
  userFollowingSet.clear();
  userFollowersSet.clear();
  postLikesCache.clear();
  postCommentsCache.clear();
  updateProfileSocialCounters();
  updateProfileBadges();

  const notifBadge = $("navNotificationBadge");
  if (notifBadge) notifBadge.hidden = true;

  feedSearchKeyword = "";
  feedSortCriteria = "newest";
  feedScopeFilter = "all";
  document.querySelectorAll(".feed-scope-btn").forEach(btn => {
    const isAll = btn.dataset.feedScope === "all";
    btn.classList.toggle("is-active", isAll);
    btn.setAttribute("aria-selected", isAll ? "true" : "false");
  });

  switchProfileTab("my");
  $("navUserMenu").hidden = true;
  $("appSection").hidden = true;
  $("authSection").hidden = false;
  $("profileUsername").textContent = "Pengguna";
  $("profileEmail").textContent = "";
  $("profileBioText").textContent = "";
  $("profileAvatar").textContent = "U";
  $("navAvatar").textContent = "U";
  $("feed").replaceChildren();
}

async function handleSignedInSession(user, preferredUsername = "") {
  if (!user || isRegistering) return;
  if (activeSessionUserId === user.id && currentProfile) return;

  activeSessionUserId = user.id;
  currentUser = user;

  const skeleton = $("feedSkeleton");
  if (skeleton) skeleton.hidden = false;

  try {
    const profile = await ensureProfileForUser(user, preferredUsername);
    currentProfile = profile;
    updateProfileUI(profile);

    $("authSection").hidden = true;
    $("appSection").hidden = false;
    $("navUserMenu").hidden = false;

    await Promise.all([
      loadFeedAndInteractions(),
      loadNotifications()
    ]);

    setupRealtimeSubscriptions(user.id);
  } catch (error) {
    console.error("Load profile/session error:", error);
    activeSessionUserId = null;
    showToast("Gagal memuat data Supabase: " + (error.message || "Pastikan supabase_schema.sql sudah dijalankan."), "error");
  } finally {
    if (skeleton) skeleton.hidden = true;
  }
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      resetAppToLoggedOut();
      return;
    }

    if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      if (!isRegistering) {
        handleSignedInSession(session.user);
      }
    }
  });
}

function renderAvatarElement(container, photoURL, initial, username = "Pengguna") {
  if (!container) return;
  if (isSafeMediaUrl(photoURL)) {
    const img = document.createElement("img");
    img.src = photoURL.trim();
    img.alt = safeText(username);
    img.className = "avatar-photo-img";
    img.loading = "lazy";
    container.replaceChildren(img);
  } else {
    container.textContent = initial || "U";
  }
}

function updateProfileUI(profile) {
  if (!profile) return;
  const username = profile.username || "Pengguna";
  const initial = username.charAt(0).toUpperCase();

  $("profileUsername").textContent = username;
  $("profileEmail").textContent = currentUser?.email || "";
  $("profileBioText").textContent = profile.bio || "Belum ada bio.";
  $("username").value = username;
  $("bio").value = profile.bio || "";
  $("bioCounter").textContent = `${(profile.bio || "").length}/500`;

  renderAvatarElement($("profileAvatar"), profile.photo_url, initial, username);
  renderAvatarElement($("navAvatar"), profile.photo_url, initial, username);
  $("navUsername").textContent = username;

  if (currentUser) {
    userProfilesCache.set(currentUser.id, profile);
  }
}

/* ==========================================================================
   7. FORM EDIT PROFIL & UPLOAD FOTO PROFIL
   ========================================================================== */
function updateEditProfileAvatarPreview() {
  const previewImg = $("editProfileAvatarImg");
  const initialSpan = $("editProfileAvatarInitial");
  const removeBtn = $("removeProfilePhotoBtn");
  const currentUsername = $("username")?.value.trim() || currentProfile?.username || "U";
  const initial = currentUsername.charAt(0).toUpperCase();

  if (pendingProfilePhotoFile && selectedProfilePhotoObjectUrl) {
    if (previewImg) { previewImg.src = selectedProfilePhotoObjectUrl; previewImg.hidden = false; }
    if (initialSpan) initialSpan.hidden = true;
    if (removeBtn) removeBtn.hidden = false;
  } else if (!removeProfilePhotoPending && currentProfile?.photo_url) {
    if (previewImg) { previewImg.src = currentProfile.photo_url; previewImg.hidden = false; }
    if (initialSpan) initialSpan.hidden = true;
    if (removeBtn) removeBtn.hidden = false;
  } else {
    if (previewImg) { previewImg.src = ""; previewImg.hidden = true; }
    if (initialSpan) { initialSpan.textContent = initial; initialSpan.hidden = false; }
    if (removeBtn) removeBtn.hidden = true;
  }
}

$("toggleEditProfileBtn")?.addEventListener("click", () => {
  if (currentProfile) {
    if ($("username")) $("username").value = currentProfile.username || "";
    if ($("bio")) $("bio").value = currentProfile.bio || "";
    if ($("bioCounter")) $("bioCounter").textContent = `${(currentProfile.bio || "").length}/500`;
  }

  pendingProfilePhotoFile = null;
  removeProfilePhotoPending = false;
  if (selectedProfilePhotoObjectUrl) {
    URL.revokeObjectURL(selectedProfilePhotoObjectUrl);
    selectedProfilePhotoObjectUrl = null;
  }
  const photoInput = $("profilePhotoInput");
  if (photoInput) photoInput.value = "";
  const photoError = $("profilePhotoError");
  if (photoError) { photoError.textContent = ""; photoError.hidden = true; }

  updateEditProfileAvatarPreview();
  openModal("editProfileModal");
  setTimeout(() => $("username")?.focus(), 80);
});

$("cancelEditProfileBtn")?.addEventListener("click", () => {
  closeModal("editProfileModal");
});

$("pickProfilePhotoBtn")?.addEventListener("click", () => {
  $("profilePhotoInput")?.click();
});

$("profilePhotoInput")?.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  const errorEl = $("profilePhotoError");
  if (!file) return;

  const fileName = file.name || "";
  const lastDot = fileName.lastIndexOf(".");
  const ext = lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : "";
  const mime = normalizeMimeType(file.type);

  if (!ALLOWED_PROFILE_PHOTO.extensions.includes(ext) || (mime && !ALLOWED_PROFILE_PHOTO.mimeTypes.includes(mime))) {
    const msg = "Format foto tidak didukung. Gunakan file JPG, JPEG, PNG, atau WebP.";
    if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
    showToast(msg, "warning");
    event.target.value = "";
    return;
  }

  if (file.size > ALLOWED_PROFILE_PHOTO.maxSize) {
    const msg = "Ukuran foto profil melebihi batas maksimal 5 MB.";
    if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; }
    showToast(msg, "warning");
    event.target.value = "";
    return;
  }

  if (errorEl) { errorEl.textContent = ""; errorEl.hidden = true; }
  if (selectedProfilePhotoObjectUrl) {
    URL.revokeObjectURL(selectedProfilePhotoObjectUrl);
  }
  selectedProfilePhotoObjectUrl = URL.createObjectURL(file);
  pendingProfilePhotoFile = file;
  removeProfilePhotoPending = false;
  updateEditProfileAvatarPreview();
});

$("removeProfilePhotoBtn")?.addEventListener("click", () => {
  pendingProfilePhotoFile = null;
  removeProfilePhotoPending = true;
  const photoInput = $("profilePhotoInput");
  if (photoInput) photoInput.value = "";
  if (selectedProfilePhotoObjectUrl) {
    URL.revokeObjectURL(selectedProfilePhotoObjectUrl);
    selectedProfilePhotoObjectUrl = null;
  }
  const errorEl = $("profilePhotoError");
  if (errorEl) { errorEl.textContent = ""; errorEl.hidden = true; }
  updateEditProfileAvatarPreview();
});

$("bio")?.addEventListener("input", event => {
  const counter = $("bioCounter");
  if (counter) counter.textContent = `${event.target.value.length}/500`;
});

$("username")?.addEventListener("input", () => {
  if (!pendingProfilePhotoFile && (removeProfilePhotoPending || !currentProfile?.photo_url)) {
    updateEditProfileAvatarPreview();
  }
});

$("profileForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase || !currentUser || isUpdatingProfile) return;

  const newUsername = $("username").value.trim();
  const newBio = $("bio").value.trim();
  const saveBtn = $("saveProfileBtn");
  const spinner = saveBtn?.querySelector(".spinner");

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(newUsername)) {
    showToast("Username harus 3–30 karakter: hanya huruf, angka, titik, atau garis bawah.", "warning");
    return;
  }

  if (newBio.length > 500) {
    showToast("Bio maksimal 500 karakter.", "warning");
    return;
  }

  isUpdatingProfile = true;
  if (saveBtn) saveBtn.disabled = true;
  if (spinner) spinner.hidden = false;

  try {
    const previousUsername = currentProfile?.username || "";
    const previousPhotoPath = currentProfile?.photo_path || "";

    if (newUsername.toLowerCase() !== previousUsername.toLowerCase()) {
      const { data: available } = await supabase.rpc("is_username_available", {
        p_username: newUsername
      });
      if (available === false) {
        showToast(`Username "${newUsername}" sudah digunakan oleh orang lain.`, "warning");
        return;
      }
    }

    let newPhotoUrl = undefined;
    let newPhotoPath = undefined;

    if (pendingProfilePhotoFile) {
      const uploaded = await uploadMediaAsset(pendingProfilePhotoFile, { isProfilePhoto: true });
      newPhotoUrl = uploaded.url;
      newPhotoPath = uploaded.path;
    } else if (removeProfilePhotoPending) {
      newPhotoUrl = "";
      newPhotoPath = "";
    }

    const updatePayload = {
      username: newUsername,
      bio: newBio
    };
    if (newPhotoUrl !== undefined) {
      updatePayload.photo_url = newPhotoUrl;
      updatePayload.photo_path = newPhotoPath;
    }

    const { data: updatedProfile, error: updateErr } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", currentUser.id)
      .select("*")
      .single();

    if (updateErr) throw updateErr;

    if (newPhotoUrl !== undefined && previousPhotoPath && previousPhotoPath !== newPhotoPath) {
      deleteStoragePaths([previousPhotoPath]);
    }

    currentProfile = updatedProfile;
    updateProfileUI(currentProfile);

    // Sinkronisasi nama di feed lokal jika username berubah (DB trigger menyinkronkan Postgres)
    if (newUsername !== previousUsername) {
      rawFeedPosts = rawFeedPosts.map(p =>
        p.user_id === currentUser.id ? { ...p, username: newUsername } : p
      );
    }

    pendingProfilePhotoFile = null;
    removeProfilePhotoPending = false;
    if (selectedProfilePhotoObjectUrl) {
      URL.revokeObjectURL(selectedProfilePhotoObjectUrl);
      selectedProfilePhotoObjectUrl = null;
    }

    renderFilteredFeed();
    closeModal("editProfileModal");
    showToast("Profil berhasil diperbarui!", "success");
  } catch (error) {
    console.error("Update profile error:", error);
    showToast("Profil gagal diperbarui: " + (error.message || "Coba lagi."), "error");
  } finally {
    isUpdatingProfile = false;
    if (saveBtn) saveBtn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
});

/* ==========================================================================
   8. PEMBUATAN POSTINGAN, PREVIEW MEDIA & UPLOAD SUPABASE STORAGE
   ========================================================================== */
$("caption")?.addEventListener("input", event => {
  const counter = $("captionCounter");
  if (counter) counter.textContent = `${event.target.value.length}/2200`;
});

$("mediaFile")?.addEventListener("change", event => {
  const file = event.target.files && event.target.files[0];
  const previewBox = $("mediaPreviewBox");
  const imgPreview = $("mediaPreviewImg");
  const videoPreview = $("mediaPreviewVideo");
  const fileNameText = $("previewFileName");

  if (!file) {
    if (previewBox) previewBox.hidden = true;
    return;
  }

  const validation = validateMediaFile(file);
  if (!validation.valid) {
    showToast(validation.message, "warning");
    event.target.value = "";
    if (previewBox) previewBox.hidden = true;
    return;
  }

  if (selectedMediaObjectUrl) {
    URL.revokeObjectURL(selectedMediaObjectUrl);
  }
  selectedMediaObjectUrl = URL.createObjectURL(file);

  if (validation.mediaType === "image") {
    imgPreview.src = selectedMediaObjectUrl;
    imgPreview.hidden = false;
    videoPreview.hidden = true;
    videoPreview.pause();
  } else {
    videoPreview.src = selectedMediaObjectUrl;
    videoPreview.hidden = false;
    imgPreview.hidden = true;
  }

  fileNameText.textContent = `${file.name} (${formatFileSize(file.size)})`;
  previewBox.hidden = false;
});

$("removeMediaBtn")?.addEventListener("click", () => {
  const fileInput = $("mediaFile");
  if (fileInput) fileInput.value = "";
  if (selectedMediaObjectUrl) {
    URL.revokeObjectURL(selectedMediaObjectUrl);
    selectedMediaObjectUrl = null;
  }
  const previewBox = $("mediaPreviewBox");
  if (previewBox) previewBox.hidden = true;
});

$("navCreateBtn")?.addEventListener("click", () => {
  const card = $("createPostCard");
  if (card) {
    card.scrollIntoView({ behavior: "smooth" });
    $("caption")?.focus();
  }
});

$("navDashboardBtn")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("navProfileBtn")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("postForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase || !currentUser || !currentProfile || isSubmittingPost) return;

  const fileInput = $("mediaFile");
  const file = fileInput.files && fileInput.files[0];
  const caption = $("caption").value.trim();
  const uploadBtn = $("uploadButton");
  const spinner = uploadBtn?.querySelector(".spinner");
  const progressBox = $("uploadProgressBox");
  const progressBar = $("uploadProgressBar");
  const progressText = $("uploadProgressText");

  if (!file && !caption) {
    showToast("Silakan tulis caption atau pilih media untuk dibagikan.", "warning");
    return;
  }

  if (caption.length > 2200) {
    showToast("Caption maksimal 2200 karakter.", "warning");
    return;
  }

  let mediaUrl = "";
  let mediaPath = "";
  let mediaType = "text";

  isSubmittingPost = true;
  if (uploadBtn) uploadBtn.disabled = true;
  if (spinner) spinner.hidden = false;

  try {
    if (file) {
      const validation = validateMediaFile(file);
      if (!validation.valid) {
        showToast(validation.message, "warning");
        return;
      }

      if (progressBox) progressBox.hidden = false;
      if (progressBar) progressBar.style.width = "0%";
      if (progressText) progressText.textContent = "Mengunggah media: 0%";

      const uploaded = await uploadMediaAsset(file, {
        isProfilePhoto: false,
        onProgress: percent => {
          if (progressBar) progressBar.style.width = `${percent}%`;
          if (progressText) progressText.textContent = `Mengunggah media: ${percent}%`;
        }
      });

      mediaUrl = uploaded.url;
      mediaPath = uploaded.path;
      mediaType = uploaded.mediaType;
    }

    const { data: insertedPost, error: postErr } = await supabase
      .from("posts")
      .insert({
        user_id: currentUser.id,
        username: currentProfile.username,
        caption,
        media_url: mediaUrl,
        media_path: mediaPath,
        media_type: mediaType
      })
      .select("*")
      .single();

    if (postErr) throw postErr;

    if (insertedPost && !rawFeedPosts.some(p => p.id === insertedPost.id)) {
      rawFeedPosts.unshift(insertedPost);
      updateMyPostsCountBadge();
      renderFilteredFeed();
    }

    if (caption && insertedPost) {
      sendMentionNotifications(caption, insertedPost.id, null).catch(err => {
        console.warn("Mention notifications notice:", err);
      });
    }

    $("postForm").reset();
    $("captionCounter").textContent = "0/2200";
    if (selectedMediaObjectUrl) {
      URL.revokeObjectURL(selectedMediaObjectUrl);
      selectedMediaObjectUrl = null;
    }
    $("mediaPreviewBox").hidden = true;
    if (progressBox) progressBox.hidden = true;

    showToast(mediaUrl ? "Momen Anda berhasil diposting!" : "Postingan teks berhasil dibuat!", "success");
  } catch (error) {
    console.error("Create post error:", error);
    showToast("Postingan gagal disimpan: " + (error.message || "Coba lagi."), "error");
    if (progressBox) progressBox.hidden = true;
  } finally {
    isSubmittingPost = false;
    if (uploadBtn) uploadBtn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
});

/* ==========================================================================
   9. FEED POSTINGAN REAL-TIME, PENCARIAN, FILTER & PENGURUTAN FEED
   ========================================================================== */
function getPostLikesCount(post) {
  const cached = postLikesCache.get(post.id);
  return cached ? (cached.count || 0) : 0;
}

function getPostCommentsCount(post) {
  const cached = postCommentsCache.get(post.id);
  return cached ? (cached.count || 0) : 0;
}

function updateMyPostsCountBadge() {
  if (!currentUser) return;
  const count = rawFeedPosts.filter(p => p.user_id === currentUser.id).length;
  const badge = $("profilePostCountBadge");
  if (badge) badge.textContent = `${count} Postingan`;
}

async function fetchAndCacheUserProfile(uid) {
  if (!supabase || !uid || userProfilesCache.has(uid)) return;
  userProfilesCache.set(uid, { username: "", photo_url: "", pending: true });

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();

    if (!error && data) {
      userProfilesCache.set(uid, data);
      if (isSafeMediaUrl(data.photo_url)) {
        const authorName = data.username || "Pengguna";
        const authorInitial = authorName.charAt(0).toUpperCase();
        document.querySelectorAll(`.post-author-avatar[data-author-uid="${uid}"]`).forEach(el => {
          renderAvatarElement(el, data.photo_url, authorInitial, authorName);
        });
      }
    } else {
      userProfilesCache.set(uid, null);
    }
  } catch (err) {
    console.warn("Gagal membaca profil penulis:", uid, err);
  }
}

function createPostCardElement(post, options = {}) {
  const postId = post.id;
  const card = document.createElement("article");
  card.className = "post-card";
  card.dataset.postId = postId;

  const authorUsername = safeText(post.username || "Pengguna");
  const authorInitial = authorUsername.charAt(0).toUpperCase();
  const formattedDate = formatDate(post.created_at);

  const header = document.createElement("div");
  header.className = "post-header";

  const authorBox = document.createElement("div");
  authorBox.className = "post-author-box";

  const avatarEl = document.createElement("div");
  avatarEl.className = "avatar-mini post-author-avatar post-author-name-clickable";
  avatarEl.dataset.authorUid = post.user_id || "";
  avatarEl.title = `Lihat profil @${authorUsername}`;
  avatarEl.addEventListener("click", () => showUserProfilePreview(authorUsername));

  const cachedAuthor = (currentUser && post.user_id === currentUser.id)
    ? currentProfile
    : userProfilesCache.get(post.user_id);

  if (cachedAuthor && isSafeMediaUrl(cachedAuthor.photo_url)) {
    renderAvatarElement(avatarEl, cachedAuthor.photo_url, authorInitial, authorUsername);
  } else {
    avatarEl.textContent = authorInitial;
    if (post.user_id && !userProfilesCache.has(post.user_id)) {
      fetchAndCacheUserProfile(post.user_id);
    }
  }

  const nameTimeBox = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "post-author-name post-author-name-clickable";
  nameEl.title = `Lihat profil @${authorUsername}`;
  nameEl.textContent = authorUsername;
  nameEl.addEventListener("click", () => showUserProfilePreview(authorUsername));

  const dateEl = document.createElement("div");
  dateEl.className = "post-date";
  dateEl.textContent = formattedDate;

  nameTimeBox.append(nameEl, dateEl);
  authorBox.append(avatarEl, nameTimeBox);
  header.append(authorBox);

  if (currentUser && post.user_id && post.user_id !== currentUser.id) {
    const followBtn = document.createElement("button");
    followBtn.className = "btn-follow-pill";
    followBtn.type = "button";
    followBtn.dataset.targetUid = post.user_id;
    applyFollowButtonUI(followBtn, post.user_id);
    followBtn.addEventListener("click", () => toggleFollowUser(post.user_id, authorUsername));
    header.append(followBtn);
  }

  card.append(header);

  // Media Postingan
  if (isSafeMediaUrl(post.media_url)) {
    const mediaUrlTrimmed = post.media_url.trim();
    const isHttpMedia = mediaUrlTrimmed.startsWith("http://") || mediaUrlTrimmed.startsWith("https://");

    if (post.media_type === "video" && isHttpMedia) {
      const mediaContainer = document.createElement("div");
      mediaContainer.className = "post-media-container";
      const video = document.createElement("video");
      video.className = "post-media";
      video.src = mediaUrlTrimmed;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      mediaContainer.append(video);
      card.append(mediaContainer);
    } else if (post.media_type === "image") {
      const mediaContainer = document.createElement("div");
      mediaContainer.className = "post-media-container";
      const img = document.createElement("img");
      img.className = "post-media";
      img.src = mediaUrlTrimmed;
      img.alt = "Foto postingan";
      img.loading = "lazy";
      mediaContainer.append(img);
      card.append(mediaContainer);
    }
  }

  // Caption
  if (post.caption) {
    const captionBox = document.createElement("div");
    captionBox.className = "post-caption-box";
    captionBox.innerHTML = parseMentionsToHtml(post.caption);
    card.append(captionBox);
  }

  // Action Row
  const actionsRow = document.createElement("div");
  actionsRow.className = "post-actions-row";

  const leftActions = document.createElement("div");
  leftActions.className = "post-actions-left";

  const likeCache = postLikesCache.get(postId);
  const isLiked = likeCache ? !!likeCache.userLiked : false;
  const likesCount = likeCache ? (likeCache.count || 0) : 0;

  const likeBtn = document.createElement("button");
  likeBtn.className = `post-action-btn btn-like-post ${isLiked ? "is-active-like" : ""}`;
  likeBtn.type = "button";
  likeBtn.dataset.postId = postId;
  likeBtn.setAttribute("aria-label", isLiked ? "Batal menyukai" : "Sukai postingan");
  likeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? "#ef4444" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
    <span class="post-like-count">${likesCount}</span>
  `;
  likeBtn.addEventListener("click", () => togglePostLike(postId));
  leftActions.append(likeBtn);

  const commentCache = postCommentsCache.get(postId);
  const commentsCount = commentCache ? (commentCache.count || 0) : 0;

  const commentBtn = document.createElement("button");
  commentBtn.className = "post-action-btn btn-comment-post";
  commentBtn.type = "button";
  commentBtn.dataset.postId = postId;
  commentBtn.setAttribute("aria-label", "Lihat dan tulis komentar");
  commentBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="post-comment-count">${commentsCount}</span>
  `;
  commentBtn.addEventListener("click", () => openCommentModal(postId));
  leftActions.append(commentBtn);

  actionsRow.append(leftActions);

  const rightActions = document.createElement("div");
  rightActions.className = "post-actions-right";

  if (options?.showUnhideBtn) {
    const unhideBtn = document.createElement("button");
    unhideBtn.className = "btn-unhide-post";
    unhideBtn.type = "button";
    unhideBtn.title = "Kembalikan postingan ke feed";
    unhideBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      <span>Tampilkan di Feed</span>
    `;
    unhideBtn.addEventListener("click", () => unhidePostFromFeed(postId));
    rightActions.append(unhideBtn);
  } else {
    const isBookmarked = userBookmarksSet.has(postId);
    const bookmarkBtn = document.createElement("button");
    bookmarkBtn.className = `post-action-btn btn-bookmark-post ${isBookmarked ? "is-active-bookmark" : ""}`;
    bookmarkBtn.type = "button";
    bookmarkBtn.dataset.postId = postId;
    bookmarkBtn.title = isBookmarked ? "Batalkan Simpan" : "Simpan Postingan";
    bookmarkBtn.setAttribute("aria-label", bookmarkBtn.title);
    bookmarkBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBookmarked ? "#f59e0b" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      </svg>
    `;
    bookmarkBtn.addEventListener("click", () => togglePostBookmark(postId));
    rightActions.append(bookmarkBtn);

    const hideBtn = document.createElement("button");
    hideBtn.className = "post-action-icon-btn btn-hide-post";
    hideBtn.type = "button";
    hideBtn.title = "Sembunyikan dari feed saya";
    hideBtn.setAttribute("aria-label", "Sembunyikan postingan dari feed");
    hideBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    `;
    hideBtn.addEventListener("click", () => hidePostFromFeed(postId));
    rightActions.append(hideBtn);
  }

  if (currentUser && post.user_id === currentUser.id) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete-post";
    deleteBtn.type = "button";
    deleteBtn.title = "Hapus Postingan Permanen";
    deleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>Hapus</span>
    `;
    deleteBtn.addEventListener("click", () => {
      postToDeleteId = postId;
      openModal("deletePostModal");
    });
    rightActions.append(deleteBtn);
  }

  actionsRow.append(rightActions);
  card.append(actionsRow);

  return card;
}

function renderFilteredFeed() {
  const feed = $("feed");
  const emptyFeed = $("emptyFeed");
  const emptySearchFeed = $("emptySearchFeed");
  const emptySearchText = $("emptySearchText");
  const statusRow = $("feedFilterStatusRow");
  const resultCountText = $("feedResultCountText");
  const clearBtn = $("clearSearchBtn");

  if (!feed) return;

  if (rawFeedPosts.length === 0) {
    if (emptyFeed) emptyFeed.hidden = false;
    if (emptySearchFeed) emptySearchFeed.hidden = true;
    if (statusRow) statusRow.hidden = true;
    feed.replaceChildren();
    return;
  }

  if (emptyFeed) emptyFeed.hidden = true;

  let filtered = rawFeedPosts.filter(post => !userHiddenPostsSet.has(post.id));

  if (feedScopeFilter === "following") {
    filtered = filtered.filter(post => post.user_id === currentUser?.id || userFollowingSet.has(post.user_id));
  } else if (feedScopeFilter === "mutual") {
    filtered = filtered.filter(post => userFollowingSet.has(post.user_id) && userFollowersSet.has(post.user_id));
  }

  const keyword = (feedSearchKeyword || "").trim().toLowerCase();
  if (keyword.length > 0) {
    filtered = filtered.filter(post => {
      const username = safeText(post.username).toLowerCase();
      const caption = safeText(post.caption).toLowerCase();
      return username.includes(keyword) || caption.includes(keyword);
    });
  }

  if (clearBtn) {
    clearBtn.hidden = keyword.length === 0;
  }

  filtered.sort((a, b) => {
    switch (feedSortCriteria) {
      case "oldest":
        return getPostTimestamp(a) - getPostTimestamp(b);
      case "az": {
        const cmp = safeText(a.username).localeCompare(safeText(b.username), "id", { sensitivity: "base" });
        return cmp !== 0 ? cmp : getPostTimestamp(b) - getPostTimestamp(a);
      }
      case "za": {
        const cmp = safeText(b.username).localeCompare(safeText(a.username), "id", { sensitivity: "base" });
        return cmp !== 0 ? cmp : getPostTimestamp(b) - getPostTimestamp(a);
      }
      case "likes": {
        const diff = getPostLikesCount(b) - getPostLikesCount(a);
        return diff !== 0 ? diff : getPostTimestamp(b) - getPostTimestamp(a);
      }
      case "comments": {
        const diff = getPostCommentsCount(b) - getPostCommentsCount(a);
        return diff !== 0 ? diff : getPostTimestamp(b) - getPostTimestamp(a);
      }
      case "newest":
      default:
        return getPostTimestamp(b) - getPostTimestamp(a);
    }
  });

  const hasActiveFilter = keyword.length > 0 || feedSortCriteria !== "newest" || feedScopeFilter !== "all";
  if (statusRow) statusRow.hidden = !hasActiveFilter;
  if (resultCountText) resultCountText.textContent = `Ditemukan ${filtered.length} postingan`;

  if (filtered.length === 0) {
    if (emptySearchFeed) emptySearchFeed.hidden = false;
    if (emptySearchText) {
      if (keyword) {
        emptySearchText.textContent = `Tidak ada postingan yang cocok dengan kata kunci "${safeText(feedSearchKeyword)}".`;
      } else if (feedScopeFilter === "following") {
        emptySearchText.textContent = "Belum ada postingan dari akun yang Anda ikuti. Coba ikuti pengguna lain di feed atau lewat Cari & Mutualan.";
      } else if (feedScopeFilter === "mutual") {
        emptySearchText.textContent = "Belum ada postingan dari akun mutualan Anda. Saling ikuti dengan pengguna lain untuk melihat momen mereka di sini.";
      } else {
        emptySearchText.textContent = "Tidak ada postingan yang sesuai dengan filter yang Anda pilih.";
      }
    }
    feed.replaceChildren();
    return;
  }

  if (emptySearchFeed) emptySearchFeed.hidden = true;
  feed.replaceChildren();
  filtered.forEach(post => {
    feed.append(createPostCardElement(post));
  });
}

async function loadFeedAndInteractions() {
  if (!supabase || !currentUser) return;

  const [postsRes, likesRes, commentsRes, bookmarksRes, hiddenRes, followsRes] = await Promise.all([
    supabase.from("posts").select("*").order("created_at", { ascending: false }),
    supabase.from("post_likes").select("post_id, user_id"),
    supabase.from("post_comments").select("id, post_id"),
    supabase.from("bookmarks").select("post_id").eq("user_id", currentUser.id),
    supabase.from("hidden_posts").select("post_id").eq("user_id", currentUser.id),
    supabase.from("follows").select("follower_id, following_id").or(`follower_id.eq.${currentUser.id},following_id.eq.${currentUser.id}`)
  ]);

  if (postsRes.error) throw postsRes.error;

  rawFeedPosts = postsRes.data || [];

  // Hitung Likes per post
  postLikesCache.clear();
  (likesRes.data || []).forEach(row => {
    const cur = postLikesCache.get(row.post_id) || { count: 0, userLiked: false };
    cur.count += 1;
    if (row.user_id === currentUser.id) cur.userLiked = true;
    postLikesCache.set(row.post_id, cur);
  });

  // Hitung Komentar per post
  postCommentsCache.clear();
  (commentsRes.data || []).forEach(row => {
    const cur = postCommentsCache.get(row.post_id) || { count: 0 };
    cur.count += 1;
    postCommentsCache.set(row.post_id, cur);
  });

  userBookmarksSet = new Set((bookmarksRes.data || []).map(r => r.post_id));
  userHiddenPostsSet = new Set((hiddenRes.data || []).map(r => r.post_id));

  userFollowingSet = new Set();
  userFollowersSet = new Set();
  (followsRes.data || []).forEach(row => {
    if (row.follower_id === currentUser.id) userFollowingSet.add(row.following_id);
    if (row.following_id === currentUser.id) userFollowersSet.add(row.follower_id);
  });

  updateMyPostsCountBadge();
  updateProfileBadges();
  updateProfileSocialCounters();
  renderFilteredFeed();

  if (activeProfileTab !== "my") {
    renderProfileTabContent();
  }
}

async function refreshPostLikes(postId) {
  if (!supabase || !postId) return;
  const { data, error } = await supabase
    .from("post_likes")
    .select("user_id")
    .eq("post_id", postId);

  if (error) return;
  const rows = data || [];
  const count = rows.length;
  const isLiked = currentUser ? rows.some(r => r.user_id === currentUser.id) : false;
  postLikesCache.set(postId, { count, userLiked: isLiked });

  document.querySelectorAll(`.btn-like-post[data-post-id="${postId}"]`).forEach(btn => {
    btn.classList.toggle("is-active-like", isLiked);
    btn.setAttribute("aria-label", isLiked ? "Batal menyukai" : "Sukai postingan");
    const countEl = btn.querySelector(".post-like-count");
    if (countEl) countEl.textContent = count;
    const svg = btn.querySelector("svg");
    if (svg) svg.setAttribute("fill", isLiked ? "#ef4444" : "none");
  });
}

async function refreshPostCommentsCount(postId) {
  if (!supabase || !postId) return;
  const { count, error } = await supabase
    .from("post_comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error) return;
  const total = count || 0;
  postCommentsCache.set(postId, { count: total });

  document.querySelectorAll(`.btn-comment-post[data-post-id="${postId}"]`).forEach(btn => {
    const countEl = btn.querySelector(".post-comment-count");
    if (countEl) countEl.textContent = total;
  });
}

async function refreshFollowSets() {
  if (!supabase || !currentUser) return;
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, following_id")
    .or(`follower_id.eq.${currentUser.id},following_id.eq.${currentUser.id}`);

  if (error) return;
  userFollowingSet = new Set();
  userFollowersSet = new Set();
  (data || []).forEach(row => {
    if (row.follower_id === currentUser.id) userFollowingSet.add(row.following_id);
    if (row.following_id === currentUser.id) userFollowersSet.add(row.follower_id);
  });

  updateProfileSocialCounters();
  document.querySelectorAll(".btn-follow-pill[data-target-uid]").forEach(btn => {
    applyFollowButtonUI(btn, btn.dataset.targetUid);
  });
  if (feedScopeFilter !== "all") {
    renderFilteredFeed();
  }
}

function setupRealtimeSubscriptions(uid) {
  if (!supabase || !uid) return;
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel(`instalite-realtime-${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
      loadFeedAndInteractions().catch(e => console.warn("Realtime posts refresh:", e));
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "post_likes" }, payload => {
      const postId = payload.new?.post_id || payload.old?.post_id;
      if (postId) refreshPostLikes(postId);
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "post_comments" }, payload => {
      const postId = payload.new?.post_id || payload.old?.post_id;
      if (postId) {
        refreshPostCommentsCount(postId);
        if (activeCommentPost && activeCommentPost.id === postId) {
          loadActivePostComments(postId);
        }
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "follows" }, payload => {
      const row = payload.new || payload.old;
      if (row && (row.follower_id === uid || row.following_id === uid)) {
        refreshFollowSets();
      }
    })
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "notifications",
      filter: `recipient_id=eq.${uid}`
    }, () => {
      loadNotifications();
    })
    .subscribe();
}

// Pencarian, Scope & Pengurutan Feed
$("feedSearchInput")?.addEventListener("input", event => {
  feedSearchKeyword = event.target.value;
  renderFilteredFeed();
});

$("clearSearchBtn")?.addEventListener("click", () => {
  const input = $("feedSearchInput");
  if (input) input.value = "";
  feedSearchKeyword = "";
  const clearBtn = $("clearSearchBtn");
  if (clearBtn) clearBtn.hidden = true;
  renderFilteredFeed();
  input?.focus();
});

$("feedSortSelect")?.addEventListener("change", event => {
  feedSortCriteria = event.target.value;
  renderFilteredFeed();
});

document.querySelectorAll(".feed-scope-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const scope = btn.dataset.feedScope || "all";
    feedScopeFilter = scope;
    document.querySelectorAll(".feed-scope-btn").forEach(b => {
      const active = b.dataset.feedScope === scope;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderFilteredFeed();
  });
});

const handleResetFeedFilter = () => {
  const input = $("feedSearchInput");
  const select = $("feedSortSelect");
  if (input) input.value = "";
  if (select) select.value = "newest";
  feedSearchKeyword = "";
  feedSortCriteria = "newest";
  feedScopeFilter = "all";
  document.querySelectorAll(".feed-scope-btn").forEach(btn => {
    const isAll = btn.dataset.feedScope === "all";
    btn.classList.toggle("is-active", isAll);
    btn.setAttribute("aria-selected", isAll ? "true" : "false");
  });
  const clearBtn = $("clearSearchBtn");
  if (clearBtn) clearBtn.hidden = true;
  renderFilteredFeed();
};

$("resetFeedFilterBtn")?.addEventListener("click", handleResetFeedFilter);
$("emptyResetFilterBtn")?.addEventListener("click", handleResetFeedFilter);

/* ==========================================================================
   10. MODAL WORKFLOW: LOGOUT, HAPUS POSTINGAN, & HAPUS AKUN
   ========================================================================== */
$("logoutButton")?.addEventListener("click", () => {
  openModal("logoutModal");
});

$("cancelLogoutBtn")?.addEventListener("click", () => {
  closeModal("logoutModal");
});

$("confirmLogoutBtn")?.addEventListener("click", async () => {
  closeModal("logoutModal");
  if (!supabase) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    resetAppToLoggedOut();
    showToast("Anda telah keluar dari akun.", "info");
  } catch (error) {
    console.error("Logout error:", error);
    showToast("Gagal keluar: " + error.message, "error");
  }
});

$("cancelDeletePostBtn")?.addEventListener("click", () => {
  postToDeleteId = null;
  closeModal("deletePostModal");
});

$("confirmDeletePostBtn")?.addEventListener("click", async () => {
  if (!supabase || !postToDeleteId || !currentUser) return;

  const btn = $("confirmDeletePostBtn");
  const spinner = btn?.querySelector(".spinner");
  if (btn) btn.disabled = true;
  if (spinner) spinner.hidden = false;

  try {
    const targetPost = rawFeedPosts.find(p => p.id === postToDeleteId);
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postToDeleteId)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    if (targetPost?.media_path) {
      await deleteStoragePaths([targetPost.media_path]);
    }

    rawFeedPosts = rawFeedPosts.filter(p => p.id !== postToDeleteId);
    updateMyPostsCountBadge();
    renderFilteredFeed();
    if (activeProfileTab !== "my") renderProfileTabContent();

    closeModal("deletePostModal");
    postToDeleteId = null;
    showToast("Postingan berhasil dihapus.", "success");
  } catch (error) {
    console.error("Delete post error:", error);
    showToast("Gagal menghapus postingan: " + error.message, "error");
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
});

$("deleteAccountButton")?.addEventListener("click", () => {
  const pwdInput = $("deleteAccountPassword");
  if (pwdInput) pwdInput.value = "";
  openModal("deleteAccountModal");
});

$("cancelDeleteAccountBtn")?.addEventListener("click", () => {
  closeModal("deleteAccountModal");
});

$("confirmDeleteAccountBtn")?.addEventListener("click", async () => {
  if (!supabase || !currentUser || isDeletingAccount) return;

  const pwdInput = $("deleteAccountPassword");
  const password = pwdInput ? pwdInput.value : "";
  const confirmBtn = $("confirmDeleteAccountBtn");
  const spinner = confirmBtn?.querySelector(".spinner");

  if (!password) {
    showToast("Silakan masukkan kata sandi akun Anda untuk konfirmasi.", "warning");
    pwdInput?.focus();
    return;
  }

  isDeletingAccount = true;
  if (confirmBtn) confirmBtn.disabled = true;
  if (spinner) spinner.hidden = false;

  try {
    // 1. Re-autentikasi dengan password
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password
    });
    if (authErr) {
      showToast("Kata sandi salah. Verifikasi gagal, tidak ada data yang dihapus.", "error");
      return;
    }

    // 2. Kumpulkan & bersihkan seluruh file media milik pengguna di Storage
    const { data: userPosts } = await supabase
      .from("posts")
      .select("media_path")
      .eq("user_id", currentUser.id);

    const storagePaths = (userPosts || []).map(p => p.media_path).filter(Boolean);
    if (currentProfile?.photo_path) storagePaths.push(currentProfile.photo_path);
    await deleteStoragePaths(storagePaths);

    // 3. Hapus akun lewat RPC (cascade seluruh tabel profiles, posts, likes, comments, follows, dll.)
    const { error: rpcErr } = await supabase.rpc("delete_user_self");
    if (rpcErr) throw rpcErr;

    await supabase.auth.signOut().catch(() => {});
    resetAppToLoggedOut();
    closeModal("deleteAccountModal");
    showToast("Akun Anda berhasil dihapus secara permanen.", "success");
  } catch (error) {
    console.error("Delete account error:", error);
    showToast("Gagal menyelesaikan penghapusan akun: " + error.message, "error");
  } finally {
    isDeletingAccount = false;
    if (confirmBtn) confirmBtn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
});

/* ==========================================================================
   11. FITUR LIKE & UNLIKE REAL-TIME
   ========================================================================== */
async function togglePostLike(postId) {
  if (!supabase || !currentUser || !currentProfile) {
    showToast("Silakan masuk terlebih dahulu untuk menyukai postingan.", "warning");
    return;
  }

  if (likingPostsSet.has(postId)) return;
  likingPostsSet.add(postId);

  const cur = postLikesCache.get(postId) || { count: 0, userLiked: false };
  const wasLiked = cur.userLiked;

  try {
    if (wasLiked) {
      const { error } = await supabase
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", currentUser.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("post_likes")
        .insert({ post_id: postId, user_id: currentUser.id });
      if (error) throw error;

      const post = rawFeedPosts.find(p => p.id === postId);
      if (post && post.user_id && post.user_id !== currentUser.id) {
        supabase.from("notifications").insert({
          recipient_id: post.user_id,
          sender_id: currentUser.id,
          sender_username: currentProfile.username,
          type: "like",
          post_id: postId,
          comment_id: null,
          message: `${currentProfile.username} menyukai postingan Anda.`,
          read: false
        }).then(({ error: nErr }) => {
          if (nErr) console.warn("Notifikasi like notice:", nErr.message);
        });
      }
    }

    await refreshPostLikes(postId);
  } catch (error) {
    console.error("Like toggle error:", error);
    showToast("Gagal memperbarui Like: " + error.message, "error");
  } finally {
    likingPostsSet.delete(postId);
  }
}

/* ==========================================================================
   12. FITUR KOMENTAR REAL-TIME
   ========================================================================== */
function openCommentModal(postId) {
  const post = rawFeedPosts.find(p => p.id === postId);
  if (!post) return;

  activeCommentPost = post;

  const authorUsername = safeText(post.username || "Pengguna");
  const authorInitial = authorUsername.charAt(0).toUpperCase();
  const cachedAuthor = (currentUser && post.user_id === currentUser.id)
    ? currentProfile
    : userProfilesCache.get(post.user_id);

  renderAvatarElement($("commentPostAuthorAvatar"), cachedAuthor?.photo_url, authorInitial, authorUsername);
  $("commentPostAuthorName").textContent = authorUsername;
  $("commentPostSnippet").textContent = post.caption ? safeText(post.caption) : (post.media_url ? "[Media foto/video]" : "Postingan");

  const myInitial = (currentProfile?.username || "U").charAt(0).toUpperCase();
  renderAvatarElement($("commentUserAvatar"), currentProfile?.photo_url, myInitial, currentProfile?.username);

  const commentInput = $("commentInput");
  if (commentInput) commentInput.value = "";
  const counter = $("commentCharCounter");
  if (counter) counter.textContent = "0/500";

  openModal("commentModal");
  loadActivePostComments(postId);
  setTimeout(() => commentInput?.focus(), 100);
}

async function loadActivePostComments(postId) {
  if (!supabase || !postId) return;
  const commentsList = $("commentModalList");
  const emptyState = $("commentEmptyState");
  if (!commentsList) return;

  const { data: comments, error } = await supabase
    .from("post_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Load comments error:", error);
    return;
  }

  if (!comments || comments.length === 0) {
    commentsList.replaceChildren();
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;
  commentsList.replaceChildren();

  comments.forEach(c => {
    const item = document.createElement("div");
    item.className = "comment-item";

    const cUsername = safeText(c.username || "Pengguna");
    const cInitial = cUsername.charAt(0).toUpperCase();
    const cDate = formatDate(c.created_at);

    const avatarEl = document.createElement("div");
    avatarEl.className = "avatar-mini comment-item-avatar";
    renderAvatarElement(avatarEl, c.photo_url, cInitial, cUsername);

    const contentBox = document.createElement("div");
    contentBox.className = "comment-item-content";

    const headerBox = document.createElement("div");
    headerBox.className = "comment-item-header";

    const authorWrap = document.createElement("div");
    authorWrap.className = "comment-author-wrap";

    const authorNameEl = document.createElement("span");
    authorNameEl.className = "comment-author";
    authorNameEl.textContent = cUsername;
    authorNameEl.title = `Lihat profil @${cUsername}`;
    authorNameEl.addEventListener("click", () => showUserProfilePreview(cUsername));

    const timeEl = document.createElement("span");
    timeEl.className = "comment-time";
    timeEl.textContent = cDate;

    authorWrap.append(authorNameEl, timeEl);
    headerBox.append(authorWrap);

    if (currentUser && c.user_id === currentUser.id) {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-delete-comment";
      deleteBtn.type = "button";
      deleteBtn.title = "Hapus Komentar Saya";
      deleteBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      deleteBtn.addEventListener("click", () => deleteComment(postId, c.id));
      headerBox.append(deleteBtn);
    }

    const textBox = document.createElement("p");
    textBox.className = "comment-text";
    textBox.innerHTML = parseMentionsToHtml(c.text);

    contentBox.append(headerBox, textBox);
    item.append(avatarEl, contentBox);
    commentsList.append(item);
  });

  const modalBody = commentsList.closest(".comment-modal-body");
  if (modalBody) modalBody.scrollTop = modalBody.scrollHeight;
}

$("commentInput")?.addEventListener("input", event => {
  const counter = $("commentCharCounter");
  if (counter) counter.textContent = `${event.target.value.length}/500`;
});

$("commentForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase || !currentUser || !currentProfile || !activeCommentPost) return;

  const input = $("commentInput");
  const text = input ? input.value.trim() : "";
  const submitBtn = $("commentSubmitBtn");
  const spinner = submitBtn?.querySelector(".spinner");

  if (!text) {
    showToast("Komentar tidak boleh kosong.", "warning");
    return;
  }
  if (text.length > 500) {
    showToast("Komentar maksimal 500 karakter.", "warning");
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (spinner) spinner.hidden = false;

  const postId = activeCommentPost.id;
  const postAuthorUid = activeCommentPost.user_id;

  try {
    const { data: insertedComment, error } = await supabase
      .from("post_comments")
      .insert({
        post_id: postId,
        user_id: currentUser.id,
        username: currentProfile.username,
        photo_url: currentProfile.photo_url || "",
        text
      })
      .select("*")
      .single();

    if (error) throw error;

    input.value = "";
    const counter = $("commentCharCounter");
    if (counter) counter.textContent = "0/500";

    await Promise.all([
      loadActivePostComments(postId),
      refreshPostCommentsCount(postId)
    ]);

    if (postAuthorUid && postAuthorUid !== currentUser.id) {
      const snippet = text.length > 50 ? text.slice(0, 47) + "..." : text;
      supabase.from("notifications").insert({
        recipient_id: postAuthorUid,
        sender_id: currentUser.id,
        sender_username: currentProfile.username,
        type: "comment",
        post_id: postId,
        comment_id: insertedComment?.id || null,
        message: `${currentProfile.username} mengomentari postingan Anda: "${snippet}"`,
        read: false
      }).then(({ error: nErr }) => {
        if (nErr) console.warn("Notifikasi komentar notice:", nErr.message);
      });
    }

    sendMentionNotifications(text, postId, insertedComment?.id || null).catch(err => {
      console.warn("Mention notifications notice:", err);
    });

    showToast("Komentar berhasil dikirim.", "success");
  } catch (error) {
    console.error("Save comment error:", error);
    showToast("Gagal mengirim komentar: " + error.message, "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (spinner) spinner.hidden = true;
  }
});

async function deleteComment(postId, commentId) {
  if (!supabase || !currentUser) return;
  try {
    const { error } = await supabase
      .from("post_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", currentUser.id);
    if (error) throw error;

    await Promise.all([
      loadActivePostComments(postId),
      refreshPostCommentsCount(postId)
    ]);
    showToast("Komentar berhasil dihapus.", "success");
  } catch (err) {
    console.error("Delete comment error:", err);
    showToast("Gagal menghapus komentar: " + err.message, "error");
  }
}

/* ==========================================================================
   13. MENTION @USERNAME & PREVIEW PROFIL PENGGUNA
   ========================================================================== */
function parseMentionsToHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  const escaped = div.innerHTML;
  return escaped.replace(/@([a-zA-Z0-9_.]{3,30})/g, (match, username) => {
    return `<span class="mention-tag" data-username="${username}">@${username}</span>`;
  });
}

function extractMentions(text) {
  if (!text) return [];
  const matches = text.match(/@([a-zA-Z0-9_.]{3,30})/g);
  if (!matches) return [];
  const seen = new Set();
  const usernames = [];
  for (const raw of matches) {
    const clean = raw.slice(1);
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      usernames.push(clean);
    }
  }
  return usernames;
}

async function findUserByUsername(username) {
  if (!supabase) return null;
  const cleanUsername = (username || "").replace(/^@/, "").trim();
  if (!cleanUsername) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", cleanUsername)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  userProfilesCache.set(data.id, data);
  return { uid: data.id, data };
}

async function sendMentionNotifications(text, postId, commentId = null) {
  if (!supabase || !currentUser || !currentProfile) return;
  const usernames = extractMentions(text);
  if (usernames.length === 0) return;

  for (const username of usernames) {
    if (username.toLowerCase() === (currentProfile.username || "").toLowerCase()) continue;

    try {
      const found = await findUserByUsername(username);
      if (found && found.uid !== currentUser.id) {
        await supabase.from("notifications").insert({
          recipient_id: found.uid,
          sender_id: currentUser.id,
          sender_username: currentProfile.username,
          type: "mention",
          post_id: postId || null,
          comment_id: commentId || null,
          message: `${currentProfile.username} menyebut Anda dalam sebuah ${commentId ? "komentar" : "postingan"}.`,
          read: false
        });
      }
    } catch (err) {
      console.warn("Gagal mengirim notifikasi mention ke @" + username, err);
    }
  }
}

document.addEventListener("click", event => {
  const mentionEl = event.target.closest(".mention-tag");
  if (mentionEl) {
    event.preventDefault();
    event.stopPropagation();
    const username = mentionEl.dataset.username || mentionEl.textContent.replace("@", "").trim();
    if (username) showUserProfilePreview(username);
  }
});

$("userPreviewViewPostsBtn")?.addEventListener("click", () => {
  const targetUsername = previewedProfileUsername;
  closeModal("userPreviewModal");
  if (!targetUsername) return;

  if (activeProfileTab !== "my") {
    switchProfileTab("my");
  }

  const searchInput = $("feedSearchInput");
  if (searchInput) searchInput.value = targetUsername;
  feedSearchKeyword = targetUsername;
  feedScopeFilter = "all";
  document.querySelectorAll(".feed-scope-btn").forEach(btn => {
    const isAll = btn.dataset.feedScope === "all";
    btn.classList.toggle("is-active", isAll);
    btn.setAttribute("aria-selected", isAll ? "true" : "false");
  });
  renderFilteredFeed();
  $("feed")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("userPreviewFollowBtn")?.addEventListener("click", () => {
  const btn = $("userPreviewFollowBtn");
  const targetUid = btn?.dataset.targetUid;
  const targetUsername = btn?.dataset.targetUsername || previewedProfileUsername;
  if (targetUid) {
    toggleFollowUser(targetUid, targetUsername);
  }
});

async function showUserProfilePreview(username) {
  if (!supabase || !username) return;
  const cleanUsername = username.replace(/^@/, "").trim();

  try {
    const found = await findUserByUsername(cleanUsername);
    if (!found) {
      showToast(`Pengguna @${cleanUsername} tidak ditemukan.`, "warning");
      return;
    }

    const userData = found.data;
    const userUid = found.uid;
    const initial = (userData.username || "U").charAt(0).toUpperCase();
    previewedProfileUsername = userData.username || "";
    previewedProfileUid = userUid;

    $("userPreviewTitle").textContent = `Profil @${userData.username}`;
    renderAvatarElement($("userPreviewAvatar"), userData.photo_url, initial, userData.username);
    $("userPreviewUsername").textContent = `@${userData.username}`;
    $("userPreviewBio").textContent = userData.bio || "Belum ada bio.";

    const [postsCountRes, followersCountRes, followingCountRes] = await Promise.all([
      supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", userUid),
      supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userUid),
      supabase.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userUid)
    ]);

    const postsCount = postsCountRes.count || 0;
    const followersCount = followersCountRes.count || 0;
    const followingCount = followingCountRes.count || 0;

    $("userPreviewPostsCount").textContent = `${postsCount} Postingan`;
    if ($("userPreviewFollowersCount")) $("userPreviewFollowersCount").textContent = `${followersCount} Pengikut`;
    if ($("userPreviewFollowingCount")) $("userPreviewFollowingCount").textContent = `${followingCount} Mengikuti`;

    const relationBadge = $("userPreviewRelationBadge");
    const previewFollowBtn = $("userPreviewFollowBtn");
    const isSelf = currentUser && userUid === currentUser.id;

    if (isSelf) {
      if (relationBadge) relationBadge.hidden = true;
      if (previewFollowBtn) previewFollowBtn.hidden = true;
    } else {
      const relation = getFollowRelation(userUid);
      if (relationBadge) {
        if (relation.isMutual) {
          relationBadge.textContent = "Mutualan";
          relationBadge.hidden = false;
        } else if (relation.followsMe) {
          relationBadge.textContent = "Mengikuti Anda";
          relationBadge.hidden = false;
        } else {
          relationBadge.hidden = true;
        }
      }
      if (previewFollowBtn) {
        previewFollowBtn.hidden = false;
        previewFollowBtn.dataset.targetUid = userUid;
        previewFollowBtn.dataset.targetUsername = userData.username || "";
        applyFollowButtonUI(previewFollowBtn, userUid);
      }
    }

    const viewPostsBtn = $("userPreviewViewPostsBtn");
    if (viewPostsBtn) viewPostsBtn.hidden = postsCount === 0;

    openModal("userPreviewModal");
  } catch (err) {
    console.error("Show profile error:", err);
    showToast("Gagal memuat profil pengguna: " + err.message, "error");
  }
}

/* ==========================================================================
   14. NOTIFIKASI REAL-TIME
   ========================================================================== */
async function loadNotifications() {
  if (!supabase || !currentUser) return;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load notifications error:", error);
    return;
  }

  rawNotifications = data || [];
  const unreadCount = rawNotifications.filter(n => !n.read).length;
  const badge = $("navNotificationBadge");
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  const modal = $("notificationModal");
  if (modal && modal.classList.contains("is-open")) {
    renderNotificationList();
  }
}

function renderNotificationList() {
  const container = $("notificationList");
  const emptyState = $("notificationEmptyState");
  if (!container) return;

  if (rawNotifications.length === 0) {
    container.replaceChildren();
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;
  container.replaceChildren();

  const typeIcons = {
    like: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`,
    comment: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
    mention: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>`,
    follow: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>`
  };

  rawNotifications.forEach(notif => {
    const item = document.createElement("div");
    item.className = `notification-item ${!notif.read ? "is-unread" : ""}`;

    const iconWrap = document.createElement("div");
    iconWrap.className = `notification-icon-wrap type-${notif.type || "like"}`;
    iconWrap.innerHTML = typeIcons[notif.type] || typeIcons.like;

    const body = document.createElement("div");
    body.className = "notification-body";

    const text = document.createElement("p");
    text.className = "notification-text";
    text.textContent = notif.message || "Aktivitas baru";

    const time = document.createElement("div");
    time.className = "notification-time";
    time.textContent = formatDate(notif.created_at);

    body.append(text, time);
    item.append(iconWrap, body);

    item.addEventListener("click", async () => {
      if (!notif.read && supabase) {
        supabase
          .from("notifications")
          .update({ read: true })
          .eq("id", notif.id)
          .then(() => loadNotifications());
      }

      closeModal("notificationModal");

      if (notif.post_id) {
        if (activeProfileTab !== "my") switchProfileTab("my");

        setTimeout(() => {
          const postCard = document.querySelector(`.post-card[data-post-id="${notif.post_id}"]`);
          if (postCard) {
            postCard.scrollIntoView({ behavior: "smooth", block: "center" });
            postCard.classList.remove("post-highlight");
            void postCard.offsetWidth;
            postCard.classList.add("post-highlight");
            setTimeout(() => postCard.classList.remove("post-highlight"), 2600);
          }

          if (notif.type === "comment") {
            setTimeout(() => openCommentModal(notif.post_id), 400);
          }
        }, 300);
      } else if (notif.type === "follow" && notif.sender_username) {
        setTimeout(() => showUserProfilePreview(notif.sender_username), 220);
      }
    });

    container.append(item);
  });
}

$("navNotificationBtn")?.addEventListener("click", () => {
  renderNotificationList();
  openModal("notificationModal");
});

$("markAllReadBtn")?.addEventListener("click", async () => {
  if (!supabase || !currentUser) return;
  const unreadDocs = rawNotifications.filter(n => !n.read);
  if (unreadDocs.length === 0) return;

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("recipient_id", currentUser.id)
      .eq("read", false);

    if (error) throw error;
    await loadNotifications();
    showToast("Semua notifikasi ditandai telah dibaca.", "success");
  } catch (err) {
    console.error("Mark all read error:", err);
    showToast("Gagal memperbarui notifikasi: " + err.message, "error");
  }
});

/* ==========================================================================
   15. BOOKMARK (TERSIMPAN) & HIDE POST (DISEMBUNYIKAN)
   ========================================================================== */
async function togglePostBookmark(postId) {
  if (!supabase || !currentUser) {
    showToast("Silakan masuk untuk menyimpan postingan.", "warning");
    return;
  }

  if (bookmarkingPostsSet.has(postId)) return;
  bookmarkingPostsSet.add(postId);

  try {
    const isBookmarked = userBookmarksSet.has(postId);
    if (isBookmarked) {
      const { error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("post_id", postId);
      if (error) throw error;
      userBookmarksSet.delete(postId);
      showToast("Postingan dihapus dari koleksi tersimpan.", "info");
    } else {
      const { error } = await supabase
        .from("bookmarks")
        .insert({ user_id: currentUser.id, post_id: postId });
      if (error) throw error;
      userBookmarksSet.add(postId);
      showToast("Postingan disimpan ke koleksi tersimpan.", "success");
    }

    updateProfileBadges();

    document.querySelectorAll(`.btn-bookmark-post[data-post-id="${postId}"]`).forEach(btn => {
      const bookmarkedNow = userBookmarksSet.has(postId);
      btn.classList.toggle("is-active-bookmark", bookmarkedNow);
      btn.title = bookmarkedNow ? "Batalkan Simpan" : "Simpan Postingan";
      btn.setAttribute("aria-label", btn.title);
      const svg = btn.querySelector("svg");
      if (svg) svg.setAttribute("fill", bookmarkedNow ? "#f59e0b" : "none");
    });

    if (activeProfileTab === "saved") renderProfileTabContent();
  } catch (error) {
    console.error("Bookmark toggle error:", error);
    showToast("Gagal mengubah bookmark: " + error.message, "error");
  } finally {
    bookmarkingPostsSet.delete(postId);
  }
}

async function hidePostFromFeed(postId) {
  if (!supabase || !currentUser) return;
  if (hidingPostsSet.has(postId)) return;
  hidingPostsSet.add(postId);

  try {
    const { error } = await supabase
      .from("hidden_posts")
      .upsert({ user_id: currentUser.id, post_id: postId });
    if (error) throw error;

    userHiddenPostsSet.add(postId);
    updateProfileBadges();
    showToast("Postingan disembunyikan dari feed Anda.", "info");
    renderFilteredFeed();
    if (activeProfileTab === "hidden") renderProfileTabContent();
  } catch (error) {
    console.error("Hide post error:", error);
    showToast("Gagal menyembunyikan postingan: " + error.message, "error");
  } finally {
    hidingPostsSet.delete(postId);
  }
}

async function unhidePostFromFeed(postId) {
  if (!supabase || !currentUser) return;
  if (hidingPostsSet.has(postId)) return;
  hidingPostsSet.add(postId);

  try {
    const { error } = await supabase
      .from("hidden_posts")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("post_id", postId);
    if (error) throw error;

    userHiddenPostsSet.delete(postId);
    updateProfileBadges();
    showToast("Postingan berhasil ditampilkan kembali di feed.", "success");
    renderFilteredFeed();
    if (activeProfileTab === "hidden") renderProfileTabContent();
  } catch (error) {
    console.error("Unhide post error:", error);
    showToast("Gagal mengembalikan postingan: " + error.message, "error");
  } finally {
    hidingPostsSet.delete(postId);
  }
}

/* ==========================================================================
   16. TAB PROFIL: POSTINGAN SAYA, TERSIMPAN & DISEMBUNYIKAN
   ========================================================================== */
function updateProfileBadges() {
  const savedBadge = $("profileSavedCountBadge");
  if (savedBadge) {
    savedBadge.textContent = userBookmarksSet.size;
    savedBadge.hidden = userBookmarksSet.size === 0;
  }
  const hiddenBadge = $("profileHiddenCountBadge");
  if (hiddenBadge) {
    hiddenBadge.textContent = userHiddenPostsSet.size;
    hiddenBadge.hidden = userHiddenPostsSet.size === 0;
  }
}

function switchProfileTab(tabName) {
  activeProfileTab = tabName;
  const tabMy = $("tabMyPostsBtn");
  const tabSaved = $("tabSavedPostsBtn");
  const tabHidden = $("tabHiddenPostsBtn");
  const tabPanel = $("profileTabPanel");

  tabMy?.classList.toggle("is-active", tabName === "my");
  tabMy?.setAttribute("aria-selected", tabName === "my" ? "true" : "false");

  tabSaved?.classList.toggle("is-active", tabName === "saved");
  tabSaved?.setAttribute("aria-selected", tabName === "saved" ? "true" : "false");

  tabHidden?.classList.toggle("is-active", tabName === "hidden");
  tabHidden?.setAttribute("aria-selected", tabName === "hidden" ? "true" : "false");

  if (tabName === "my") {
    if (tabPanel) tabPanel.hidden = true;
    renderFilteredFeed();
  } else {
    if (tabPanel) tabPanel.hidden = false;
    renderProfileTabContent();
  }
}

function renderProfileTabContent() {
  const feed = $("profileTabFeed");
  const emptyState = $("profileTabEmptyState");
  const emptyTitle = $("profileTabEmptyTitle");
  const emptyDesc = $("profileTabEmptyDesc");
  if (!feed) return;

  let targetPosts = [];
  if (activeProfileTab === "saved") {
    targetPosts = rawFeedPosts.filter(p => userBookmarksSet.has(p.id));
    if (emptyTitle) emptyTitle.textContent = "Belum Ada Postingan Tersimpan";
    if (emptyDesc) emptyDesc.textContent = "Postingan yang Anda bookmark akan tersimpan secara rapi dan pribadi di sini.";
  } else if (activeProfileTab === "hidden") {
    targetPosts = rawFeedPosts.filter(p => userHiddenPostsSet.has(p.id));
    if (emptyTitle) emptyTitle.textContent = "Tidak Ada Postingan Disembunyikan";
    if (emptyDesc) emptyDesc.textContent = "Postingan yang Anda sembunyikan dari feed akan muncul di sini dan dapat dikembalikan kapan saja.";
  }

  if (targetPosts.length === 0) {
    feed.replaceChildren();
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;
  feed.replaceChildren();

  targetPosts.forEach(post => {
    feed.append(createPostCardElement(post, {
      showUnhideBtn: activeProfileTab === "hidden"
    }));
  });
}

$("tabMyPostsBtn")?.addEventListener("click", () => switchProfileTab("my"));
$("tabSavedPostsBtn")?.addEventListener("click", () => switchProfileTab("saved"));
$("tabHiddenPostsBtn")?.addEventListener("click", () => switchProfileTab("hidden"));

/* ==========================================================================
   17. FITUR FOLLOW, PENGIKUT & MUTUALAN REAL-TIME
   ========================================================================== */
function getFollowRelation(targetUid) {
  const isFollowing = Boolean(targetUid && userFollowingSet.has(targetUid));
  const followsMe = Boolean(targetUid && userFollowersSet.has(targetUid));
  return {
    isFollowing,
    followsMe,
    isMutual: isFollowing && followsMe
  };
}

function getFollowButtonConfig(relation) {
  if (relation.isMutual) {
    return { label: "Mutual", extraClass: "is-mutual", title: "Kalian saling mengikuti (klik untuk berhenti mengikuti)" };
  }
  if (relation.isFollowing) {
    return { label: "Mengikuti", extraClass: "is-following", title: "Berhenti mengikuti" };
  }
  if (relation.followsMe) {
    return { label: "Ikuti Balik", extraClass: "is-follow-back", title: "Pengguna ini mengikuti Anda — klik untuk mutualan" };
  }
  return { label: "+ Ikuti", extraClass: "", title: "Ikuti pengguna ini" };
}

function applyFollowButtonUI(btn, targetUid) {
  if (!btn || !targetUid) return;
  const relation = getFollowRelation(targetUid);
  const { label, extraClass, title } = getFollowButtonConfig(relation);

  btn.classList.remove("is-mutual", "is-following", "is-follow-back");
  if (extraClass) btn.classList.add(extraClass);
  btn.textContent = label;
  btn.title = title;
  btn.disabled = followingInFlightSet.has(targetUid);
}

function updateFollowButtonsInDom(targetUid) {
  document.querySelectorAll(`.btn-follow-pill[data-target-uid="${targetUid}"]`).forEach(btn => {
    applyFollowButtonUI(btn, targetUid);
  });

  const previewFollowBtn = $("userPreviewFollowBtn");
  if (previewFollowBtn && !previewFollowBtn.hidden && previewFollowBtn.dataset.targetUid === targetUid) {
    applyFollowButtonUI(previewFollowBtn, targetUid);
    const relation = getFollowRelation(targetUid);
    const relationBadge = $("userPreviewRelationBadge");
    if (relationBadge) {
      if (relation.isMutual) {
        relationBadge.textContent = "Mutualan";
        relationBadge.hidden = false;
      } else if (relation.followsMe) {
        relationBadge.textContent = "Mengikuti Anda";
        relationBadge.hidden = false;
      } else {
        relationBadge.hidden = true;
      }
    }
  }
}

function getMutualUidList() {
  return Array.from(userFollowingSet).filter(uid => userFollowersSet.has(uid));
}

function updateProfileSocialCounters() {
  const followersBtn = $("profileFollowersBtn");
  const followingBtn = $("profileFollowingBtn");
  const mutualBtn = $("profileMutualBtn");

  if (followersBtn) followersBtn.textContent = `${userFollowersSet.size} Pengikut`;
  if (followingBtn) followingBtn.textContent = `${userFollowingSet.size} Mengikuti`;
  if (mutualBtn) mutualBtn.textContent = `${getMutualUidList().length} Mutual`;

  const modal = $("connectionsModal");
  if (modal && modal.classList.contains("is-open")) {
    renderConnectionsList();
  }
}

async function toggleFollowUser(targetUid, targetUsername = "Pengguna") {
  if (!supabase || !currentUser || !currentProfile) {
    showToast("Silakan masuk terlebih dahulu untuk mengikuti pengguna.", "warning");
    return;
  }
  if (!targetUid || targetUid === currentUser.id) return;
  if (followingInFlightSet.has(targetUid)) return;

  followingInFlightSet.add(targetUid);
  const wasFollowing = userFollowingSet.has(targetUid);
  const followsMe = userFollowersSet.has(targetUid);

  if (wasFollowing) {
    userFollowingSet.delete(targetUid);
  } else {
    userFollowingSet.add(targetUid);
  }
  updateFollowButtonsInDom(targetUid);
  updateProfileSocialCounters();

  try {
    if (wasFollowing) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", targetUid);
      if (error) throw error;
      showToast(`Berhenti mengikuti @${targetUsername}.`, "info");
    } else {
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: currentUser.id, following_id: targetUid });
      if (error) throw error;

      const becameMutual = followsMe;
      showToast(
        becameMutual
          ? `Anda dan @${targetUsername} sekarang mutualan!`
          : `Anda mulai mengikuti @${targetUsername}.`,
        "success"
      );

      supabase.from("notifications").insert({
        recipient_id: targetUid,
        sender_id: currentUser.id,
        sender_username: currentProfile.username,
        type: "follow",
        post_id: null,
        comment_id: null,
        message: becameMutual
          ? `${currentProfile.username} mengikuti Anda balik! Kalian sekarang mutualan.`
          : `${currentProfile.username} mulai mengikuti Anda.`,
        read: false
      }).then(({ error: nErr }) => {
        if (nErr) console.warn("Notifikasi follow notice:", nErr.message);
      });
    }

    if (previewedProfileUid === targetUid) {
      const previewFollowersEl = $("userPreviewFollowersCount");
      if (previewFollowersEl) {
        const { count } = await supabase
          .from("follows")
          .select("follower_id", { count: "exact", head: true })
          .eq("following_id", targetUid);
        previewFollowersEl.textContent = `${count || 0} Pengikut`;
      }
    }

    if (feedScopeFilter !== "all") {
      renderFilteredFeed();
    }
  } catch (error) {
    console.error("Follow toggle error:", error);
    if (wasFollowing) {
      userFollowingSet.add(targetUid);
    } else {
      userFollowingSet.delete(targetUid);
    }
    showToast("Gagal memperbarui status ikuti: " + error.message, "error");
  } finally {
    followingInFlightSet.delete(targetUid);
    updateFollowButtonsInDom(targetUid);
    updateProfileSocialCounters();
  }
}

async function fetchUsersByIds(uids) {
  if (!supabase || !uids || uids.length === 0) return [];
  const missing = [];
  const results = [];

  for (const uid of uids) {
    const cached = userProfilesCache.get(uid);
    if (cached && cached.username) {
      results.push(cached);
    } else {
      missing.push(uid);
    }
  }

  if (missing.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("id", missing);

    if (!error && data) {
      data.forEach(p => {
        userProfilesCache.set(p.id, p);
        results.push(p);
      });
    }
  }

  return results;
}

async function renderConnectionsList() {
  const listEl = $("connectionsList");
  const emptyEl = $("connectionsEmptyState");
  const emptyTitle = $("connectionsEmptyTitle");
  const emptyDesc = $("connectionsEmptyDesc");
  if (!listEl || !supabase || !currentUser) return;

  listEl.replaceChildren();
  if (emptyEl) emptyEl.hidden = true;

  let users = [];
  if (activeConnectionsTab === "discover") {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .neq("id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      showToast("Gagal memuat daftar pengguna: " + error.message, "error");
    } else {
      users = data || [];
      users.forEach(u => userProfilesCache.set(u.id, u));
    }
  } else {
    let targetUids = [];
    if (activeConnectionsTab === "mutual") targetUids = getMutualUidList();
    else if (activeConnectionsTab === "followers") targetUids = Array.from(userFollowersSet);
    else if (activeConnectionsTab === "following") targetUids = Array.from(userFollowingSet);
    users = await fetchUsersByIds(targetUids);
  }

  if (users.length === 0) {
    if (emptyEl) {
      emptyEl.hidden = false;
      if (activeConnectionsTab === "mutual") {
        if (emptyTitle) emptyTitle.textContent = "Belum Ada Mutualan";
        if (emptyDesc) emptyDesc.textContent = "Saling ikuti dengan pengguna lain di feed atau tab Temukan Orang untuk menjadi mutual.";
      } else if (activeConnectionsTab === "followers") {
        if (emptyTitle) emptyTitle.textContent = "Belum Ada Pengikut";
        if (emptyDesc) emptyDesc.textContent = "Pengguna yang mengikuti akun Anda akan tampil di sini.";
      } else if (activeConnectionsTab === "following") {
        if (emptyTitle) emptyTitle.textContent = "Belum Mengikuti Siapa Pun";
        if (emptyDesc) emptyDesc.textContent = "Buka tab Temukan Orang untuk mengikuti pengguna lain.";
      } else {
        if (emptyTitle) emptyTitle.textContent = "Belum Ada Pengguna Lain";
        if (emptyDesc) emptyDesc.textContent = "Pengguna baru yang mendaftar di InstaLite akan tampil di sini.";
      }
    }
    return;
  }

  users.sort((a, b) => safeText(a.username).localeCompare(safeText(b.username), "id", { sensitivity: "base" }));

  users.forEach(user => {
    const item = document.createElement("div");
    item.className = "connection-item";

    const info = document.createElement("div");
    info.className = "connection-user-info";
    info.title = `Lihat profil @${safeText(user.username)}`;
    info.addEventListener("click", () => {
      closeModal("connectionsModal");
      if (user.username) showUserProfilePreview(user.username);
    });

    const avatar = document.createElement("div");
    avatar.className = "avatar-mini";
    const username = safeText(user.username || "Pengguna");
    renderAvatarElement(avatar, user.photo_url, username.charAt(0).toUpperCase(), username);

    const meta = document.createElement("div");
    meta.className = "connection-user-meta";

    const nameEl = document.createElement("div");
    nameEl.className = "connection-username";
    nameEl.textContent = `@${username}`;

    const bioEl = document.createElement("div");
    bioEl.className = "connection-bio";
    bioEl.textContent = user.bio || "Pengguna InstaLite";

    meta.append(nameEl, bioEl);
    info.append(avatar, meta);

    const followBtn = document.createElement("button");
    followBtn.className = "btn-follow-pill";
    followBtn.type = "button";
    followBtn.dataset.targetUid = user.id;
    applyFollowButtonUI(followBtn, user.id);
    followBtn.addEventListener("click", () => toggleFollowUser(user.id, username));

    item.append(info, followBtn);
    listEl.append(item);
  });
}

function switchConnectionsTab(tabName) {
  activeConnectionsTab = tabName;
  document.querySelectorAll(".connections-tab-btn").forEach(btn => {
    const active = btn.dataset.connectionsTab === tabName;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  renderConnectionsList();
}

function openConnectionsModal(tabName = "mutual") {
  openModal("connectionsModal");
  switchConnectionsTab(tabName);
}

$("profileFollowersBtn")?.addEventListener("click", () => openConnectionsModal("followers"));
$("profileFollowingBtn")?.addEventListener("click", () => openConnectionsModal("following"));
$("profileMutualBtn")?.addEventListener("click", () => openConnectionsModal("mutual"));
$("openDiscoverUsersBtn")?.addEventListener("click", () => openConnectionsModal("discover"));

document.querySelectorAll(".connections-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    switchConnectionsTab(btn.dataset.connectionsTab || "mutual");
  });
});
