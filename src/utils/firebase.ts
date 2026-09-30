// ============================================================
// Muse — Firebase Client Configuration
// Email/password auth + a Firestore document per user for sync.
// The web config below is public by design: Firebase web API keys
// identify the project, they don't grant access. Access control
// lives in firestore.rules. Every value can be overridden at build
// time with VITE_FIREBASE_* variables (see .env.example).
// ============================================================

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore/lite';

const env = import.meta.env;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyCfEr_ZYf0nc4l5pEFjd2H0ar2vkGmDjbk',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'muse-in.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'muse-in',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'muse-in.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '506314920395',
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function isCloudConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

function getApp(): FirebaseApp {
  if (!app) app = initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    try {
      // Keep the session across reloads; IndexedDB first, localStorage as fallback
      // (Electron's file:// origin and some private windows lack IndexedDB).
      auth = initializeAuth(getApp(), {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      });
    } catch {
      // initializeAuth throws if auth was already initialized (e.g. after HMR).
      auth = getAuth(getApp());
    }
  }
  return auth;
}

export function getDb(): Firestore {
  if (!db) db = getFirestore(getApp());
  return db;
}
