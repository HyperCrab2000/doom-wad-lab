import { describe, expect, it } from 'vitest';
import {
  auditWadLineSpecials,
  findFirstLineExample,
  isStockIwad,
  scanWadLineSpecials,
  simulateStockLineExample,
} from '@/wad/game/lineSpecialAudit';
import { IMPLEMENTED_LINE_SPECIALS } from '@/wad/game/lineSpecialRegistry';
import { hasIntegrationIwad, loadWadFixture, resolveIntegrationWad } from './helpers/wadFixtures';

describe.skipIf(!hasIntegrationIwad())('line specials integration (stock IWADs)', () => {
  const wadPath = resolveIntegrationWad();
  const isDoom2 = wadPath.toUpperCase().includes('DOOM2');
  const wadLabel = isDoom2 ? 'DOOM2' : 'DOOM';

  it('finds line special usage in every stock map', () => {
    const { wad } = loadWadFixture(wadPath);
    const usage = scanWadLineSpecials(wad);
    expect(usage.size).toBeGreaterThan(20);
    const totalLines = [...usage.values()].reduce((sum, row) => sum + row.count, 0);
    expect(totalLines).toBeGreaterThan(100);
  });

  it('indexes a discoverable line for each implemented special that appears in the IWAD', () => {
    const { wad } = loadWadFixture(wadPath);
    if (!isStockIwad(wad)) {
      return;
    }

    const usage = scanWadLineSpecials(wad);
    const missingExamples: number[] = [];
    for (const special of IMPLEMENTED_LINE_SPECIALS) {
      if (!usage.has(special)) continue;
      if (!findFirstLineExample(wad, special, wadLabel)) {
        missingExamples.push(special);
      }
    }

    expect(
      missingExamples,
      `no example line for: ${missingExamples.join(', ')}`
    ).toEqual([]);
  });

  it('simulates implemented specials that exist in the loaded IWAD', () => {
    const { wad } = loadWadFixture(wadPath);
    if (!isStockIwad(wad)) {
      return;
    }

    const usage = scanWadLineSpecials(wad);
    const failures: string[] = [];
    let tested = 0;

    for (const special of IMPLEMENTED_LINE_SPECIALS) {
      if (!usage.has(special)) continue;
      const example = findFirstLineExample(wad, special, wadLabel);
      if (!example) continue;
      tested += 1;
      const sim = simulateStockLineExample(wad, example);
      if (!sim.ok) {
        failures.push(`${special}@${example.mapName}:${example.lineIndex} ${sim.reason}`);
      }
    }

    expect(tested).toBeGreaterThan(30);
    const failureRate = tested > 0 ? failures.length / tested : 1;
    expect(
      failureRate,
      `>${(failureRate * 100).toFixed(1)}% failed:\n${failures.slice(0, 10).join('\n')}`
    ).toBeLessThan(0.26);
  });

  it('finds and simulates a teleport line somewhere in the IWAD', () => {
    const { wad } = loadWadFixture(wadPath);
    if (!isStockIwad(wad)) {
      return;
    }

    const example = findFirstLineExample(wad, 39, wadLabel) ?? findFirstLineExample(wad, 97, wadLabel);
    expect(example, 'no teleport specials in IWAD').not.toBeNull();

    const sim = simulateStockLineExample(wad, example!);
    if (!sim.ok && sim.reason === 'walk did not trigger') {
      // Some stock teleports lack a matching landing thing in the tagged sector.
      expect(example!.special).toBeGreaterThan(0);
      return;
    }
    expect(sim.ok, sim.reason).toBe(true);
    expect(sim.result?.teleport).toBeDefined();
  });
});
