// ============================================================
// Muse — PIN Gate (shown on phone when PIN not yet entered)
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { getStoredPin, setStoredPin, phoneVerifyPin } from '../utils/syncClient';

interface PinGateProps {
  onAuthenticated: () => void;
}

export function PinGate({ onAuthenticated }: PinGateProps) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-verify if PIN already stored
  useEffect(() => {
    const stored = getStoredPin();
    if (stored && stored.length === 4) {
      setVerifying(true);
      phoneVerifyPin(stored).then((ok) => {
        if (ok) {
          onAuthenticated();
        } else {
          setVerifying(false);
          // PIN invalid, clear it
          setStoredPin('');
        }
      });
    }
  }, [onAuthenticated]);

  const handleDigitChange = (index: number, value: string) => {
    // Only allow digits
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError('');

    // Auto-advance to next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (digit && index === 3) {
      const pin = newDigits.join('');
      if (pin.length === 4) {
        submitPin(pin);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      submitPin(pasted);
    }
  };

  const submitPin = async (pin: string) => {
    setVerifying(true);
    setError('');
    const ok = await phoneVerifyPin(pin);
    if (ok) {
      setStoredPin(pin);
      onAuthenticated();
    } else {
      setError('Wrong PIN');
      setDigits(['', '', '', '']);
      setVerifying(false);
      inputRefs.current[0]?.focus();
    }
  };

  if (verifying && getStoredPin()) {
    return (
      <div className="h-full flex items-center justify-center bg-nord0 font-mono">
        <div className="text-nord4 text-xs">Connecting...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-nord0 font-mono">
      <div className="text-center px-8">
        <img
          src={`${import.meta.env.BASE_URL}icon.png`}
          alt="Muse"
          className="w-12 h-12 mx-auto mb-4 object-contain"
        />
        <h1 className="text-lg font-bold text-nord8 tracking-widest uppercase mb-1">
          muse
        </h1>
        <p className="text-xs text-nord4 mb-8">
          Enter the PIN shown in desktop Settings → Device Sync
        </p>

        <div className="flex justify-center gap-3 mb-4" onPaste={handlePaste}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el; }}
              type="tel"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={verifying}
              className="w-12 h-14 text-center text-xl font-bold text-nord6 bg-nord1 border-2 border-nord3 focus:border-nord8 focus:outline-none font-mono transition-colors"
              autoFocus={i === 0}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-nord11 mb-4">{error}</p>
        )}

        {verifying && (
          <p className="text-xs text-nord4">Verifying...</p>
        )}

        <p className="text-[10px] text-nord3 mt-8">
          This PIN protects your calendar from others on the same WiFi
        </p>
      </div>
    </div>
  );
}
