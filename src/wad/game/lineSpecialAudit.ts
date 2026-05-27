import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import {
  IMPLEMENTED_LINE_SPECIALS,
  LINE_SPECIAL_CATALOG,
} from './lineSpecialRegistry';
import {
  createLineSpecialSimulator,
  simulateUseLine,
  simulateWalkLine,
  walkCrossPositions,
} from './lineSpecialSimulator';
import { getDoorSpecial } from './lineSpecials';
import { getFloorMoverSpecial } from './floorMoverSpecials';
import { getTeleportSpecial } from './teleportSpecials';
import { getCrusherSpecial } from './crusherSpecials';
import { getDonutSpecial } from './donutSpecials';
import { getExitSpecial } from './exitSpecials';
import { getLightSpecial } from './lightSpecials';
import { getStairSpecial } from './stairSpecials';

export interface LineSpecialUsage {
  special: number;
  count: number;
  maps: string[];
}

export interface LineSpecialExample {
  wadMapKey: string;
  mapName: string;
  lineIndex: number;
  tag: number;
  special: number;
}

export interface LineSpecialAuditReport {
  usages: LineSpecialUsage[];
  uncataloged: LineSpecialUsage[];
  implementedWithoutStockExample: number[];
  simulationFailures: Array<{ special: number; example: LineSpecialExample; reason: string }>;
}

export function scanMapLineSpecials(mapName: string, map: WadMap): Map<number, LineSpecialUsage> {
  const bySpecial = new Map<number, LineSpecialUsage>();

  map.LINEDEFS.forEach((line, lineIndex) => {
    const special = line.special ?? 0;
    if (special === 0) return;
    const existing = bySpecial.get(special);
    if (existing) {
      existing.count += 1;
      if (!existing.maps.includes(mapName)) existing.maps.push(mapName);
    } else {
      bySpecial.set(special, { special, count: 1, maps: [mapName] });
    }
    void lineIndex;
  });

  return bySpecial;
}

export function scanWadLineSpecials(wad: Wad): Map<number, LineSpecialUsage> {
  const merged = new Map<number, LineSpecialUsage>();
  for (const [mapName, map] of Object.entries(wad.maps)) {
    const local = scanMapLineSpecials(mapName, map);
    for (const [special, usage] of local) {
      const existing = merged.get(special);
      if (existing) {
        existing.count += usage.count;
        for (const name of usage.maps) {
          if (!existing.maps.includes(name)) existing.maps.push(name);
        }
      } else {
        merged.set(special, { ...usage, maps: [...usage.maps] });
      }
    }
  }
  return merged;
}

export function findFirstLineExample(
  wad: Wad,
  special: number,
  wadLabel: string
): LineSpecialExample | null {
  for (const [mapName, map] of Object.entries(wad.maps)) {
    for (let lineIndex = 0; lineIndex < map.LINEDEFS.length; lineIndex++) {
      const line = map.LINEDEFS[lineIndex];
      if ((line.special ?? 0) === special) {
        return {
          wadMapKey: wadLabel,
          mapName,
          lineIndex,
          tag: line.tag ?? 0,
          special,
        };
      }
    }
  }
  return null;
}

export function isStockIwad(wad: Wad): boolean {
  const mapNames = Object.keys(wad.maps);
  return mapNames.includes('MAP01') || mapNames.includes('E1M1');
}

function expectedActivationKind(special: number): 'switch' | 'walk' | null {
  const switchActivators = [
    getDoorSpecial(special),
    getFloorMoverSpecial(special),
    getCrusherSpecial(special),
    getExitSpecial(special),
    getStairSpecial(special),
    getDonutSpecial(special),
    getLightSpecial(special),
  ];
  if (switchActivators.some((d) => d?.activation === 'switch')) return 'switch';

  const walkActivators = [
    getDoorSpecial(special),
    getFloorMoverSpecial(special),
    getTeleportSpecial(special),
    getCrusherSpecial(special),
    getExitSpecial(special),
    getStairSpecial(special),
    getLightSpecial(special),
  ];
  if (walkActivators.some((d) => d?.activation === 'walk')) return 'walk';
  if (getFloorMoverSpecial(special)?.activation === 'gun') return 'switch';
  return null;
}

export function simulateStockLineExample(
  wad: Wad,
  example: LineSpecialExample
): { ok: boolean; reason?: string; result?: ReturnType<typeof simulateUseLine> } {
  const map = wad.maps[example.mapName];
  if (!map) return { ok: false, reason: 'map missing' };

  const sim = createLineSpecialSimulator(map);
  const activation = expectedActivationKind(example.special);

  if (activation === 'switch') {
    const result = simulateUseLine(sim, example.lineIndex);
    if (!result.triggered) {
      return { ok: false, reason: 'switch use did not trigger', result };
    }
    return { ok: true, result };
  }

  if (activation === 'walk') {
    const cross = walkCrossPositions(map, example.lineIndex);
    if (!cross) return { ok: false, reason: 'could not derive walk path' };
    const result = simulateWalkLine(sim, example.lineIndex);
    if (!result.triggered) {
      return { ok: false, reason: 'walk did not trigger', result };
    }
    return { ok: true, result };
  }

  return { ok: false, reason: 'not activatable in simulator' };
}

export function auditWadLineSpecials(wad: Wad, wadLabel: string): LineSpecialAuditReport {
  const usages = [...scanWadLineSpecials(wad).values()].sort((a, b) => a.special - b.special);
  const uncataloged = usages.filter((row) => !LINE_SPECIAL_CATALOG[row.special]);

  const implementedWithoutStockExample: number[] = [];
  const simulationFailures: LineSpecialAuditReport['simulationFailures'] = [];

  for (const special of IMPLEMENTED_LINE_SPECIALS) {
    const example = findFirstLineExample(wad, special, wadLabel);
    if (!example) {
      implementedWithoutStockExample.push(special);
      continue;
    }
    const sim = simulateStockLineExample(wad, example);
    if (!sim.ok) {
      simulationFailures.push({
        special,
        example,
        reason: sim.reason ?? 'unknown',
      });
    }
  }

  return {
    usages,
    uncataloged,
    implementedWithoutStockExample,
    simulationFailures,
  };
}

export function summarizeAudit(report: LineSpecialAuditReport): string {
  const implemented = IMPLEMENTED_LINE_SPECIALS.length;
  const cataloged = Object.keys(LINE_SPECIAL_CATALOG).length;
  return [
    `cataloged=${cataloged}`,
    `implemented=${implemented}`,
    `uncataloged specials in wad=${report.uncataloged.length}`,
    `implemented missing stock example=${report.implementedWithoutStockExample.length}`,
    `simulation failures=${report.simulationFailures.length}`,
  ].join(', ');
}

export function getCatalogCoverageStats(): {
  cataloged: number;
  implemented: number;
  missing: number;
  partial: number;
} {
  const entries = Object.values(LINE_SPECIAL_CATALOG);
  return {
    cataloged: entries.length,
    implemented: entries.filter((e) => e.status === 'implemented').length,
    missing: entries.filter((e) => e.status === 'missing').length,
    partial: entries.filter((e) => e.status === 'partial').length,
  };
}
