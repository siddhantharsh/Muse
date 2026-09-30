// ============================================================
// Muse — Guided Tour
// Walks a new person through the real interface: each step spotlights
// the element it talks about (found via data-tour attributes). Rendered
// into document.body so its geometry isn't affected by the app's zoom.
// When a target isn't on screen (phones, hidden sidebar) the step shows
// as a centered card instead.
// ============================================================

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';

interface TourStep {
  target?: string;
  title: string;
  body: React.ReactNode;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Muse',
    body: (
      <>
        Muse plans your tasks into your calendar for you. Tell it what needs doing and by when,
        and it finds the time. Here’s the two-minute version.
      </>
    ),
  },
  {
    target: 'quick-capture',
    title: 'Add a task',
    body: (
      <>
        Type what needs doing and press <Kbd>Enter</Kbd>. Muse gives it a slot in your free time
        straight away. Open it later to add a due date or duration.
      </>
    ),
  },
  {
    target: 'calendar',
    title: 'Your week, planned',
    body: (
      <>
        Events are fixed. Tasks are placed into the gaps around them, ordered by urgency,
        priority, deadline and dependencies. Double-click empty time to add something at an
        exact spot, or drag a task block to pin it there.
      </>
    ),
  },
  {
    title: 'Every task has a few dials',
    body: (
      <>
        <p>Click any task to open it. The ones that shape your plan:</p>
        <ul className="mt-2 space-y-1.5">
          <Dial name="Duration & due date">how much time it needs, and by when</Dial>
          <Dial name="Priority">wins the slot when two tasks compete</Dial>
          <Dial name="Splittable">lets long work spread across several gaps</Dial>
          <Dial name="Depends on">never scheduled before another task</Dial>
          <Dial name="Repeat">daily, weekly, monthly habits and chores</Dial>
        </ul>
      </>
    ),
  },
  {
    title: 'Colors tell you if it fits',
    body: (
      <ul className="space-y-2">
        <Swatch color="#A3BE8C" label="On track">scheduled with room to spare</Swatch>
        <Swatch color="#D08770" label="Tight">fits, but with little slack before the deadline</Swatch>
        <Swatch color="#BF616A" label="At risk">overdue, won’t fit, or blocked by another task</Swatch>
      </ul>
    ),
  },
  {
    target: 'recalculate',
    title: 'Plans change. Muse keeps up.',
    body: (
      <>
        Every edit re-plans automatically, and unfinished work rolls forward as time passes.
        Press <Kbd>R</Kbd> or this button to re-plan from right now.
      </>
    ),
  },
  {
    target: 'nav',
    title: 'Tasks, inbox and missed',
    body: (
      <>
        <b className="text-nord6">Tasks</b> lists everything by day. <b className="text-nord6">Inbox</b> holds
        ideas that aren’t ready to schedule. <b className="text-nord6">Missed</b> collects anything that slipped
        past its deadline so you can decide what happens next.
      </>
    ),
  },
  {
    target: 'settings',
    title: 'Set your hours',
    body: (
      <>
        In Settings → Scheduling Hours, choose when work may be scheduled (say, weekdays 9–5, or
        a separate “Deep work” window), and pick Balanced or Front-load planning.
      </>
    ),
  },
  {
    title: 'Everything is one shortcut away',
    body: (
      <>
        Press <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd> <Kbd>K</Kbd> to create, jump anywhere, or re-plan
        without touching the mouse. You can replay this tour from there too.
      </>
    ),
  },
];

const PAD = 8;
const CARD_W = 360;
const MARGIN = 16;

export function Tutorial() {
  const closeTutorial = useMuseStore((s) => s.closeTutorial);
  const addExampleTasks = useMuseStore((s) => s.addExampleTasks);
  const setSidebarOpen = useMuseStore((s) => s.setSidebarOpen);

  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const isFinal = index === STEPS.length;
  const step = isFinal ? null : STEPS[index];

  // Make sure the sidebar the tour points at is actually open (desktop).
  useEffect(() => {
    if (window.innerWidth > 768) setSidebarOpen(true);
  }, [setSidebarOpen]);

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    const r = el?.getBoundingClientRect();
    const visible =
      r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < window.innerHeight && r.left < window.innerWidth;
    setRect(visible ? r : null);
  }, [step]);

  useLayoutEffect(() => {
    measure();
    // Re-measure once layout settles (e.g. the sidebar just opened).
    const settle = setTimeout(measure, 120);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
    primaryRef.current?.focus();
  }, [index, rect]);

  const next = useCallback(() => setIndex((i) => Math.min(STEPS.length, i + 1)), []);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const finish = useCallback(
    (withExamples: boolean) => {
      if (withExamples) addExampleTasks();
      closeTutorial();
      if (!withExamples) {
        // Hand straight over to the quick-capture box.
        setTimeout(() => {
          document.querySelector<HTMLInputElement>('[data-tour="quick-capture"] input')?.focus();
        }, 50);
      }
    },
    [addExampleTasks, closeTutorial]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTutorial();
      } else if (e.key === 'ArrowRight' && !isFinal) {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeTutorial, next, back, isFinal]);

  // ---- Card placement: beside the target if it fits, else below/above, else centered ----
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardWidth = Math.min(CARD_W, vw - MARGIN * 2);
  let cardStyle: React.CSSProperties;

  if (rect) {
    const spaceRight = vw - rect.right;
    const spaceLeft = rect.left;
    const clampTop = (top: number) => Math.max(MARGIN, Math.min(top, vh - cardHeight - MARGIN));
    const clampLeft = (left: number) => Math.max(MARGIN, Math.min(left, vw - cardWidth - MARGIN));

    if (spaceRight >= cardWidth + MARGIN * 2) {
      cardStyle = { left: rect.right + PAD + MARGIN, top: clampTop(rect.top) };
    } else if (spaceLeft >= cardWidth + MARGIN * 2) {
      cardStyle = { left: rect.left - PAD - MARGIN - cardWidth, top: clampTop(rect.top) };
    } else if (vh - rect.bottom >= cardHeight + MARGIN * 2) {
      cardStyle = { left: clampLeft(rect.left), top: rect.bottom + PAD + MARGIN };
    } else if (rect.top >= cardHeight + MARGIN * 2) {
      cardStyle = { left: clampLeft(rect.left), top: rect.top - PAD - MARGIN - cardHeight };
    } else {
      // Target fills the screen (e.g. the calendar) — sit in its lower-right corner.
      cardStyle = { left: clampLeft(vw - cardWidth - MARGIN * 2), top: clampTop(vh - cardHeight - MARGIN * 3) };
    }
  } else {
    cardStyle = { left: (vw - cardWidth) / 2, top: Math.max(MARGIN, (vh - cardHeight) / 2) };
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] font-mono" style={{ fontSize: 14 }}>
      {/* Click shield: the app underneath stays still during the tour */}
      <div className="absolute inset-0" aria-hidden="true" />

      {rect ? (
        <div
          aria-hidden="true"
          className="absolute pointer-events-none transition-all duration-300 ease-out"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(15, 18, 24, 0.72)',
            outline: '2px solid #88C0D0',
            outlineOffset: 0,
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'rgba(15, 18, 24, 0.72)' }} />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute bg-nord1 border border-nord3 floating-modal animate-scale-in"
        style={{ ...cardStyle, width: cardWidth }}
      >
        <div className="flex items-center justify-between px-5 pt-4">
          <span className="text-[11px] uppercase tracking-widest text-nord8 font-semibold">
            {isFinal ? 'Ready' : `Step ${index + 1} of ${STEPS.length}`}
          </span>
          <button
            onClick={closeTutorial}
            className="p-1 text-nord4 hover:text-nord6 hover:bg-nord2 transition-colors"
            aria-label="Skip tour"
          >
            <X size={14} />
          </button>
        </div>

        {step ? (
          <>
            <div className="px-5 pt-2 pb-4">
              <h2 id="tour-title" className="text-base font-bold text-nord6 leading-snug">
                {step.title}
              </h2>
              <div className="mt-2 text-[13px] leading-relaxed text-nord4">{step.body}</div>
            </div>

            <div className="flex items-center gap-1 px-5 pb-3" aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 transition-colors ${i <= index ? 'bg-nord8' : 'bg-nord3/60'}`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-t border-nord3/60">
              <button
                onClick={index === 0 ? closeTutorial : back}
                className="flex items-center gap-1 text-xs text-nord4 hover:text-nord6 transition-colors"
              >
                {index === 0 ? (
                  'Skip tour'
                ) : (
                  <>
                    <ArrowLeft size={12} /> Back
                  </>
                )}
              </button>
              <button ref={primaryRef} onClick={next} className="btn-primary flex items-center gap-1.5">
                {index === 0 ? 'Show me' : 'Next'} <ArrowRight size={12} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pt-2 pb-5">
              <h2 id="tour-title" className="text-base font-bold text-nord6 leading-snug">
                You’re set.
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-nord4">
                Want to see the planner work first? Muse can add three linked example tasks — a
                splittable one, one that depends on it, and a quick one due tomorrow — and schedule
                them right now. Delete them whenever you like.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-5 pb-5">
              <button
                ref={primaryRef}
                onClick={() => finish(true)}
                className="btn-primary flex items-center justify-center gap-2 py-2.5"
              >
                <Sparkles size={13} /> Add example tasks
              </button>
              <button onClick={() => finish(false)} className="btn-secondary py-2.5">
                Start with an empty calendar
              </button>
              <button
                onClick={back}
                className="flex items-center justify-center gap-1 pt-1 text-xs text-nord4 hover:text-nord6 transition-colors"
              >
                <ArrowLeft size={12} /> Back
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-px mx-0.5 bg-nord0 border border-nord3 text-[11px] text-nord6 font-mono">
      {children}
    </kbd>
  );
}

function Dial({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="text-nord8 flex-shrink-0">›</span>
      <span>
        <b className="text-nord6 font-semibold">{name}</b> — {children}
      </span>
    </li>
  );
}

function Swatch({ color, label, children }: { color: string; label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-1 w-3 h-3 flex-shrink-0"
        style={{ background: `${color}33`, borderLeft: `3px solid ${color}` }}
      />
      <span>
        <b className="font-semibold" style={{ color }}>{label}</b> — {children}
      </span>
    </li>
  );
}
