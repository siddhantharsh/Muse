// ============================================================
// Muse — Light / Dark theme toggle
// ============================================================

import { Moon, Sun } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

export function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useMuseStore((s) => s.settings.theme);
  const updateSettings = useMuseStore((s) => s.updateSettings);
  const isLight = theme === 'light';
  const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <button
      onClick={() => updateSettings({ theme: isLight ? 'dark' : 'light' })}
      className={`flex items-center gap-1.5 px-2 py-1 border border-nord3 hover:border-nord8 hover:bg-nord2 text-nord4 hover:text-nord6 transition-colors text-[10px] ${className}`}
      title={label}
      aria-label={label}
    >
      {isLight ? <Moon size={12} /> : <Sun size={12} />}
      <span>{isLight ? 'dark' : 'light'}</span>
    </button>
  );
}
