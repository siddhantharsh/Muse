// ============================================================
// Muse — Web Header (shown in non-Electron browser contexts)
// ============================================================

import React from 'react';
import { Menu, Smartphone } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    () => window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  );
  React.useEffect(() => {
    const check = () => setIsMobile(
      window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    );
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

export function PhoneHeader() {
  const toggleSidebar = useMuseStore((s) => s.toggleSidebar);
  const isMobile = useIsMobile();

  return (
    <div className="h-10 flex items-center justify-between px-3 bg-nord0 border-b border-nord3 select-none font-mono">
      <div className="flex items-center gap-2">
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="p-1 hover:bg-nord2 transition-colors text-nord4"
            title="Menu"
          >
            <Menu size={16} />
          </button>
        )}
        <span className="text-xs font-bold text-nord8 tracking-widest uppercase">
          muse
        </span>
        <span className="text-xs text-nord3">│</span>
        <span className="text-[10px] text-nord4">
          {isMobile ? 'mobile' : 'web'}
        </span>
        {isMobile && (
          <a
            href="https://github.com/siddhantharsh/Muse/releases/latest"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-nord13 hover:text-nord12 transition-colors ml-2"
            title="Download Android APK"
          >
            <Smartphone size={12} />
            <span>get app</span>
          </a>
        )}
      </div>
    </div>
  );
}
