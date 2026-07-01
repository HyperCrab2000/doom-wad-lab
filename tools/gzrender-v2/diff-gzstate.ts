#!/usr/bin/env npx tsx
/**
 * Inspect or diff GZSTATE v1 binary files.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/diff-gzstate.ts left.gzstate [right.gzstate]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { diffGzstate, formatGzstateDiff, readGzstateFile } from '../../gzstate';

function main(): void {
  const leftPath = process.argv[2];
  const rightPath = process.argv[3];

  if (!leftPath) {
    console.error('Usage: diff-gzstate.ts <left.gzstate> [right.gzstate]');
    process.exit(2);
  }

  const left = readGzstateFile(readFileSync(leftPath));
  if (!rightPath) {
    const summary = {
      mapName: left.header.mapName,
      engineTag: left.header.engineTag,
      vertices: left.vertices.length,
      sectors: left.sectors.length,
      sidedefs: left.sidedefs.length,
      linedefs: left.linedefs.length,
      segs: left.segs.length,
      subsectors: left.subsectors.length,
      nodes: left.nodes.length,
      strings: left.strings.length,
    };
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const right = readGzstateFile(readFileSync(rightPath));
  const result = diffGzstate(left, right);
  const report = formatGzstateDiff(result);
  console.log(report);
  if (process.env.GZSTATE_DIFF_JSON) {
    writeFileSync(process.env.GZSTATE_DIFF_JSON, JSON.stringify(result, null, 2));
  }
  process.exit(result.identical ? 0 : 1);
}

main();
