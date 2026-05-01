// Pure adherence calculation. Adherence = logged ÷ (logged + missed + skipped)
// inside a window. Pending schedules whose `scheduledFor` is still in the
// future are excluded — we don't grade work that hasn't been due yet.
//
// We deliberately don't include any clinical interpretation. The number is
// "what fraction of due doses got logged" and that's it. No good/bad label.

import type { DoseLog, DoseSchedule } from '@/db';

export interface AdherenceInput {
  readonly schedules: readonly DoseSchedule[];
  readonly logs: readonly DoseLog[];
  readonly now: Date;
  readonly windowDays: number;
}

export interface AdherenceResult {
  /** 0..1 fraction. Null when there are no due doses in the window. */
  readonly rate: number | null;
  readonly logged: number;
  readonly skipped: number;
  readonly missed: number;
  /** Total schedules that have come due in the window. */
  readonly due: number;
  /** Sample size for tiny windows: <5 due → low confidence. */
  readonly lowConfidence: boolean;
}

export function computeAdherence(input: AdherenceInput): AdherenceResult {
  const { schedules, now, windowDays } = input;
  const start = new Date(now.getTime() - windowDays * 24 * 3600_000).toISOString();
  const nowIso = now.toISOString();

  let logged = 0;
  let skipped = 0;
  let missed = 0;

  for (const s of schedules) {
    if (s.deletedAt) continue;
    if (s.scheduledFor < start) continue;
    // Pending schedules whose scheduledFor is still in the future don't
    // count — they aren't due yet.
    if (s.status === 'pending' && s.scheduledFor > nowIso) continue;
    switch (s.status) {
      case 'logged':
        logged += 1;
        break;
      case 'skipped':
        skipped += 1;
        break;
      case 'missed':
      case 'pending': // pending + past = effectively missed
        missed += 1;
        break;
    }
  }

  const due = logged + skipped + missed;
  const rate = due === 0 ? null : logged / due;
  return { rate, logged, skipped, missed, due, lowConfidence: due < 5 };
}

/** Daily counts for a per-day adherence sparkline. */
export interface DailyAdherencePoint {
  readonly date: string; // YYYY-MM-DD (local)
  readonly logged: number;
  readonly due: number;
}

export function dailyAdherence(input: AdherenceInput): DailyAdherencePoint[] {
  const { schedules, now, windowDays } = input;
  const buckets = new Map<string, { logged: number; due: number }>();

  for (let d = windowDays - 1; d >= 0; d -= 1) {
    const day = new Date(now.getTime() - d * 24 * 3600_000);
    buckets.set(localDateKey(day), { logged: 0, due: 0 });
  }
  const minKey = localDateKey(new Date(now.getTime() - (windowDays - 1) * 24 * 3600_000));

  for (const s of schedules) {
    if (s.deletedAt) continue;
    const key = localDateKey(new Date(s.scheduledFor));
    if (key < minKey) continue;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (s.status === 'pending' && s.scheduledFor > now.toISOString()) continue;
    bucket.due += 1;
    if (s.status === 'logged') bucket.logged += 1;
  }

  return Array.from(buckets.entries())
    .map(([date, b]) => ({ date, logged: b.logged, due: b.due }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function localDateKey(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
