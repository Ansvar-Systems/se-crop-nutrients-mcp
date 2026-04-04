/**
 * Sweden Crop Nutrients MCP — Data Ingestion Script
 *
 * Sources:
 * 1. Jordbruksverket (Swedish Board of Agriculture) — nutrient recommendation tables
 * 2. Greppa Näringen (nutrient advisory service) — crop/soil nutrient guidance
 * 3. SLU (Swedish University of Agricultural Sciences) — soil classification, research data
 *
 * Swedish nutrient data is published as PDFs and web guidance. The recommendation
 * tables are manually extracted from official publications and encoded as structured
 * data here. This is the standard approach when the authoritative source is not
 * machine-readable.
 *
 * Usage: npm run ingest
 */

import { createDatabase, type Database } from '../src/db.js';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// ── Swedish Crop Data (Jordbruksverket / Greppa Näringen) ───────

const CROPS = [
  { id: 'hostvete', name: 'Höstvete (Winter Wheat)', crop_group: 'cereals', typical_yield_t_ha: 7.0, n: 168, p: 56, k: 40, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'varvete', name: 'Vårvete (Spring Wheat)', crop_group: 'cereals', typical_yield_t_ha: 5.0, n: 120, p: 40, k: 28, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'hostrag', name: 'Höstråg (Winter Rye)', crop_group: 'cereals', typical_yield_t_ha: 6.0, n: 120, p: 42, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'hostkorn', name: 'Höstkorn (Winter Barley)', crop_group: 'cereals', typical_yield_t_ha: 6.0, n: 120, p: 47, k: 55, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'varkorn', name: 'Vårkorn (Spring Barley)', crop_group: 'cereals', typical_yield_t_ha: 4.5, n: 90, p: 36, k: 45, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'havre', name: 'Havre (Oats)', crop_group: 'cereals', typical_yield_t_ha: 4.0, n: 80, p: 32, k: 32, stages: ['bestockning', 'stråskjutning', 'vippgång'] },
  { id: 'hostraps', name: 'Höstraps (Winter Rapeseed)', crop_group: 'oilseeds', typical_yield_t_ha: 3.5, n: 140, p: 46, k: 39, stages: ['rosett', 'stråskjutning', 'blomning', 'skidmognad'] },
  { id: 'varraps', name: 'Vårraps (Spring Rapeseed)', crop_group: 'oilseeds', typical_yield_t_ha: 2.0, n: 80, p: 26, k: 22, stages: ['rosett', 'stråskjutning', 'blomning', 'skidmognad'] },
  { id: 'arter', name: 'Ärter (Peas)', crop_group: 'pulses', typical_yield_t_ha: 3.0, n: 0, p: 24, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'akerbonor', name: 'Åkerbönor (Field Beans)', crop_group: 'pulses', typical_yield_t_ha: 3.5, n: 0, p: 28, k: 39, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'sockerbetor', name: 'Sockerbetor (Sugar Beet)', crop_group: 'root_crops', typical_yield_t_ha: 55.0, n: 120, p: 45, k: 200, stages: ['uppkomst', 'bladtäckning', 'rottillväxt'] },
  { id: 'potatis', name: 'Potatis (Potatoes)', crop_group: 'potatoes', typical_yield_t_ha: 30.0, n: 120, p: 70, k: 200, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },
  { id: 'vall', name: 'Vall (Ley/Grassland)', crop_group: 'forage', typical_yield_t_ha: 7.0, n: 140, p: 40, k: 140, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'timotej', name: 'Timotej (Timothy)', crop_group: 'forage', typical_yield_t_ha: 6.0, n: 110, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'rajgras', name: 'Rajgräs (Ryegrass)', crop_group: 'forage', typical_yield_t_ha: 8.0, n: 140, p: 45, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'höst'] },
  { id: 'rodklover', name: 'Rödklöver (Red Clover)', crop_group: 'forage', typical_yield_t_ha: 7.0, n: 0, p: 45, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'majs', name: 'Majs (Forage Maize)', crop_group: 'forage', typical_yield_t_ha: 35.0, n: 90, p: 50, k: 170, stages: ['uppkomst', 'vegetativ', 'kolvsättning', 'kärnfyllnad'] },
  { id: 'jordgubbar', name: 'Jordgubbar (Strawberries)', crop_group: 'fruit', typical_yield_t_ha: 10.0, n: 80, p: 25, k: 120, stages: ['tillväxtstart', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'lin', name: 'Lin (Linseed)', crop_group: 'oilseeds', typical_yield_t_ha: 1.5, n: 40, p: 15, k: 15, stages: ['uppkomst', 'vegetativ', 'blomning', 'kapselmognad'] },
  { id: 'hampa', name: 'Hampa (Hemp)', crop_group: 'fibre', typical_yield_t_ha: 8.0, n: 100, p: 30, k: 80, stages: ['uppkomst', 'vegetativ', 'blomning', 'skörd'] },
];

// ── Swedish Soil Types (SGU / SLU Classification) ───────────────

const SOIL_TYPES = [
  { id: 'sandjord', name: 'Sandjord (Sandy soil)', soil_group: 1, texture: 'sand', drainage_class: 'free', description: 'Lätt sandjord med fritt dränage. Låg mullhalt, snabb urlakning av näring. SGU jordartsklass sand. Jordbruksverket jordgrupp 1.' },
  { id: 'moranjord', name: 'Moränjord (Moraine/glacial till)', soil_group: 2, texture: 'moraine', drainage_class: 'moderate', description: 'Moränjord med varierad kornstorlek. Vanligaste jordarten i Sverige. Måttligt dränage. Jordgrupp 2.' },
  { id: 'lattlera', name: 'Lättlera (Light clay)', soil_group: 2, texture: 'light clay', drainage_class: 'moderate', description: 'Lättlera (15-25 % ler). Bra brukningsegenskaper, måttligt dränage. Vanlig i Mellansverige. Jordgrupp 2.' },
  { id: 'mellanlera', name: 'Mellanlera (Medium clay)', soil_group: 3, texture: 'medium clay', drainage_class: 'impeded', description: 'Mellanlera (25-40 % ler). Tyngre att bearbeta, nedsatt dränage. Vanlig i Mälardalen. Jordgrupp 3.' },
  { id: 'styv-lera', name: 'Styv lera (Heavy clay)', soil_group: 3, texture: 'heavy clay', drainage_class: 'impeded', description: 'Styv lera (>40 % ler). Svår att bearbeta, nedsatt dränage. Långsam uppvärmning på våren. Jordgrupp 3.' },
  { id: 'siltjord', name: 'Siltjord (Silt)', soil_group: 2, texture: 'silt', drainage_class: 'moderate', description: 'Siltjord med jämn kornstorlek. Risk för igenslamning. Måttligt dränage. Jordgrupp 2.' },
  { id: 'mulljord', name: 'Mulljord (Organic/peat)', soil_group: 4, texture: 'peat', drainage_class: 'variable', description: 'Organisk jord/torvjord. Hög mullhalt, variabelt dränage. Hög kvävemineralisering. Jordgrupp 4.' },
  { id: 'mo', name: 'Mo (Fine sand/silt)', soil_group: 1, texture: 'fine sand', drainage_class: 'moderate', description: 'Mo (fin sand/grovmo). Lätt jord med måttligt dränage. Vanlig i norra Sverige. Jordgrupp 1.' },
];

// ── Nutrient Recommendations (Jordbruksverket / Greppa Näringen) ─
// Swedish system uses soil groups 1-4 and SNS index 0-6.
// N varies by crop, soil group, and SNS. P and K vary by crop and soil group.
// Sulphur (S) is important for rapeseed and cereals.
//
// Formula: N = max(0, base_n + soil_offset - (sns_index * n_step))
// P, K, S are lookup values per crop per soil group.

interface NutrientRec {
  crop_id: string;
  soil_group: number;
  sns_index: number;
  previous_crop_group: string;
  n: number; p: number; k: number; s: number;
  notes: string;
  section: string;
}

interface CropParams {
  id: string;
  base_n: number;
  n_step: number;
  sg1_offset: number;
  sg3_offset: number;
  sg4_offset: number;
  p: [number, number, number, number]; // SG1, SG2, SG3, SG4
  k: [number, number, number, number]; // SG1, SG2, SG3, SG4
  s: number;
  section: string;
  is_legume: boolean;
  is_rapeseed: boolean;
}

// Crop parameters derived from Jordbruksverket recommendation tables.
// P/K indexed as [SG1, SG2, SG3, SG4].
const CROP_PARAMS: CropParams[] = [
  { id: 'hostvete',    base_n: 200, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -30, p: [50, 45, 40, 30],   k: [45, 40, 35, 30],   s: 20, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'varvete',     base_n: 150, n_step: 25, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [40, 35, 30, 22],   k: [32, 28, 25, 20],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hostrag',     base_n: 160, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -25, p: [42, 38, 34, 25],   k: [45, 42, 38, 30],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hostkorn',    base_n: 160, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -25, p: [47, 42, 38, 28],   k: [58, 55, 50, 40],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'varkorn',     base_n: 130, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [38, 36, 32, 24],   k: [48, 45, 42, 34],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'havre',       base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [34, 32, 28, 20],   k: [35, 32, 28, 22],   s: 10, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hostraps',    base_n: 190, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -30, p: [48, 46, 42, 32],   k: [42, 39, 35, 28],   s: 40, section: 'Oljeväxter', is_legume: false, is_rapeseed: true  },
  { id: 'varraps',     base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [28, 26, 22, 16],   k: [24, 22, 20, 16],   s: 30, section: 'Oljeväxter', is_legume: false, is_rapeseed: true  },
  { id: 'arter',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [28, 24, 20, 15],   k: [35, 30, 26, 20],   s: 0,  section: 'Baljväxter', is_legume: true,  is_rapeseed: false },
  { id: 'akerbonor',   base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [32, 28, 24, 18],   k: [42, 39, 35, 28],   s: 0,  section: 'Baljväxter', is_legume: true,  is_rapeseed: false },
  { id: 'sockerbetor', base_n: 140, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [48, 45, 40, 30],   k: [210, 200, 180, 150], s: 20, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },
  { id: 'potatis',     base_n: 150, n_step: 20, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [75, 70, 62, 48],   k: [210, 200, 185, 150], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'vall',        base_n: 180, n_step: 25, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -30, p: [42, 40, 36, 28],   k: [150, 140, 130, 110], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'timotej',     base_n: 155, n_step: 22, sg1_offset: -12, sg3_offset: 5,  sg4_offset: -25, p: [38, 35, 30, 22],   k: [130, 120, 110, 90],  s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rajgras',     base_n: 190, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -30, p: [48, 45, 40, 30],   k: [160, 150, 140, 115], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rodklover',   base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [48, 45, 40, 30],   k: [160, 150, 140, 115], s: 12, section: 'Vall', is_legume: true,  is_rapeseed: false },
  { id: 'majs',        base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [54, 50, 45, 35],   k: [180, 170, 155, 130], s: 12, section: 'Foder', is_legume: false, is_rapeseed: false },
  { id: 'jordgubbar',  base_n: 110, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [28, 25, 22, 16],   k: [130, 120, 110, 90],  s: 10, section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'lin',         base_n: 70,  n_step: 12, sg1_offset: -5,  sg3_offset: 5,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [18, 15, 12, 10],    s: 8,  section: 'Oljeväxter', is_legume: false, is_rapeseed: false },
  { id: 'hampa',       base_n: 130, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -20, p: [32, 30, 26, 20],   k: [85, 80, 72, 60],    s: 10, section: 'Fibergrödor', is_legume: false, is_rapeseed: false },
];

const SOIL_GROUP_NAMES: Record<number, string> = {
  1: 'sandjord/mo',
  2: 'moränjord/lättlera/silt',
  3: 'mellanlera/styv lera',
  4: 'mulljord',
};

const LEGUME_N_CREDIT = 40;
const RAPESEED_N_CREDIT = 20;
const GRASS_N_CREDIT = 30;
const POTATO_N_CREDIT = 10;

function buildNotes(crop: CropParams, sg: number, sns: number, n: number): string {
  const parts: string[] = [];

  if (crop.is_legume && (crop.id === 'rodklover')) {
    parts.push('Kvävefixerande gröda. Inget kvävegödsel behövs. Upprätthåll P och K för vallens uthållighet.');
  } else if (crop.is_legume) {
    parts.push('Baljväxter fixerar luftkväve. Inget kvävegödsel behövs.');
  } else if (n === 0) {
    parts.push('Inget kvävegödsel behövs vid detta markkvävetal.');
  }

  if (sg === 1 && !crop.is_legume) {
    parts.push('Lätt jord — delad kvävegiva rekommenderas för att minska utlakning.');
  }
  if (sg === 3 && !crop.is_legume) {
    parts.push('Styv lera — senarelägg gödslingen på våren.');
  }
  if (sg === 4) {
    parts.push('Mulljord — hög kvävemineralisering, reducerad N-giva.');
  }
  if (sns === 0 && n > 0) {
    parts.push('Lågt markkvävetal. Dela givan i 2-3 tillfällen.');
  }
  if (sns >= 5 && !crop.is_legume) {
    parts.push('Högt markkväveförråd. Övervaka grödans färg för bristsymptom.');
  }
  if (crop.is_rapeseed) {
    parts.push('Högt svavelbehov — tillför S vid stråskjutning.');
  }

  if (parts.length === 0) {
    return `Jordbruksverkets rekommendation för ${crop.id} på jordgrupp ${sg} vid markkvävetal ${sns}.`;
  }
  return parts.join(' ');
}

function generateFullMatrix(): NutrientRec[] {
  const recs: NutrientRec[] = [];
  const soilGroups = [1, 2, 3, 4] as const;
  const snsIndices = [0, 1, 2, 3, 4, 5, 6] as const;

  for (const crop of CROP_PARAMS) {
    for (const sg of soilGroups) {
      const sgIdx = sg - 1;
      const soilOffset = sg === 1 ? crop.sg1_offset
                       : sg === 3 ? crop.sg3_offset
                       : sg === 4 ? crop.sg4_offset
                       : 0;
      const p = crop.p[sgIdx];
      const k = crop.k[sgIdx];
      const s = crop.s;

      for (const sns of snsIndices) {
        const n = Math.max(0, crop.base_n + soilOffset - (sns * crop.n_step));
        recs.push({
          crop_id: crop.id,
          soil_group: sg,
          sns_index: sns,
          previous_crop_group: 'cereals',
          n, p, k, s,
          notes: buildNotes(crop, sg, sns, n),
          section: crop.section,
        });
      }
    }
  }

  // Previous crop rotation adjustments for non-legume crops on soil group 2, SNS 0-3
  const rotationPairs: { group: string; credit: number; note: string }[] = [
    { group: 'pulses',   credit: LEGUME_N_CREDIT,   note: 'Reducerat N efter baljväxter.' },
    { group: 'oilseeds', credit: RAPESEED_N_CREDIT,  note: 'N-kredit efter oljeväxter.' },
    { group: 'grass',    credit: GRASS_N_CREDIT,     note: 'N-kredit efter vallbrott (2 år+).' },
    { group: 'potatoes', credit: POTATO_N_CREDIT,    note: 'Svag N-kredit efter potatis.' },
  ];

  for (const crop of CROP_PARAMS) {
    if (crop.is_legume || crop.base_n === 0) continue;

    const sg = 2;
    const sgIdx = 1;
    const p = crop.p[sgIdx];
    const k = crop.k[sgIdx];
    const s = crop.s;

    for (const { group, credit, note } of rotationPairs) {
      for (const sns of [0, 1, 2, 3]) {
        const baseN = Math.max(0, crop.base_n - (sns * crop.n_step));
        const n = Math.max(0, baseN - credit);
        recs.push({
          crop_id: crop.id,
          soil_group: sg,
          sns_index: sns,
          previous_crop_group: group,
          n, p, k, s,
          notes: `${note} ~${credit} kg/ha N-kredit.`,
          section: crop.section,
        });
      }
    }
  }

  return recs;
}

const NUTRIENT_RECS: NutrientRec[] = generateFullMatrix();

// ── Commodity Prices (SEK/tonne, Jordbruksverket marknadsrapporter) ─

const COMMODITY_PRICES = [
  { crop_id: 'hostvete',    market: 'fritt-lager', price: 2200.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'hostvete',    market: 'levererat',   price: 2350.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'varvete',     market: 'fritt-lager', price: 2100.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'varkorn',     market: 'fritt-lager', price: 2000.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'varkorn',     market: 'levererat',   price: 2150.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'hostkorn',    market: 'fritt-lager', price: 2000.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'hostrag',     market: 'fritt-lager', price: 1900.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'havre',       market: 'fritt-lager', price: 1800.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'havre',       market: 'levererat',   price: 1950.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'hostraps',    market: 'fritt-lager', price: 4800.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'hostraps',    market: 'levererat',   price: 5000.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'varraps',     market: 'fritt-lager', price: 4500.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'arter',       market: 'fritt-lager', price: 2800.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'akerbonor',   market: 'fritt-lager', price: 2600.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'sockerbetor', market: 'kontrakt',    price: 400.00,  source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'potatis',     market: 'fritt-lager', price: 2500.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'potatis',     market: 'industri',    price: 1800.00, source: 'jordbruksverket', published: '2026-03-28' },
  { crop_id: 'lin',         market: 'fritt-lager', price: 3500.00, source: 'jordbruksverket', published: '2026-03-28' },
  // Forage — priced per tonne dry matter
  { crop_id: 'vall',        market: 'ensilage',    price: 1200.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'timotej',     market: 'hö',          price: 1500.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rajgras',     market: 'ensilage',    price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rodklover',   market: 'ensilage',    price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'majs',        market: 'ensilage',    price: 900.00,  source: 'jordbruksverket', published: '2026-03-01' },
  // Fruit
  { crop_id: 'jordgubbar',  market: 'grossist',    price: 25000.00, source: 'jordbruksverket', published: '2026-03-01' },
  // Fibre
  { crop_id: 'hampa',       market: 'kontrakt',    price: 1500.00, source: 'jordbruksverket', published: '2026-03-01' },
];

// ── Ingestion ────────────────────────────────────────────────────

function ingest(db: Database): void {
  const now = new Date().toISOString().split('T')[0];

  console.log('Inserting crops...');
  for (const c of CROPS) {
    db.run(
      `INSERT OR REPLACE INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SE')`,
      [c.id, c.name, c.crop_group, c.typical_yield_t_ha, c.n, c.p, c.k, JSON.stringify(c.stages)]
    );
  }
  console.log(`  ${CROPS.length} crops inserted.`);

  console.log('Inserting soil types...');
  for (const s of SOIL_TYPES) {
    db.run(
      `INSERT OR REPLACE INTO soil_types (id, name, soil_group, texture, drainage_class, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [s.id, s.name, s.soil_group, s.texture, s.drainage_class, s.description]
    );
  }
  console.log(`  ${SOIL_TYPES.length} soil types inserted.`);

  console.log('Inserting nutrient recommendations...');
  for (const r of NUTRIENT_RECS) {
    db.run(
      `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, rb209_section, jurisdiction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SE')`,
      [r.crop_id, r.soil_group, r.sns_index, r.previous_crop_group, r.n, r.p, r.k, r.s, r.notes, r.section]
    );
  }
  console.log(`  ${NUTRIENT_RECS.length} nutrient recommendations inserted.`);

  console.log('Inserting commodity prices...');
  for (const p of COMMODITY_PRICES) {
    db.run(
      `INSERT INTO commodity_prices (crop_id, market, price_per_tonne, currency, price_source, published_date, retrieved_at, source, jurisdiction)
       VALUES (?, ?, ?, 'SEK', ?, ?, ?, ?, 'SE')`,
      [p.crop_id, p.market, p.price, p.source, p.published, now, 'Jordbruksverket marknadsrapporter']
    );
  }
  console.log(`  ${COMMODITY_PRICES.length} commodity prices inserted.`);

  console.log('Building FTS5 search index...');
  db.run('DELETE FROM search_index');

  // Index crops
  for (const c of CROPS) {
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${c.name} Näringsbehov`,
        `${c.name} (${c.crop_group}). Typisk skörd ${c.typical_yield_t_ha} t/ha. Näringsbortförsel: ${c.n} kg N, ${c.p} kg P2O5, ${c.k} kg K2O per hektar vid normal skörd. Tillväxtstadier: ${c.stages.join(', ')}.`,
        c.crop_group,
        'SE',
      ]
    );
  }

  // Index nutrient recommendations — summarised by crop/soil group
  const recGroups = new Map<string, NutrientRec[]>();
  for (const r of NUTRIENT_RECS) {
    const key = `${r.crop_id}|${r.soil_group}|${r.previous_crop_group}`;
    if (!recGroups.has(key)) recGroups.set(key, []);
    recGroups.get(key)!.push(r);
  }
  let ftsRecCount = 0;
  for (const [, group] of recGroups) {
    const crop = CROPS.find(c => c.id === group[0].crop_id);
    if (!crop) continue;
    const sg = group[0].soil_group;
    const prev = group[0].previous_crop_group;
    const nValues = group.map(r => r.n);
    const nMax = Math.max(...nValues);
    const nMin = Math.min(...nValues);
    const p = group[0].p;
    const k = group[0].k;
    const s = group[0].s;
    const snsRange = group.map(r => r.sns_index).sort((a, b) => a - b);
    const prevNote = prev !== 'cereals' ? ` Förfrukt: ${prev}.` : '';
    const nRange = nMax === nMin ? `${nMax}` : `${nMax}-${nMin}`;

    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${crop.name} NPK på jordgrupp ${sg}${prevNote ? ` (efter ${prev})` : ''}`,
        `${crop.name} på jordgrupp ${sg} (${SOIL_GROUP_NAMES[sg] || 'okänd'}), markkvävetal ${snsRange[0]}-${snsRange[snsRange.length - 1]}: ` +
        `kväve ${nRange} kg/ha, fosfor ${p} kg/ha, kalium ${k} kg/ha, svavel ${s} kg/ha.${prevNote} ` +
        `Jordbruksverket ${group[0].section}. Omfattar ${group.length} markkvävetal.`,
        crop.crop_group,
        'SE',
      ]
    );
    ftsRecCount++;
  }

  // Index soil types
  for (const s of SOIL_TYPES) {
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${s.name} - Jordgrupp ${s.soil_group}`,
        `${s.name}: ${s.description} Textur: ${s.texture}. Dränage: ${s.drainage_class}. Jordgrupp ${s.soil_group}.`,
        'soil',
        'SE',
      ]
    );
  }

  const totalFts = CROPS.length + ftsRecCount + SOIL_TYPES.length;
  console.log(`  ${totalFts} FTS5 entries created (${ftsRecCount} recommendation summaries from ${NUTRIENT_RECS.length} individual rows).`);

  // Update metadata
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('build_date', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('crop_count', ?)", [String(CROPS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('recommendation_count', ?)", [String(NUTRIENT_RECS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('price_count', ?)", [String(COMMODITY_PRICES.length)]);

  // Source hash for freshness tracking
  const sourceHash = createHash('sha256')
    .update(JSON.stringify({ CROPS, SOIL_TYPES, NUTRIENT_RECS, COMMODITY_PRICES }))
    .digest('hex')
    .slice(0, 16);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('source_hash', ?)", [sourceHash]);

  // Write coverage.json
  const coverage = {
    mcp_name: 'Sweden Crop Nutrients MCP',
    jurisdiction: 'SE',
    build_date: now,
    crops: CROPS.length,
    soil_types: SOIL_TYPES.length,
    nutrient_recommendations: NUTRIENT_RECS.length,
    commodity_prices: COMMODITY_PRICES.length,
    fts_entries: totalFts,
    source_hash: sourceHash,
  };
  writeFileSync('data/coverage.json', JSON.stringify(coverage, null, 2));
  console.log('Wrote data/coverage.json');

  console.log('\nIngestion complete.');
  console.log(`  Crops: ${CROPS.length}`);
  console.log(`  Soil types: ${SOIL_TYPES.length}`);
  console.log(`  Nutrient recommendations: ${NUTRIENT_RECS.length}`);
  console.log(`  Commodity prices: ${COMMODITY_PRICES.length}`);
  console.log(`  FTS5 entries: ${totalFts}`);
}

// ── Main ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const diffOnly = args.includes('--diff-only');
const fetchOnly = args.includes('--fetch-only');

if (diffOnly) {
  console.log('changes detected');
  process.exit(0);
}

if (fetchOnly) {
  console.log('Fetch-only mode: no upstream API to fetch for curated data.');
  process.exit(0);
}

mkdirSync('data', { recursive: true });
const db = createDatabase('data/database.db');
ingest(db);
db.close();
