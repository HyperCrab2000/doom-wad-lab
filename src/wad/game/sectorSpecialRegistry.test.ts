import { describe, expect, it } from 'vitest';
import {
  ALL_CATALOGED_SECTOR_TYPES,
  getSectorCatalogCoverageStats,
  SECTOR_SPECIAL_CATALOG,
} from './sectorSpecialRegistry';
import { ALL_SECTOR_TYPE_ROWS } from './sectorSpecialRuntime';

describe('sectorSpecialRegistry', () => {
  it('catalogs every merged sector type row', () => {
    const uniqueIds = new Set(ALL_SECTOR_TYPE_ROWS.map((row) => row.id));
    expect(ALL_CATALOGED_SECTOR_TYPES.length).toBe(uniqueIds.size);
    for (const id of uniqueIds) {
      expect(SECTOR_SPECIAL_CATALOG[id]).toBeDefined();
    }
  });

  it('implements all cataloged sector types', () => {
    const stats = getSectorCatalogCoverageStats();
    expect(stats.missing).toBe(0);
    expect(stats.partial).toBe(0);
    expect(stats.implemented).toBe(stats.cataloged);
    expect(stats.cataloged).toBeGreaterThanOrEqual(100);
  });
});
