// ============================================================
// Muse — Phone Header (shown when accessed from phone browser)
// ============================================================

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Menu } from 'lucide-react';
import { phoneCheckVersion, phonePullState } from '../utils/syncClient';
import { useMuseStore } from '../store/useMuseStore';

export function PhoneHeader() {
  const [connected, setConnected] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Ping the server periodically to check connection
  useEffect(() => {
    const check = async () => {
      try {
        const v = await phoneCheckVersion();
        setConnected(v > 0);
      } catch {
        setConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const data = await phonePullState();
      if (data && data.tasks) {
        const store = useMuseStore.getState();
        useMuseStore.setState({
          tasks: data.tasks || [],
          events: data.events || [],
          lists: data.lists?.length ? data.lists : store.lists,
          settings: data.settings || store.settings,
        });
        store.persist();
      }
    } catch {
      // ignore
    }
    setSyncing(false);
  };

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

      <div className="flex items-center gap-2">
        {connected ? (
          <Wifi size={14} className="text-nord14" />
        ) : (
          <WifiOff size={14} className="text-nord11" />
        )}
        <button
          onClick={handleManualSync}
          className="p-1 hover:bg-nord2 rounded transition-colors"
          title="Sync now"
        >
          <RefreshCw size={14} className={`text-nord4 ${syncing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
