// ============================================================
// Muse — Repeat Options (shared by task and event editors)
// ============================================================

import { RepeatFrequency } from '../types';

// "Custom" stays in the type for old data, but it behaves exactly like
// "daily" — the interval field ("every N days") covers that case.
export const REPEAT_OPTIONS = [
  RepeatFrequency.Daily,
  RepeatFrequency.Weekly,
  RepeatFrequency.Biweekly,
  RepeatFrequency.Monthly,
  RepeatFrequency.Yearly,
];

export const INTERVAL_UNIT: Record<RepeatFrequency, string> = {
  [RepeatFrequency.Daily]: 'day(s)',
  [RepeatFrequency.Custom]: 'day(s)',
  [RepeatFrequency.Weekly]: 'week(s)',
  [RepeatFrequency.Biweekly]: '× 2 weeks',
  [RepeatFrequency.Monthly]: 'month(s)',
  [RepeatFrequency.Yearly]: 'year(s)',
};
