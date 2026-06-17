#!/usr/bin/env tsx
/**
 * PNG frame diff for GZRender Stage 2 parity.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/diff-frame.ts <reference.png> <candidate.png>
 */
import path from 'node:path';

import { diffPlayfieldPngFiles, formatFrameDiff } from '../../src/wad/parity/frame/frameDiff.ts';

const refPath = process.argv[2];
const candPath = process.argv[3];
const tolerance = Number(process.env.GZFRAME_TOLERANCE ?? '0');

if (!refPath || !candPath) {
  console.error('Usage: npx tsx tools/gzrender-v2/diff-frame.ts <reference.png> <candidate.png>');
  process.exit(2);
}

async function main(): Promise<void> {
  const result = await diffPlayfieldPngFiles(path.resolve(refPath), path.resolve(candPath), { tolerance });
  console.log(formatFrameDiff(result));
  console.log(`source: ref ${result.leftSize} | cand ${result.rightSize}`);
  process.exit(result.identical ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
