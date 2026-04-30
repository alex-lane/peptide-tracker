import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, nextStatusOptions } from './status-machine';

describe('canTransition', () => {
  it('allows the documented transitions', () => {
    expect(canTransition('sealed', 'reconstituted')).toBe(true);
    expect(canTransition('sealed', 'in_use')).toBe(true);
    expect(canTransition('reconstituted', 'in_use')).toBe(true);
    expect(canTransition('reconstituted', 'empty')).toBe(true);
    expect(canTransition('in_use', 'empty')).toBe(true);
    expect(canTransition('expired', 'discarded')).toBe(true);
  });

  it('rejects no-op transitions', () => {
    expect(canTransition('sealed', 'sealed')).toBe(false);
    expect(canTransition('in_use', 'in_use')).toBe(false);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('empty', 'in_use')).toBe(false);
    expect(canTransition('discarded', 'sealed')).toBe(false);
    expect(canTransition('reconstituted', 'sealed')).toBe(false);
    expect(canTransition('expired', 'in_use')).toBe(false);
  });

  it('terminal states have no further options', () => {
    expect(nextStatusOptions('empty')).toEqual([]);
    expect(nextStatusOptions('discarded')).toEqual([]);
  });

  it('assertTransition throws on illegal moves', () => {
    expect(() => assertTransition('sealed', 'sealed')).toThrow(/Illegal/);
    expect(() => assertTransition('empty', 'reconstituted')).toThrow(/Illegal/);
    expect(() => assertTransition('sealed', 'reconstituted')).not.toThrow();
  });
});
