// ============================================================
// Muse — Cloud Sync (Firebase Auth + Firestore)
// Each account owns one document, users/{uid}, holding the full app
// state as a JSON string. Auto-placed schedule blocks are stripped
// before upload — every device recomputes them deterministically —
// which keeps the document well under Firestore's 1 MiB limit.
// ============================================================

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { getFirebaseAuth, getDb, isCloudConfigured } from './firebase';
import type { Task, CalendarEvent, TaskList, AppSettings } from '../types';

export { isCloudConfigured };

export interface SyncPayload {
  tasks: Task[];
  events: CalendarEvent[];
  lists: TaskList[];
  settings: AppSettings;
}

export interface CloudUser {
  uid: string;
  email: string | null;
}

export interface RemoteState {
  payload: SyncPayload;
  updatedAt: number;
  deviceId: string | null;
}

// Firestore caps a document at 1 MiB; leave headroom for field overhead.
const MAX_DOC_BYTES = 900_000;

function toCloudUser(user: User | null): CloudUser | null {
  return user ? { uid: user.uid, email: user.email } : null;
}

function userDoc(uid: string) {
  return doc(getDb(), 'users', uid);
}

// ---- Auth ----

export async function cloudSignUp(email: string, password: string): Promise<CloudUser> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  // Courtesy verification email; sign-in doesn't depend on it.
  sendEmailVerification(cred.user).catch(() => {});
  return toCloudUser(cred.user)!;
}

export async function cloudSignIn(email: string, password: string): Promise<CloudUser> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return toCloudUser(cred.user)!;
}

export async function cloudSignOut(): Promise<void> {
  await signOut(getFirebaseAuth());
}

export async function cloudSendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function getCloudUser(): Promise<CloudUser | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return toCloudUser(auth.currentUser);
}

/** Fires once with the restored session, then on every sign-in/out. */
export function onAuthStateChange(callback: (user: CloudUser | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => callback(toCloudUser(user)));
}

/** Maps Firebase error codes to messages a person can act on. */
export function describeAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address doesn’t look right.';
    case 'auth/missing-password':
      return 'Enter your password.';
    case 'auth/weak-password':
      return 'Use a password with at least 6 characters.';
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Log in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'auth/network-request-failed':
      return 'Can’t reach the server. Check your connection and try again.';
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'Email sign-in isn’t switched on for this app yet. Continue without an account for now — you can sign in later from Settings.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    default:
      return (err as Error)?.message || 'Something went wrong. Try again.';
  }
}

// ---- Data ----

/** Drop what every device can recompute, so uploads stay small. */
function slimPayload(payload: SyncPayload): SyncPayload {
  return {
    ...payload,
    tasks: payload.tasks.map((t) => ({
      ...t,
      scheduledBlocks: t.scheduledBlocks.filter((b) => b.isManuallyPinned),
    })),
  };
}

export async function cloudPull(uid: string): Promise<RemoteState | null> {
  const snap = await getDoc(userDoc(uid));
  if (!snap.exists()) return null;
  return parseRemote(snap.data());
}

export async function cloudPush(uid: string, payload: SyncPayload, deviceId: string): Promise<number> {
  const data = JSON.stringify(slimPayload(payload));
  if (data.length > MAX_DOC_BYTES) {
    throw new Error('Your data is too large to sync (over ~900 KB). Delete old completed tasks and try again.');
  }
  const updatedAt = Date.now();
  await setDoc(userDoc(uid), { data, updatedAt, deviceId, schema: 1 });
  return updatedAt;
}

/** Live updates from other devices. Returns an unsubscribe function. */
export function subscribeToRemote(
  uid: string,
  onChange: (remote: RemoteState) => void,
  onError: (err: Error) => void
): () => void {
  return onSnapshot(
    userDoc(uid),
    (snap) => {
      // Our own writes echo back first as local "pending" snapshots — skip them.
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const remote = parseRemote(snap.data());
      if (remote) onChange(remote);
    },
    onError
  );
}

function parseRemote(raw: Record<string, unknown>): RemoteState | null {
  if (typeof raw.data !== 'string') return null;
  try {
    const payload = JSON.parse(raw.data) as SyncPayload;
    return {
      payload,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : null,
    };
  } catch {
    return null;
  }
}
