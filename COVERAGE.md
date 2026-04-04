# Coverage

## What Is Included

- **Crop nutrient recommendations** from AHDB RB209 (10th Edition): NPK rates by crop, soil type, SNS index, and previous crop
- **Soil type classifications**: RB209 soil groups 1-3, texture, drainage class
- **Commodity prices**: Ex-farm and delivered prices from AHDB Market Data and DEFRA Agricultural Price Indices
- **Crop profiles**: Typical yields, nutrient offtake values, growth stages for major UK arable crops

## Jurisdictions

| Code | Country | Status |
|------|---------|--------|
| GB | Great Britain | Supported |

## What Is NOT Included

- **Organic farming recommendations** -- RB209 covers conventional only
- **Scotland-specific advice** -- Scottish SRUC equivalents are not yet ingested
- **Northern Ireland** -- NI follows separate guidance (CAFRE)
- **Micronutrient recommendations** -- Only N, P, K, and S are covered
- **Individual field analysis** -- This is reference data, not a precision farming tool
- **Lime recommendations** -- Separate RB209 section, not yet ingested
- **Grassland management** -- Focus is arable crops in v0.1.0
- **Real-time prices** -- Prices are snapshots from the last ingestion run

## Known Gaps

1. Commodity price data depends on AHDB/DEFRA publication schedule
2. FTS5 search quality varies with query phrasing -- use specific crop names for best results
3. SNS index estimation is not included -- users must provide their own SNS assessment

## Data Freshness

Run `check_data_freshness` to see when data was last updated. The ingestion pipeline runs on a schedule; manual triggers available via `gh workflow run ingest.yml`.
