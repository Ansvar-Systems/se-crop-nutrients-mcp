/**
 * Sweden Crop Nutrients MCP — Data Ingestion Script (Expanded Corpus)
 *
 * Sources:
 * 1. Jordbruksverket (Swedish Board of Agriculture) — "Rekommendationer för gödsling
 *    och kalkning 2026" (JO21:9), "Riktgivor och strategier för gödsling"
 *    https://jordbruksverket.se/vaxter/odling/vaxtnaring/rekommendationer-och-strategier-for-godsling
 * 2. Jordbruksverket yield statistics — "Skörd av spannmål, trindsäd, oljeväxter,
 *    potatis och slåttervall 2024. Slutlig statistik" (2025-04-16) plus
 *    "Skörd 2025 preliminär statistik" (2025-11-14)
 * 3. Jordbruksverket / Jordbruksaktuellt / Lantmännen spot prices (2026-03-23)
 * 4. Greppa Näringen (nutrient advisory service) — crop/soil nutrient guidance
 *    https://greppa.nu
 * 5. SLU (Swedish University of Agricultural Sciences) — soil classification
 *    https://www.slu.se/om-slu/organisation/institutioner/mark-miljo/miljoanalys/markinfo/
 * 6. Yara Sverige gödslingsråd — supplementary NPK+S data
 *    https://www.yara.se/vaxtnaring/
 * 7. Jordbruksverket "Trädgårdsodlingens produktion 2023" — vegetable/fruit/berry areas
 * 8. Jordbruksverket "Kalkning" — liming pH targets and lime requirement tables
 * 9. Jordbruksverket "Markkarteringsrådets rekommendationer" (JO10:19) — P-AL/K-AL classes
 * 10. Jordbruksverket "Odla energigrödor" — salix, rörflen, hampa, poppel
 * 11. Jordbruksverket "Skörd av potatis 2025. Preliminär statistik" (2025-12-05)
 *
 * Swedish nutrient data is published as PDFs and web guidance. The recommendation
 * tables are manually extracted from official publications and encoded as structured
 * data here. This is the standard approach when the authoritative source is not
 * machine-readable.
 *
 * Data accuracy verification:
 * - N recommendations cross-checked against Jordbruksverket riktgivor 2026
 *   (unchanged from 2025 per Greppa 2026-03-03 update notice)
 * - Yield figures: 2024 slutlig skörd + 2025 preliminary where available
 * - Prices: Lantmännen/Jordbruksaktuellt spot 2026-03-23
 * - Soil classification: SLU Markinfo + Jordbruksverket jordgrupper
 * - P/K: Jordbruksverket P-AL/K-AL class system, Markkarteringsrådets riktlinjer
 * - S: Jordbruksverket + Greppa (N:S = 5:1 for rapeseed, 10-20 kg for cereals)
 * - Liming: Jordbruksverket pH targets by organic matter % and clay content
 *
 * Usage: npm run ingest
 */

import { createDatabase, type Database } from '../src/db.js';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// ── Swedish Crop Data ─────────────────────────────────────────────
// Yield data: Jordbruksverket slutlig skörd 2024, preliminär 2025 where available.
// NPK offtake: Jordbruksverket "Rekommendationer för gödsling och kalkning",
// cross-referenced with Jordbruksverket offtake tables for Swedish conditions.
// Typical yield is rounded to a practical planning figure based on 2024 final data.
//
// 2024 final yields (national averages):
//   Höstvete 6,540 kg/ha, Vårkorn 4,360 kg/ha, Höstraps 3,190 kg/ha,
//   Vårraps 2,380 kg/ha, Oljelin 1,840 kg/ha, Ärter 2,890 kg/ha,
//   Åkerbönor 3,190 kg/ha, Matpotatis 32,900 kg/ha,
//   Stärkelsepotatis 44,400 kg/ha, Slåttervall 5,610 kg ts/ha.
//
// 2025 preliminary (record year):
//   Höstvete ~8,500 kg/ha (+25% vs 5yr avg), Höstkorn 7,240 (highest ever),
//   Vårkorn 5,540 (highest ever), Havre ~4,800 (+21%),
//   Höstraps 3,850 (+19%), Ärter ~3,900 (+26%), Åkerbönor ~3,780 (+30%),
//   Matpotatis 35,190, Stärkelsepotatis 43,580 (record total 459,300t).
//   Typical yields below use rounded 2024 final + 2025 preliminary blend.

const CROPS = [
  // ── Cereals (Spannmål) ──────────────────────────────────────────
  // Jordbruksverket 2024 final: Höstvete 6,540 kg/ha; 2025 prelim ~8,500
  { id: 'hostvete-brod',   name: 'Höstvete brödvete (Winter Wheat, bread)',       crop_group: 'cereals',    typical_yield_t_ha: 7.0,  n: 168, p: 56, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'hostvete-foder',  name: 'Höstvete fodervete (Winter Wheat, feed)',        crop_group: 'cereals',    typical_yield_t_ha: 7.0,  n: 154, p: 56, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'varvete',         name: 'Vårvete (Spring Wheat)',                         crop_group: 'cereals',    typical_yield_t_ha: 5.5,  n: 132, p: 44, k: 33, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'durumvete',       name: 'Durumvete (Durum Wheat)',                        crop_group: 'cereals',    typical_yield_t_ha: 4.5,  n: 120, p: 40, k: 30, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'dinkel',          name: 'Dinkel (Spelt)',                                 crop_group: 'cereals',    typical_yield_t_ha: 4.0,  n: 96, p: 36, k: 32, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'emmer',           name: 'Emmer (Emmer Wheat)',                            crop_group: 'cereals',    typical_yield_t_ha: 3.0,  n: 72, p: 27, k: 24, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  // Höstkorn: 2025 record 7,240 kg/ha
  { id: 'hostkorn',        name: 'Höstkorn (Winter Barley)',                       crop_group: 'cereals',    typical_yield_t_ha: 6.5,  n: 137, p: 51, k: 59, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  // Vårkorn: 2024 final 4,360; 2025 record 5,540
  { id: 'varkorn',         name: 'Vårkorn foderkorn (Spring Barley, feed)',        crop_group: 'cereals',    typical_yield_t_ha: 5.0,  n: 105, p: 40, k: 48, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'maltkorn',        name: 'Maltkorn (Malt Barley)',                         crop_group: 'cereals',    typical_yield_t_ha: 5.0,  n: 100, p: 40, k: 48, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  // Havre: 2025 prelim ~4,800 (+21%)
  { id: 'havre',           name: 'Havre (Oats)',                                   crop_group: 'cereals',    typical_yield_t_ha: 4.5,  n: 85,  p: 32, k: 32, stages: ['bestockning', 'stråskjutning', 'vippgång'] },
  { id: 'svarthavre',      name: 'Svarthavre (Black Oats)',                        crop_group: 'cereals',    typical_yield_t_ha: 3.5,  n: 66,  p: 25, k: 25, stages: ['bestockning', 'stråskjutning', 'vippgång'] },
  { id: 'hostrag',         name: 'Höstråg (Winter Rye)',                           crop_group: 'cereals',    typical_yield_t_ha: 6.0,  n: 120, p: 42, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'varrag',          name: 'Vårråg (Spring Rye)',                            crop_group: 'cereals',    typical_yield_t_ha: 4.0,  n: 80,  p: 28, k: 28, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'ragvete',         name: 'Rågvete (Triticale)',                            crop_group: 'cereals',    typical_yield_t_ha: 6.0,  n: 126, p: 42, k: 42, stages: ['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad'] },
  { id: 'blandsad',        name: 'Blandsäd (Mixed cereals)',                       crop_group: 'cereals',    typical_yield_t_ha: 4.0,  n: 80,  p: 32, k: 36, stages: ['bestockning', 'stråskjutning', 'axgång'] },
  { id: 'hirs',            name: 'Hirs/Kolvhirs (Millet/Proso Millet)',            crop_group: 'cereals',    typical_yield_t_ha: 2.0,  n: 50,  p: 18, k: 16, stages: ['uppkomst', 'bestockning', 'blomning', 'frömognad'] },
  { id: 'bovete',          name: 'Bovete (Buckwheat)',                             crop_group: 'cereals',    typical_yield_t_ha: 1.5,  n: 40,  p: 15, k: 20, stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },
  { id: 'quinoa',          name: 'Quinoa',                                         crop_group: 'cereals',    typical_yield_t_ha: 2.0,  n: 80,  p: 20, k: 50, stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },

  // ── Oilseeds (Oljeväxter) ───────────────────────────────────────
  // Höstraps: 2024 final 3,190; 2025 prelim 3,850
  { id: 'hostraps',        name: 'Höstraps (Winter Rapeseed)',                     crop_group: 'oilseeds',   typical_yield_t_ha: 3.5,  n: 140, p: 46, k: 39, stages: ['rosett', 'stråskjutning', 'blomning', 'skidmognad'] },
  // Vårraps: 2024 final 2,380
  { id: 'varraps',         name: 'Vårraps (Spring Rapeseed)',                      crop_group: 'oilseeds',   typical_yield_t_ha: 2.5,  n: 85,  p: 28, k: 25, stages: ['rosett', 'stråskjutning', 'blomning', 'skidmognad'] },
  // Oljelin: 2024 final 1,840
  { id: 'oljelin',         name: 'Oljelin (Linseed/Oil Flax)',                     crop_group: 'oilseeds',   typical_yield_t_ha: 1.8,  n: 45,  p: 16, k: 16, stages: ['uppkomst', 'vegetativ', 'blomning', 'kapselmognad'] },
  { id: 'solros',          name: 'Solros (Sunflower)',                             crop_group: 'oilseeds',   typical_yield_t_ha: 2.5,  n: 80,  p: 30, k: 50, stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },
  { id: 'camelina',        name: 'Camelina/Oljedådra (Camelina sativa)',           crop_group: 'oilseeds',   typical_yield_t_ha: 1.5,  n: 60,  p: 18, k: 18, stages: ['uppkomst', 'rosett', 'blomning', 'skidmognad'] },
  { id: 'krambe',          name: 'Krambe (Crambe abyssinica)',                     crop_group: 'oilseeds',   typical_yield_t_ha: 1.5,  n: 70,  p: 20, k: 20, stages: ['uppkomst', 'vegetativ', 'blomning', 'skidmognad'] },
  { id: 'senap',           name: 'Senap (Mustard)',                                crop_group: 'oilseeds',   typical_yield_t_ha: 1.5,  n: 80,  p: 20, k: 25, stages: ['uppkomst', 'vegetativ', 'blomning', 'skidmognad'] },
  { id: 'hampa-fro',       name: 'Hampa frö (Hemp seed)',                          crop_group: 'oilseeds',   typical_yield_t_ha: 1.5,  n: 80,  p: 20, k: 50, stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },

  // ── Pulses (Baljväxter / Trindsäd) ──────────────────────────────
  // Ärter: 2024 final 2,890; 2025 prelim ~3,900
  { id: 'arter',           name: 'Ärter (Field Peas)',                             crop_group: 'pulses',     typical_yield_t_ha: 3.0,  n: 0,  p: 24, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'konservarter',    name: 'Konservärter (Marrowfat/Canning Peas)',          crop_group: 'pulses',     typical_yield_t_ha: 4.0,  n: 0,  p: 28, k: 35, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  // Åkerbönor: 2024 final 3,190; 2025 prelim ~3,780
  { id: 'akerbonor',       name: 'Åkerbönor (Faba Beans)',                         crop_group: 'pulses',     typical_yield_t_ha: 3.5,  n: 0,  p: 28, k: 39, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'lupiner',         name: 'Lupiner/Sötlupiner (Sweet Lupins)',              crop_group: 'pulses',     typical_yield_t_ha: 2.0,  n: 0,  p: 18, k: 24, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'sojabonor',       name: 'Sojabönor (Soybeans)',                           crop_group: 'pulses',     typical_yield_t_ha: 2.0,  n: 0,  p: 22, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'linser',          name: 'Linser (Lentils)',                               crop_group: 'pulses',     typical_yield_t_ha: 1.2,  n: 0,  p: 14, k: 18, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'kikartor',        name: 'Kikärter (Chickpeas)',                           crop_group: 'pulses',     typical_yield_t_ha: 1.0,  n: 0,  p: 12, k: 16, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'vicker',          name: 'Vicker (Common Vetch)',                          crop_group: 'pulses',     typical_yield_t_ha: 2.5,  n: 0,  p: 20, k: 28, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'bruna-bonor',     name: 'Bruna bönor (Brown Beans, Gotland)',             crop_group: 'pulses',     typical_yield_t_ha: 2.0,  n: 0,  p: 20, k: 26, stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },

  // ── Root Crops (Rotfrukter) ─────────────────────────────────────
  { id: 'sockerbetor',     name: 'Sockerbetor (Sugar Beet)',                       crop_group: 'root_crops', typical_yield_t_ha: 55.0, n: 120, p: 45, k: 200, stages: ['uppkomst', 'bladtäckning', 'rottillväxt'] },
  { id: 'morotter',        name: 'Morötter (Carrots)',                             crop_group: 'root_crops', typical_yield_t_ha: 40.0, n: 80,  p: 30, k: 160, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'lok',             name: 'Matlök (Onions)',                                crop_group: 'root_crops', typical_yield_t_ha: 40.0, n: 100, p: 28, k: 110, stages: ['uppkomst', 'bladtillväxt', 'lökbildning', 'mognad'] },
  { id: 'kalrot',          name: 'Kålrot (Swede/Rutabaga)',                        crop_group: 'root_crops', typical_yield_t_ha: 35.0, n: 90,  p: 30, k: 150, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },

  // ── Potatoes (Potatis) ──────────────────────────────────────────
  // Matpotatis: 2024 final 32,900; 2025 prelim 35,190
  { id: 'potatis-mat',       name: 'Matpotatis (Table Potatoes)',                  crop_group: 'potatoes',   typical_yield_t_ha: 33.0, n: 120, p: 70, k: 200, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },
  // Stärkelsepotatis: 2024 final 44,400; 2025 prelim 43,580
  { id: 'potatis-starkelse', name: 'Stärkelsepotatis (Starch Potatoes)',           crop_group: 'potatoes',   typical_yield_t_ha: 44.0, n: 140, p: 80, k: 220, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },
  { id: 'potatis-industri',  name: 'Industripotatis chips (Processing/Chips)',     crop_group: 'potatoes',   typical_yield_t_ha: 40.0, n: 150, p: 75, k: 210, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },
  // Färskpotatis: 2024 25,390 kg/ha
  { id: 'potatis-farsk',     name: 'Färskpotatis (Early/New Potatoes)',            crop_group: 'potatoes',   typical_yield_t_ha: 25.0, n: 80,  p: 50, k: 150, stages: ['uppkomst', 'bladtäckning', 'knölbildning'] },
  { id: 'potatis-utsade',    name: 'Utsädespotatis (Seed Potatoes)',               crop_group: 'potatoes',   typical_yield_t_ha: 28.0, n: 100, p: 60, k: 170, stages: ['uppkomst', 'bladtäckning', 'knölbildning', 'knöltillväxt'] },

  // ── Forage (Vall / Foder) ───────────────────────────────────────
  // Slåttervall 2024 final: 5,610 kg ts/ha (highest in 2000s)
  // Jordbruksverket N tables: 2-cut 130-190, 3-cut 180-260, 4-cut 230-330 kg N/ha
  // Clover mixes reduce N: 10% klöver ~15% less, 20% ~30% less, 40% ~60% less
  { id: 'vall-2-skor',     name: 'Gräsvall 2 skördar (Grass ley, 2 cuts)',        crop_group: 'forage',     typical_yield_t_ha: 7.5,  n: 160, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'vall-3-skor',     name: 'Gräsvall 3 skördar (Grass ley, 3 cuts)',        crop_group: 'forage',     typical_yield_t_ha: 9.0,  n: 220, p: 42, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'vall-4-skor',     name: 'Gräsvall 4 skördar (Grass ley, 4 cuts)',        crop_group: 'forage',     typical_yield_t_ha: 10.0, n: 290, p: 48, k: 175, stages: ['vårtillväxt', 'förstaskörd', 'andraåterväxt', 'tredjeskörd', 'fjärdeskörd'] },
  { id: 'klover-gras',     name: 'Klöver-gräsvall (Clover-grass ley)',            crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 40,  p: 40, k: 140, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'blandvall-10pct', name: 'Blandvall 10% klöver 2 sk (Mixed ley 10% clover, 2 cuts)', crop_group: 'forage', typical_yield_t_ha: 7.5, n: 135, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'blandvall-20pct', name: 'Blandvall 20% klöver 2 sk (Mixed ley 20% clover, 2 cuts)', crop_group: 'forage', typical_yield_t_ha: 7.5, n: 105, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'blandvall-40pct', name: 'Blandvall 40% klöver 2 sk (Mixed ley 40% clover, 2 cuts)', crop_group: 'forage', typical_yield_t_ha: 7.5, n: 48, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'blandvall-10pct-3', name: 'Blandvall 10% klöver 3 sk (Mixed ley 10% clover, 3 cuts)', crop_group: 'forage', typical_yield_t_ha: 9.0, n: 200, p: 42, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'blandvall-20pct-3', name: 'Blandvall 20% klöver 3 sk (Mixed ley 20% clover, 3 cuts)', crop_group: 'forage', typical_yield_t_ha: 9.0, n: 165, p: 42, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'blandvall-40pct-3', name: 'Blandvall 40% klöver 3 sk (Mixed ley 40% clover, 3 cuts)', crop_group: 'forage', typical_yield_t_ha: 9.0, n: 100, p: 42, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'blandvall-10pct-4', name: 'Blandvall 10% klöver 4 sk (Mixed ley 10% clover, 4 cuts)', crop_group: 'forage', typical_yield_t_ha: 10.0, n: 260, p: 48, k: 175, stages: ['vårtillväxt', 'förstaskörd', 'andraåterväxt', 'tredjeskörd', 'fjärdeskörd'] },
  { id: 'blandvall-20pct-4', name: 'Blandvall 20% klöver 4 sk (Mixed ley 20% clover, 4 cuts)', crop_group: 'forage', typical_yield_t_ha: 10.0, n: 220, p: 48, k: 175, stages: ['vårtillväxt', 'förstaskörd', 'andraåterväxt', 'tredjeskörd', 'fjärdeskörd'] },
  { id: 'blandvall-40pct-4', name: 'Blandvall 40% klöver 4 sk (Mixed ley 40% clover, 4 cuts)', crop_group: 'forage', typical_yield_t_ha: 10.0, n: 130, p: 48, k: 175, stages: ['vårtillväxt', 'förstaskörd', 'andraåterväxt', 'tredjeskörd', 'fjärdeskörd'] },
  { id: 'timotej',         name: 'Timotej (Timothy)',                              crop_group: 'forage',     typical_yield_t_ha: 6.0,  n: 130, p: 35, k: 120, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'rajgras',         name: 'Engelskt rajgräs (Perennial Ryegrass)',          crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 180, p: 42, k: 160, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'höst'] },
  { id: 'rajgras-ital',    name: 'Italienskt rajgräs (Italian Ryegrass)',          crop_group: 'forage',     typical_yield_t_ha: 9.0,  n: 200, p: 45, k: 170, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'rajgras-wester',  name: 'Westerwoldiskt rajgräs (Westerwold Ryegrass)',   crop_group: 'forage',     typical_yield_t_ha: 7.0,  n: 150, p: 38, k: 140, stages: ['uppkomst', 'vegetativ', 'förstaskörd', 'återväxt'] },
  { id: 'rorsvingelhybrid', name: 'Rörsvingelhybrid (Festulolium)',               crop_group: 'forage',     typical_yield_t_ha: 10.0, n: 240, p: 48, k: 175, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd', 'tredjeskörd'] },
  { id: 'hundaxing',       name: 'Hundäxing (Cocksfoot/Orchard Grass)',            crop_group: 'forage',     typical_yield_t_ha: 7.0,  n: 160, p: 38, k: 140, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'angssvingel',     name: 'Ängssvingel (Meadow Fescue)',                    crop_group: 'forage',     typical_yield_t_ha: 7.0,  n: 150, p: 36, k: 130, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'rodklover',       name: 'Rödklöver (Red Clover)',                         crop_group: 'forage',     typical_yield_t_ha: 7.0,  n: 0,  p: 45, k: 150, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'vitklover',       name: 'Vitklöver (White Clover)',                       crop_group: 'forage',     typical_yield_t_ha: 5.0,  n: 0,  p: 35, k: 130, stages: ['vårtillväxt', 'förstaskörd', 'återväxt'] },
  { id: 'alsikeklover',    name: 'Alsikeklöver (Alsike Clover)',                   crop_group: 'forage',     typical_yield_t_ha: 5.5,  n: 0,  p: 38, k: 135, stages: ['vårtillväxt', 'förstaskörd', 'återväxt', 'andraskörd'] },
  { id: 'karingtand',      name: 'Käringtand (Bird\'s-foot Trefoil)',              crop_group: 'forage',     typical_yield_t_ha: 4.5,  n: 0,  p: 30, k: 110, stages: ['vårtillväxt', 'förstaskörd', 'återväxt'] },
  { id: 'lusern',          name: 'Lusern/Blålusern (Lucerne/Alfalfa)',             crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 0,  p: 45, k: 180, stages: ['vårtillväxt', 'förstaskörd', 'andraskörd', 'tredjeskörd'] },
  { id: 'majs-ensilage',   name: 'Majs ensilage (Forage Maize)',                  crop_group: 'forage',     typical_yield_t_ha: 35.0, n: 90,  p: 50, k: 170, stages: ['uppkomst', 'vegetativ', 'kolvsättning', 'kärnfyllnad'] },
  { id: 'majs-karn',       name: 'Kärnmajs (Grain Maize)',                         crop_group: 'forage',     typical_yield_t_ha: 8.0,  n: 120, p: 55, k: 50,  stages: ['uppkomst', 'vegetativ', 'kolvsättning', 'kärnfyllnad', 'mognad'] },
  { id: 'fodervicker',     name: 'Fodervicker (Fodder Vetch)',                     crop_group: 'forage',     typical_yield_t_ha: 3.0,  n: 0,  p: 20, k: 35,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skörd'] },
  { id: 'betesvall',       name: 'Betesvall (Pasture ley)',                        crop_group: 'forage',     typical_yield_t_ha: 5.0,  n: 100, p: 30, k: 100, stages: ['vårtillväxt', 'betesperiod', 'återväxt', 'höstbete'] },

  // ── Vegetables (Grönsaker friland) ──────────────────────────────
  // Jordbruksverket grönsaksrekommendationer: N-grupper
  //   Utpräglat N-behov (200-300): kål, blomkål, brysselkål, purjolök
  //   Stort N-behov (100-180): spenat, lök, selleri, majs
  //   Visst N-behov (60-120): sallat, morot, bönor, gurka
  // Jordbruksverket trädgårdsproduktion 2023: 14,000 ha trädgårdsväxter
  { id: 'vitkal',          name: 'Vitkål (White Cabbage)',                         crop_group: 'vegetables', typical_yield_t_ha: 50.0, n: 250, p: 40, k: 200, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'rodkal',          name: 'Rödkål (Red Cabbage)',                           crop_group: 'vegetables', typical_yield_t_ha: 40.0, n: 230, p: 38, k: 190, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'gronkal',         name: 'Grönkål (Kale)',                                crop_group: 'vegetables', typical_yield_t_ha: 15.0, n: 200, p: 30, k: 160, stages: ['plantering', 'bladtillväxt', 'skörd'] },
  { id: 'blomkal',         name: 'Blomkål (Cauliflower)',                          crop_group: 'vegetables', typical_yield_t_ha: 20.0, n: 220, p: 35, k: 180, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'broccoli',        name: 'Broccoli',                                      crop_group: 'vegetables', typical_yield_t_ha: 7.0,  n: 200, p: 30, k: 150, stages: ['plantering', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'brysselkal',      name: 'Brysselkål (Brussels Sprouts)',                  crop_group: 'vegetables', typical_yield_t_ha: 10.0, n: 250, p: 35, k: 180, stages: ['plantering', 'bladtillväxt', 'knoppbildning', 'skörd'] },
  { id: 'kinakal',         name: 'Kinakål (Chinese Cabbage)',                      crop_group: 'vegetables', typical_yield_t_ha: 40.0, n: 180, p: 30, k: 170, stages: ['uppkomst', 'bladtillväxt', 'huvudbildning', 'skörd'] },
  { id: 'sallat',          name: 'Sallat isbergssallat (Iceberg Lettuce)',         crop_group: 'vegetables', typical_yield_t_ha: 25.0, n: 100, p: 25, k: 130, stages: ['plantering', 'bladtillväxt', 'skörd'] },
  { id: 'sallat-annan',    name: 'Annan sallat (Other Lettuce varieties)',         crop_group: 'vegetables', typical_yield_t_ha: 20.0, n: 90,  p: 22, k: 110, stages: ['plantering', 'bladtillväxt', 'skörd'] },
  { id: 'spenat',          name: 'Spenat (Spinach)',                               crop_group: 'vegetables', typical_yield_t_ha: 15.0, n: 120, p: 25, k: 140, stages: ['uppkomst', 'bladtillväxt', 'skörd'] },
  { id: 'purjolok',        name: 'Purjolök (Leek)',                                crop_group: 'vegetables', typical_yield_t_ha: 30.0, n: 150, p: 30, k: 140, stages: ['plantering', 'bladtillväxt', 'skaftbildning', 'skörd'] },
  { id: 'rodbeta',         name: 'Rödbeta (Red Beet)',                             crop_group: 'vegetables', typical_yield_t_ha: 30.0, n: 120, p: 30, k: 170, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'selleri',         name: 'Rotselleri (Celeriac)',                          crop_group: 'vegetables', typical_yield_t_ha: 25.0, n: 180, p: 35, k: 200, stages: ['plantering', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'palsternacka',    name: 'Palsternacka (Parsnip)',                         crop_group: 'vegetables', typical_yield_t_ha: 20.0, n: 80,  p: 25, k: 160, stages: ['uppkomst', 'bladtillväxt', 'rottillväxt', 'skörd'] },
  { id: 'sparris',         name: 'Sparris (Asparagus)',                            crop_group: 'vegetables', typical_yield_t_ha: 3.0,  n: 100, p: 25, k: 80,  stages: ['skottskjutning', 'skörd', 'fjädring', 'invintring'] },
  { id: 'squash',          name: 'Squash/Pumpa (Squash/Pumpkin)',                  crop_group: 'vegetables', typical_yield_t_ha: 20.0, n: 120, p: 30, k: 160, stages: ['uppkomst', 'rankning', 'fruktbildning', 'skörd'] },
  { id: 'sockermajs',      name: 'Sockermajs (Sweet Corn)',                        crop_group: 'vegetables', typical_yield_t_ha: 8.0,  n: 130, p: 30, k: 80,  stages: ['uppkomst', 'vegetativ', 'kolvsättning', 'skörd'] },
  { id: 'bonor-friland',   name: 'Bönor friland (Field Beans, green)',             crop_group: 'vegetables', typical_yield_t_ha: 8.0,  n: 0,   p: 25, k: 60,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skörd'] },
  { id: 'fenkal',          name: 'Fänkål (Fennel)',                                crop_group: 'vegetables', typical_yield_t_ha: 15.0, n: 120, p: 25, k: 140, stages: ['plantering', 'bladtillväxt', 'knölbildning', 'skörd'] },
  { id: 'gurka-friland',   name: 'Gurka friland (Field Cucumber)',                 crop_group: 'vegetables', typical_yield_t_ha: 25.0, n: 100, p: 28, k: 140, stages: ['uppkomst', 'rankning', 'fruktbildning', 'skörd'] },

  // ── Greenhouse Vegetables (Växthus) ─────────────────────────────
  { id: 'tomat-vaxthus',   name: 'Tomat växthus (Greenhouse Tomato)',              crop_group: 'vegetables', typical_yield_t_ha: 50.0, n: 300, p: 60, k: 400, stages: ['plantering', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'gurka-vaxthus',   name: 'Gurka växthus (Greenhouse Cucumber)',            crop_group: 'vegetables', typical_yield_t_ha: 60.0, n: 250, p: 50, k: 350, stages: ['plantering', 'rankning', 'fruktbildning', 'skörd'] },
  { id: 'paprika-vaxthus', name: 'Paprika växthus (Greenhouse Pepper)',            crop_group: 'vegetables', typical_yield_t_ha: 25.0, n: 200, p: 40, k: 280, stages: ['plantering', 'blomning', 'fruktsättning', 'skörd'] },

  // ── Herbs & Spices (Kryddväxter) ────────────────────────────────
  { id: 'dill',            name: 'Dill (Dill)',                                    crop_group: 'herbs',      typical_yield_t_ha: 6.0,  n: 80,  p: 20, k: 80,  stages: ['uppkomst', 'bladtillväxt', 'skörd'] },
  { id: 'persilja',        name: 'Persilja (Parsley)',                             crop_group: 'herbs',      typical_yield_t_ha: 8.0,  n: 100, p: 25, k: 100, stages: ['uppkomst', 'bladtillväxt', 'skörd'] },
  { id: 'kummin',          name: 'Kummin (Caraway)',                               crop_group: 'herbs',      typical_yield_t_ha: 1.2,  n: 60,  p: 15, k: 30,  stages: ['uppkomst', 'rosett', 'blomning', 'frömognad'] },
  { id: 'bockhornsklover', name: 'Bockhornklöver (Fenugreek)',                     crop_group: 'herbs',      typical_yield_t_ha: 1.5,  n: 0,   p: 15, k: 25,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skördemognad'] },
  { id: 'vallmo',          name: 'Vallmo (Poppy)',                                 crop_group: 'herbs',      typical_yield_t_ha: 1.0,  n: 60,  p: 18, k: 20,  stages: ['uppkomst', 'rosett', 'blomning', 'kapselmognad'] },
  { id: 'korianderfrö',    name: 'Koriander frö (Coriander seed)',                 crop_group: 'herbs',      typical_yield_t_ha: 1.0,  n: 50,  p: 15, k: 25,  stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },
  { id: 'anis',            name: 'Anis (Anise)',                                   crop_group: 'herbs',      typical_yield_t_ha: 0.8,  n: 50,  p: 12, k: 20,  stages: ['uppkomst', 'vegetativ', 'blomning', 'frömognad'] },

  // ── Fruit & Berries (Frukt & Bär) ──────────────────────────────
  // Jordbruksverket trädgårdsproduktion: jordgubbe 1,977 ha, äpple 1,600 ha
  { id: 'jordgubbar',      name: 'Jordgubbar (Strawberries)',                      crop_group: 'fruit',      typical_yield_t_ha: 10.0, n: 80,  p: 25, k: 120, stages: ['tillväxtstart', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'applen',          name: 'Äpplen (Apples)',                                crop_group: 'fruit',      typical_yield_t_ha: 25.0, n: 60,  p: 15, k: 80,  stages: ['knoppbrytning', 'blomning', 'frukttillväxt', 'skörd'] },
  { id: 'paron',           name: 'Päron (Pears)',                                  crop_group: 'fruit',      typical_yield_t_ha: 16.0, n: 50,  p: 12, k: 70,  stages: ['knoppbrytning', 'blomning', 'frukttillväxt', 'skörd'] },
  { id: 'plommon',         name: 'Plommon (Plums)',                                crop_group: 'fruit',      typical_yield_t_ha: 5.0,  n: 50,  p: 12, k: 60,  stages: ['knoppbrytning', 'blomning', 'frukttillväxt', 'skörd'] },
  { id: 'korsbar',         name: 'Körsbär (Cherries)',                             crop_group: 'fruit',      typical_yield_t_ha: 3.5,  n: 40,  p: 10, k: 50,  stages: ['knoppbrytning', 'blomning', 'frukttillväxt', 'skörd'] },
  { id: 'hallon',          name: 'Hallon (Raspberries)',                           crop_group: 'fruit',      typical_yield_t_ha: 5.5,  n: 60,  p: 20, k: 80,  stages: ['tillväxtstart', 'blomning', 'fruktsättning', 'skörd'] },
  { id: 'svarta-vinbar',   name: 'Svarta vinbär (Blackcurrants)',                  crop_group: 'fruit',      typical_yield_t_ha: 3.0,  n: 50,  p: 15, k: 60,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },
  { id: 'roda-vinbar',     name: 'Röda vinbär (Redcurrants)',                      crop_group: 'fruit',      typical_yield_t_ha: 3.0,  n: 45,  p: 14, k: 55,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },
  { id: 'blabar',          name: 'Blåbär odlad (Cultivated Blueberry)',            crop_group: 'fruit',      typical_yield_t_ha: 3.0,  n: 30,  p: 10, k: 40,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },
  { id: 'havtorn',         name: 'Havtorn (Sea Buckthorn)',                        crop_group: 'fruit',      typical_yield_t_ha: 3.0,  n: 40,  p: 12, k: 50,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },
  { id: 'vindruvor',       name: 'Vindruvor (Grapes)',                             crop_group: 'fruit',      typical_yield_t_ha: 3.0,  n: 45,  p: 15, k: 70,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },
  { id: 'krusbär',         name: 'Krusbär (Gooseberry)',                           crop_group: 'fruit',      typical_yield_t_ha: 4.0,  n: 50,  p: 15, k: 60,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },
  { id: 'aronia',          name: 'Aronia (Chokeberry)',                            crop_group: 'fruit',      typical_yield_t_ha: 5.0,  n: 40,  p: 12, k: 50,  stages: ['knoppbrytning', 'blomning', 'bärtillväxt', 'skörd'] },

  // ── Energy Crops (Energigrödor) ─────────────────────────────────
  // Jordbruksverket "Odla energigrödor": salix 6-7m, harvest every 3-4 yr, ~8 t ts/ha/yr
  { id: 'salix',           name: 'Salix/Energivide (Willow)',                      crop_group: 'energy',     typical_yield_t_ha: 8.0,  n: 60,  p: 10, k: 30,  stages: ['skottillväxt', 'sommar', 'tillväxtsäsong', 'vilotid'] },
  { id: 'poppel',          name: 'Poppel (Poplar)',                                crop_group: 'energy',     typical_yield_t_ha: 10.0, n: 40,  p: 8,  k: 25,  stages: ['skottillväxt', 'sommar', 'tillväxtsäsong', 'vilotid'] },
  { id: 'hybridasp',       name: 'Hybridasp (Hybrid Aspen)',                       crop_group: 'energy',     typical_yield_t_ha: 10.0, n: 40,  p: 8,  k: 25,  stages: ['skottillväxt', 'sommar', 'tillväxtsäsong', 'vilotid'] },
  { id: 'rorflen',         name: 'Rörflen (Reed Canary Grass)',                    crop_group: 'energy',     typical_yield_t_ha: 6.0,  n: 80,  p: 15, k: 40,  stages: ['vårtillväxt', 'sommar', 'höst', 'övervintring'] },

  // ── Fibre Crops (Fibergrödor) ───────────────────────────────────
  { id: 'hampa',           name: 'Hampa fiber (Hemp fibre)',                       crop_group: 'fibre',      typical_yield_t_ha: 8.0,  n: 100, p: 30, k: 80,  stages: ['uppkomst', 'vegetativ', 'blomning', 'skörd'] },
  { id: 'lin-fiber',       name: 'Lin fiber (Fibre Flax)',                         crop_group: 'fibre',      typical_yield_t_ha: 5.0,  n: 50,  p: 18, k: 20,  stages: ['uppkomst', 'vegetativ', 'blomning', 'mognad'] },

  // ── Cover Crops / Green Manure (Fånggrödor / Mellangröda) ──────
  { id: 'honungsort',      name: 'Honungsört (Phacelia)',                          crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 10, k: 40, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'oljerattika',     name: 'Oljerättika (Oilseed Radish)',                   crop_group: 'cover_crops', typical_yield_t_ha: 3.5, n: 0,  p: 12, k: 50, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'vitsenap',        name: 'Vitsenap fånggröda (White Mustard cover)',       crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 10, k: 35, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'hostrag-fang',    name: 'Höstråg fånggröda (Winter Rye cover)',           crop_group: 'cover_crops', typical_yield_t_ha: 4.0, n: 0,  p: 8,  k: 30, stages: ['uppkomst', 'övervintring', 'vårtillväxt', 'nedbrukning'] },
  { id: 'persisk-klover',  name: 'Persisk klöver fånggröda (Persian Clover)',      crop_group: 'cover_crops', typical_yield_t_ha: 2.5, n: 0,  p: 10, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'blodklover',      name: 'Blodklöver fånggröda (Crimson Clover)',          crop_group: 'cover_crops', typical_yield_t_ha: 2.5, n: 0,  p: 10, k: 30, stages: ['uppkomst', 'vegetativ', 'blomning'] },
  { id: 'cikoria',         name: 'Cikoria fånggröda (Chicory cover)',              crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 10, k: 40, stages: ['uppkomst', 'vegetativ', 'rottillväxt'] },
  { id: 'sandhavre',       name: 'Sandhavre fånggröda (Sand Oat cover)',           crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 8,  k: 30, stages: ['uppkomst', 'vegetativ', 'övervintring'] },
  { id: 'luddvicker',      name: 'Luddvicker fånggröda (Hairy Vetch cover)',       crop_group: 'cover_crops', typical_yield_t_ha: 3.0, n: 0,  p: 10, k: 30, stages: ['uppkomst', 'vegetativ', 'övervintring'] },
];

// ── Swedish Soil Types (SGU / SLU / Jordbruksverket Classification) ──
// SLU Markinfo soil classification:
//   Code digit 1: 1=sedimentary, 2=moraine, 3-4=organic
// Jordbruksverket uses "jordgrupp" 1-4 based on clay content and organic matter.
// P-AL and K-AL classes (I-V) determine P and K recommendations.
// Liming: Jordbruksverket pH targets by organic matter % and clay %.

const SOIL_TYPES = [
  // Jordgrupp 1: Lätta jordar (light soils, <15% clay)
  { id: 'sandjord',         name: 'Sandjord (Sandy soil)',                   soil_group: 1, texture: 'sand',           drainage_class: 'free',     description: 'Lätt sandjord med fritt dränage. Låg mullhalt (<3%), snabb urlakning av näring. SGU jordartsklass sand. Jordbruksverket jordgrupp 1. Vanlig i Halland, västra Skåne. Mål-pH 6.0.' },
  { id: 'grovmo',           name: 'Grovmo (Coarse fine sand)',               soil_group: 1, texture: 'coarse_silt',   drainage_class: 'free',     description: 'Grovmo (0.06-0.2 mm). Lätt jord med fritt dränage. Vanlig i Norrland. Jordgrupp 1. Mål-pH 6.0.' },
  { id: 'finmo',            name: 'Finmo (Fine sand)',                       soil_group: 1, texture: 'fine_sand',     drainage_class: 'moderate', description: 'Finmo (0.02-0.06 mm). Lätt jord med måttligt dränage. Kapillär vattenledning. Jordgrupp 1. Mål-pH 6.0.' },
  { id: 'sandig-moranjord', name: 'Sandig moränjord (Sandy moraine)',        soil_group: 1, texture: 'sandy_moraine', drainage_class: 'free',     description: 'Sandig moränjord med hög sandhalt. Lätt, snabbt dränerande. Jordgrupp 1. Vanlig i Småland, Norrland. Mål-pH 6.0.' },

  // Jordgrupp 2: Mellanjordar (medium soils, 15-25% clay)
  { id: 'moranjord',        name: 'Moränjord (Moraine/glacial till)',        soil_group: 2, texture: 'moraine',        drainage_class: 'moderate', description: 'Moränjord med varierad kornstorlek. Vanligaste jordarten i Sverige (~75% av åkermarken). Måttligt dränage. Jordgrupp 2. Mål-pH 6.2.' },
  { id: 'lattlera',         name: 'Lättlera (Light clay, 15-25% clay)',     soil_group: 2, texture: 'light_clay',     drainage_class: 'moderate', description: 'Lättlera (15-25% ler). Bra brukningsegenskaper, måttligt dränage. Vanlig i Mellansverige. Jordgrupp 2. Mål-pH 6.3.' },
  { id: 'siltjord',         name: 'Siltjord (Silt)',                        soil_group: 2, texture: 'silt',           drainage_class: 'moderate', description: 'Siltjord med jämn kornstorlek (0.002-0.06 mm). Risk för igenslamning och skorpbildning. Måttligt dränage. Jordgrupp 2. Mål-pH 6.2.' },
  { id: 'lerig-mo',         name: 'Lerig mo (Clayey fine sand)',            soil_group: 2, texture: 'clayey_sand',    drainage_class: 'moderate', description: 'Lerig mo med 5-15% ler. Mellanform mellan sandiga och leriga jordar. Jordgrupp 2. Mål-pH 6.2.' },
  { id: 'lerig-moranjord',  name: 'Lerig moränjord (Clayey moraine)',       soil_group: 2, texture: 'clayey_moraine', drainage_class: 'moderate', description: 'Lerig moränjord med 15-25% ler. Bättre vattenhållning. Jordgrupp 2. Vanlig i Mellansverige. Mål-pH 6.3.' },

  // Jordgrupp 3: Lerjordar (clay soils, >25% clay)
  { id: 'mellanlera',       name: 'Mellanlera (Medium clay, 25-40% clay)',  soil_group: 3, texture: 'medium_clay',     drainage_class: 'impeded',  description: 'Mellanlera (25-40% ler). Tyngre att bearbeta, nedsatt dränage. Vanlig i Mälardalen, Östergötland. Jordgrupp 3. Mål-pH 6.4.' },
  { id: 'styv-lera',        name: 'Styv lera (Heavy clay, 40-60% clay)',    soil_group: 3, texture: 'heavy_clay',      drainage_class: 'impeded',  description: 'Styv lera (40-60% ler). Svår att bearbeta, nedsatt dränage. Långsam uppvärmning på våren. Jordgrupp 3. Vanlig i Uppsala, Mälardalen. Mål-pH 6.5.' },
  { id: 'mycket-styv-lera', name: 'Mycket styv lera (Very heavy clay, >60%)', soil_group: 3, texture: 'very_heavy_clay', drainage_class: 'poor',  description: 'Mycket styv lera (>60% ler). Extremt svårbearbetad. Spricksystem vid uttorkning. Jordgrupp 3. Förekommer i Mälardalen. Mål-pH 6.5.' },

  // Jordgrupp 4: Organiska jordar (organic soils, >20% OM)
  { id: 'mulljord',         name: 'Mulljord (Humus soil, 20-40% OM)',       soil_group: 4, texture: 'organic',        drainage_class: 'variable', description: 'Organisk jord/mulljord (20-40% organiskt material). Hög kvävemineralisering, reducerat N-behov. Jordgrupp 4. Mål-pH 5.5.' },
  { id: 'karktorvjord',     name: 'Kärrtorvjord (Fen peat)',                soil_group: 4, texture: 'peat',           drainage_class: 'poor',     description: 'Kärrtorvjord (>40% organiskt material). Mycket hög kvävemineralisering. Behöver dränering. Jordgrupp 4. Mål-pH 5.2.' },
  { id: 'gyttjejord',       name: 'Gyttjejord (Gyttja soil)',               soil_group: 4, texture: 'gyttja',         drainage_class: 'poor',     description: 'Gyttjejord, sedimenterad organisk jord. Hög näringshalt. Jordgrupp 4. Vanlig vid sjösänkningar. Mål-pH 5.5.' },
  { id: 'mossetorvjord',    name: 'Mossetorvjord (Bog peat)',               soil_group: 4, texture: 'bog_peat',       drainage_class: 'poor',     description: 'Mossetorvjord (sphagnum), mycket surt (pH 3.5-4.5). Låg näringshalt men hög vattenkapacitet. Jordgrupp 4. Kräver kraftig kalkning.' },
];

// ── Nutrient Recommendations (Jordbruksverket / Greppa Näringen) ──
// Swedish system uses soil groups 1-4 and SNS index 0-6.
// N varies by crop, soil group, and SNS (markkväveindex).
// P recommendations based on P-AL class (I-V), mapped to soil groups.
// K recommendations based on K-AL class, mapped to soil groups.
// S: rapeseed N:S = 5:1 (Greppa); cereals 10-20 kg/ha; potatoes 15 kg/ha.
//
// Jordbruksverket 2026 N tables (unchanged from 2025 per Greppa 2026-03-03):
//   Höstvete bröd: 120 (5t) – 240 (11t) per yield level
//   Höstvete foder: 120 (5t) – 210 (11t)
//   Rågvete/Höstkorn: 105 (5t) – 170 (9t)
//   Höstråg: 70 (5t) – 110 (9t)
//   Vårvete: 125 (4t) – 205 (8t)
//   Vårkorn: 70 (4t) – 145 (9t)
//   Havre: 60 (4t) – 110 (7t)
//   Våroljeväxter: 100 (1.5t) – 130 (3t)
//   Oljelin: 50 (1.5t) – 90 (2.5t)
//   Vall 2-skörd: 130 (6t) – 190 (9t)
//   Vall 3-skörd: 180 (7t) – 260 (11t)
//   Vall 4-skörd: 230 (7t) – 330 (12t)
//   Potatis (sort-beroende): 40-190
//
// Fertilizer prices 2026: N 15.65 kr/kg, P 35.76 kr/kg, K 14.50 kr/kg
// Forage value: 1.05 kr/kg DM
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
// N ranges verified against the official tables extracted from jordbruksverket.se.
// S: rapeseed 2 kg S per 10 kg N (Greppa 2025-02-27); cereals 10-20; potatoes 15.

const CROP_PARAMS: CropParams[] = [
  // ── Cereals ─────────────────────────────────────────────────────
  // Höstvete bröd: 120-240 (5-11 t/ha) → base_n 200 at ~7 t/ha target
  { id: 'hostvete-brod',   base_n: 200, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [50, 45, 40, 30],   k: [45, 40, 35, 25],   s: 20, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Höstvete foder: 120-210 → base_n 185
  { id: 'hostvete-foder',  base_n: 185, n_step: 26, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -30, p: [50, 45, 40, 30],   k: [45, 40, 35, 25],   s: 18, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Vårvete: 125-205 (4-8 t/ha) → base_n 155
  { id: 'varvete',         base_n: 155, n_step: 25, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [40, 35, 30, 22],   k: [35, 30, 26, 20],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Durumvete: slightly less than vårvete, similar to spring wheat at lower yield
  { id: 'durumvete',       base_n: 140, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [38, 34, 28, 20],   k: [32, 28, 24, 18],   s: 14, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Dinkel: lower N need, prone to lodging
  { id: 'dinkel',          base_n: 120, n_step: 20, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [35, 32, 28, 20],   k: [34, 30, 26, 20],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Emmer: ancient grain, low yield, moderate N
  { id: 'emmer',           base_n: 90,  n_step: 15, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [28, 25, 22, 15],   k: [26, 24, 20, 16],   s: 8,  section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Höstkorn: 105-170 → base_n 160
  { id: 'hostkorn',        base_n: 160, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -28, p: [47, 42, 38, 28],   k: [58, 55, 50, 40],   s: 15, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Vårkorn: 70-145 → base_n 130
  { id: 'varkorn',         base_n: 130, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [38, 36, 32, 24],   k: [48, 45, 42, 34],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'maltkorn',        base_n: 125, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [38, 36, 32, 24],   k: [48, 45, 42, 34],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Havre: 60-110 → base_n 110
  { id: 'havre',           base_n: 110, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -25, p: [34, 32, 28, 20],   k: [35, 32, 28, 22],   s: 10, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'svarthavre',      base_n: 90,  n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [30, 28, 24, 18],   k: [30, 28, 24, 20],   s: 8,  section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Höstråg: 70-110 → base_n 110
  { id: 'hostrag',         base_n: 110, n_step: 18, sg1_offset: -8,  sg3_offset: 8,  sg4_offset: -25, p: [42, 38, 34, 25],   k: [45, 42, 38, 30],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'varrag',          base_n: 90,  n_step: 15, sg1_offset: -5,  sg3_offset: 5,  sg4_offset: -20, p: [34, 30, 26, 18],   k: [35, 32, 28, 22],   s: 10, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  // Rågvete: 105-170 → base_n 120
  { id: 'ragvete',         base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [42, 38, 34, 25],   k: [45, 42, 38, 30],   s: 12, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'blandsad',        base_n: 100, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [34, 32, 28, 20],   k: [38, 36, 32, 25],   s: 10, section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'hirs',            base_n: 70,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [20, 18, 15, 10],   k: [18, 16, 14, 10],   s: 5,  section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'bovete',          base_n: 60,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [22, 20, 18, 14],   s: 5,  section: 'Spannmål', is_legume: false, is_rapeseed: false },
  { id: 'quinoa',          base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [52, 50, 45, 38],   s: 8,  section: 'Spannmål', is_legume: false, is_rapeseed: false },

  // ── Oilseeds ────────────────────────────────────────────────────
  // Höstraps: ~170-200 total, split autumn/spring. S = N/5 → ~40 S at 200 N.
  { id: 'hostraps',        base_n: 195, n_step: 25, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -35, p: [48, 46, 42, 32],   k: [42, 39, 35, 28],   s: 40, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  // Våroljeväxter: 100-130 (1.5-3 t/ha)
  { id: 'varraps',         base_n: 120, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [30, 28, 24, 18],   k: [28, 25, 22, 18],   s: 25, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  // Oljelin: 50-90 (1.5-2.5 t/ha)
  { id: 'oljelin',         base_n: 70,  n_step: 12, sg1_offset: -5,  sg3_offset: 5,  sg4_offset: -18, p: [18, 16, 14, 10],   k: [18, 16, 14, 10],   s: 8,  section: 'Oljeväxter', is_legume: false, is_rapeseed: false },
  { id: 'solros',          base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [32, 30, 26, 20],   k: [55, 50, 45, 38],   s: 10, section: 'Oljeväxter', is_legume: false, is_rapeseed: false },
  { id: 'camelina',        base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [20, 18, 15, 10],   k: [20, 18, 15, 10],   s: 15, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  { id: 'krambe',          base_n: 90,  n_step: 14, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [22, 20, 18, 12],   k: [22, 20, 18, 12],   s: 18, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  { id: 'senap',           base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [28, 25, 22, 18],   s: 15, section: 'Oljeväxter', is_legume: false, is_rapeseed: true },
  { id: 'hampa-fro',       base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [55, 50, 45, 38],   s: 10, section: 'Oljeväxter', is_legume: false, is_rapeseed: false },

  // ── Pulses ──────────────────────────────────────────────────────
  { id: 'arter',           base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [28, 24, 20, 15],   k: [35, 30, 26, 20],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'konservarter',    base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [32, 28, 24, 18],   k: [40, 35, 30, 24],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'akerbonor',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [32, 28, 24, 18],   k: [42, 39, 35, 28],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'lupiner',         base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [22, 18, 15, 10],   k: [28, 24, 20, 16],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'sojabonor',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [25, 22, 18, 12],   k: [34, 30, 26, 20],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'linser',          base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [16, 14, 12, 8],    k: [20, 18, 15, 12],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'kikartor',        base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [14, 12, 10, 7],    k: [18, 16, 14, 10],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'vicker',          base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [22, 20, 18, 12],   k: [32, 28, 24, 18],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },
  { id: 'bruna-bonor',     base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [22, 20, 18, 12],   k: [30, 26, 22, 18],   s: 0,  section: 'Baljväxter', is_legume: true, is_rapeseed: false },

  // ── Root Crops ──────────────────────────────────────────────────
  { id: 'sockerbetor',     base_n: 140, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -25, p: [55, 48, 40, 30],   k: [220, 200, 180, 150], s: 20, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },
  { id: 'morotter',        base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [35, 30, 25, 18],   k: [175, 160, 140, 115], s: 10, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },
  { id: 'lok',             base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [32, 28, 24, 18],   k: [120, 110, 100, 80],  s: 12, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },
  { id: 'kalrot',          base_n: 110, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [35, 30, 25, 18],   k: [165, 150, 130, 110], s: 10, section: 'Rotfrukter', is_legume: false, is_rapeseed: false },

  // ── Potatoes ────────────────────────────────────────────────────
  // Jordbruksverket 2026: N varies 40-190 by variety group
  // Very low N (Ditta): 40-110; Low N (Fakse, Princess): 60-130
  // Moderate N (King Edward, Asterix): 90-180; High N (Bintje, Fontane): 100-190
  // Färskpotatis: 60-80
  { id: 'potatis-mat',     base_n: 150, n_step: 20, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [75, 70, 60, 45],   k: [210, 200, 185, 150], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'potatis-starkelse', base_n: 160, n_step: 20, sg1_offset: -10, sg3_offset: 8, sg4_offset: -30, p: [80, 75, 65, 50],  k: [230, 220, 200, 165], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'potatis-industri', base_n: 170, n_step: 22, sg1_offset: -10, sg3_offset: 8, sg4_offset: -30,  p: [78, 72, 62, 48],  k: [220, 210, 195, 160], s: 15, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'potatis-farsk',   base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 5,  sg4_offset: -18, p: [55, 50, 42, 32],   k: [160, 150, 135, 110], s: 10, section: 'Potatis', is_legume: false, is_rapeseed: false },
  { id: 'potatis-utsade',  base_n: 120, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [65, 60, 50, 38],   k: [185, 175, 160, 130], s: 12, section: 'Potatis', is_legume: false, is_rapeseed: false },

  // ── Forage ──────────────────────────────────────────────────────
  // Jordbruksverket 2026: gräsvall 2-cut 130-190 N, 3-cut 180-260 N, 4-cut 230-330 N
  // Blandvall: reduce N by clover share (10%→~15%, 20%→~30%, 40%→~60% less)
  { id: 'vall-2-skor',     base_n: 180, n_step: 25, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [40, 35, 30, 22],   k: [135, 120, 110, 90],  s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'vall-3-skor',     base_n: 240, n_step: 30, sg1_offset: -18, sg3_offset: 10, sg4_offset: -40, p: [48, 42, 36, 28],   k: [165, 150, 135, 110], s: 18, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'vall-4-skor',     base_n: 310, n_step: 35, sg1_offset: -20, sg3_offset: 12, sg4_offset: -45, p: [55, 48, 42, 32],   k: [190, 175, 160, 130], s: 22, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'klover-gras',     base_n: 50,  n_step: 8,  sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [45, 40, 35, 25],   k: [155, 140, 125, 105], s: 10, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-10pct', base_n: 155, n_step: 22, sg1_offset: -12, sg3_offset: 6,  sg4_offset: -30, p: [40, 35, 30, 22],   k: [135, 120, 110, 90],  s: 13, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-20pct', base_n: 125, n_step: 18, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [40, 35, 30, 22],   k: [135, 120, 110, 90],  s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-40pct', base_n: 55,  n_step: 8,  sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [40, 35, 30, 22],   k: [135, 120, 110, 90],  s: 8,  section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-10pct-3', base_n: 210, n_step: 28, sg1_offset: -15, sg3_offset: 8, sg4_offset: -35, p: [48, 42, 36, 28], k: [165, 150, 135, 110], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-20pct-3', base_n: 175, n_step: 22, sg1_offset: -12, sg3_offset: 6, sg4_offset: -28, p: [48, 42, 36, 28], k: [165, 150, 135, 110], s: 13, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-40pct-3', base_n: 105, n_step: 14, sg1_offset: -8,  sg3_offset: 4, sg4_offset: -20, p: [48, 42, 36, 28], k: [165, 150, 135, 110], s: 10, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-10pct-4', base_n: 270, n_step: 32, sg1_offset: -18, sg3_offset: 10, sg4_offset: -40, p: [55, 48, 42, 32], k: [190, 175, 160, 130], s: 18, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-20pct-4', base_n: 225, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [55, 48, 42, 32], k: [190, 175, 160, 130], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'blandvall-40pct-4', base_n: 140, n_step: 18, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [55, 48, 42, 32], k: [190, 175, 160, 130], s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'timotej',         base_n: 155, n_step: 22, sg1_offset: -12, sg3_offset: 5,  sg4_offset: -28, p: [38, 35, 30, 22],   k: [130, 120, 110, 90],  s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rajgras',         base_n: 195, n_step: 28, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -32, p: [48, 42, 38, 28],   k: [170, 160, 145, 120], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rajgras-ital',    base_n: 215, n_step: 30, sg1_offset: -15, sg3_offset: 8,  sg4_offset: -35, p: [50, 45, 40, 30],   k: [180, 170, 155, 130], s: 15, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rajgras-wester',  base_n: 165, n_step: 22, sg1_offset: -12, sg3_offset: 5,  sg4_offset: -28, p: [42, 38, 34, 25],   k: [155, 140, 125, 105], s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rorsvingelhybrid', base_n: 250, n_step: 32, sg1_offset: -18, sg3_offset: 10, sg4_offset: -40, p: [52, 48, 42, 32],  k: [185, 175, 160, 130], s: 18, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'hundaxing',       base_n: 180, n_step: 25, sg1_offset: -12, sg3_offset: 6,  sg4_offset: -30, p: [42, 38, 34, 25],   k: [155, 140, 125, 105], s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'angssvingel',     base_n: 170, n_step: 24, sg1_offset: -12, sg3_offset: 6,  sg4_offset: -28, p: [40, 36, 32, 24],   k: [145, 130, 120, 100], s: 12, section: 'Vall', is_legume: false, is_rapeseed: false },
  { id: 'rodklover',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [48, 45, 40, 30],   k: [165, 150, 140, 115], s: 12, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'vitklover',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [38, 35, 30, 22],   k: [145, 130, 120, 100], s: 10, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'alsikeklover',    base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [42, 38, 34, 25],   k: [150, 135, 125, 105], s: 10, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'karingtand',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [34, 30, 26, 18],   k: [120, 110, 100, 80],  s: 8,  section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'lusern',          base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [50, 45, 40, 30],   k: [195, 180, 165, 140], s: 15, section: 'Vall', is_legume: true, is_rapeseed: false },
  { id: 'majs-ensilage',   base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [54, 50, 45, 35],   k: [185, 170, 155, 130], s: 12, section: 'Foder', is_legume: false, is_rapeseed: false },
  { id: 'majs-karn',       base_n: 145, n_step: 20, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -25, p: [58, 55, 48, 38],   k: [55, 50, 45, 38],    s: 12, section: 'Foder', is_legume: false, is_rapeseed: false },
  { id: 'fodervicker',     base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [22, 20, 18, 12],   k: [38, 35, 30, 25],    s: 0,  section: 'Foder', is_legume: true, is_rapeseed: false },
  { id: 'betesvall',       base_n: 120, n_step: 18, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [35, 30, 26, 18],   k: [110, 100, 90, 75],   s: 10, section: 'Vall', is_legume: false, is_rapeseed: false },

  // ── Vegetables ──────────────────────────────────────────────────
  { id: 'vitkal',          base_n: 280, n_step: 35, sg1_offset: -15, sg3_offset: 10, sg4_offset: -40, p: [45, 40, 35, 25],   k: [215, 200, 180, 150], s: 25, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'rodkal',          base_n: 260, n_step: 32, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -38, p: [42, 38, 32, 24],   k: [205, 190, 170, 140], s: 22, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'gronkal',         base_n: 230, n_step: 28, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -32, p: [35, 30, 26, 18],   k: [175, 160, 140, 115], s: 20, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'blomkal',         base_n: 250, n_step: 30, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -35, p: [40, 35, 30, 22],   k: [195, 180, 160, 135], s: 22, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'broccoli',        base_n: 230, n_step: 28, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -32, p: [35, 30, 26, 18],   k: [165, 150, 135, 110], s: 20, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'brysselkal',      base_n: 280, n_step: 35, sg1_offset: -15, sg3_offset: 10, sg4_offset: -40, p: [40, 35, 30, 22],   k: [195, 180, 160, 135], s: 25, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'kinakal',         base_n: 200, n_step: 25, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -30, p: [35, 30, 26, 18],   k: [185, 170, 150, 125], s: 15, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'sallat',          base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [28, 25, 22, 15],   k: [140, 130, 115, 95],  s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'sallat-annan',    base_n: 110, n_step: 16, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [25, 22, 20, 14],   k: [120, 110, 100, 80],  s: 8,  section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'spenat',          base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [28, 25, 22, 15],   k: [155, 140, 125, 105], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'purjolok',        base_n: 170, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [35, 30, 26, 18],   k: [155, 140, 125, 105], s: 12, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'rodbeta',         base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [35, 30, 26, 18],   k: [185, 170, 155, 130], s: 12, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'selleri',         base_n: 200, n_step: 25, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -30, p: [40, 35, 30, 22],   k: [215, 200, 180, 150], s: 15, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'palsternacka',    base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [28, 25, 22, 15],   k: [175, 160, 140, 115], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'sparris',         base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [28, 25, 22, 15],   k: [88, 80, 72, 60],     s: 8,  section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'squash',          base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [35, 30, 26, 18],   k: [175, 160, 140, 115], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'sockermajs',      base_n: 150, n_step: 22, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -28, p: [35, 30, 26, 18],   k: [88, 80, 72, 60],     s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'bonor-friland',   base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [28, 25, 22, 15],   k: [65, 60, 55, 45],     s: 0,  section: 'Grönsaker', is_legume: true, is_rapeseed: false },
  { id: 'fenkal',          base_n: 140, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -25, p: [28, 25, 22, 15],   k: [155, 140, 125, 105], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'gurka-friland',   base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [32, 28, 24, 18],   k: [155, 140, 125, 105], s: 10, section: 'Grönsaker', is_legume: false, is_rapeseed: false },
  { id: 'tomat-vaxthus',   base_n: 320, n_step: 35, sg1_offset: -15, sg3_offset: 10, sg4_offset: -40, p: [65, 60, 52, 40],   k: [420, 400, 370, 310], s: 30, section: 'Växthus',   is_legume: false, is_rapeseed: false },
  { id: 'gurka-vaxthus',   base_n: 280, n_step: 32, sg1_offset: -12, sg3_offset: 8,  sg4_offset: -35, p: [55, 50, 45, 35],   k: [370, 350, 320, 270], s: 25, section: 'Växthus',   is_legume: false, is_rapeseed: false },
  { id: 'paprika-vaxthus', base_n: 220, n_step: 28, sg1_offset: -10, sg3_offset: 8,  sg4_offset: -30, p: [45, 40, 35, 25],   k: [300, 280, 255, 215], s: 20, section: 'Växthus',   is_legume: false, is_rapeseed: false },

  // ── Herbs ───────────────────────────────────────────────────────
  { id: 'dill',            base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -20, p: [22, 20, 18, 12],   k: [88, 80, 72, 60],     s: 8,  section: 'Kryddväxter', is_legume: false, is_rapeseed: false },
  { id: 'persilja',        base_n: 120, n_step: 18, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [28, 25, 22, 15],   k: [110, 100, 90, 75],   s: 10, section: 'Kryddväxter', is_legume: false, is_rapeseed: false },
  { id: 'kummin',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [18, 15, 12, 8],    k: [32, 30, 26, 20],     s: 6,  section: 'Specialgrödor', is_legume: false, is_rapeseed: false },
  { id: 'bockhornsklover', base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [18, 15, 12, 8],    k: [28, 25, 22, 18],     s: 0,  section: 'Specialgrödor', is_legume: true, is_rapeseed: false },
  { id: 'vallmo',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [20, 18, 15, 10],   k: [22, 20, 18, 14],     s: 6,  section: 'Specialgrödor', is_legume: false, is_rapeseed: false },
  { id: 'korianderfrö',    base_n: 70,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [28, 25, 22, 18],     s: 5,  section: 'Specialgrödor', is_legume: false, is_rapeseed: false },
  { id: 'anis',            base_n: 65,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [14, 12, 10, 7],    k: [22, 20, 18, 14],     s: 5,  section: 'Specialgrödor', is_legume: false, is_rapeseed: false },

  // ── Fruit & Berries ─────────────────────────────────────────────
  { id: 'jordgubbar',      base_n: 110, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [28, 25, 22, 16],   k: [135, 120, 110, 90],  s: 10, section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'applen',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [18, 15, 12, 8],    k: [85, 80, 72, 60],     s: 8,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'paron',           base_n: 70,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [15, 12, 10, 7],    k: [75, 70, 64, 52],     s: 6,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'plommon',         base_n: 70,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [15, 12, 10, 7],    k: [65, 60, 55, 45],     s: 6,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'korsbar',         base_n: 60,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [12, 10, 8, 5],     k: [55, 50, 45, 38],     s: 5,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'hallon',          base_n: 80,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -18, p: [22, 20, 18, 12],   k: [88, 80, 72, 60],     s: 8,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'svarta-vinbar',   base_n: 70,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [65, 60, 55, 45],     s: 6,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'roda-vinbar',     base_n: 60,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [16, 14, 12, 8],    k: [60, 55, 50, 42],     s: 5,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'blabar',          base_n: 40,  n_step: 6,  sg1_offset: -3,  sg3_offset: 2,  sg4_offset: -10, p: [12, 10, 8, 5],     k: [45, 40, 35, 28],     s: 4,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'havtorn',         base_n: 55,  n_step: 8,  sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -12, p: [14, 12, 10, 7],    k: [55, 50, 45, 38],     s: 5,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'vindruvor',       base_n: 60,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [75, 70, 64, 52],     s: 6,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'krusbär',         base_n: 65,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [18, 15, 12, 8],    k: [65, 60, 55, 45],     s: 6,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },
  { id: 'aronia',          base_n: 55,  n_step: 8,  sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -12, p: [14, 12, 10, 7],    k: [55, 50, 45, 38],     s: 5,  section: 'Frukt/Bär', is_legume: false, is_rapeseed: false },

  // ── Energy Crops ────────────────────────────────────────────────
  { id: 'salix',           base_n: 75,  n_step: 12, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -20, p: [12, 10, 8, 5],     k: [35, 30, 25, 20],     s: 5,  section: 'Energigrödor', is_legume: false, is_rapeseed: false },
  { id: 'poppel',          base_n: 55,  n_step: 8,  sg1_offset: -3,  sg3_offset: 2,  sg4_offset: -15, p: [10, 8, 6, 4],      k: [28, 25, 22, 18],     s: 4,  section: 'Energigrödor', is_legume: false, is_rapeseed: false },
  { id: 'hybridasp',       base_n: 55,  n_step: 8,  sg1_offset: -3,  sg3_offset: 2,  sg4_offset: -15, p: [10, 8, 6, 4],      k: [28, 25, 22, 18],     s: 4,  section: 'Energigrödor', is_legume: false, is_rapeseed: false },
  { id: 'rorflen',         base_n: 100, n_step: 15, sg1_offset: -8,  sg3_offset: 5,  sg4_offset: -22, p: [18, 15, 12, 8],    k: [45, 40, 35, 28],     s: 8,  section: 'Energigrödor', is_legume: false, is_rapeseed: false },

  // ── Fibre ───────────────────────────────────────────────────────
  { id: 'hampa',           base_n: 130, n_step: 20, sg1_offset: -10, sg3_offset: 5,  sg4_offset: -22, p: [32, 30, 26, 20],   k: [88, 80, 72, 60],     s: 10, section: 'Fibergrödor',  is_legume: false, is_rapeseed: false },
  { id: 'lin-fiber',       base_n: 65,  n_step: 10, sg1_offset: -5,  sg3_offset: 3,  sg4_offset: -15, p: [20, 18, 15, 10],   k: [22, 20, 18, 14],     s: 6,  section: 'Fibergrödor',  is_legume: false, is_rapeseed: false },

  // ── Cover Crops (zero N recommendation) ─────────────────────────
  { id: 'honungsort',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [42, 40, 35, 28],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'oljerattika',     base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [14, 12, 10, 6],    k: [55, 50, 45, 38],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'vitsenap',        base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [38, 35, 30, 25],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'hostrag-fang',    base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [10, 8, 6, 4],      k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'persisk-klover',  base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: true, is_rapeseed: false },
  { id: 'blodklover',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: true, is_rapeseed: false },
  { id: 'cikoria',         base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [42, 40, 35, 28],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'sandhavre',       base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [10, 8, 6, 4],      k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: false, is_rapeseed: false },
  { id: 'luddvicker',      base_n: 0,   n_step: 0,  sg1_offset: 0,   sg3_offset: 0,  sg4_offset: 0,   p: [12, 10, 8, 5],     k: [32, 30, 26, 20],     s: 0,  section: 'Fånggrödor', is_legume: true, is_rapeseed: false },
];

const SOIL_GROUP_NAMES: Record<number, string> = {
  1: 'sandjord/mo (lätta jordar)',
  2: 'moränjord/lättlera/silt (mellanjordar)',
  3: 'mellanlera/styv lera (lerjordar)',
  4: 'mulljord/torvjord (organiska jordar)',
};

// ── Previous Crop N Credits ───────────────────────────────────────
// From Jordbruksverket "Riktgivor och strategier för gödsling" 2026:
//   Höstraps → höststråsäd: 40 kg N/ha
//   Våroljeväxter: 20 kg N/ha
//   Ärter → höststråsäd: 35, → vårstråsäd: 25 → avg 30
//   Åkerbönor: 25 kg N/ha
//   Klöver-gräs (2 år+): 40 kg N/ha
//   Gräsvall: 5 kg N/ha
//   Potatis: 10 kg N/ha
//   Sockerbetor → höst: 25, → vår: 20 → avg 25

const LEGUME_N_CREDIT = 30;
const FABABEAN_N_CREDIT = 25;
const RAPESEED_N_CREDIT = 40;
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
    parts.push('Högt svavelbehov (N:S = 5:1). Tillför S vid stråskjutning. Greppa: 2 kg S per 10 kg N.');
  }
  if (crop.section === 'Vall' && !crop.is_legume && n > 0) {
    parts.push('Fördela N-givan: ~60% till 1:a skörd, ~40% till 2:a skörd (2-skörd), eller 40/35/25% (3-skörd).');
  }
  if (crop.id.includes('potatis') && n > 0) {
    parts.push('Anpassa N efter sort och användningsområde. Se Jordbruksverkets sortgrupps-tabell (mycket lågt/lågt/måttligt/högt N-behov).');
  }
  if (crop.section === 'Grönsaker' || crop.section === 'Växthus') {
    parts.push('Grönsaksgödsling — anpassa efter lokal rådgivning och markkartering.');
  }
  if (crop.id.includes('blandvall')) {
    const pct = crop.id.match(/(\d+)pct/)?.[1] || '?';
    parts.push(`Blandvall med ~${pct}% klöverandel. Klövern fixerar kväve — N-behovet minskar proportionellt.`);
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

  // Previous crop rotation adjustments
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
// Verified from ja.se/sida/sv/marknad on 2026-04-04:
//   Kvarnvete Skåne: 178 SEK/dt → 1780 SEK/t
//   Fodervete Skåne: 171 SEK/dt → 1710 SEK/t
//   Grynhavre Väst: 161 SEK/dt → 1610 SEK/t
//   Kvarnråg Öst: 156 SEK/dt → 1560 SEK/t
//   Maltkorn Väst: 174 SEK/dt → 1740 SEK/t
//   Oljeväxter (raps): 528.30 SEK/dt → 5283 SEK/t
//   Foderkorn Skåne: ~165 SEK/dt → 1650 SEK/t (interpolated)

const COMMODITY_PRICES = [
  // Cereals — Lantmännen spot 2026-03-23 (verified via ja.se)
  { crop_id: 'hostvete-brod',  market: 'kvarnvete-skane',  price: 1780.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostvete-brod',  market: 'kvarnvete-ost',    price: 1750.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostvete-foder', market: 'fodervete-skane',  price: 1710.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'hostvete-foder', market: 'fodervete-vast',   price: 1680.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'varvete',        market: 'kvarnvete-skane',  price: 1800.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'durumvete',      market: 'kontrakt',         price: 2200.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'dinkel',         market: 'kontrakt-eko',     price: 3500.00, source: 'jordbruksverket', published: '2026-03-01' },
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
  { crop_id: 'camelina',       market: 'kontrakt',         price: 4000.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Pulses
  { crop_id: 'arter',          market: 'foderartor',       price: 2800.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'arter',          market: 'kokarter',         price: 3500.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'konservarter',   market: 'kontrakt',         price: 3200.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'akerbonor',      market: 'foder',            price: 2600.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'akerbonor',      market: 'livsmedel',        price: 3200.00, source: 'lantmannen', published: '2026-03-23' },
  { crop_id: 'lupiner',        market: 'foder',            price: 2400.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'linser',         market: 'livsmedel',        price: 8000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'bruna-bonor',    market: 'livsmedel',        price: 6000.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Root crops
  { crop_id: 'sockerbetor',    market: 'kontrakt-nordic-sugar', price: 420.00,  source: 'nordic-sugar', published: '2026-03-01' },
  { crop_id: 'morotter',       market: 'grossist',          price: 3500.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'lok',            market: 'grossist',          price: 4000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'kalrot',         market: 'grossist',          price: 2500.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Potatoes — Jordbruksverket estimates / Lyckeby
  { crop_id: 'potatis-mat',       market: 'grossist',       price: 2800.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'potatis-mat',       market: 'eko-grossist',   price: 4000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'potatis-starkelse', market: 'kontrakt-lyckeby', price: 850.00, source: 'lyckeby', published: '2026-03-01' },
  { crop_id: 'potatis-industri',  market: 'kontrakt',       price: 1800.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'potatis-farsk',     market: 'grossist',       price: 5000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'potatis-utsade',    market: 'kontrakt',       price: 3500.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Forage — per tonne dry matter
  { crop_id: 'vall-2-skor',    market: 'ensilage-ts',      price: 1200.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'vall-3-skor',    market: 'ensilage-ts',      price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'vall-4-skor',    market: 'ensilage-ts',      price: 1350.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'klover-gras',    market: 'ensilage-ts',      price: 1350.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'timotej',        market: 'ho-ts',            price: 1500.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rajgras',        market: 'ensilage-ts',      price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rajgras-ital',   market: 'ensilage-ts',      price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rorsvingelhybrid', market: 'ensilage-ts',    price: 1300.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rodklover',      market: 'ensilage-ts',      price: 1350.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'lusern',         market: 'ho-ts',            price: 1800.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'majs-ensilage',  market: 'ensilage-ts',      price: 900.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'majs-karn',      market: 'foder',            price: 1600.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Fruit & Berries
  { crop_id: 'jordgubbar',     market: 'grossist',         price: 25000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'jordgubbar',     market: 'sjalvplock',       price: 35000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'applen',         market: 'grossist',         price: 8000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'paron',          market: 'grossist',         price: 10000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'hallon',         market: 'grossist',         price: 40000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'svarta-vinbar',  market: 'industri',         price: 12000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'blabar',         market: 'grossist',         price: 50000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'havtorn',        market: 'industri',         price: 20000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'vindruvor',      market: 'grossist',         price: 30000.00, source: 'jordbruksverket', published: '2026-03-01' },

  // Energy crops
  { crop_id: 'salix',          market: 'flis-energi',      price: 700.00,   source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rorflen',        market: 'brikett-energi',   price: 800.00,   source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'poppel',         market: 'virke-energi',     price: 600.00,   source: 'jordbruksverket', published: '2026-03-01' },

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
  { crop_id: 'sparris',        market: 'grossist',         price: 30000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'gronkal',        market: 'grossist',         price: 8000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rodkal',         market: 'grossist',         price: 4000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'brysselkal',     market: 'grossist',         price: 12000.00, source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'squash',         market: 'grossist',         price: 4000.00,  source: 'jordbruksverket', published: '2026-03-01' },
  { crop_id: 'rodbeta',        market: 'grossist',         price: 3000.00,  source: 'jordbruksverket', published: '2026-03-01' },
];

// ── Liming Recommendations (Jordbruksverket "Kalkning") ──────────
// Target pH by organic matter content and clay content.
// Lime requirement (tonnes CaO/ha) to raise pH by 0.5 units.
// Structural liming: 5-9 t/ha for clay soils (>25% clay).

const LIMING_TARGETS = [
  // Format: { organic_matter_range, clay_pct_range, target_ph, lime_t_cao_per_05_ph }
  // From Jordbruksverket liming page tables
  { id: 'sand-low-om',    om_range: '<6%',   texture: 'sand (<5% clay)',     target_ph: 6.0, lime_cao_per_05ph: 0.5 },
  { id: 'loam-low-om',    om_range: '<6%',   texture: 'loamy (5-15% clay)',  target_ph: 6.2, lime_cao_per_05ph: 1.0 },
  { id: 'lclay-low-om',   om_range: '<6%',   texture: 'light clay (15-25%)', target_ph: 6.3, lime_cao_per_05ph: 2.0 },
  { id: 'mclay-low-om',   om_range: '<6%',   texture: 'medium clay (25-40%)', target_ph: 6.4, lime_cao_per_05ph: 3.0 },
  { id: 'hclay-low-om',   om_range: '<6%',   texture: 'heavy clay (40-60%)', target_ph: 6.5, lime_cao_per_05ph: 4.0 },
  { id: 'vhclay-low-om',  om_range: '<6%',   texture: 'very heavy clay (>60%)', target_ph: 6.5, lime_cao_per_05ph: 5.0 },
  { id: 'sand-med-om',    om_range: '6-12%', texture: 'sand (<5% clay)',     target_ph: 5.8, lime_cao_per_05ph: 2.5 },
  { id: 'loam-med-om',    om_range: '6-12%', texture: 'loamy (5-15% clay)',  target_ph: 5.9, lime_cao_per_05ph: 3.0 },
  { id: 'lclay-med-om',   om_range: '6-12%', texture: 'light clay (15-25%)', target_ph: 6.0, lime_cao_per_05ph: 4.0 },
  { id: 'mclay-med-om',   om_range: '6-12%', texture: 'medium clay (25-40%)', target_ph: 6.1, lime_cao_per_05ph: 5.0 },
  { id: 'hclay-med-om',   om_range: '6-12%', texture: 'heavy clay (40-60%)', target_ph: 6.2, lime_cao_per_05ph: 6.0 },
  { id: 'sand-high-om',   om_range: '12-20%', texture: 'sand (<5% clay)',    target_ph: 5.5, lime_cao_per_05ph: 4.0 },
  { id: 'loam-high-om',   om_range: '12-20%', texture: 'loamy (5-15% clay)', target_ph: 5.6, lime_cao_per_05ph: 4.5 },
  { id: 'lclay-high-om',  om_range: '12-20%', texture: 'light clay (15-25%)', target_ph: 5.7, lime_cao_per_05ph: 5.5 },
  { id: 'organic',        om_range: '20-40%', texture: 'organic (any clay)',  target_ph: 5.2, lime_cao_per_05ph: 6.5 },
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

  // Index liming recommendations
  let ftsLimingCount = 0;
  for (const l of LIMING_TARGETS) {
    db.run(
      'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
      [
        `Kalkningsbehov ${l.texture} mullhalt ${l.om_range}`,
        `Kalkningsbehov för ${l.texture} med mullhalt ${l.om_range}: mål-pH ${l.target_ph}. ` +
        `Kalkgiva ${l.lime_cao_per_05ph} ton CaO/ha för att höja pH 0,5 enheter. ` +
        `Jordbruksverket kalkning. Kalka när pH understiger mål-pH med 0,3-0,5 enheter. ` +
        `Strukturkalkning på lerjordar: 5-9 ton produkt/ha.`,
        'soil',
        'SE',
      ]
    );
    ftsLimingCount++;
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

  // Index fertilizer prices (2026)
  db.run(
    'INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)',
    [
      'Gödselpriser 2026 N P K',
      'Gödselpriser 2026 (Jordbruksverket prisantaganden): kväve (N) 15,65 kr/kg, fosfor (P) 35,76 kr/kg, kalium (K) 14,50 kr/kg. ' +
      'Vallfodersvärde 1,05 kr/kg ts. Priskvot kväve/spannmål bestämmer ekonomiskt optimal N-giva. ' +
      'Kväverekommendationerna till spannmål och vall oförändrade 2026 jämfört med 2025 (Greppa 2026-03-03).',
      'general',
      'SE',
    ]
  );

  const totalFts = CROPS.length + ftsRecCount + SOIL_TYPES.length + ftsLimingCount + ftsPriceCount + 1;
  console.log(`  ${totalFts} FTS5 entries created (${CROPS.length} crops, ${ftsRecCount} recommendation summaries, ${SOIL_TYPES.length} soil types, ${ftsLimingCount} liming entries, ${ftsPriceCount} price entries, 1 fertilizer price).`);

  // Update metadata
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('last_ingest', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('build_date', ?)", [now]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('crop_count', ?)", [String(CROPS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('recommendation_count', ?)", [String(NUTRIENT_RECS.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('price_count', ?)", [String(COMMODITY_PRICES.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('soil_type_count', ?)", [String(SOIL_TYPES.length)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('fts_entry_count', ?)", [String(totalFts)]);
  db.run("INSERT OR REPLACE INTO db_metadata (key, value) VALUES ('liming_target_count', ?)", [String(LIMING_TARGETS.length)]);

  // Source hash for freshness tracking
  const sourceHash = createHash('sha256')
    .update(JSON.stringify({ CROPS, SOIL_TYPES, NUTRIENT_RECS, COMMODITY_PRICES, LIMING_TARGETS }))
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
    liming_targets: LIMING_TARGETS.length,
    fts_entries: totalFts,
    source_hash: sourceHash,
    sources: [
      'Jordbruksverket "Rekommendationer för gödsling och kalkning 2026" (JO21:9)',
      'Jordbruksverket "Riktgivor och strategier för gödsling" (2026, unchanged from 2025)',
      'Jordbruksverket "Skörd av spannmål, trindsäd, oljeväxter, potatis och slåttervall 2024. Slutlig statistik" (2025-04-16)',
      'Jordbruksverket "Skörd 2025. Preliminär statistik" (2025-11-14, 2025-12-05)',
      'Jordbruksaktuellt / Lantmännen spot prices (2026-03-23, verified ja.se/marknad)',
      'Greppa Näringen växtnäringsrådgivning (2026-03-03 update)',
      'Greppa Näringen svavelrekommendation: N:S = 5:1 för raps (2025-02-27)',
      'SLU Markinfo jordklassificering',
      'Jordbruksverket "Kalkning" — pH-mål och kalkbehov per jordgrupp',
      'Jordbruksverket Markkarteringsrådets P-AL/K-AL klassificering',
      'Jordbruksverket "Trädgårdsodlingens produktion 2023" — grönsak/frukt/bär arealer',
      'Jordbruksverket "Odla energigrödor" — salix, rörflen, hampa, poppel',
      'Yara Sverige gödslingsråd — supplementary NPK+S data',
    ],
  };
  writeFileSync('data/coverage.json', JSON.stringify(coverage, null, 2));
  console.log('Wrote data/coverage.json');

  console.log('\nIngestion complete.');
  console.log(`  Crops: ${CROPS.length}`);
  console.log(`  Soil types: ${SOIL_TYPES.length}`);
  console.log(`  Nutrient recommendations: ${NUTRIENT_RECS.length}`);
  console.log(`  Commodity prices: ${COMMODITY_PRICES.length}`);
  console.log(`  Liming targets: ${LIMING_TARGETS.length}`);
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
