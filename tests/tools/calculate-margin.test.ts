import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleCalculateMargin } from '../../src/tools/calculate-margin.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-calc-margin.db';

describe('calculate_margin tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('calculates gross margin using DB price', () => {
    const result = handleCalculateMargin(db, { crop: 'spring-barley', yield_t_ha: 5.0 });
    expect(result).toHaveProperty('revenue_per_ha');
    // 5.0 * 1850.0 = 9250.00
    expect((result as { revenue_per_ha: number }).revenue_per_ha).toBe(9250);
    expect((result as { price_source: string }).price_source).toBe('jordbruksverket_market');
  });

  test('uses provided price when given', () => {
    const result = handleCalculateMargin(db, { crop: 'spring-barley', yield_t_ha: 5.0, price_per_tonne: 2000 });
    // 5.0 * 2000 = 10000
    expect((result as { revenue_per_ha: number }).revenue_per_ha).toBe(10000);
    expect((result as { price_source: string }).price_source).toBe('user_provided');
  });

  test('returns error when no price data and no override', () => {
    const result = handleCalculateMargin(db, { crop: 'turnips', yield_t_ha: 30 });
    expect(result).toHaveProperty('error', 'no_price_data');
  });

  test('subtracts input costs', () => {
    const result = handleCalculateMargin(db, { crop: 'winter-wheat', yield_t_ha: 7.5, input_costs: 5000 });
    // 7.5 * 2150 = 16125, 16125 - 5000 = 11125
    expect((result as { gross_margin_per_ha: number }).gross_margin_per_ha).toBe(11125);
  });
});
