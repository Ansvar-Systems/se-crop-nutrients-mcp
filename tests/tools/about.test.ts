import { describe, test, expect } from 'vitest';
import { handleAbout } from '../../src/tools/about.js';

describe('about tool', () => {
  test('returns server metadata', () => {
    const result = handleAbout();
    expect(result.name).toBe('Sweden Crop Nutrients MCP');
    expect(result.version).toBeDefined();
    expect(result.jurisdiction).toContain('SE');
    expect(result.data_sources).toBeDefined();
    expect(result.tools_count).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
  });
});
