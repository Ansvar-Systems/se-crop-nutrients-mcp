import { buildMeta } from '../metadata.js';
import { buildCitation } from '../citation.js';
import { validateJurisdiction } from '../jurisdiction.js';
import type { Database } from '../db.js';

interface SoilArgs {
  soil_type?: string;
  texture?: string;
  jurisdiction?: string;
}

export function handleGetSoilClassification(db: Database, args: SoilArgs) {
  const jv = validateJurisdiction(args.jurisdiction);
  if (!jv.valid) return jv.error;

  if (args.soil_type) {
    const soil = db.get<{
      id: string; name: string; soil_group: number;
      texture: string; drainage_class: string; description: string;
    }>(
      'SELECT * FROM soil_types WHERE id = ? OR LOWER(name) = LOWER(?)',
      [args.soil_type, args.soil_type]
    );

    if (!soil) {
      return { error: 'not_found', message: `Soil type '${args.soil_type}' not found.` };
    }

    return {
      ...soil,
      _meta: buildMeta(),
      _citation: buildCitation(
        `Soil: ${soil.name} (group ${soil.soil_group})`,
        soil.name,
        'get_soil_classification',
        { soil_type: args.soil_type! },
      ),
    };
  }

  if (args.texture) {
    const soils = db.all<{
      id: string; name: string; soil_group: number;
      texture: string; drainage_class: string; description: string;
    }>(
      'SELECT * FROM soil_types WHERE LOWER(texture) = LOWER(?)',
      [args.texture]
    );

    return {
      texture: args.texture,
      results_count: soils.length,
      results: soils,
      _meta: buildMeta(),
      _citation: buildCitation(
        `Soil classification: ${args.texture}`,
        `Soil classification for texture ${args.texture}`,
        'get_soil_classification',
        { texture: args.texture! },
      ),
    };
  }

  // Return all soil types
  const allSoils = db.all<{
    id: string; name: string; soil_group: number;
    texture: string; drainage_class: string;
  }>('SELECT id, name, soil_group, texture, drainage_class FROM soil_types');

  return {
    results_count: allSoils.length,
    results: allSoils,
    _meta: buildMeta(),
    _citation: buildCitation(
      'Soil classification (SE)',
      'Soil classification overview',
      'get_soil_classification',
      {},
    ),
  };
}
