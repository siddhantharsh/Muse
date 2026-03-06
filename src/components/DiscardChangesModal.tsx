// ============================================================
// Muse — Discard Changes Confirmation Modal
// ============================================================

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

export function DiscardChangesModal({
  onDiscard,
  onCancel,
}: {
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      {/* Modal */}
      <div className="relative bg-nord1 border border-nord3 w-[340px] p-0 animate-scale-in">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-nord3/50">
          <AlertTriangle size={16} className="text-nord13" />
          <span className="text-sm font-semibold text-nord6">Unsaved Changes</span>
        </div>

        {/* Body */}
        <div className="px-4 py-4">
          <p className="text-xs text-nord4 leading-relaxed">
            You have unsaved changes. Are you sure you want to discard them?
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-nord3/50">
          <button
            onClick={onCancel}
            className="btn-secondary text-xs"
          >
            Keep Editing
          </button>
          <button
            onClick={onDiscard}
            className="btn-danger text-xs"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
