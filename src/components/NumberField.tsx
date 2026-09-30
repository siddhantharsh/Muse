// ============================================================
// Muse — Number Field
// Lets people type freely and commits a clamped whole number on
// blur/Enter. (Clamping on every keystroke makes some values
// impossible to type: "120" would go 1 → 5 → 52 → 520.)
// ============================================================

import React, { useEffect, useRef, useState } from 'react';

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export function NumberField({ value, min, max, step = 1, onCommit, className, id, ...rest }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  // Escape cancels: the blur that follows must not commit the stale draft.
  const cancelling = useRef(false);

  // Follow outside changes (another device, a reset) while not being edited.
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    if (cancelling.current) {
      cancelling.current = false;
      setDraft(String(value));
      return;
    }
    const parsed = Math.round(Number(draft));
    const next = Number.isFinite(parsed) && draft.trim() !== '' ? Math.min(max, Math.max(min, parsed)) : value;
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          // Cancel just this edit; don't let Escape also close the window.
          e.stopPropagation();
          cancelling.current = true;
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
      aria-label={rest['aria-label']}
      data-dirty={String(draft !== String(value))}
    />
  );
}
