/**
 * Regenerate data/coverage.json from the current database.
 * Usage: npm run coverage:update
 */

import { createDatabase } from '../src/db.js';
import { writeFileSync } from 'fs';

const db = createDatabase();

const crops = db.get<{ c: number }>('SELECT count(*) as c FROM crops')!.c;
const soils = db.get<{ c: number }>('SELECT count(*) as c FROM soil_types')!.c;
const recs = db.get<{ c: number }>('SELECT count(*) as c FROM nutrient_recommendations')!.c;
const prices = db.get<{ c: number }>('SELECT count(*) as c FROM commodity_prices')!.c;
const fts = db.get<{ c: number }>('SELECT count(*) as c FROM search_index')!.c;
const lastIngest = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['last_ingest']);

db.close();

const coverage = {
  mcp_name: 'UK Crop Nutrients MCP',
  jurisdiction: 'GB',
  build_date: lastIngest?.value ?? new Date().toISOString().split('T')[0],
  crops,
  soil_types: soils,
  nutrient_recommendations: recs,
  commodity_prices: prices,
  fts_entries: fts,
};

writeFileSync('data/coverage.json', JSON.stringify(coverage, null, 2));
console.log('Updated data/coverage.json:', coverage);
