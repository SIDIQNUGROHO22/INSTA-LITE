
import { auth, db, storage } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, query, orderBy, onSnapshot,
  where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";

const $ = id => document.getElementById(id);

let currentUser = null;
let isRegister = false;
let unsubscribeFeed = null;

function status(message) {
  $("status").textContent = message;
}

function safeText(value) {
  return String(value ?? "");
}

function formatDate(value) {
  if (!value?.toDate) return "Baru saja";
  return value.toDate().toLocaleString("id-ID");
}

$("toggleAuth").addEventListener("click", () => {
  isRegister = !isRegister;
  $("authSubmit").textContent = isRegister ? "Daftar" : "Masuk";
  $("toggleAuth").textContent = isRegister
    ? "Sudah punya akun? Masuk"
    : "Belum punya akun? Daftar";

  $("password").autocomplete = isRegister
    ? "new-password"
    : "current-password";

  status("");
});

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("authSubmit").disabled = true;

  try {
    if (isRegister) {
      const result = await createUserWithEmailAndPassword(
        auth, email, password
      );

      await setDoc(doc(db, "users", result.user.uid), {
        email: result.user.email,
        username: "user_" + result.user.uid.slice(0, 8),
        bio: "",
        createdAt: serverTimestamp()
      });

      status("Akun berhasil dibuat.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      status("Login berhasil.");
    }
  } catch (error) {
    console.error(error);
    status("Gagal memproses akun. Periksa email, kata sandi, dan konfigurasi Firebase.");
  } finally {
    $("authSubmit").disabled = false;
  }
});

onAuthStateChanged(auth, async user => {
  currentUser = user;

  $("authSection").hidden = !!user;
  $("appSection").hidden = !user;

  if (unsubscribeFeed) {
    unsubscribeFeed();
    unsubscribeFeed = null;
  }

  if (!user) return;

  try {
    const snapshot = await getDoc(doc(db, "users", user.uid));

    if (!snapshot.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        email: user.email,
        username: "user_" + user.uid.slice(0, 8),
        bio: "",
        createdAt: serverTimestamp()
      });
    }

    const profile = (await getDoc(
      doc(db, "users", user.uid)
    )).data();

    $("profileEmail").textContent = user.email || "";
    $("profileUsername").textContent = profile.username || "Pengguna";
    $("username").value = profile.username || "";
    $("bio").value = profile.bio || "";

    loadFeed();
  } catch (error) {
    console.error(error);
    status("Profil tidak dapat dimuat. Periksa konfigurasi dan aturan Firestore.");
  }
});

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const username = $("username").value.trim();
  const bio = $("bio").value.trim();

  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) {
    status("Username harus 3–30 karakter: huruf, angka, titik, atau garis bawah.");
    return;
  }

  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      username,
      bio
    });

    $("profileUsername").textContent = username;
    status("Profil berhasil diperbarui.");
  } catch (error) {
    console.error(error);
    status("Profil gagal diperbarui.");
  }
});

$("logoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
    status("Kamu sudah keluar.");
  } catch (error) {
    console.error(error);
    status("Gagal keluar dari akun.");
  }
});

$("postForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!currentUser) return;

  const file = $("mediaFile").files[0];
  const caption = $("caption").value.trim();

  if (!file) {
    status("Pilih foto atau video terlebih dahulu.");
    return;
  }

  const allowedTypes = {
    "image/jpeg": 10 * 1024 * 1024,
    "image/png": 10 * 1024 * 1024,
    "video/mp4": 50 * 1024 * 1024,
    "video/quicktime": 50 * 1024 * 1024
  };

  if (!(file.type in allowedTypes)) {
    status("Format tidak didukung. Gunakan JPG, PNG, MP4, atau MOV.");
    return;
  }

  if (file.size > allowedTypes[file.type]) {
    status("Ukuran file melebihi batas yang ditentukan.");
    return;
  }

  const button = $("uploadButton");
  button.disabled = true;

  try {
    const profileSnap = await getDoc(
      doc(db, "users", currentUser.uid)
    );
    const profile = profileSnap.data();

    const postRef = doc(collection(db, "posts"));
    const mediaPath = `posts/${currentUser.uid}/${postRef.id}`;
    const mediaRef = ref(storage, mediaPath);

    await uploadBytes(mediaRef, file, {
      contentType: file.type
    });

    const mediaUrl = await getDownloadURL(mediaRef);

    await setDoc(postRef, {
      uid: currentUser.uid,
      username: profile?.username || "Pengguna",
      caption,
      mediaUrl,
      mediaPath,
      mediaType: file.type.startsWith("image/")
        ? "image" : "video",
      createdAt: serverTimestamp()
    });

    $("postForm").reset();
    status("Postingan berhasil diunggah.");
  } catch (error) {
    console.error(error);
    status("Unggahan gagal. Periksa koneksi dan aturan Firebase Storage.");
  } finally {
    button.disabled = false;
  }
});

function loadFeed() {
  if (unsubscribeFeed) unsubscribeFeed();

  const feedQuery = query(
    collection(db, "posts"),
    orderBy("createdAt", "desc")
  );

  unsubscribeFeed = onSnapshot(feedQuery, snapshot => {
    const feed = $("feed");
    feed.replaceChildren();

    if (snapshot.empty) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Belum ada postingan. Jadilah yang pertama!";
      feed.append(empty);
      return;
    }

    snapshot.forEach(postSnapshot => {
      const post = postSnapshot.data();
      const postId = postSnapshot.id;

      const card = document.createElement("article");
      card.className = "post";

      const header = document.createElement("div");
      header.className = "post-header";

      const owner = document.createElement("strong");
      owner.textContent = safeText(post.username);

      const date = document.createElement("span");
      date.className = "muted";
      date.textContent = formatDate(post.createdAt);

      header.append(owner, date);

      const media = document.createElement(
        post.mediaType === "video" ? "video" : "img"
      );
      media.className = "post-media";
      media.src = post.mediaUrl;
      media.alt = post.mediaType === "image"
        ? "Foto unggahan" : "";

      if (post.mediaType === "video") {
        media.controls = true;
        media.preload = "metadata";
        media.playsInline = true;
      } else {
        media.loading = "lazy";
      }

      const caption = document.createElement("p");
      caption.className = "post-caption";
      caption.textContent = safeText(post.caption);

      card.append(header, media, caption);

      if (currentUser && post.uid === currentUser.uid) {
        const actions = document.createElement("div");
        actions.className = "post-actions";

        const deleteButton = document.createElement("button");
        deleteButton.className = "danger";
        deleteButton.textContent = "Hapus postingan";

        deleteButton.addEventListener("click", async () => {
          if (!confirm("Hapus postingan ini secara permanen?")) return;

          deleteButton.disabled = true;

          try {
            const latest = await getDoc(doc(db, "posts", postId));

            if (!latest.exists() ||
                latest.data().uid !== currentUser.uid) {
              throw new Error("Akses ditolak");
            }

            await deleteDoc(doc(db, "posts", postId));

            if (latest.data().mediaPath) {
              try {
                await deleteObject(ref(storage, latest.data().mediaPath));
              } catch (error) {
                console.error("Pembersihan media perlu diperiksa:", error);
                status("Postingan dihapus, tetapi file media perlu diperiksa.");
                return;
              }
            }

            status("Postingan berhasil dihapus.");
          } catch (error) {
            console.error(error);
            status("Penghapusan gagal. Periksa koneksi dan aturan akses.");
          } finally {
            deleteButton.disabled = false;
          }
        });

        actions.append(deleteButton);
        card.append(actions);
      }

      feed.append(card);
    });
  }, error => {
    console.error(error);
    status("Feed gagal dimuat. Periksa aturan Firestore.");
  });
}

$("deleteAccountButton").addEventListener("click", async () => {
  if (!currentUser) return;

  const confirmed = confirm(
    "Hapus akun dan semua postingan beserta medianya? Tindakan ini permanen."
  );

  if (!confirmed) return;

  const user = currentUser;
  $("deleteAccountButton").disabled = true;

  try {
    const postsQuery = query(
      collection(db, "posts"),
      where("uid", "==", user.uid)
    );

    const postsSnapshot = await getDocs(postsQuery);

    // Hapus file media dan dokumen setiap postingan.
    for (const item of postsSnapshot.docs) {
      const post = item.data();

      if (post.mediaPath) {
        await deleteObject(ref(storage, post.mediaPath));
      }

      await deleteDoc(item.ref);
    }

    await deleteDoc(doc(db, "users", user.uid));

    // Firebase mungkin meminta login ulang jika sesi sudah lama.
    await deleteUser(user);

    status("Akun berhasil dihapus.");
  } catch (error) {
    console.error(error);
    status(
      "Penghapusan belum selesai. Mungkin diperlukan login ulang atau pembersihan data yang tersisa."
    );
  } finally {
    $("deleteAccountButton").disabled = false;
  }
});
