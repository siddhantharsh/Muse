// ============================================================
// Muse — Cloud Auth Screen (Sign Up / Sign In)
// ============================================================

import React, { useState } from 'react';
import { Cloud, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import { cloudSignIn, cloudSignUp } from '../utils/cloudSync';

interface AuthScreenProps {
  onAuthenticated: () => void;
  onSkip: () => void;
}

export function AuthScreen({ onAuthenticated, onSkip }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await cloudSignUp(email, password);
        setSignupSuccess(true);
      } else {
        await cloudSignIn(email, password);
        onAuthenticated();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (signupSuccess) {
    return (
      <div className="h-full flex items-center justify-center bg-nord0">
        <div className="w-full max-w-sm p-6 border border-nord3 bg-nord1">
          <div className="text-center space-y-4">
            <Cloud size={32} className="mx-auto text-nord14" />
            <h2 className="text-lg font-bold text-nord6">Check Your Email</h2>
            <p className="text-sm text-nord4">
              A confirmation link has been sent to{' '}
              <span className="text-nord8">{email}</span>.
              Click it to verify your account, then sign in.
            </p>
            <button
              onClick={() => {
                setSignupSuccess(false);
                setMode('signin');
                setPassword('');
                setConfirmPassword('');
              }}
              className="btn-primary w-full mt-4"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-nord0">
      <div className="w-full max-w-sm p-6 border border-nord3 bg-nord1">
        {/* Header */}
        <div className="text-center mb-6">
          <Cloud size={32} className="mx-auto text-nord8 mb-2" />
          <h1 className="text-lg font-bold text-nord6">Muse Cloud</h1>
          <p className="text-xs text-nord4 mt-1">
            Sync your tasks across devices
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-nord3 mb-4">
          <button
            onClick={() => { setMode('signin'); setError(''); }}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
              mode === 'signin'
                ? 'border-nord8 text-nord8'
                : 'border-transparent text-nord4 hover:text-nord6'
            }`}
          >
            <LogIn size={12} className="inline mr-1" />
            Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
              mode === 'signup'
                ? 'border-nord8 text-nord8'
                : 'border-transparent text-nord4 hover:text-nord6'
            }`}
          >
            <UserPlus size={12} className="inline mr-1" />
            Sign Up
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-2 mb-4 text-xs text-nord11 bg-nord11/10 border border-nord11/30">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-nord4 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
              placeholder="you@example.com"
              autoFocus
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs text-nord4 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base"
              placeholder="••••••••"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label className="block text-xs text-nord4 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-base"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : mode === 'signin' ? (
              <LogIn size={14} />
            ) : (
              <UserPlus size={14} />
            )}
            {loading
              ? 'Please wait...'
              : mode === 'signin'
              ? 'Sign In'
              : 'Create Account'}
          </button>
        </form>

        {/* Skip */}
        <button
          onClick={onSkip}
          className="w-full mt-4 py-2 text-xs text-nord4 hover:text-nord6 transition-colors text-center"
        >
          Skip — use offline only
        </button>
      </div>
    </div>
  );
}
