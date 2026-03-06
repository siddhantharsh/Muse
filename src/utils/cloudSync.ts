// ============================================================
// Muse — Cloud Sync (Supabase)
// Full-state sync: stores entire app state as a JSON blob per user
// ============================================================

import { getSupabase, isCloudConfigured } from './supabase';
import type { Task, CalendarEvent, TaskList, AppSettings } from '../types';

export interface SyncPayload {
  tasks: Task[];
  events: CalendarEvent[];
  lists: TaskList[];
  settings: AppSettings;
}

interface CloudRow {
  user_id: string;
  data: SyncPayload;
  updated_at: string;
}

// ---- Auth helpers ----

export async function cloudSignUp(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function cloudSignIn(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function cloudSignOut() {
  const sb = getSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getCloudUser() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user;
}

export async function getCloudSession() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

// ---- Sync helpers ----

/** Push local state to cloud */
export async function cloudPush(payload: SyncPayload): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error('Cloud sync not configured');

  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await sb.from('user_data').upsert(
    {
      user_id: user.id,
      data: payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) throw error;
}

/** Pull remote state from cloud */
export async function cloudPull(): Promise<SyncPayload | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from('user_data')
    .select('data, updated_at')
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No row found
    throw error;
  }

  return (data as CloudRow)?.data || null;
}

/** Get remote version timestamp */
export async function cloudGetVersion(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from('user_data')
    .select('updated_at')
    .eq('user_id', user.id)
    .single();

  if (error) return null;
  return data?.updated_at || null;
}

/** Subscribe to auth state changes */
export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  const sb = getSupabase();
  if (!sb) return { data: { subscription: { unsubscribe: () => {} } } };
  return sb.auth.onAuthStateChange(callback as any);
}

export { isCloudConfigured };
