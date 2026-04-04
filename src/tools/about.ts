import { buildMeta } from '../metadata.js';
import { SUPPORTED_JURISDICTIONS } from '../jurisdiction.js';

export function handleAbout() {
  return {
    name: 'Sweden Crop Nutrients MCP',
    description:
      'Swedish crop nutrient recommendations based on Jordbruksverket guidelines. Provides NPK planning, ' +
      'soil classification (SGU/SLU), crop requirements, and commodity pricing (SEK) for Swedish agriculture.',
    version: '0.1.0',
    jurisdiction: [...SUPPORTED_JURISDICTIONS],
    data_sources: [
      'Jordbruksverket (Swedish Board of Agriculture)',
      'Greppa Näringen (nutrient advisory service)',
      'SLU (Swedish University of Agricultural Sciences)',
    ],
    tools_count: 10,
    links: {
      homepage: 'https://ansvar.eu/open-agriculture',
      repository: 'https://github.com/ansvar-systems/se-crop-nutrients-mcp',
      mcp_network: 'https://ansvar.ai/mcp',
    },
    _meta: buildMeta(),
  };
}
