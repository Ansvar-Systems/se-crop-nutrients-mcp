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

Search crop nutrient requirements, soil data, and recommendations via full-text search. Use for broad queries about crops and nutrients.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Free-text search query |
| `crop_group` | string | No | Filter by crop group (e.g. cereals, oilseeds) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |
| `limit` | number | No | Max results (default: 20, max: 50) |

**Returns:** Array of results with `title`, `body`, `crop_group`, `relevance_rank`.

**Example:** `{ "query": "kvave vintevete" }`

---

### `get_crop_details`

Get full profile for a crop: nutrient offtake, typical yields, growth stages.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name (e.g. winter-wheat, Vintevete) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |

**Returns:** Crop group, typical yield (t/ha), nutrient offtake (N, P2O5, K2O in kg/ha), growth stages array.

**Example:** `{ "crop": "winter-wheat" }`

---

### `get_nutrient_plan`

Get NPK fertiliser recommendation for a specific crop and soil type. Based on Jordbruksverket guidelines.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name (e.g. winter-wheat) |
| `soil_type` | string | Yes | Soil type ID or name (e.g. styv-lera) |
| `sns_index` | number | No | Soil Nitrogen Supply index |
| `previous_crop` | string | No | Previous crop group for rotation adjustment |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |

**Returns:** NPK recommendation in kg/ha, soil group, notes, and reference section.

**Example:** `{ "crop": "winter-wheat", "soil_type": "styv-lera", "sns_index": 2 }`

---

### `get_soil_classification`

Get soil group, characteristics, and drainage class for a soil type or texture.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `soil_type` | string | No | Soil type ID or name |
| `texture` | string | No | Soil texture (e.g. lera, sand, mo) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |

**Returns:** Soil group number, texture, drainage class, description. If no parameters given, returns all soil types.

**Example:** `{ "soil_type": "styv-lera" }`

---

### `list_crops`

List all crops in the database, optionally filtered by crop group.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop_group` | string | No | Filter by crop group (e.g. cereals) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |

**Returns:** Array of crops with `id`, `name`, `crop_group`, `typical_yield_t_ha`.

---

### `get_commodity_price`

Get latest commodity price for a crop with source attribution. Warns if data is stale (>14 days).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name |
| `market` | string | No | Market type (e.g. ex-farm, delivered) |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |

**Returns:** Price per tonne (SEK), market, source attribution, published date. Includes `staleness_warning` if >14 days old.

**Example:** `{ "crop": "winter-wheat", "market": "ex-farm" }`

---

### `calculate_margin`

Estimate gross margin for a crop. Uses current commodity price if `price_per_tonne` is not provided.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `crop` | string | Yes | Crop ID or name |
| `yield_t_ha` | number | Yes | Expected yield in tonnes per hectare |
| `price_per_tonne` | number | No | Override price (SEK/t). If omitted, uses latest market price |
| `input_costs` | number | No | Total input costs per hectare (SEK). Default: 0 |
| `jurisdiction` | string | No | ISO 3166-1 alpha-2 code (default: SE) |

**Returns:** Revenue/ha, input costs/ha, gross margin/ha, price source, currency.

**Example:** `{ "crop": "winter-wheat", "yield_t_ha": 7.5, "input_costs": 5200 }`
