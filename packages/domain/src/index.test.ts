import { describe, expect, it } from 'vitest';
import { DOMAIN_VERSION } from './index.js';

describe('domain scaffold', () => {
  it('exports a version', () => {
    expect(DOMAIN_VERSION).toBe('0.0.0');
  });
});
