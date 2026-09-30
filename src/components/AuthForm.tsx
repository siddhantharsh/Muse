// ============================================================
// Muse — Email Auth Form
// Log in / create account / reset password. Shared by the first-run
// welcome screen and Settings → Account.
// ============================================================

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { CloudAccount } from '../types';

export type AuthMode = 'signin' | 'signup';

interface AuthFormProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: (account: CloudAccount, isNewAccount: boolean) => void;
  autoFocus?: boolean;
}

export function AuthForm({ mode, onModeChange, onSuccess, autoFocus = false }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AuthMode) => {
    setError('');
    setNotice('');
    onModeChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Use a password with at least 6 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('The two passwords don’t match.');
      return;
    }

    setLoading(true);
    try {
      const sync = await import('../utils/cloudSync');
      try {
        const account =
          mode === 'signup'
            ? await sync.cloudSignUp(email, password)
            : await sync.cloudSignIn(email, password);
        onSuccess(account, mode === 'signup');
      } catch (err) {
        setError(sync.describeAuthError(err));
      }
    } catch {
      setError('Couldn’t load sign-in. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email above, then choose “Forgot password?” again.');
      return;
    }
    setLoading(true);
    try {
      const sync = await import('../utils/cloudSync');
      try {
        await sync.cloudSendPasswordReset(email);
        setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
      } catch (err) {
        setError(sync.describeAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2 p-2.5 text-xs text-nord11 bg-nord11/10 border border-nord11/30">
          <AlertCircle size={14} className="flex-shrink-0 mt-px" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2 p-2.5 text-xs text-nord14 bg-nord14/10 border border-nord14/30">
          <CheckCircle2 size={14} className="flex-shrink-0 mt-px" />
          <span>{notice}</span>
        </div>
      )}

      <div>
        <label htmlFor="auth-email" className="block text-xs text-nord4 mb-1">
          Email
        </label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-base"
          placeholder="you@example.com"
          autoFocus={autoFocus}
          autoComplete="email"
          inputMode="email"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="auth-password" className="block text-xs text-nord4">
            Password
          </label>
          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-nord8 hover:text-nord7 transition-colors"
            >
              Forgot password?
            </button>
          )}
        </div>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-base"
          placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />
      </div>

      {mode === 'signup' && (
        <div>
          <label htmlFor="auth-confirm" className="block text-xs text-nord4 mb-1">
            Confirm password
          </label>
          <input
            id="auth-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-base"
            placeholder="Repeat your password"
            autoComplete="new-password"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 disabled:opacity-60"
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {mode === 'signin' ? 'Log in' : 'Create account'}
      </button>

      <p className="text-center text-xs text-nord4">
        {mode === 'signin' ? 'New to Muse? ' : 'Already have an account? '}
        <button
          type="button"
          onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-nord8 hover:text-nord7 font-medium transition-colors"
        >
          {mode === 'signin' ? 'Create an account' : 'Log in'}
        </button>
      </p>
    </form>
  );
}
