import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { handleGetCropDetails } from '../../src/tools/get-crop-details.js';
import { createSeededDatabase } from '../helpers/seed-db.js';
import type { Database } from '../../src/db.js';
import { existsSync, unlinkSync } from 'fs';

const TEST_DB = 'tests/test-crop-details.db';

describe('get_crop_details tool', () => {
  let db: Database;

  beforeAll(() => {
    db = createSeededDatabase(TEST_DB);
  });

  afterAll(() => {
    db.close();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
  });

  test('returns crop by ID', () => {
    const result = handleGetCropDetails(db, { crop: 'winter-wheat' }) as Record<string, unknown>;
    expect(result.name).toBe('Höstvete');
    expect(result.crop_group).toBe('cereals');
    expect(result.typical_yield_t_ha).toBe(7.5);
  });

  test('returns nutrient offtake breakdown', () => {
    const result = handleGetCropDetails(db, { crop: 'winter-wheat' }) as Record<string, unknown>;
    const offtake = result.nutrient_offtake as Record<string, unknown>;
    expect(offtake.nitrogen).toBe(180);
    expect(offtake.phosphate_p2o5).toBe(65);
    expect(offtake.potash_k2o).toBe(44);
  });

  test('returns growth stages as array', () => {
    const result = handleGetCropDetails(db, { crop: 'winter-wheat' }) as Record<string, unknown>;
    expect(Array.isArray(result.growth_stages)).toBe(true);
    expect((result.growth_stages as string[]).length).toBeGreaterThan(0);
  });

  test('returns not_found for unknown crop', () => {
    const result = handleGetCropDetails(db, { crop: 'unknown-crop' });
    expect(result).toHaveProperty('error', 'not_found');
  });

  test('rejects unsupported jurisdiction', () => {
    const result = handleGetCropDetails(db, { crop: 'winter-wheat', jurisdiction: 'GB' });
    expect(result).toHaveProperty('error', 'jurisdiction_not_supported');
  });
});
