import { createDatabase, type Database } from '../../src/db.js';

export function createSeededDatabase(dbPath: string): Database {
  const db = createDatabase(dbPath);

  // Crops
  db.run(
    `INSERT INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-wheat', 'Höstvete', 'cereals', 7.5, 180, 65, 44, JSON.stringify(['bestockning', 'stråskjutning', 'axgång', 'kärnfyllnad']), 'SE']
  );
  db.run(
    `INSERT INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['spring-barley', 'Vårkorn', 'cereals', 5.0, 100, 42, 50, JSON.stringify(['bestockning', 'stråskjutning', 'axgång']), 'SE']
  );
  db.run(
    `INSERT INTO crops (id, name, crop_group, typical_yield_t_ha, nutrient_offtake_n, nutrient_offtake_p2o5, nutrient_offtake_k2o, growth_stages, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-rapeseed', 'Höstraps', 'oilseeds', 3.5, 130, 55, 40, JSON.stringify(['rosett', 'stråskjutning', 'blomning', 'fröfyllnad']), 'SE']
  );

  // Soil types
  db.run(
    `INSERT INTO soil_types (id, name, soil_group, texture, drainage_class, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['styv-lera', 'Styv lera', 3, 'lera', 'dålig', 'Styv lera med hög lerhalt och dålig dränering. Jordbruksverket jordgrupp 3.']
  );
  db.run(
    `INSERT INTO soil_types (id, name, soil_group, texture, drainage_class, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['sandjord', 'Sandjord', 1, 'sand', 'fri', 'Lätt sandjord med fri dränering. Jordbruksverket jordgrupp 1.']
  );
  db.run(
    `INSERT INTO soil_types (id, name, soil_group, texture, drainage_class, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['mellanlera', 'Mellanlera', 2, 'lera', 'måttlig', 'Mellanlera med måttlig dränering. Jordbruksverket jordgrupp 2.']
  );

  // Nutrient recommendations
  db.run(
    `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, source_section, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-wheat', 3, 2, 'cereals', 170, 40, 50, 18, 'Rekommendation för höstvete på styv lera, Jordbruksverket riktlinjer', 'Kapitel 4', 'SE']
  );
  db.run(
    `INSERT INTO nutrient_recommendations (crop_id, soil_group, sns_index, previous_crop_group, n_rec_kg_ha, p_rec_kg_ha, k_rec_kg_ha, s_rec_kg_ha, notes, source_section, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['spring-barley', 1, 3, 'cereals', 90, 35, 45, 12, 'Rekommendation för vårkorn på sandjord, Jordbruksverket riktlinjer', 'Kapitel 4', 'SE']
  );

  // Commodity prices
  db.run(
    `INSERT INTO commodity_prices (crop_id, market, price_per_tonne, currency, price_source, published_date, retrieved_at, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['winter-wheat', 'ex-farm', 2150.0, 'SEK', 'jordbruksverket_market', '2026-03-28', '2026-03-29', 'Jordbruksverket prisstatistik', 'SE']
  );
  db.run(
    `INSERT INTO commodity_prices (crop_id, market, price_per_tonne, currency, price_source, published_date, retrieved_at, source, jurisdiction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['spring-barley', 'ex-farm', 1850.0, 'SEK', 'jordbruksverket_market', '2026-03-28', '2026-03-29', 'Jordbruksverket prisstatistik', 'SE']
  );

  // FTS5 search index
  db.run(
    `INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)`,
    ['Höstvete näringsbehov', 'Höstvete behöver 170 kg/ha kväve på styv lera. Rekommendation från Jordbruksverket.', 'cereals', 'SE']
  );
  db.run(
    `INSERT INTO search_index (title, body, crop_group, jurisdiction) VALUES (?, ?, ?, ?)`,
    ['Vårkorn näringsbehov', 'Vårkorn behöver 90 kg/ha kväve på sandjord. Rekommendation från Jordbruksverket.', 'cereals', 'SE']
  );

  return db;
}
