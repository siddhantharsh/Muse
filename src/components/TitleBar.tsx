// ============================================================
// Muse — Title Bar (Terminal-style window chrome)
// ============================================================

import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

export function TitleBar() {
  const isRecalculating = useMuseStore((s) => s.ui.isRecalculating);

  return (
    <div
      className="h-8 flex items-center justify-between px-3 bg-nord0 border-b border-nord3 select-none font-mono"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* App Identity — terminal style */}
      <div className="flex items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}icon.png`} alt="Muse" className="w-4 h-4 object-contain" />
        <span className="text-xs font-bold text-nord8 tracking-widest uppercase">
          muse
        </span>
        <span className="text-xs text-nord3">│</span>
        <span className="text-[10px] text-nord4">
          {isRecalculating ? (
            <span className="text-nord13 animate-pulse-soft">scheduling...</span>
          ) : (
            'ready'
          )}
        </span>
      </div>

      {/* Window Controls — terminal buttons */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
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
