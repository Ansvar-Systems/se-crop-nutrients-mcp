# Sweden Crop Nutrients MCP

[![CI](https://github.com/ansvar-systems/se-crop-nutrients-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/ansvar-systems/se-crop-nutrients-mcp/actions/workflows/ci.yml)
[![GHCR](https://github.com/ansvar-systems/se-crop-nutrients-mcp/actions/workflows/ghcr-build.yml/badge.svg)](https://github.com/ansvar-systems/se-crop-nutrients-mcp/actions/workflows/ghcr-build.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Swedish crop nutrient recommendations via the [Model Context Protocol](https://modelcontextprotocol.io). Query Jordbruksverket data, Swedish soil types (SGU/SLU), NPK planning, and commodity prices in SEK -- all from your AI assistant.

Part of [Ansvar Open Agriculture](https://ansvar.eu/open-agriculture).

## Why This Exists

Swedish farmers and agronomists need quick access to Jordbruksverket nutrient recommendation tables, commodity prices, and soil data. This information is published by Jordbruksverket, Greppa Näringen, and SLU but is locked in PDFs, spreadsheets, and web pages that AI assistants cannot query directly. This MCP server covers 20 Swedish crops (höstvete, vårkorn, höstraps, vall, potatis, and more), 8 Swedish soil types, and current SEK commodity prices.

## Quick Start

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "se-crop-nutrients": {
      "command": "npx",
      "args": ["-y", "@ansvar/se-crop-nutrients-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add se-crop-nutrients npx @ansvar/se-crop-nutrients-mcp
```

### Streamable HTTP (remote)

```
https://mcp.ansvar.eu/se-crop-nutrients/mcp
```

### Docker (self-hosted)

```bash
docker run -p 3000:3000 ghcr.io/ansvar-systems/se-crop-nutrients-mcp:latest
```

### npm (stdio)

```bash
npx @ansvar/se-crop-nutrients-mcp
```

## Example Queries

Ask your AI assistant:

- "Vad behöver höstvete för NPK på styv lera?"
- "Vad kostar vårkorn per ton?"
- "Beräkna bruttomarginal för 7 t/ha höstvete vid 5000 kr/ha insatskostnad"
- "Vilken jordgrupp tillhör moränjord?"
- "Sök kväverekommendationer för höstraps"
- "What nutrient plan does spring barley need on sandy soil?"

## Stats

| Metric | Value |
|--------|-------|
| Tools | 10 (3 meta + 7 domain) |
| Jurisdiction | SE |
| Data sources | Jordbruksverket, Greppa Näringen, SLU |
| License (data) | Swedish Open Data Licence |
| License (code) | Apache-2.0 |
| Transport | stdio + Streamable HTTP |

## Tools

| Tool | Description |
|------|-------------|
| `about` | Server metadata and links |
| `list_sources` | Data sources with freshness info |
| `check_data_freshness` | Staleness status and refresh command |
| `search_crop_requirements` | FTS5 search across crop and nutrient data |
| `get_nutrient_plan` | NPK recommendation for crop + soil type |
| `get_soil_classification` | Soil group and characteristics |
| `list_crops` | All crops, optionally by group |
| `get_crop_details` | Full crop profile with nutrient offtake |
| `get_commodity_price` | Latest price with source attribution |
| `calculate_margin` | Gross margin estimate |

See [TOOLS.md](TOOLS.md) for full parameter documentation.

## Security Scanning

This repository runs 6 security checks on every push:

- **CodeQL** -- static analysis for JavaScript/TypeScript
- **Gitleaks** -- secret detection across full history
- **Dependency review** -- via Dependabot
- **Container scanning** -- via GHCR build pipeline

See [SECURITY.md](SECURITY.md) for reporting policy.

## Disclaimer

This tool provides reference data for informational purposes only. It is not professional agricultural advice. See [DISCLAIMER.md](DISCLAIMER.md).

## Contributing

Issues and pull requests welcome. For security vulnerabilities, email security@ansvar.eu (do not open a public issue).

## License

Apache-2.0. Data sourced from Jordbruksverket, Greppa Näringen, and SLU under Swedish Open Data Licence.
