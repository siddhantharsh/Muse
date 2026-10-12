// ============================================================
// Muse — Animated ASCII cat logo
// Four frames: the cat dances while the "m" above its head turns
// like a coin (m, edge-on, m, edge-on). A still frame is shown when
// the system asks for reduced motion.
// ============================================================

import React, { useEffect, useState } from 'react';

export const CAT_FRAMES: string[][] = [
  ["        m", "      Λ___Λ", "     (´•ω•`)", "   ((⊂      ⊃", "   ((⊂ ,,,  /\"", "       (_/,,"],
  ["        |", "      ∩.___Λ", "      ||•ω•`)", "      /    ,⊃", "    (((  ,,_,⊃\"", "        \\_),,"],
  ["        m", "      Λ___Λ\"", "     (´•ω• )", "   (⊂,    ⊃\"", "   ((⊂,,,_,, )", "         (_/,"],
  ["        |", "      Λ___.∩", "     (´•ω•||", "     ⊂,    \\", "   \"⊂,_,,  )))", "     ,,(_/"],
];

/** Just the m, ears and face — for slim headers. */
export const CAT_FRAMES_MINI: string[][] = [
  ["   m", " Λ___Λ", "(´•ω•`)"],
  ["   |", " ∩.___Λ", " ||•ω•`)"],
  ["   m", " Λ___Λ\"", "(´•ω• )"],
  ["   |", " Λ___.∩", "(´•ω•||"],
];

const FRAME_MS = 240;

/** Widest row across all frames, so text beside the logo never shifts. */
const widthOf = (frames: string[][]) => Math.max(...frames.flat().map((r) => [...r].length));
const FULL_COLS = widthOf(CAT_FRAMES);
const MINI_COLS = widthOf(CAT_FRAMES_MINI);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** One row, with the m, mouth, motion lines and fur picked out in theme colours. */
function Row({ row, index }: { row: string; index: number }) {
  if (index === 0) return <span className="text-nord8 font-bold">{row}</span>;
  const lead = row.match(/^(\s*)(\(\(+)/);
  const trail = row.match(/(\)\)+)(\s*)$/);
  const from = lead ? lead[0].length : 0;
  const to = trail && trail.index! >= from ? trail.index! : row.length;
  return (
    <>
      {lead && (
        <>
          {lead[1]}
          <span className="text-nord3">{lead[2]}</span>
        </>
      )}
      {[...row.slice(from, to)].map((c, i) =>
        c === 'ω' ? (
          <span key={i} className="text-nord15">ω</span>
        ) : c === ',' || c === '"' ? (
          <span key={i} className="text-nord4">{c}</span>
        ) : (
          c
        )
      )}
      {trail && trail.index! >= from && <span className="text-nord3">{trail[1]}</span>}
    </>
  );
}

export function CatLogo({
  variant = 'full',
  className = '',
}: {
  variant?: 'full' | 'mini';
  className?: string;
}) {
  const frames = variant === 'mini' ? CAT_FRAMES_MINI : CAT_FRAMES;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % frames.length), FRAME_MS);
    return () => window.clearInterval(id);
  }, [frames.length]);

  return (
    <pre
      role="img"
      aria-label="Muse"
      className={`font-mono text-nord6 leading-[1.05] select-none m-0 flex-shrink-0 ${className}`}
      style={{ width: `${variant === 'mini' ? MINI_COLS : FULL_COLS}ch` }}
    >
      {frames[frame].map((row, i) => (
        <React.Fragment key={i}>
          <Row row={row} index={i} />
          {i < frames[frame].length - 1 && '\n'}
        </React.Fragment>
      ))}
    </pre>
  );
}
