// ============================================================
// Muse — First-Run Welcome
// Asks, before anything else, whether the person wants to log in
// with an email account (sync + backup) or keep everything on this
// device. The answer is remembered per device.
// ============================================================

import React, { useState } from 'react';
import { ArrowLeft, Cloud, HardDrive, Mail } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { AuthForm, type AuthMode } from './AuthForm';
import { ThemeToggle } from './ThemeToggle';
import { CatLogo } from './CatLogo';

export function WelcomeScreen() {
  const setOnboardingChoice = useMuseStore((s) => s.setOnboardingChoice);
  const setAccount = useMuseStore((s) => s.setAccount);
  const [step, setStep] = useState<'choose' | 'email'>('choose');
  const [mode, setMode] = useState<AuthMode>('signin');

  const openEmail = (next: AuthMode) => {
    setMode(next);
    setStep('email');
    // Start downloading sign-in code while the person types.
    import('../utils/cloudSync').catch(() => {});
  };

  return (
    <div className="h-full overflow-y-auto scrollable bg-nord0 font-mono">
      <div className="min-h-full flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">
          <div className="flex items-end gap-3 mb-8">
            <CatLogo className="text-[11px]" />
            <span className="text-sm font-bold tracking-widest uppercase text-nord8 pb-1">muse</span>
            <ThemeToggle className="ml-auto" />
          </div>

          {step === 'choose' ? (
            <>
              <h1 className="text-2xl font-bold text-nord6 leading-tight">
                Do you want to log in with your email?
              </h1>
              <p className="mt-3 text-sm text-nord4 leading-relaxed">
                An account keeps your schedule backed up and in sync on every device you use.
                You can also keep everything on this device only.
              </p>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => openEmail('signin')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-nord8 text-nord0 border border-nord8 hover:bg-nord7 hover:border-nord7 transition-colors text-left"
                >
                  <Mail size={18} className="flex-shrink-0" />
                  <span className="flex-1">
                    <span className="block text-sm font-bold">Log in with email</span>
                    <span className="block text-xs opacity-80">I already have a Muse account</span>
                  </span>
                </button>

                <button
                  onClick={() => openEmail('signup')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-nord1 text-nord6 border border-nord3 hover:border-nord8 transition-colors text-left"
                >
                  <Cloud size={18} className="flex-shrink-0 text-nord8" />
                  <span className="flex-1">
                    <span className="block text-sm font-bold">Create an account</span>
                    <span className="block text-xs text-nord4">Free — sync and backup included</span>
                  </span>
                </button>

                <button
                  onClick={() => setOnboardingChoice('offline')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border border-transparent hover:border-nord3 hover:bg-nord1 transition-colors text-left"
                >
                  <HardDrive size={18} className="flex-shrink-0 text-nord4" />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-nord6">Continue without an account</span>
                    <span className="block text-xs text-nord4">
                      Everything stays on this device. Sign in any time from Settings.
                    </span>
                  </span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('choose')}
                className="flex items-center gap-1.5 text-xs text-nord4 hover:text-nord6 transition-colors mb-6"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <h1 className="text-2xl font-bold text-nord6 leading-tight">
                {mode === 'signin' ? 'Log in to Muse' : 'Create your Muse account'}
              </h1>
              <p className="mt-2 mb-6 text-sm text-nord4">
                {mode === 'signin'
                  ? 'Your schedule will sync the moment you’re in.'
                  : 'Anything you’ve already added on this device comes with you.'}
              </p>
              <div className="p-5 bg-nord1 border border-nord3">
                <AuthForm
                  mode={mode}
                  onModeChange={setMode}
                  autoFocus
                  onSuccess={(account) => {
                    setOnboardingChoice('account');
                    setAccount(account);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
