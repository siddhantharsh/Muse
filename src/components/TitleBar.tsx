// ============================================================
// Muse — Title Bar (Terminal-style window chrome)
// ============================================================

import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import { ThemeToggle } from './ThemeToggle';
import { CatLogo } from './CatLogo';

export function TitleBar() {
  const isRecalculating = useMuseStore((s) => s.ui.isRecalculating);

  return (
    <div
      className="h-8 flex items-center justify-between px-3 bg-nord0 border-b border-nord3 select-none font-mono"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App Identity — terminal style */}
      <div className="flex items-center gap-2">
        <CatLogo variant="mini" className="text-[8px] !leading-none" />
        <span className="flex items-baseline gap-2">
          <span className="text-xs font-bold text-nord8 tracking-widest uppercase">muse</span>
          <span className="text-xs text-nord3">│</span>
          <span className="text-[10px] text-nord4">
            {isRecalculating ? (
              <span className="text-nord13 animate-pulse-soft">scheduling...</span>
            ) : (
              'ready'
            )}
          </span>
        </span>
      </div>

      {/* Window Controls — terminal buttons */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ThemeToggle className="mr-2" />
        <button
          className="px-2 py-1 hover:bg-nord2 transition-colors text-nord4 text-xs"
          onClick={() => (window as any).electronAPI?.minimize?.()}
          title="minimize"
        >
          <Minus size={12} />
        </button>
        <button
          className="px-2 py-1 hover:bg-nord2 transition-colors text-nord4 text-xs"
          onClick={() => (window as any).electronAPI?.maximize?.()}
          title="maximize"
        >
          <Square size={10} />
        </button>
        <button
          className="px-2 py-1 hover:bg-nord11 transition-colors text-nord4 hover:text-nord6 text-xs"
          onClick={() => (window as any).electronAPI?.close?.()}
          title="close"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
