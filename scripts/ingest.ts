/**
 * Sweden Crop Nutrients MCP — Data Ingestion Script
 *
 * TODO: Replace with Sweden-specific data sources.
 * See the UK implementation (uk-crop-nutrients-mcp) for the reference pattern.
 *
 * Usage: npm run ingest
 */

import { createDatabase } from '../src/db.js';
import { mkdirSync, writeFileSync } from 'fs';

mkdirSync('data', { recursive: true });
const db = createDatabase('data/database.db');

const now = new Date().toISOString().split('T')[0];

// TODO: Add Sweden-specific data here.
// Follow the same patterns as the UK implementation:
// 1. Define data arrays (crops, soil types, recommendations, etc.)
// 2. Insert into database tables
// 3. Build FTS5 search index
// 4. Update db_metadata

console.log('TODO: Add Sweden-specific data to this ingestion script.');
console.log('See uk-crop-nutrients-mcp/scripts/ingest.ts for the reference pattern.');

db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [now]);
db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('build_date', ?)", [now]);

writeFileSync('data/coverage.json', JSON.stringify({
  mcp_name: 'Sweden Crop Nutrients MCP',
  jurisdiction: 'SE',
  build_date: now,
  status: 'template — data not yet populated',
}, null, 2));

db.close();
console.log('Skeleton database created. Populate scripts/ingest.ts with real data.');
