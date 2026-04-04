export interface Meta {
  disclaimer: string;
  data_age: string;
  source_url: string;
  copyright: string;
  server: string;
  version: string;
}

const DISCLAIMER =
  'This data is provided for informational purposes only. It does not constitute professional ' +
  'agricultural advice. Always consult a qualified agronomist or rådgivare before ' +
  'making nutrient management decisions. Data sourced from Jordbruksverket (Swedish Board of ' +
  'Agriculture), Greppa Näringen, and SLU (Swedish University of Agricultural Sciences).';

export function buildMeta(overrides?: Partial<Meta>): Meta {
  return {
    disclaimer: DISCLAIMER,
    data_age: overrides?.data_age ?? 'unknown',
    source_url: overrides?.source_url ?? 'https://jordbruksverket.se/vaxter/odling/vaxtnaring-och-godsling',
    copyright: 'Data: Jordbruksverket, Greppa Näringen, SLU. Server: Apache-2.0 Ansvar Systems.',
    server: 'se-crop-nutrients-mcp',
    version: '0.1.0',
    ...overrides,
  };
}

export function buildStalenessWarning(publishedDate: string): string | undefined {
  const published = new Date(publishedDate);
  const now = new Date();
  const daysSincePublished = Math.floor(
    (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSincePublished > 14) {
    return `Price data is ${daysSincePublished} days old (published ${publishedDate}). Check current market rates before making decisions.`;
  }
  return undefined;
}
