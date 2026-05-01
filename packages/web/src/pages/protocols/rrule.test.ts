import { describe, expect, it } from 'vitest';
import { describeRrule, recognizeRrule, rrulePresetToString } from './rrule';

describe('rrule helpers', () => {
  it('round-trips daily and MWF presets', () => {
    expect(rrulePresetToString({ kind: 'daily' })).toBe('FREQ=DAILY');
    expect(recognizeRrule('FREQ=DAILY')).toEqual({ kind: 'daily' });

    expect(rrulePresetToString({ kind: 'mwf' })).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR');
    expect(recognizeRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual({ kind: 'mwf' });
  });

  it('round-trips weekly_one and every_n_days', () => {
    expect(rrulePresetToString({ kind: 'weekly_one', byday: 'WE' })).toBe(
      'FREQ=WEEKLY;BYDAY=WE',
    );
    expect(recognizeRrule('FREQ=WEEKLY;BYDAY=WE')).toEqual({ kind: 'weekly_one', byday: 'WE' });

    expect(rrulePresetToString({ kind: 'every_n_days', n: 3 })).toBe('FREQ=DAILY;INTERVAL=3');
    expect(recognizeRrule('FREQ=DAILY;INTERVAL=3')).toEqual({ kind: 'every_n_days', n: 3 });
  });

  it('falls back to custom for unrecognized input', () => {
    const out = recognizeRrule('FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25');
    expect(out.kind).toBe('custom');
  });

  it('describeRrule produces a readable label', () => {
    expect(describeRrule('FREQ=DAILY')).toBe('Every day');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe('Mon / Wed / Fri');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=TU,TH')).toBe('Tue / Thu');
    expect(describeRrule('FREQ=WEEKLY;BYDAY=WE')).toBe('Weekly on Wednesday');
    expect(describeRrule('FREQ=DAILY;INTERVAL=3')).toBe('Every 3 days');
  });
});
