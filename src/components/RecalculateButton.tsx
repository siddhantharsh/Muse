// ============================================================
// Muse — Recalculate Button (Terminal-style)
// ============================================================

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

export function RecalculateButton() {
  const recalculate = useMuseStore((s) => s.recalculate);
  const isRecalculating = useMuseStore((s) => s.ui.isRecalculating);

  return (
    <button
      onClick={recalculate}
      disabled={isRecalculating}
      className={`absolute bottom-4 right-4 z-30 flex items-center gap-2 px-3 py-2 text-xs font-mono border transition-all ${
        isRecalculating
          ? 'bg-nord2 text-nord4 border-nord3 cursor-wait'
          : 'bg-nord1 text-nord8 border-nord8 hover:bg-nord8 hover:text-nord0 active:bg-nord10'
      }`}
      title="recalculate schedule (R)"
    >
      <RefreshCw
        size={12}
        className={isRecalculating ? 'animate-spin' : ''}
      />
      {isRecalculating ? '$ scheduling...' : '$ recalculate'}
    </button>
  );
}
