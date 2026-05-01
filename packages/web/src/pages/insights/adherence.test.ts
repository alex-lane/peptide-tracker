import { describe, expect, it } from 'vitest';
import { computeAdherence, dailyAdherence } from './adherence';
import type { DoseSchedule } from '@/db';

const NOW = new Date('2026-05-01T12:00:00.000Z');

function makeSchedule(over: Partial<DoseSchedule>): DoseSchedule {
  return {
    id: 's1',
    householdId: 'hh',
    userId: 'u1',
    itemId: 'p1',
    scheduledFor: '2026-04-30T08:00:00.000Z',
    doseAmount: 250,
    doseUnit: 'mcg',
    method: 'subq',
    status: 'pending',
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    version: 0,
    ...over,
  };
}

describe('computeAdherence', () => {
  it('returns null rate when no due schedules in window', () => {
    const out = computeAdherence({
      schedules: [],
      logs: [],
      now: NOW,
      windowDays: 30,
    });
    expect(out.rate).toBeNull();
    expect(out.due).toBe(0);
  });

  it('counts logged + skipped + missed in the window', () => {
    const schedules: DoseSchedule[] = [
      makeSchedule({ id: '1', status: 'logged', scheduledFor: '2026-04-25T08:00:00Z' }),
      makeSchedule({ id: '2', status: 'logged', scheduledFor: '2026-04-26T08:00:00Z' }),
      makeSchedule({ id: '3', status: 'logged', scheduledFor: '2026-04-27T08:00:00Z' }),
      makeSchedule({ id: '4', status: 'missed', scheduledFor: '2026-04-28T08:00:00Z' }),
      makeSchedule({ id: '5', status: 'skipped', scheduledFor: '2026-04-29T08:00:00Z' }),
    ];
    const out = computeAdherence({ schedules, logs: [], now: NOW, windowDays: 30 });
    expect(out.due).toBe(5);
    expect(out.logged).toBe(3);
    expect(out.skipped).toBe(1);
    expect(out.missed).toBe(1);
    expect(out.rate).toBeCloseTo(0.6, 5);
  });

  it('treats past-due pending as missed', () => {
    const schedules: DoseSchedule[] = [
      makeSchedule({ id: '1', status: 'pending', scheduledFor: '2026-04-29T08:00:00Z' }),
    ];
    const out = computeAdherence({ schedules, logs: [], now: NOW, windowDays: 30 });
    expect(out.missed).toBe(1);
    expect(out.due).toBe(1);
    expect(out.rate).toBe(0);
  });

  it('excludes future pending schedules from "due"', () => {
    const schedules: DoseSchedule[] = [
      makeSchedule({ id: '1', status: 'pending', scheduledFor: '2026-05-02T08:00:00Z' }),
    ];
    const out = computeAdherence({ schedules, logs: [], now: NOW, windowDays: 30 });
    expect(out.due).toBe(0);
    expect(out.rate).toBeNull();
  });

  it('excludes schedules outside the window', () => {
    const schedules: DoseSchedule[] = [
      makeSchedule({ id: '1', status: 'logged', scheduledFor: '2026-01-01T08:00:00Z' }),
    ];
    const out = computeAdherence({ schedules, logs: [], now: NOW, windowDays: 30 });
    expect(out.due).toBe(0);
  });

  it('flags low confidence when < 5 due doses', () => {
    const schedules: DoseSchedule[] = [
      makeSchedule({ id: '1', status: 'logged', scheduledFor: '2026-04-30T08:00:00Z' }),
    ];
    const out = computeAdherence({ schedules, logs: [], now: NOW, windowDays: 30 });
    expect(out.lowConfidence).toBe(true);
  });
});

describe('dailyAdherence', () => {
  it('emits one bucket per day in the window', () => {
    const out = dailyAdherence({
      schedules: [],
      logs: [],
      now: NOW,
      windowDays: 7,
    });
    expect(out).toHaveLength(7);
  });

  it('counts logged + due per local day', () => {
    const schedules: DoseSchedule[] = [
      makeSchedule({ id: '1', status: 'logged', scheduledFor: '2026-04-29T08:00:00Z' }),
      makeSchedule({ id: '2', status: 'missed', scheduledFor: '2026-04-29T20:00:00Z' }),
      makeSchedule({ id: '3', status: 'logged', scheduledFor: '2026-04-30T08:00:00Z' }),
    ];
    const out = dailyAdherence({ schedules, logs: [], now: NOW, windowDays: 7 });
    const apr29 = out.find((b) => b.date === '2026-04-29');
    const apr30 = out.find((b) => b.date === '2026-04-30');
    expect(apr29).toEqual({ date: '2026-04-29', logged: 1, due: 2 });
    expect(apr30).toEqual({ date: '2026-04-30', logged: 1, due: 1 });
  });
});
