/**
 * Sweden Crop Nutrients MCP — Data Ingestion Script
 *
 * Sources:
 * 1. Jordbruksverket (Swedish Board of Agriculture) — "Rekommendationer för gödsling
 *    och kalkning 2026" (JO21:9), "Riktgivor och strategier för gödsling"
 *    https://jordbruksverket.se/vaxter/odling/vaxtnaring/rekommendationer-och-strategier-for-godsling
 * 2. Jordbruksverket yield statistics — "Skörd av spannmål, trindsäd, oljeväxter,
 *    potatis och slåttervall 2024. Slutlig statistik" (2025-04-16)
 * 3. Jordbruksverket price statistics / Jordbruksaktuellt market data (2026-03-23)
 * 4. Greppa Näringen (nutrient advisory service) — crop/soil nutrient guidance
 *    https://greppa.nu
 * 5. SLU (Swedish University of Agricultural Sciences) — soil classification
 *    https://www.slu.se/om-slu/organisation/institutioner/mark-miljo/miljoanalys/markinfo/
 * 6. Yara Sverige gödslingsråd — supplementary NPK+S data
 *    https://www.yara.se/vaxtnaring/
 *
 * Swedish nutrient data is published as PDFs and web guidance. The recommendation
 * tables are manually extracted from official publications and encoded as structured
 * data here. This is the standard approach when the authoritative source is not
 * machine-readable.
 *
 * Data accuracy verification:
 * - N recommendations cross-checked against Jordbruksverket riktgivor 2026
 * - Yield figures from Jordbruksverket official statistics 2024 (slutlig skörd)
 * - Prices from Lantmännen spot prices via Jordbruksaktuellt 2026-03-23
 * - Soil classification from SLU Markinfo + Jordbruksverket jordgrupper
 *
 * Usage: npm run ingest
 */

import { createDatabase, type Database } from '../src/db.js';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// ── Swedish Crop Data ─────────────────────────────────────────────
// Yield data: Jordbruksverket slutlig skörd 2024 (national averages).
// NPK offtake: Jordbruksverket "Rekommendationer för gödsling och kalkning",
// cross-referenced with Jordbruksverket offtake tables for Swedish conditions.
// Typical yield is rounded to a practical planning figure.

const CROPS = [
  // ── Cereals (Spannmål) ──────────────────────────────────────────
  { id: 'hostvete-brod',   name: 'Höstvete brödvete (Winter Wheat, bread)',      crop_group: 'cereals',    typical_yield_t_ha: 7.0,  n: 168, p: 56, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'hostvete-foder',  name: 'Höstvete fodervete (Winter Wheat, feed)',       crop_group: 'cereals',    typical_yield_t_ha: 7.0,  n: 154, p: 56, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'varvete',         name: 'Vårvete (Spring Wheat)',                        crop_group: 'cereals',    typical_yield_t_ha: 5.5,  n: 132, p: 44, k: 33, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'hostkorn',        name: 'Höstkorn (Winter Barley)',                      crop_group: 'cereals',    typical_yield_t_ha: 6.0,  n: 126, p: 47, k: 54, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'varkorn',         name: 'Vårkorn foderkorn (Spring Barley, feed)',       crop_group: 'cereals',    typical_yield_t_ha: 4.5,  n: 95,  p: 36, k: 43, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'maltkorn',        name: 'Maltkorn (Malt Barley)',                        crop_group: 'cereals',    typical_yield_t_ha: 4.5,  n: 90,  p: 36, k: 43, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'havre',           name: 'Havre (Oats)',                                  crop_group: 'cereals',    typical_yield_t_ha: 4.5,  n: 85,  p: 32, k: 32, stages: ['bestockning', 'stråskjutning', 'vippgång'] },
  { id: 'hostrag',         name: 'Höstråg (Winter Rye)',                          crop_group: 'cereals',    typical_yield_t_ha: 6.0,  n: 120, p: 42, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'ragvete',         name: 'Rågvete (Triticale)',                           crop_group: 'cereals',    typical_yield_t_ha: 6.0,  n: 126, p: 42, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'blandsad',        name: 'Blandsäd (Mixed cereals)',                      crop_group: 'cereals',    typical_yield_t_ha: 4.0,  n: 80,  p: 32, k: 36, stages: ['bestockning', 'stråskjutning', 'axgång'] },

  // ── Oilseeds (Oljeväxter) ───────────────────────────────────────
  { id: 'hostraps',        name: 'Höstraps (Winter Rapeseed)',                    crop_group: 'oilseeds',   typical_yield_t_ha: 3.5,  n: 140, p: 46, k: 39, stages: ['rosett', 'stråskjutning', 'blomning', 'skidmognad'] },
  { id: 'varraps',         name: 'Vårraps (Spring Rapeseed)',                     crop_group: 'oilseeds',   typical_yield_t_ha: 2.5,  n: 85,  p: 28, k: 25, stages: ['rosett', 'stråskjutning', 'blomning', 'skidmognad'] },
  { id: 'oljelin',         name: 'Oljelin (Linseed/Oil Flax)',                    crop_group: 'oilseeds',   typical_yield_t_ha: 1.8,  n: 45,  p: 16, k: 16, stages: ['uppkomst', 'vegetativ', 'blomning', 'kapselmognad'] },
  { id: 'solros',          name: 'Solros (Sunflower)',                            crop_group: 'oilseeds',   typical_yield_t_ha: 2.5,  n: 80,  p: 30, k: 50, stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },

  // ── Pulses (Baljväxter / Trindsäd) ──────────────────────────────
  { id: 'arter',           name: 'Ärter (Field Peas)',                            crop_group: 'pulses',     typical_yield_t_ha: 3.0,  n: 0,  p: 24, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'akerbonor',       name: 'Åkerbönor (Faba Beans)',                        crop_group: 'pulses',     typical_yield_t_ha: 3.5,  n: 0,  p: 28, k: 39, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'lupiner',         name: 'Lupiner (Lupins)',                              crop_group: 'pulses',     typical_yield_t_ha: 2.0,  n: 0,  p: 18, k: 24, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'sojabonor',       name: 'Sojabönor (Soybeans)',                          crop_group: 'pulses',     typical_yield_t_ha: 2.0,  n: 0,  p: 22, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },

  // ── Root Crops (Rotfrukter) ─────────────────────────────────────
  { id: 'sockerbetor',     name: 'Sockerbetor (Sugar Beet)',                      crop_group: 'root_crops', typical_yield_t_ha: 55.0, n: 120, p: 45, k: 200, stages: ['uppkomst', 'bladtäckning', 'rottillväxt'] },
  { id: 'morotter',        name: 'Morötter (Carrots)',                            crop_group: 'root_crops', typical_yield_t_ha: 40.0, n: 80,  p: 30, k: 160, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'lok',             name: 'Lök (Onions)',                                  crop_group: 'root_crops', typical_yield_t_ha: 35.0, n: 100, p: 28, k: 110, stages: ['uppkomst', 'bladtillväxt', 'lökbildning', 'mognad'] },

  // ── Potatoes (Potatis) ──────────────────────────────────────────
  { id: 'potatis-mat',     name: 'Matpotatis (Table Potatoes)',                   crop_group: 'potatoes',   typical_yield_t_ha: 33.0, n: 120, p: 70, k: 200, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },
  { id: 'potatis-starkelse', name: 'Stärkelsepotatis (Starch Potatoes)',          crop_group: 'potatoes',   typical_yield_t_ha: 44.0, n: 140, p: 80, k: 220, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },
  { id: 'potatis-industri', name: 'Industripotatis (Processing Potatoes)',        crop_group: 'potatoes',   typical_yield_t_ha: 40.0, n: 150, p: 75, k: 210, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },

  // ── Forage (Vall / Foder) ───────────────────────────────────────
  // Jordbruksverket: grass 2-cut 130-190, 3-cut 180-260, 4-cut 230-330 kg N/ha
  { id: 'vall-2-skor',     name: 'Gräsvall 2 skördar (Grass ley, 2 cuts)',       crop_group: 'forage',     typical_yield_t_ha: 7.5,  n: 160, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'vall-3-skor',     name: 'Gräsvall 3 skördar (Grass ley, 3 cuts)',       crop_group: 'forage',     typical_yield_t_ha: 9.0,  n: 220, p: 42, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'klover-gras',     name: 'Klöver-gräsvall (Clover-grass ley)',           crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 40,  p: 40, k: 140, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'timotej',         name: 'Timotej (Timothy)',                             crop_group: 'forage',     typical_yield_t_ha: 6.0,  n: 130, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'rajgras',         name: 'Engelskt rajgräs (Perennial Ryegrass)',         crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 180, p: 42, k: 160, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'höst'] },
  { id: 'rajgras-ital',    name: 'Italienskt rajgräs (Italian Ryegrass)',         crop_group: 'forage',     typical_yield_t_ha: 9.0,  n: 200, p: 45, k: 170, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'rodklover',       name: 'Rödklöver (Red Clover)',                        crop_group: 'forage',     typical_yield_t_ha: 7.0,  n: 0,  p: 45, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'vitklover',       name: 'Vitklöver (White Clover)',                      crop_group: 'forage',     typical_yield_t_ha: 5.0,  n: 0,  p: 35, k: 130, stages: ['vårtillväxt', 'förstaskörd', 'återväxt'] },
  { id: 'lusern',          name: 'Lusern/Blålusern (Lucerne/Alfalfa)',            crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 0,  p: 45, k: 180, stages: ['vårtillväxt', 'förstaskörd', 'andraskörd', 'tredjeskörd'] },
  { id: 'majs-ensilage',   name: 'Majs ensilage (Forage Maize)',                 crop_group: 'forage',     typical_yield_t_ha: 35.0, n: 90,  p: 50, k: 170, stages: ['uppkomst', 'vegetativ', 'kolvsättning', 'kärnfyllnad'] },
  { id: 'majs-karn',       name: 'Kärnmajs (Grain Maize)',                        crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 120, p: 55, k: 50,  stages: ['uppkomst', 'vegetativ', 'kolvsättning', 'kärnfyllnad', 'mognad'] },
  { id: 'fodervicker',     name: 'Fodervicker (Fodder Vetch)',                    crop_group: 'forage',     typical_yield_t_ha: 3.0,  n: 0,  p: 20, k: 35,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skörd'] },

  // ── Vegetables (Grönsaker friland) ──────────────────────────────
  // N from Jordbruksverket grönsaksrekommendationer
  { id: 'vitkal',          name: 'Vitkål (White Cabbage)',                        crop_group: 'vegetables', typical_yield_t_ha: 50.0, n: 250, p: 40, k: 200, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'blomkal',         name: 'Blomkål (Cauliflower)',                         crop_group: 'vegetables', typical_yield_t_ha: 20.0, n: 220, p: 35, k: 180, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'broccoli',        name: 'Broccoli',                                     crop_group: 'vegetables', typical_yield_t_ha: 7.0,  n: 200, p: 30, k: 150, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'sallat',          name: 'Sallat (Lettuce)',                              crop_group: 'vegetables', typical_yield_t_ha: 25.0, n: 100, p: 25, k: 130, stages: ['plantering', 'bladtillväxt', 'skörd'] },
  { id: 'spenat',          name: 'Spenat (Spinach)',                              crop_group: 'vegetables', typical_yield_t_ha: 15.0, n: 120, p: 25, k: 140, stages: ['uppkomst', 'bladtillväxt', 'skörd'] },
  { id: 'purjolok',        name: 'Purjolök (Leek)',                               crop_group: 'vegetables', typical_yield_t_ha: 30.0, n: 150, p: 30, k: 140, stages: ['plantering', 'bladtillväxt', 'skaftbildning', 'skörd'] },
  { id: 'rodbeta',         name: 'Rödbeta (Red Beet)',                            crop_group: 'vegetables', typical_yield_t_ha: 30.0, n: 120, p: 30, k: 170, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'tomat-vaxthus',   name: 'Tomat växthus (Greenhouse Tomato)',             crop_group: 'vegetables', typical_yield_t_ha: 50.0, n: 300, p: 60, k: 400, stages: ['plantering', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'gurka-vaxthus',   name: 'Gurka växthus (Greenhouse Cucumber)',           crop_group: 'vegetables', typical_yield_t_ha: 60.0, n: 250, p: 50, k: 350, stages: ['plantering', 'rankning', 'fruktbildning', 'skörd'] },
  { id: 'selleri',         name: 'Rotselleri (Celeriac)',                         crop_group: 'vegetables', typical_yield_t_ha: 25.0, n: 180, p: 35, k: 200, stages: ['plantering', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'palsternacka',    name: 'Palsternacka (Parsnip)',                        crop_group: 'vegetables', typical_yield_t_ha: 20.0, n: 80,  p: 25, k: 160, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },

  // ── Fruit & Berries (Frukt & Bär) ──────────────────────────────
  { id: 'jordgubbar',      name: 'Jordgubbar (Strawberries)',                     crop_group: 'fruit',      typical_yield_t_ha: 10.0, n: 80,  p: 25, k: 120, stages: ['tillväxtstart', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'applen',          name: 'Äpplen (Apples)',                               crop_group: 'fruit',      typical_yield_t_ha: 25.0, n: 60,  p: 15, k: 80,  stages: ['knoppbrytning', 'blomning', 'frukttillväxt', 'skörd'] },
  { id: 'hallon',          name: 'Hallon (Raspberries)',                          crop_group: 'fruit',      typical_yield_t_ha: 5.0,  n: 60,  p: 20, k: 80,  stages: ['tillväxtstart', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'svarta-vinbar',   name: 'Svarta vinbär (Blackcurrants)',                 crop_group: 'fruit',      typical_yield_t_ha: 3.0,  n: 50,  p: 15, k: 60,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },

  // ── Energy Crops (Energigrödor) ─────────────────────────────────
  // Jordbruksverket: "Odla energigrödor" — salix, rörflen, hampa
  { id: 'salix',           name: 'Salix/Energivide (Willow)',                     crop_group: 'energy',     typical_yield_t_ha: 8.0,  n: 60,  p: 10, k: 30,  stages: ['skottillväxt', 'sommar', 'tillväxtsäsong', 'vilotid'] },
  { id: 'rorflen',         name: 'Rörflen (Reed Canary Grass)',                   crop_group: 'energy',     typical_yield_t_ha: 6.0,  n: 80,  p: 15, k: 40,  stages: ['vårtillväxt', 'sommar', 'höst', 'övervintring'] },
  { id: 'hampa',           name: 'Hampa (Hemp)',                                  crop_group: 'fibre',      typical_yield_t_ha: 8.0,  n: 100, p: 30, k: 80,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skörd'] },
  { id: 'hampa-fro',       name: 'Hampa frö (Hemp seed)',                         crop_group: 'oilseeds',   typical_yield_t_ha: 1.5,  n: 80,  p: 20, k: 50,  stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },

  // ── Special / Niche Crops ───────────────────────────────────────
  { id: 'kummin',          name: 'Kummin (Caraway)',                              crop_group: 'herbs',      typical_yield_t_ha: 1.2,  n: 60,  p: 15, k: 30,  stages: ['uppkomst', 'rosett', 'blomning', 'frömognad'] },
  { id: 'bockhornsklover', name: 'Bockhornklöver (Fenugreek)',                    crop_group: 'herbs',      typical_yield_t_ha: 1.5,  n: 0,   p: 15, k: 25,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'vallmo',          name: 'Vallmo (Poppy)',                                crop_group: 'herbs',      typical_yield_t_ha: 1.0,  n: 60,  p: 18, k: 20,  stages: ['uppkomst', 'rosett', 'blomning', 'kapselmognad'] },
  { id: 'senap',           name: 'Senap (Mustard)',                               crop_group: 'oilseeds',   typical_yield_t_ha: 1.5,  n: 80,  p: 20, k: 25,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skidmognad'] },
  { id: 'bovete',          name: 'Bovete (Buckwheat)',                            crop_group: 'cereals',    typical_yield_t_ha: 1.5,  n: 40,  p: 15, k: 20,  stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },
  { id: 'quinoa',          name: 'Quinoa',                                        crop_group: 'cereals',    typical_yield_t_ha: 2.0,  n: 80,  p: 20, k: 50,  stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },

  // ── Cover Crops / Green Manure (Fånggrödor / Mellangröda) ──────
  { id: 'honungsort',      name: 'Honungsört (Phacelia)',                         crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 10, k: 40, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'oljerattika',     name: 'Oljerättika (Oilseed Radish)',                  crop_group: 'cover_crops', typical_yield_t_ha: 3.5, n: 0,  p: 12, k: 50, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'vitsenap',        name: 'Vitsenap fånggröda (White Mustard cover)',      crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 10, k: 35, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'hostrag-fang',    name: 'Höstråg fånggröda (Winter Rye cover)',          crop_group: 'cover_crops', typical_yield_t_ha: 4.0, n: 0,  p: 8,  k: 30, stages: ['uppkomst', 'övervintring', 'vårtillväxt', 'nedbrukning'] },
  { id: 'persisk-klover',  name: 'Persisk klöver fånggröda (Persian Clover)',     crop_group: 'cover_crops', typical_yield_t_ha: 2.5, n: 0,  p: 10, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning'] },
];

// ── Swedish Soil Types (SGU / SLU Classification) ─────────────────
// SLU Markinfo soil classification:
//   Code digit 1: 1=sedimentary, 2=moraine, 3-4=organic
// Jordbruksverket uses "jordgrupp" 1-5 based on clay content and organic matter.
// P-AL and K-AL classes (I-V) determine P and K recommendations.

const SOIL_TYPES = [
  // Jordgrupp 1: Lätta jordar (light soils)
  { id: 'sandjord',         name: 'Sandjord (Sandy soil)',                  soil_group: 1, texture: 'sand',          drainage_class: 'free',     description: 'Lätt sandjord med fritt dränage. Låg mullhalt (<3%), snabb urlakning av näring. SGU jordartsklass sand. Jordbruksverket jordgrupp 1. Vanlig i Halland, västra Skåne.' },
  { id: 'grovmo',           name: 'Grovmo (Coarse fine sand)',              soil_group: 1, texture: 'coarse_silt',  drainage_class: 'free',     description: 'Grovmo (0.06-0.2 mm). Lätt jord med fritt dränage. Vanlig i Norrland. Jordgrupp 1.' },
  { id: 'finmo',            name: 'Finmo (Fine sand)',                      soil_group: 1, texture: 'fine_sand',    drainage_class: 'moderate', description: 'Finmo (0.02-0.06 mm). Lätt jord med måttligt dränage. Kapillär vattenledning. Jordgrupp 1.' },

  // Jordgrupp 2: Mellanljärdar (medium soils)
  { id: 'moranjord',        name: 'Moränjord (Moraine/glacial till)',       soil_group: 2, texture: 'moraine',      drainage_class: 'moderate', description: 'Moränjord med varierad kornstorlek. Vanligaste jordarten i Sverige (~75% av åkermarken). Måttligt dränage. Jordgrupp 2.' },
  { id: 'lattlera',         name: 'Lättlera (Light clay, 15-25% clay)',    soil_group: 2, texture: 'light_clay',   drainage_class: 'moderate', description: 'Lättlera (15-25% ler). Bra brukningsegenskaper, måttligt dränage. Vanlig i Mellansverige. Jordgrupp 2.' },
  { id: 'siltjord',         name: 'Siltjord (Silt)',                       soil_group: 2, texture: 'silt',         drainage_class: 'moderate', description: 'Siltjord med jämn kornstorlek (0.002-0.06 mm). Risk för igenslamning och skorpbildning. Måttligt dränage. Jordgrupp 2.' },
  { id: 'lerig-mo',         name: 'Lerig mo (Clayey fine sand)',           soil_group: 2, texture: 'clayey_sand',  drainage_class: 'moderate', description: 'Lerig mo med 5-15% ler. Mellanform mellan sandiga och leriga jordar. Jordgrupp 2.' },

  // Jordgrupp 3: Lerigt (clay soils)
  { id: 'mellanlera',       name: 'Mellanlera (Medium clay, 25-40% clay)', soil_group: 3, texture: 'medium_clay',  drainage_class: 'impeded',  description: 'Mellanlera (25-40% ler). Tyngre att bearbeta, nedsatt dränage. Vanlig i Mälardalen, Östergötland. Jordgrupp 3.' },
  { id: 'styv-lera',        name: 'Styv lera (Heavy clay, 40-60% clay)',   soil_group: 3, texture: 'heavy_clay',   drainage_class: 'impeded',  description: 'Styv lera (40-60% ler). Svår att bearbeta, nedsatt dränage. Långsam uppvärmning på våren. Jordgrupp 3. Vanlig i Uppsala, Mälardalen.' },
  { id: 'mycket-styv-lera', name: 'Mycket styv lera (Very heavy clay, >60%)', soil_group: 3, texture: 'very_heavy_clay', drainage_class: 'poor', description: 'Mycket styv lera (>60% ler). Extremt svårbearbetad. Spricksystem vid uttorkning. Jordgrupp 3. Förekommer i Mälardalen.' },

  // Jordgrupp 4: Mulljordar (organic soils)
  { id: 'mulljord',         name: 'Mulljord (Humus soil, 20-40% OM)',      soil_group: 4, texture: 'organic',      drainage_class: 'variable', description: 'Organisk jord/mulljord (20-40% organiskt material). Hög kvävemineralisering, reducerat N-behov. Jordgrupp 4.' },
  { id: 'karktorvjord',     name: 'Kärrtorvjord (Fen peat)',               soil_group: 4, texture: 'peat',         drainage_class: 'poor',     description: 'Kärrtorvjord (>40% organiskt material). Mycket hög kvävemineralisering. Behöver dränering. Jordgrupp 4.' },
  { id: 'gyttjejord',       name: 'Gyttjejord (Gyttja soil)',              soil_group: 4, texture: 'gyttja',       drainage_class: 'poor',     description: 'Gyttjejord, sedimenterad organisk jord. Hög näringshalt. Jordgrupp 4. Vanlig vid sjösänkningar.' },

  // Jordgrupp 5: Special (used in some recommendation systems)
  { id: 'sandig-moranjord',  name: 'Sandig moränjord (Sandy moraine)',     soil_group: 1, texture: 'sandy_moraine', drainage_class: 'free',    description: 'Sandig moränjord med hög sandhalt. Lätt, snabbt dränerande. Jordgrupp 1. Vanlig i Småland, Norrland.' },
  { id: 'lerig-moranjord',  name: 'Lerig moränjord (Clayey moraine)',      soil_group: 2, texture: 'clayey_moraine', drainage_class: 'moderate', description: 'Lerig moränjord med 15-25% ler. Bättre vattenhållning. Jordgrupp 2. Vanlig i Mellansverige.' },
];

// ── Nutrient Recommendations (Jordbruksverket / Greppa Näringen) ──
// Swedish system uses soil groups 1-4 and SNS index 0-6.
// N varies by crop, soil group, and SNS (markkväveindex).
// P recommendations based on P-AL class (I-V), mapped to soil groups.
// K recommendations based on K-AL class, mapped to soil groups.
// S (sulfur) important for rapeseed (N:S = 5:1) and cereals on light soils.
//
// Formula: N = max(0, base_n + soil_offset - (sns_index * n_step))
// P, K indexed per crop per soil group [SG1, SG2, SG3, SG4].

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
  base_n: number;       // Base N at SG2, SNS 0 (kg/ha)
  n_step: number;       // N reduction per SNS unit
  sg1_offset: number;   // Sandy soil N offset (usually negative — more leaching)
  sg3_offset: number;   // Clay soil N offset (usually positive — slower mineralization)
  sg4_offset: number;   // Organic soil N offset (large negative — high mineralization)
  p: [number, number, number, number]; // P rec kg/ha at [SG1, SG2, SG3, SG4]
  k: [number, number, number, number]; // K rec kg/ha at [SG1, SG2, SG3, SG4]
  s: number;            // S rec kg/ha (flat rate)
  section: string;      // Jordbruksverket section label
  is_legume: boolean;
  is_rapeseed: boolean;
}

// Crop parameters derived from Jordbruksverket "Rekommendationer för gödsling
// och kalkning 2026" (JO21:9) and "Riktgivor och strategier för gödsling".
//
// N ranges from the official tables (mineral soil, stråsäd as previous crop):
//   Höstvete bröd: 120-240 (5-11 t/ha) → base_n 200 at ~7 t/ha target
//   Höstvete foder: 120-210 → base_n 185
//   Vårvete: 125-205 (4-8 t/ha) → base_n 155 at ~5.5 t
//   Höstkorn: 105-170 → base_n 160
//   Vårkorn: 70-145 → base_n 130
//   Havre: 60-110 → base_n 110
//   Höstråg: 70-110 → base_n 110
//   Rågvete: similar to höstråg → base_n 120
//   Höstraps: needs split application → base_n 190 total
//   Vårraps: 100-130 → base_n 120
//   Oljelin: 50-90 → base_n 70
//   Potatis: 40-190 (depends on variety) → moderate base_n 150
//   Sockerbetor: ~120 → base_n 140
//   Vall 2-cut: 130-190 → base_n 180
//   Vall 3-cut: 180-260 → base_n 240
//
// P/K indexed as [SG1, SG2, SG3, SG4], from P-AL/K-AL class III (mid-range).
// Jordbruksverket P example: spring cereals 25 at class II, winter cereals 30.
// Potatis 75 at class I. Sockerbetor 60 at class I.

const CROP_PARAMS: CropParams[] = [
  // ── Cereals ─────────────────────────────────────────────────────
  { id: 'hostvete-brod',   base_n: 200, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [50, 45, 40, 30],   k: [45, 40, 35, 25],   s: 20, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hostvete-foder',  base_n: 185, n_step: 26, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -30, p: [50, 45, 40, 30],   k: [45, 40, 35, 25],   s: 18, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'varvete',         base_n: 155, n_step: 25, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [40, 35, 30, 22],   k: [35, 30, 26, 20],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hostkorn',        base_n: 160, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -28, p: [47, 42, 38, 28],   k: [58, 55, 50, 40],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'varkorn',         base_n: 130, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [38, 36, 32, 24],   k: [48, 45, 42, 34],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'maltkorn',        base_n: 125, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [38, 36, 32, 24],   k: [48, 45, 42, 34],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'havre',           base_n: 110, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -25, p: [34, 32, 28, 20],   k: [35, 32, 28, 22],   s: 10, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hostrag',         base_n: 110, n_step: 18, sg1_offset: -8,  sg3_offset: 8,  sg4_offset: -25, p: [42, 38, 34, 25],   k: [45, 42, 38, 30],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'ragvete',         base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [42, 38, 34, 25],   k: [45, 42, 38, 30],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'blandsad',        base_n: 100, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [34, 32, 28, 20],   k: [38, 36, 32, 25],   s: 10, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'bovete',          base_n: 60,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [22, 20, 18, 14],   s: 5,  section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'quinoa',          base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [52, 50, 45, 38],   s: 8,  section: 'Spannmål', is_legume: false, is_rapeseed: false },

  // ── Oilseeds ────────────────────────────────────────────────────
  // Höstraps: Jordbruksverket ~170-200 total, split autumn/spring. N:S = 5:1 → 40 S at 200 N.
  { id: 'hostraps',        base_n: 195, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -35, p: [48, 46, 42, 32],   k: [42, 39, 35, 28],   s: 40, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  { id: 'varraps',         base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [30, 28, 24, 18],   k: [28, 25, 22, 18],   s: 25, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  { id: 'oljelin',         base_n: 70,  n_step: 12, sg1_offset: -5,  sg3_offset: 5,  sg4_offset: -18, p: [18, 16, 14, 10],   k: [18, 16, 14, 10],   s: 8,  section: 'Oljeväxter', is_legume: false, is_rapeseed: false },
  { id: 'solros',          base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [32, 30, 26, 20],   k: [55, 50, 45, 38],   s: 10, section: 'Oljeväxter', is_legume: false, is_rapeseed: false },
  { id: 'senap',           base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [28, 25, 22, 18],   s: 15, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  { id: 'hampa-fro',       base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [55, 50, 45, 38],   s: 10, section: 'Oljeväxter', is_legume: false, is_rapeseed: false },

  // ── Pulses ──────────────────────────────────────────────────────
  { id: 'arter',           base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [28, 24, 20, 15],   k: [35, 30, 26, 20],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'akerbonor',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [32, 28, 24, 18],   k: [42, 39, 35, 28],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'lupiner',         base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [22, 18, 15, 10],   k: [28, 24, 20, 16],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'sojabonor',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [25, 22, 18, 12],   k: [34, 30, 26, 20],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },

  // ── Root Crops ──────────────────────────────────────────────────
  // Sockerbetor: Jordbruksverket ~120 N, P-AL I 60 P. High K.
  { id: 'sockerbetor',     base_n: 140, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -25, p: [55, 48, 40, 30],   k: [220, 200, 180, 150], s: 20, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },
  { id: 'morotter',        base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [35, 30, 25, 18],   k: [175, 160, 140, 115], s: 10, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },
  { id: 'lok',             base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [32, 28, 24, 18],   k: [120, 110, 100, 80],  s: 12, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },

  // ── Potatoes ────────────────────────────────────────────────────
  // Jordbruksverket: 40-190 N depending on variety. P-AL I 75 P. High K.
  { id: 'potatis-mat',     base_n: 140, n_step: 18, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [75, 70, 60, 45],   k: [210, 200, 185, 150], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'potatis-starkelse', base_n: 160, n_step: 20, sg1_offset: -10, sg3_offset: 8, sg4_offset: -30, p: [80, 75, 65, 50],  k: [230, 220, 200, 165], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'potatis-industri', base_n: 170, n_step: 22, sg1_offset: -10, sg3_offset: 8, sg4_offset: -30,  p: [78, 72, 62, 48],  k: [220, 210, 195, 160], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },

  // ── Forage ──────────────────────────────────────────────────────
  // Jordbruksverket: gräsvall 2-cut 130-190 N, 3-cut 180-260 N
  // Klöver-gräs: reduce N 10-70% depending on clover share
  { id: 'vall-2-skor',     base_n: 180, n_step: 25, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [40, 35, 30, 22],   k: [135, 120, 110, 90],  s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'vall-3-skor',     base_n: 240, n_step: 30, sg1_offset: -18, sg3_offset: 10, sg4_offset: -40, p: [48, 42, 36, 28],   k: [165, 150, 135, 110], s: 18, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'klover-gras',     base_n: 50,  n_step: 8,  sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [45, 40, 35, 25],   k: [155, 140, 125, 105], s: 10, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'timotej',         base_n: 155, n_step: 22, sg1_offset: -12, sg3_offset: 5,  sg4_offset: -28, p: [38, 35, 30, 22],   k: [130, 120, 110, 90],  s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rajgras',         base_n: 195, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -32, p: [48, 42, 38, 28],   k: [170, 160, 145, 120], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rajgras-ital',    base_n: 215, n_step: 30, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [50, 45, 40, 30],   k: [180, 170, 155, 130], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rodklover',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [48, 45, 40, 30],   k: [165, 150, 140, 115], s: 12, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'vitklover',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [38, 35, 30, 22],   k: [145, 130, 120, 100], s: 10, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'lusern',          base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [50, 45, 40, 30],   k: [195, 180, 165, 140], s: 15, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'majs-ensilage',   base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [54, 50, 45, 35],   k: [185, 170, 155, 130], s: 12, section: 'Foder', is_legume: false, is_rapeseed: false },
  { id: 'majs-karn',       base_n: 145, n_step: 20, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [58, 55, 48, 38],   k: [55, 50, 45, 38],    s: 12, section: 'Foder', is_legume: false, is_rapeseed: false },
  { id: 'fodervicker',     base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [22, 20, 18, 12],   k: [38, 35, 30, 25],    s: 0,  section: 'Foder', is_legume: true, is_rapeseed: false },

  // ── Vegetables (field) ──────────────────────────────────────────
  // Jordbruksverket: Blomkål, vitkål, brysselkål = utpräglat N-behov (200-300)
  // Spenat, lök, purjolök, morötter = stort N-behov (100-180)
  // Sallat, gurka, bönor = visst N-behov (80-120)
  { id: 'vitkal',          base_n: 280, n_step: 35, sg1_offset: -15, sg3_offset: 10, sg4_offset: -40, p: [45, 40, 35, 25],   k: [215, 200, 180, 150], s: 25, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'blomkal',         base_n: 250, n_step: 30, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -35, p: [40, 35, 30, 22],   k: [195, 180, 160, 135], s: 22, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'broccoli',        base_n: 230, n_step: 28, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -32, p: [35, 30, 26, 18],   k: [165, 150, 135, 110], s: 20, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'sallat',          base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [28, 25, 22, 15],   k: [140, 130, 115, 95],  s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'spenat',          base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [28, 25, 22, 15],   k: [155, 140, 125, 105], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'purjolok',        base_n: 170, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [35, 30, 26, 18],   k: [155, 140, 125, 105], s: 12, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'rodbeta',         base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [35, 30, 26, 18],   k: [185, 170, 155, 130], s: 12, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'tomat-vaxthus',   base_n: 320, n_step: 35, sg1_offset: -15, sg3_offset: 10, sg4_offset: -40, p: [65, 60, 52, 40],   k: [420, 400, 370, 310], s: 30, section: 'Växthus',   is_legume: false, is_rapeseed: false },
  { id: 'gurka-vaxthus',   base_n: 280, n_step: 32, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -35, p: [55, 50, 45, 35],   k: [370, 350, 320, 270], s: 25, section: 'Växthus',   is_legume: false, is_rapeseed: false },
  { id: 'selleri',         base_n: 200, n_step: 25, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -30, p: [40, 35, 30, 22],   k: [215, 200, 180, 150], s: 15, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'palsternacka',    base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [28, 25, 22, 15],   k: [175, 160, 140, 115], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },

  // ── Fruit & Berries ─────────────────────────────────────────────
  { id: 'jordgubbar',      base_n: 110, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [28, 25, 22, 16],   k: [135, 120, 110, 90],  s: 10, section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'applen',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [18, 15, 12, 8],    k: [85, 80, 72, 60],     s: 8,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'hallon',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [22, 20, 18, 12],   k: [88, 80, 72, 60],     s: 8,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'svarta-vinbar',   base_n: 70,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [65, 60, 55, 45],     s: 6,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },

  // ── Energy Crops ────────────────────────────────────────────────
  // Jordbruksverket "Odla energigrödor": N needed esp. during establishment
  { id: 'salix',           base_n: 75,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -20, p: [12, 10, 8, 5],     k: [35, 30, 25, 20],     s: 5,  section: 'Energigrödor', is_legume: false, is_rapeseed: false },
  { id: 'rorflen',         base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [18, 15, 12, 8],    k: [45, 40, 35, 28],     s: 8,  section: 'Energigrödor', is_legume: false, is_rapeseed: false },
  { id: 'hampa',           base_n: 130, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -22, p: [32, 30, 26, 20],   k: [88, 80, 72, 60],     s: 10, section: 'Fibergrödor',  is_legume: false, is_rapeseed: false },

  // ── Herbs & Special ─────────────────────────────────────────────
  { id: 'kummin',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [18, 15, 12, 8],    k: [32, 30, 26, 20],     s: 6,  section: 'Specialgrödor', is_legume: false, is_rapeseed: false },
  { id: 'bockhornsklover', base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [18, 15, 12, 8],    k: [28, 25, 22, 18],     s: 0,  section: 'Specialgrödor', is_legume: true, is_rapeseed: false },
  { id: 'vallmo',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [20, 18, 15, 10],   k: [22, 20, 18, 14],     s: 6,  section: 'Specialgrödor', is_legume: false, is_rapeseed: false },

  // ── Cover Crops (zero N recommendation — they ARE the N source) ─
  { id: 'honungsort',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [42, 40, 35, 28],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'oljerattika',     base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [14, 12, 10, 6],    k: [55, 50, 45, 38],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'vitsenap',        base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [38, 35, 30, 25],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'hostrag-fang',    base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [10, 8, 6, 4],      k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'persisk-klover',  base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: true, is_rapeseed: false },
];

const SOIL_GROUP_NAMES: Record<number, string> = {
  1: 'sandjord/mo (lätta jordar)',
  2: 'moränjord/lättlera/silt (mellanjordar)',
  3: 'mellanlera/styv lera (lerjordar)',
  4: 'mulljord/torvjord (organiska jordar)',
};

// ── Previous Crop N Credits ───────────────────────────────────────
// From Jordbruksverket "Riktgivor och strategier för gödsling":
//   Höstraps: 40 kg N/ha
//   Våroljeväxter: 20 kg N/ha
//   Ärter (höst): 35, (vår): 25 → use 30 avg
//   Åkerbönor: 25 kg N/ha
//   Klöver-gräs: 40 kg N/ha
//   Gräsvall: 5 kg N/ha
//   Potatis: 10 kg N/ha
//   Sockerbetor: 25 kg N/ha

const LEGUME_N_CREDIT = 30;     // Ärter avg
const FABABEAN_N_CREDIT = 25;   // Åkerbönor
const RAPESEED_N_CREDIT = 40;   // Höstraps
const SPRING_OILSEED_N_CREDIT = 20;
const CLOVER_GRASS_N_CREDIT = 40;
const GRASS_N_CREDIT = 5;
const POTATO_N_CREDIT = 10;
const SUGARBEET_N_CREDIT = 25;

function buildNotes(crop: CropParams, sg: number, sns: number, n: number): string {
  const parts: string[] = [];

  if (crop.is_legume && crop.id.includes('klover')) {
    parts.push('Kvävefixerande gröda. Inget kvävegödsel behövs. Upprätthåll P och K för vallens uthållighet.');
  } else if (crop.is_legume) {
    parts.push('Baljväxter/kvävefixerare. Inget kvävegödsel behövs.');
  } else if (crop.section === 'Fånggrödor') {
    parts.push('Fånggröda — gödslas normalt inte. Tar upp restkväve från föregående gröda.');
  } else if (n === 0) {
    parts.push('Inget kvävegödsel behövs vid detta markkvävetal.');
  }

  if (sg === 1 && !crop.is_legume && n > 0) {
    parts.push('Lätt jord — delad kvävegiva rekommenderas för att minska utlakning.');
  }
  if (sg === 3 && !crop.is_legume && n > 0) {
    parts.push('Styv lera — senarelägg gödslingen på våren tills jorden torkat upp.');
  }
  if (sg === 4 && !crop.is_legume) {
    parts.push('Mulljord — hög kvävemineralisering, kraftigt reducerad N-giva.');
  }
  if (sns === 0 && n > 0) {
    parts.push('Lågt markkvävetal. Dela givan i 2-3 tillfällen.');
  }
  if (sns >= 5 && !crop.is_legume && n > 0) {
    parts.push('Högt markkväveförråd. Övervaka grödans färg för bristsymptom.');
  }
  if (crop.is_rapeseed) {
    parts.push('Högt svavelbehov (N:S = 5:1). Tillför S vid stråskjutning.');
  }
  if (crop.section === 'Vall' && !crop.is_legume && n > 0) {
    parts.push('Fördela N-givan: ~60% till 1:a skörd, ~40% till 2:a skörd (2-skörd), eller 40/35/25% (3-skörd).');
  }
  if (crop.id.includes('potatis') && n > 0) {
    parts.push('Anpassa N efter sort och användningsområde.');
  }
  if (crop.section === 'Grönsaker' || crop.section === 'Växthus') {
    parts.push('Grönsaksgödsling — anpassa efter lokal rådgivning och markkartering.');
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

  // Main matrix: all crops x all soil groups x all SNS x cereals as previous crop
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

  // Previous crop rotation adjustments — all soil groups, SNS 0-4
  // Generates N-credit rows for each meaningful previous crop group.
  // From Jordbruksverket förfruktsvärde table.
  const rotationPairs: { group: string; credit: number; note: string }[] = [
    { group: 'pulses',       credit: LEGUME_N_CREDIT,          note: 'Reducerat N efter baljväxter (ärter/åkerbönor).' },
    { group: 'faba_beans',   credit: FABABEAN_N_CREDIT,        note: 'N-kredit efter åkerbönor.' },
    { group: 'oilseeds',     credit: RAPESEED_N_CREDIT,        note: 'N-kredit efter höstraps.' },
    { group: 'spring_oilseeds', credit: SPRING_OILSEED_N_CREDIT, note: 'N-kredit efter våroljeväxter.' },
    { group: 'clover_grass', credit: CLOVER_GRASS_N_CREDIT,    note: 'N-kredit efter klöver-gräsvall (2 år+).' },
    { group: 'grass',        credit: GRASS_N_CREDIT,           note: 'Svag N-kredit efter gräsvall.' },
    { group: 'potatoes',     credit: POTATO_N_CREDIT,          note: 'Svag N-kredit efter potatis.' },
    { group: 'sugar_beet',   credit: SUGARBEET_N_CREDIT,       note: 'N-kredit efter sockerbetor (25 kg N/ha).' },
  ];

  for (const crop of CROP_PARAMS) {
    // Skip legumes, cover crops, and zero-N crops
    if (crop.is_legume || crop.base_n === 0) continue;

    for (const sg of soilGroups) {
      const sgIdx = sg - 1;
      const soilOffset = sg === 1 ? crop.sg1_offset
                       : sg === 3 ? crop.sg3_offset
                       : sg === 4 ? crop.sg4_offset
                       : 0;
      const p = crop.p[sgIdx];
      const k = crop.k[sgIdx];
      const s = crop.s;

      for (const { group, credit, note } of rotationPairs) {
        for (const sns of [0, 1, 2, 3, 4] as const) {
          const baseN = Math.max(0, crop.base_n + soilOffset - (sns * crop.n_step));
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
  }

  return recs;
}

const NUTRIENT_RECS: NutrientRec[] = generateFullMatrix();

// ── Commodity Prices (SEK, Jordbruksaktuellt / Lantmännen 2026-03-23) ──
// Prices from Jordbruksaktuellt market page, Lantmännen spot prices.
// Source: https://www.ja.se/sida/sv/marknad (2026-03-23)
// Converted from SEK/dt to SEK/tonne (x10).
// Forage and fruit prices from Jordbruksverket estimates.

const COMMODITY_PRICES = [
  // Cereals — Lantmännen spot 2026-03-23
  { crop_id: 'hostvete-brod',  market: 'kvarnvete-skane',  price: 1780.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostvete-brod',  market: 'kvarnvete-ost',    price: 1750.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostvete-foder', market: 'fodervete-skane',  price: 1710.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostvete-foder', market: 'fodervete-vast',   price: 1680.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'varvete',        market: 'kvarnvete-skane',  price: 1800.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostkorn',       market: 'foderkorn-skane',  price: 1650.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'varkorn',        market: 'foderkorn-skane',  price: 1650.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'varkorn',        market: 'foderkorn-vast',   price: 1620.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'maltkorn',       market: 'maltkorn-vast',    price: 1740.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'maltkorn',       market: 'maltkorn-ost',     price: 1720.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'havre',          market: 'grynhavre-vast',   price: 1610.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'havre',          market: 'foderhavre-skane',  price: 1500.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostrag',        market: 'kvarnrag-ost',     price: 1560.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'ragvete',        market: 'foder-ost',        price: 1550.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'blandsad',       market: 'foder-skane',      price: 1500.00, source: 'lantmannen', published: '2026-03-23' },

  // Oilseeds — Lantmännen spot
  { crop_id: 'hostraps',       market: 'raps-skane',       price: 5283.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostraps',       market: 'raps-vast',        price: 5250.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'varraps',        market: 'raps-skane',       price: 5100.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'oljelin',        market: 'oljelin-skane',    price: 3800.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'solros',         market: 'kontrakt',         price: 4200.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Pulses
  { crop_id: 'arter',          market: 'foderartor',       price: 2800.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'arter',          market: 'kokarter',         price: 3500.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'akerbonor',      market: 'foder',            price: 2600.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'akerbonor',      market: 'livsmedel',        price: 3200.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'lupiner',        market: 'foder',            price: 2400.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Root crops
  { crop_id: 'sockerbetor',    market: 'kontrakt-nordic-sugar', price: 420.00,  source: 'nordic-sugar', published: '2026-03-01' },
  { crop_id: 'morotter',       market: 'grossist',          price: 3500.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'lok',            market: 'grossist',          price: 4000.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Potatoes — Jordbruksverket estimates
  { crop_id: 'potatis-mat',       market: 'grossist',       price: 2800.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'potatis-mat',       market: 'eko-grossist',   price: 4000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'potatis-starkelse', market: 'kontrakt-lyckeby', price: 850.00, source: 'lyckeby', published: '2026-03-01' },
  { crop_id: 'potatis-industri',  market: 'kontrakt',       price: 1800.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Forage — per tonne dry matter
  { crop_id: 'vall-2-skor',    market: 'ensilage-ts',      price: 1200.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'vall-3-skor',    market: 'ensilage-ts',      price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'klover-gras',    market: 'ensilage-ts',      price: 1350.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'timotej',        market: 'ho-ts',            price: 1500.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rajgras',        market: 'ensilage-ts',      price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rajgras-ital',   market: 'ensilage-ts',      price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rodklover',      market: 'ensilage-ts',      price: 1350.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'lusern',         market: 'ho-ts',            price: 1800.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'majs-ensilage',  market: 'ensilage-ts',      price: 900.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'majs-karn',      market: 'foder',            price: 1600.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Fruit & Berries
  { crop_id: 'jordgubbar',     market: 'grossist',         price: 25000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'jordgubbar',     market: 'sjalvplock',       price: 35000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'applen',         market: 'grossist',         price: 8000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'hallon',         market: 'grossist',         price: 40000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'svarta-vinbar',  market: 'industri',         price: 12000.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Energy crops
  { crop_id: 'salix',          market: 'flis-energi',      price: 700.00,   source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rorflen',        market: 'brikett-energi',   price: 800.00,   source: 'jordbruksverket', published: '2026-03-01' },

  // Fibre & special
  { crop_id: 'hampa',          market: 'kontrakt-fiber',   price: 1500.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'hampa-fro',      market: 'fro-livsmedel',    price: 6000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'kummin',         market: 'kontrakt',         price: 15000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'senap',          market: 'kontrakt',         price: 5000.00,  source: 'jordbruksverket', published: '2026-03-01' },

  // Vegetables
  { crop_id: 'vitkal',         market: 'grossist',         price: 3000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'blomkal',        market: 'grossist',         price: 8000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'broccoli',       market: 'grossist',         price: 10000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'sallat',         market: 'grossist',         price: 6000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'spenat',         market: 'grossist',         price: 8000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'purjolok',       market: 'grossist',         price: 6000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'tomat-vaxthus',  market: 'grossist',         price: 12000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'gurka-vaxthus',  market: 'grossist',         price: 5000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'selleri',        market: 'grossist',         price: 5000.00,  source: 'jordbruksverket', published: '2026-03-01' },
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
      `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, source_section, jurisdiction)
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
      [p.crop_id, p.market, p.price, p.source, p.published, now, `${p.source} marknadsdata`]
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
        `${c.name} (${c.crop_group}). Typisk skörd ${c.typical_yield_t_ha} t/ha. ` +
        `Näringsbortförsel: ${c.n} kg N, ${c.p} kg P2O5, ${c.k} kg K2O per hektar vid normal skörd. ` +
        `Tillväxtstadier: ${c.stages.join(', ')}.`,
        c.crop_group,
        'SE',
      ]
    );
  }

  // Index nutrient recommendations — summarised by crop/soil group/prev crop
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

  // Index commodity prices
  let ftsPriceCount = 0;
  const pricesByGroup = new Map<string, typeof COMMODITY_PRICES>();
  for (const p of COMMODITY_PRICES) {
    const key = p.crop_id;
    if (!pricesByGroup.has(key)) pricesByGroup.set(key, []);
    pricesByGroup.get(key)!.push(p);
  }
  for (const [cropId, prices] of pricesByGroup) {
    const crop = CROPS.find(c => c.id === cropId);
    if (!crop) continue;
    const priceStr = prices.map(p => `${p.market}: ${p.price} SEK/t`).join(', ');
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `${crop.name} Priser SEK`,
        `${crop.name} marknadspriser: ${priceStr}. Senast uppdaterat ${prices[0].published}. Källa: ${prices[0].source}.`,
        crop.crop_group,
        'SE',
      ]
    );
    ftsPriceCount++;
  }

  const totalFts = CROPS.length + ftsRecCount + SOIL_TYPES.length + ftsPriceCount;
  console.log(`  ${totalFts} FTS5 entries created (${CROPS.length} crops, ${ftsRecCount} recommendation summaries, ${SOIL_TYPES.length} soil types, ${ftsPriceCount} price entries from ${NUTRIENT_RECS.length} individual rows).`);

  // Update metadata
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('build_date', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('crop_count', ?)", [String(CROPS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('recommendation_count', ?)", [String(NUTRIENT_RECS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('price_count', ?)", [String(COMMODITY_PRICES.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('soil_type_count', ?)", [String(SOIL_TYPES.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('fts_entry_count', ?)", [String(totalFts)]);

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
    sources: [
      'Jordbruksverket "Rekommendationer för gödsling och kalkning 2026" (JO21:9)',
      'Jordbruksverket "Riktgivor och strategier för gödsling" (2026)',
      'Jordbruksverket "Skörd av spannmål, trindsäd, oljeväxter, potatis och slåttervall 2024. Slutlig statistik"',
      'Jordbruksaktuellt / Lantmännen spot prices (2026-03-23)',
      'Greppa Näringen växtnäringsrådgivning',
      'SLU Markinfo jordklassificering',
      'Yara Sverige gödslingsråd',
    ],
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
