// ============================================================
// Muse — Keep a floating window fully on screen when it opens
// The opening position comes from the click point, which can sit near the
// bottom or right edge. Once the window has rendered and its real height is
// known, pull it inside the viewport so it never first appears cut off.
// Later drags are left alone.
// ============================================================

import { useLayoutEffect } from 'react';
import { rootViewport } from '../utils/viewport';

const MARGIN = 8;

export function useFitInViewport(
  ref: React.RefObject<HTMLElement>,
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>,
  ready: boolean
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    const vp = rootViewport();
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    setPosition((p) => ({
      x: Math.max(MARGIN, Math.min(p.x, vp.width - width - MARGIN)),
      y: Math.max(MARGIN, Math.min(p.y, vp.height - height - MARGIN)),
    }));
    // Only on first appearance; dragging afterwards is the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}

/** Opening spot for a window with no click point: centred, near the top. */
export function centredOpeningPosition(width: number): { x: number; y: number } {
  const vp = rootViewport();
  return { x: Math.max(MARGIN, (vp.width - width) / 2), y: Math.max(MARGIN, vp.height * 0.12) };
}
