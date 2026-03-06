// ============================================================
// Muse — Phone Header (shown when accessed from phone browser)
// ============================================================

import React from 'react';
import { Menu } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

export function PhoneHeader() {
  const toggleSidebar = useMuseStore((s) => s.toggleSidebar);

  return (
    <div className="h-10 flex items-center justify-between px-3 bg-nord0 border-b border-nord3 select-none font-mono">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleSidebar}
          className="p-1 hover:bg-nord2 transition-colors text-nord4"
          title="Menu"
        >
          <Menu size={16} />
        </button>
        <span className="text-xs font-bold text-nord8 tracking-widest uppercase">
          muse
        </span>
        <span className="text-xs text-nord3">│</span>
        <span className="text-[10px] text-nord4">mobile</span>
      </div>
    </div>
  );
}
