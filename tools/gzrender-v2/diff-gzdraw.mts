#!/usr/bin/env npx tsx
/**
 * Diff GZDRAW v1 binary draw-state dumps.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/diff-gzdraw.mts left.gzdraw right.gzdraw
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { diffGzdraw, formatGzdrawDiff, readGzdrawFile } from '../../src/wad/parity/gzdraw/index.ts';

function main(): void {
  const leftPath = process.argv[2];
  const rightPath = process.argv[3];

  if (!leftPath || !rightPath) {
    console.error('Usage: diff-gzdraw.mts <left.gzdraw> <right.gzdraw>');
    process.exit(2);
  }

  const left = readGzdrawFile(readFileSync(leftPath));
  const right = readGzdrawFile(readFileSync(rightPath));
  const result = diffGzdraw(left, right);
  const report = formatGzdrawDiff(result);
  console.log(report);

  if (process.env.GZDRAW_DIFF_JSON) {
    writeFileSync(process.env.GZDRAW_DIFF_JSON, JSON.stringify(result, null, 2));
  }

  process.exit(result.identical ? 0 : 1);
}

main();
