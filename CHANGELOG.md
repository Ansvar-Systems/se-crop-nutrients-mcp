# Changelog

## [0.1.0] - 2026-04-03

### Added

- Initial release with 11 MCP tools (3 meta + 8 domain)
- SQLite + FTS5 database with schema for crops, soil types, nutrient recommendations, commodity prices
- Dual transport: stdio (npm) and Streamable HTTP (Docker)
- Jurisdiction validation (GB supported)
- Data freshness monitoring
- Docker image with non-root user, health check
- CI/CD: TypeScript build, lint, test, CodeQL, Gitleaks, GHCR image build
- Agricultural disclaimer and privacy statement
