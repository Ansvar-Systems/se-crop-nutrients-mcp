import { buildMeta } from '../metadata.js';
import type { Database } from '../db.js';

interface Source {
  name: string;
  authority: string;
  official_url: string;
  retrieval_method: string;
  update_frequency: string;
  license: string;
  coverage: string;
  last_retrieved?: string;
}

export function handleListSources(db: Database): { sources: Source[]; _meta: ReturnType<typeof buildMeta> } {
  const lastIngest = db.get<{ value: string }>('SELECT value FROM db_metadata WHERE key = ?', ['last_ingest']);

  const sources: Source[] = [
    {
      name: 'Jordbruksverket Vaxtnaringslara',
      authority: 'Jordbruksverket (Swedish Board of Agriculture)',
      official_url: 'https://jordbruksverket.se/vaxter/odling/vaxtnaring-och-godsling',
      retrieval_method: 'HTML_SCRAPE',
      update_frequency: 'annual',
      license: 'Swedish public access (offentlighetsprincipen)',
      coverage: 'NPK recommendations for major Swedish crops by soil type and previous crop',
      last_retrieved: lastIngest?.value,
    },
    {
      name: 'Jordbruksverket Prisstatistik',
      authority: 'Jordbruksverket (Swedish Board of Agriculture)',
      official_url: 'https://jordbruksverket.se/om-jordbruksverket/jordbruksverkets-statistik',
      retrieval_method: 'BULK_DOWNLOAD',
      update_frequency: 'monthly',
      license: 'Swedish public access (offentlighetsprincipen)',
      coverage: 'Swedish agricultural commodity prices in SEK',
      last_retrieved: lastIngest?.value,
    },
    {
      name: 'Greppa Naringen',
      authority: 'Greppa Naringen / Jordbruksverket',
      official_url: 'https://greppa.nu',
      retrieval_method: 'HTML_SCRAPE',
      update_frequency: 'quarterly',
      license: 'Swedish public access (offentlighetsprincipen)',
      coverage: 'Nutrient advisory guidance for Swedish farming conditions',
      last_retrieved: lastIngest?.value,
    },
  ];

  return {
    sources,
    _meta: buildMeta({ source_url: 'https://jordbruksverket.se/vaxter/odling/vaxtnaring-och-godsling' }),
  };
}
