// ============================================================
// Muse — Supabase Client Configuration
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// These come from environment variables (set in .env or at build time)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabase) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'muse-auth',          // fixed key across file:// and http origins
        storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
      },
    });
  }
  return supabase;
}

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
