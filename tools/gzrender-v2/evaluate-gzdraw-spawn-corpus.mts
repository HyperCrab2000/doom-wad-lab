#!/usr/bin/env npx tsx
/** Evaluate existing probe-0 gzdraw spawn corpus (no capture). */
import fs from 'node:fs';
import path from 'node:path';

import { diffGzdraw, formatGzdrawDiff, readGzdrawFile } from '../../src/wad/parity/gzdraw/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CORPUS = path.join(ROOT, 'artifacts/gzrender-v2/gzdraw-corpus');

function evalSlug(slug: string): number {
  const dir = path.join(CORPUS, slug);
  if (!fs.existsSync(dir)) {
    console.error(`${slug}: corpus dir missing`);
    return 1;
  }
  let pass = 0;
  let fail = 0;
  let missing = 0;
  const failures: string[] = [];
  for (const map of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())) {
    const native = path.join(dir, map, 'probe-0.gzdraw');
    const wasm = path.join(dir, map, 'probe-0-wasm.gzdraw');
    if (!fs.existsSync(native) || !fs.existsSync(wasm)) {
      missing++;
      failures.push(`${map}: missing artifact`);
      continue;
    }
    const diff = diffGzdraw(readGzdrawFile(fs.readFileSync(native)), readGzdrawFile(fs.readFileSync(wasm)));
    if (diff.identical) pass++;
    else {
      fail++;
      failures.push(`${map}: ${formatGzdrawDiff(diff).split('\n')[1] ?? 'diff'}`);
    }
  }
  console.log(`${slug}: pass=${pass} fail=${fail} missing=${missing}`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  return fail + missing;
}

const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['DOOM', 'DOOM2'];
let code = 0;
for (const slug of slugs) {
  if (evalSlug(slug.toUpperCase()) > 0) code = 1;
}
process.exit(code);
