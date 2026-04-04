# Tools Reference

## Meta Tools

### `about`

Get server metadata: name, version, coverage, data sources, and links.

**Parameters:** None

**Returns:** Server name, version, jurisdiction list, data source names, tool count, homepage/repository links.

---

### `list_sources`

List all data sources with authority, URL, license, and freshness info.

**Parameters:** None

**Returns:** Array of data sources, each with `name`, `authority`, `official_url`, `retrieval_method`, `update_frequency`, `license`, `coverage`, `last_retrieved`.

---

### `check_data_freshness`

Check when data was last ingested, staleness status, and how to trigger a refresh.

**Parameters:** None

**Returns:** `status` (fresh/stale/unknown), `last_ingest`, `days_since_ingest`, `staleness_threshold_days`, `refresh_command`.

---

## Domain Tools

### `search_crop_requirements`

Search crop nutrient requirements, soil data, and recommendations. Use for broad queries about crops and nutrients.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Free-text search query |
| `crop_group` | string | No | Filter by crop group (e.g. cereals, oilseeds) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |
| `limit` | number | No | Max results (default: 20, max: 50) |

**Example:** `{ "query": "nitrogen winter wheat clay" }`

---

### `get_nutrient_plan`

Get NPK fertiliser recommendation for a specific crop and soil type. Based on AHDB RB209.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name (e.g. winter-wheat) |
| `soil_type` | string | Yes | Soil type ID or name (e.g. heavy-clay) |
| `sns_index` | number | No | Soil Nitrogen Supply index (0-6) |
| `previous_crop` | string | No | Previous crop group for rotation adjustment |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** NPK recommendation in kg/ha with RB209 section reference.

**Example:** `{ "crop": "winter-wheat", "soil_type": "heavy-clay", "sns_index": 2 }`

---

### `get_soil_classification`

Get soil group, characteristics, and drainage class for a soil type or texture.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `soil_type` | string | No | Soil type ID or name |
| `texture` | string | No | Soil texture (e.g. clay, sand, loam) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Soil group number, texture, drainage class, description. If no parameters given, returns all soil types.

---

### `list_crops`

List all crops in the database, optionally filtered by crop group.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop_group` | string | No | Filter by crop group (e.g. cereals) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

---

### `get_crop_details`

Get full profile for a crop: nutrient offtake, typical yields, growth stages.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Crop group, typical yield (t/ha), nutrient offtake (N, P2O5, K2O in kg/ha), growth stages.

---

### `get_commodity_price`

Get latest commodity price for a crop with source attribution. Warns if data is stale (>14 days).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name |
| `market` | string | No | Market type (e.g. ex-farm, delivered) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Price per tonne (GBP), market, source attribution, published date. Includes `staleness_warning` if >14 days old.

---

### `calculate_margin`

Estimate gross margin for a crop. Uses current commodity price if price_per_tonne not provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name |
| `yield_t_ha` | number | Yes | Expected yield in tonnes per hectare |
| `price_per_tonne` | number | No | Override price (GBP/t). If omitted, uses latest market price |
| `input_costs` | number | No | Total input costs per hectare (GBP). Default: 0 |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: GB) |

**Returns:** Revenue/ha, input costs/ha, gross margin/ha, price source.

**Example:** `{ "crop": "winter-wheat", "yield_t_ha": 8.5, "input_costs": 520 }`
