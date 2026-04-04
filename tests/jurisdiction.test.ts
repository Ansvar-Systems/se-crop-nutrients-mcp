import { describe, test, expect } from 'vitest';
import { validateJurisdiction, SUPPORTED_JURISDICTIONS } from '../src/jurisdiction.js';

describe('jurisdiction validation', () => {
  test('accepts SE', () => {
    const result = validateJurisdiction('SE');
    expect(result).toEqual({ valid: true, jurisdiction: 'SE' });
  });

  test('defaults to SE when undefined', () => {
    const result = validateJurisdiction(undefined);
    expect(result).toEqual({ valid: true, jurisdiction: 'SE' });
  });

  test('rejects unsupported jurisdiction', () => {
    const result = validateJurisdiction('XX');
    expect(result).toHaveProperty('valid', false);
  });

  test('normalises lowercase input', () => {
    const result = validateJurisdiction('se');
    expect(result).toEqual({ valid: true, jurisdiction: 'SE' });
  });

  test('SUPPORTED_JURISDICTIONS contains SE', () => {
    expect(SUPPORTED_JURISDICTIONS).toContain('SE');
  });
});
