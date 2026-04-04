import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleListCrops } from '../../src/tools/list-crops.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-list-crops.db';

describe('list_crops tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('lists all SE crops', () => {
    const result = handleListCrops(db, {}) as { results_count: number; crops: unknown[] };
    expect(result.results_count).toBe(3);
    expect(result.crops.length).toBe(3);
  });

  test('filters by crop group', () => {
    const result = handleListCrops(db, { crop_group: 'cereals' }) as { results_count: number };
    expect(result.results_count).toBe(2);
  });

  test('returns zero for non-existent crop group', () => {
    const result = handleListCrops(db, { crop_group: 'tropical' }) as { results_count: number };
    expect(result.results_count).toBe(0);
  });

  test('defaults to SE jurisdiction', () => {
    const result = handleListCrops(db, {}) as { jurisdiction: string };
    expect(result.jurisdiction).toBe('SE');
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleListCrops(db, { jurisdiction: 'DE' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
