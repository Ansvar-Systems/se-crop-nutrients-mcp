# Coverage

## What Is Included

- **Crop nutrient recommendations** from Jordbruksverket guidelines: NPK rates by crop, soil type, and previous crop for Swedish conditions
- **Soil type classifications**: Swedish soil groups based on SGU/SLU classification, texture, and drainage class
- **Commodity prices**: Swedish market prices (SEK) from Jordbruksverket agricultural price statistics
- **Crop profiles**: Typical yields, nutrient offtake values, and growth stages for major Swedish arable crops

## Jurisdictions

| Code | Country | Status |
|------|---------|--------|
| SE | Sweden | Supported |

## What Is NOT Included

- **Organic farming recommendations** -- KRAV-certified organic guidelines are not yet ingested
- **Micronutrient recommendations** -- only N, P, K, and S are covered
- **Individual field analysis** -- this is reference data, not a precision farming tool
- **Lime recommendations** -- separate topic, not yet ingested
- **Grassland management** -- focus is arable crops in v0.1.0
- **Real-time prices** -- prices are snapshots from the last ingestion run
- **Finnish or Norwegian conditions** -- only Swedish data is included

## Known Gaps

1. Commodity price data depends on Jordbruksverket publication schedule
2. FTS5 search quality varies with query phrasing -- use specific crop names for best results
3. Soil nitrogen supply estimation is not included -- users must provide their own assessment

## Data Freshness

Run `check_data_freshness` to see when data was last updated. The ingestion pipeline runs on a schedule; manual triggers available via `gh workflow run ingest.yml`.
