import { describe, expect, it } from 'vitest';
import { cleanCode, newCode, showCode } from './sync';

describe('sync codes', () => {
  it('are 26 unambiguous characters that survive being typed back with dashes or lower case', () => {
    const c = newCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{26}$/);
    expect(cleanCode(showCode(c).toLowerCase())).toBe(c);
    expect(cleanCode(' ' + showCode(c) + ' ')).toBe(c);
  });
  it('reject anything else', () => {
    expect(cleanCode('ABCD')).toBeNull();
    expect(cleanCode('O'.repeat(26))).toBeNull(); // O is not in the alphabet
  });
});
