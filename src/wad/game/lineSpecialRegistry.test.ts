import { describe, expect, it } from 'vitest';
import { getCatalogCoverageStats } from './lineSpecialAudit';
import {
  ALL_CATALOGED_SPECIALS,
  getLineSpecialCatalogEntry,
  IMPLEMENTED_LINE_SPECIALS,
  isLineSpecialImplemented,
  LINE_SPECIAL_CATALOG,
} from './lineSpecialRegistry';
import { DOOR_SPECIALS } from './lineSpecials';
import { FLOOR_MOVER_SPECIALS } from './floorMoverSpecials';
import { TELEPORT_SPECIALS } from './teleportSpecials';
import { CRUSHER_SPECIALS } from './crusherSpecials';
import { EXIT_SPECIALS } from './exitSpecials';
import { STAIR_SPECIALS } from './stairSpecials';
import { DONUT_SPECIALS } from './donutSpecials';
import { LIGHT_SPECIALS } from './lightSpecials';
import { MOVING_FLOOR_SPECIALS } from './movingFloorSpecials';
import { isScrollWallSpecial } from './scrollSpecials';

describe('lineSpecialRegistry', () => {
  it('marks every handler-backed special as implemented', () => {
    for (const special of Object.keys(DOOR_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('door');
    }
    for (const special of Object.keys(FLOOR_MOVER_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('floor');
    }
    for (const special of Object.keys(TELEPORT_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('teleport');
    }
    for (const special of Object.keys(CRUSHER_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('crusher');
    }
    for (const special of Object.keys(EXIT_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('exit');
    }
    for (const special of Object.keys(STAIR_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('stair');
    }
    for (const special of Object.keys(DONUT_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('donut');
    }
    for (const special of Object.keys(LIGHT_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('light');
    }
    for (const special of Object.keys(MOVING_FLOOR_SPECIALS).map(Number)) {
      expect(LINE_SPECIAL_CATALOG[special]?.status).toBe('implemented');
      expect(LINE_SPECIAL_CATALOG[special]?.handler).toBe('movingFloor');
    }
    expect(isScrollWallSpecial(48)).toBe(true);
    expect(LINE_SPECIAL_CATALOG[48]?.handler).toBe('scroll');
  });

  it('marks scroll, keyed doors, and transfer floors as implemented', () => {
    expect(getLineSpecialCatalogEntry(48)?.status).toBe('implemented');
    expect(getLineSpecialCatalogEntry(48)?.handler).toBe('scroll');
    expect(getLineSpecialCatalogEntry(26)?.status).toBe('implemented');
    expect(getLineSpecialCatalogEntry(26)?.handler).toBe('door');
    expect(getLineSpecialCatalogEntry(22)?.status).toBe('implemented');
    expect(getLineSpecialCatalogEntry(53)?.handler).toBe('movingFloor');
    expect(getLineSpecialCatalogEntry(7)?.status).toBe('implemented');
    expect(isLineSpecialImplemented(7)).toBe(true);
    expect(isLineSpecialImplemented(11)).toBe(true);
    expect(isLineSpecialImplemented(6)).toBe(true);
  });

  it('exposes implemented specials for audits', () => {
    expect(IMPLEMENTED_LINE_SPECIALS).toContain(10);
    expect(IMPLEMENTED_LINE_SPECIALS).toContain(39);
    expect(IMPLEMENTED_LINE_SPECIALS).toContain(1);
    expect(IMPLEMENTED_LINE_SPECIALS).toContain(9);
    expect(ALL_CATALOGED_SPECIALS.length).toBeGreaterThan(120);
    const stats = getCatalogCoverageStats();
    expect(stats.implemented).toBe(stats.cataloged);
    expect(stats.missing).toBe(0);
    expect(stats.partial).toBe(0);
  });
});
