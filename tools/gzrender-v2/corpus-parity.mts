#!/usr/bin/env npx tsx
/**
 * Corpus parity runner — compare Node GZSTATE export vs GZDoom dump for every stock map.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/corpus-parity.mts [iwad] [--static] [--maps E1M1,MAP01]
 *
 * Outputs:
 *   artifacts/gzrender-v2/corpus/<wad>/<map>/
 *     gzdoom.gzstate
 *     node.gzstate
 *     static.wad          (with --static)
 *     gzdoom-static.gzstate (with --static)
 *   artifacts/gzrender-v2/corpus/summary.json
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  assertFullParity,
  diffGzstate,
  discoverMapNames,
  encodeWadToArrayBuffer,
  exportToGzstate,
  formatGzstateDiff,
  loadWadFromArrayBuffer,
  readGzstateFile,
  writeGzstate,
} from '@hypercrab2000/doom-wad-core';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GZDOOM_DUMP = path.join(ROOT, 'tools/gzrender-v2/dump-gzdoom-state.sh');
const ARTIFACTS = path.join(ROOT, 'artifacts/gzrender-v2/corpus');

interface MapResult {
  map: string;
  nodeVsGzdoom: 'pass' | 'fail' | 'skip';
  staticVsGzdoom?: 'pass' | 'fail' | 'skip';
  error?: string;
}

function parseArgs(argv: string[]) {
  let iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
  let staticVerify = false;
  let mapFilter: string[] | undefined;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--static') staticVerify = true;
    else if (arg === '--maps') mapFilter = argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    else if (!arg.startsWith('-')) iwad = path.resolve(arg);
  }
  return { iwad, staticVerify, mapFilter };
}

function wadSlug(iwadPath: string): string {
  return path.basename(iwadPath, path.extname(iwadPath)).toUpperCase();
}

function dumpGzdoom(iwad: string, map: string, out: string): void {
  const res = spawnSync(GZDOOM_DUMP, [iwad, map, out], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (res.status !== 0) {
    throw new Error(`GZDoom dump failed for ${map}: ${res.stderr || res.stdout}`);
  }
}

async function main() {
  const { iwad, staticVerify, mapFilter } = parseArgs(process.argv);

  if (!fs.existsSync(iwad)) {
    console.error(`IWAD not found: ${iwad}`);
    process.exit(1);
  }

  const wadBytes = fs.readFileSync(iwad);
  const wad = loadWadFromArrayBuffer(
    wadBytes.buffer.slice(wadBytes.byteOffset, wadBytes.byteOffset + wadBytes.byteLength)
  );
  let maps = discoverMapNames(wad);
  if (mapFilter?.length) maps = maps.filter((m) => mapFilter.includes(m));

  const slug = wadSlug(iwad);
  const corpusDir = path.join(ARTIFACTS, slug);
  fs.mkdirSync(corpusDir, { recursive: true });

  /** One static IWAD per corpus run — shared across all maps. */
  let staticWadPath: string | undefined;
  if (staticVerify) {
    staticWadPath = path.join(corpusDir, 'static.wad');
    if (!fs.existsSync(staticWadPath)) {
      process.stdout.write(`  [encode] static IWAD for ${slug}...`);
      fs.writeFileSync(staticWadPath, Buffer.from(encodeWadToArrayBuffer(wad)));
      process.stdout.write(' ok\n');
    }
  }

  const results: MapResult[] = [];
  let pass = 0;
  let fail = 0;

  console.log(`Corpus parity: ${slug} — ${maps.length} maps${staticVerify ? ' (+ static WAD)' : ''}`);

  for (const map of maps) {
    const mapDir = path.join(corpusDir, map);
    fs.mkdirSync(mapDir, { recursive: true });

    const gzdoomPath = path.join(mapDir, 'gzdoom.gzstate');
    const nodePath = path.join(mapDir, 'node.gzstate');
    const result: MapResult = { map, nodeVsGzdoom: 'skip' };

    try {
      if (!fs.existsSync(gzdoomPath)) {
        process.stdout.write(`  [dump] ${map}...`);
        dumpGzdoom(iwad, map, gzdoomPath);
        process.stdout.write(' ok\n');
      }

      const nodeDoc = exportToGzstate(wad, map);
      fs.writeFileSync(nodePath, Buffer.from(writeGzstate(nodeDoc)));

      const gzdoomDoc = readGzstateFile(new Uint8Array(fs.readFileSync(gzdoomPath)));
      assertFullParity(nodeDoc, gzdoomDoc);
      result.nodeVsGzdoom = 'pass';
      pass++;
      process.stdout.write(`  [pass] ${map} node vs gzdoom\n`);

      if (staticVerify && staticWadPath) {
        const staticGzPath = path.join(mapDir, 'gzdoom-static.gzstate');
        if (!fs.existsSync(staticGzPath)) {
          dumpGzdoom(staticWadPath, map, staticGzPath);
        }
        const staticDoc = readGzstateFile(new Uint8Array(fs.readFileSync(staticGzPath)));
        assertFullParity(staticDoc, gzdoomDoc);
        result.staticVsGzdoom = 'pass';
        process.stdout.write(`  [pass] ${map} static WAD vs gzdoom\n`);
      }
    } catch (err) {
      result.nodeVsGzdoom = 'fail';
      result.error = err instanceof Error ? err.message : String(err);
      fail++;
      process.stdout.write(`  [FAIL] ${map}: ${result.error}\n`);
      if (fs.existsSync(nodePath) && fs.existsSync(gzdoomPath)) {
        try {
          const diff = diffGzstate(
            readGzstateFile(new Uint8Array(fs.readFileSync(nodePath))),
            readGzstateFile(new Uint8Array(fs.readFileSync(gzdoomPath))),
          );
          fs.writeFileSync(path.join(mapDir, 'diff.txt'), formatGzstateDiff(diff));
        } catch {
          /* ignore */
        }
      }
    }

    results.push(result);
  }

  const summary = {
    iwad: slug,
    mapCount: maps.length,
    pass,
    fail,
    staticVerify,
    results,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(corpusDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\nDone: ${pass} pass, ${fail} fail (${maps.length} maps)`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
