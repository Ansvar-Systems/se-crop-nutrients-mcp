import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleGetSoilClassification } from '../../src/tools/get-soil-classification.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-soil-class.db';

describe('get_soil_classification tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns soil by ID', () => {
    const result = handleGetSoilClassification(db, { soil_type: 'styv-lera' }) as Record<string, unknown>;
    expect(result.name).toBe('Styv lera');
    expect(result.soil_group).toBe(3);
    expect(result.texture).toBe('lera');
  });

  test('returns soils by texture', () => {
    const result = handleGetSoilClassification(db, { texture: 'sand' }) as { results_count: number; results: unknown[] };
    expect(result.results_count).toBeGreaterThan(0);
  });

  test('returns all soils when no params', () => {
    const result = handleGetSoilClassification(db, {}) as { results_count: number };
    expect(result.results_count).toBe(3);
  });

  test('returns not_found for unknown soil type', () => {
    const result = handleGetSoilClassification(db, { soil_type: 'volcanic' });
    expect(result).toHaveProperty('error', 'not_found');
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleGetSoilClassification(db, { soil_type: 'styv-lera', jurisdiction: 'GB' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
