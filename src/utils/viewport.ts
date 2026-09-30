// ============================================================
// Muse — Viewport Geometry
// The app shell scales #root with CSS `zoom` on larger screens. Mouse
// coordinates (clientX/Y) and getBoundingClientRect() are in screen
// pixels, while `left`/`top`/heights inside #root are in CSS pixels —
// so every pointer → layout conversion must divide by this scale.
// ============================================================

/** Screen pixels per CSS pixel inside #root (1.2 on desktop, 1 on phones). */
export function getRootScale(): number {
  const root = document.getElementById('root');
  if (!root) return 1;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;width:100px;height:0;';
  root.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  root.removeChild(probe);
  return width > 0 ? width / 100 : 1;
}

/** Screen-pixel distance → CSS pixels inside #root. */
export function toRootPx(screenPx: number, scale = getRootScale()): number {
  return screenPx / scale;
}

/** Viewport size expressed in #root CSS pixels. */
export function rootViewport(scale = getRootScale()): { width: number; height: number } {
  return { width: window.innerWidth / scale, height: window.innerHeight / scale };
}
