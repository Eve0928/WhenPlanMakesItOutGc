// Connects the app to your Firebase Firestore database.
// This defines window.storage.get / .set / .list — the same interface
// script.js already knows how to use, so script.js itself needs no changes.
// Data saved with shared=true (plan info + everyone's availability) goes to
// Firestore, so it syncs between everyone using the site.
// Data saved with shared=false (your personal "my plans" list) intentionally
// stays on your own browser via localStorage — no need to sync that part.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection,
  query, orderBy, startAt, endAt, getDocs, documentId
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7NMWS4tLiWYS-QNFnulM41k2aHCosk1U",
  authDomain: "whenplanleavesgc.firebaseapp.com",
  projectId: "whenplanleavesgc",
  storageBucket: "whenplanleavesgc.firebasestorage.app",
  messagingSenderId: "1057249416625",
  appId: "1:1057249416625:web:26f6b67ba2de16f97f5990",
  measurementId: "G-6X2L06TDFG"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COLLECTION = "align_store";

window.storage = {
  async get(key, shared) {
    if (!shared) throw new Error("local-only key");
    const snap = await getDoc(doc(db, COLLECTION, key));
    return snap.exists() ? { key, value: snap.data().value, shared } : null;
  },

  async set(key, value, shared) {
    if (!shared) throw new Error("local-only key");
    await setDoc(doc(db, COLLECTION, key), { value, updatedAt: Date.now() });
    return { key, value, shared };
  },

  async list(prefix, shared) {
    if (!shared) throw new Error("local-only key");
    const q = query(
      collection(db, COLLECTION),
      orderBy(documentId()),
      startAt(prefix),
      endAt(prefix + "\uf8ff")
    );
    const snap = await getDocs(q);
    const keys = [];
    snap.forEach(d => keys.push(d.id));
    return { keys, prefix, shared };
  }
};
