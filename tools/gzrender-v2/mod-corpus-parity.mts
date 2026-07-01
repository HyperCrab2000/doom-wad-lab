#!/usr/bin/env npx tsx
/**
 * Mod stack GZSTATE parity — compare Node merged WAD export vs GZDoom dump with same `-file` stack.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/mod-corpus-parity.mts [stack-id]
 *   npx tsx tools/gzrender-v2/mod-corpus-parity.mts --all
 *
 * Requires GZDoom dumps (generated on first run). PWAD stacks need patch files present under
 * public/mods/ or paths in mod-stacks.json.
 *
 * Fixture PK3 paths skip when files missing unless MOD_CORPUS_REQUIRED=1.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  diffGzstate,
  exportToGzstate,
  formatGzstateDiff,
  readGzstateFile,
  writeGzstate,
} from '@hypercrab2000/doom-wad-core';

import {
  loadWadFromModStack,
  modStackFilesPresent,
  type ModFileStack,
} from '../../src/wad/mod/modFileStack.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const STACKS_PATH = path.join(import.meta.dirname, 'mod-stacks.json');
const ARTIFACTS = path.join(ROOT, 'artifacts/gzrender-v2/mod-corpus');
const GZDOOM_DUMP = path.join(ROOT, 'tools/gzrender-v2/dump-gzdoom-state.sh');
const REQUIRED = process.env.MOD_CORPUS_REQUIRED === '1';

function loadStacks(): ModFileStack[] {
  return JSON.parse(fs.readFileSync(STACKS_PATH, 'utf8')) as ModFileStack[];
}

function gzdoomExtraArgs(stack: ModFileStack): string {
  const tokens = stack.files.flatMap((f) => ['-file', path.join(ROOT, f)]);
  if (stack.gzdoomArgs?.length) tokens.push(...stack.gzdoomArgs);
  return tokens.join(' ');
}

function dumpGzdoom(stack: ModFileStack, map: string, out: string): void {
  const res = spawnSync(GZDOOM_DUMP, [path.join(ROOT, stack.iwad), map, out], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      GZDOOM_EXTRA_ARGS: gzdoomExtraArgs(stack),
    },
  });
  if (res.status !== 0) {
    throw new Error(`GZDoom dump failed (${stack.id}/${map}): ${res.stderr || res.stdout}`);
  }
}

async function runStack(stack: ModFileStack): Promise<{ pass: number; fail: number; skip: number }> {
  let pass = 0;
  let fail = 0;
  let skip = 0;
  const outDir = path.join(ARTIFACTS, stack.id);
  fs.mkdirSync(outDir, { recursive: true });

  if (!modStackFilesPresent(ROOT, stack)) {
    const msg = `Skipping ${stack.id}: missing IWAD or patch files`;
    if (REQUIRED) throw new Error(msg);
    console.log(msg);
    return { pass, fail, skip: stack.maps.length };
  }

  const wad = loadWadFromModStack(ROOT, stack);

  for (const map of stack.maps) {
    const mapDir = path.join(outDir, map);
    fs.mkdirSync(mapDir, { recursive: true });
    const gzdoomPath = path.join(mapDir, 'gzdoom.gzstate');
    const nodePath = path.join(mapDir, 'node.gzstate');

    if (!fs.existsSync(gzdoomPath)) {
      process.stdout.write(`  [gzdoom] ${stack.id}/${map}...`);
      dumpGzdoom(stack, map, gzdoomPath);
      process.stdout.write(' ok\n');
    }

    const nodeDoc = exportToGzstate(wad, map);
    fs.writeFileSync(nodePath, Buffer.from(new Uint8Array(writeGzstate(nodeDoc))));

    const gzdoomDoc = readGzstateFile(new Uint8Array(fs.readFileSync(gzdoomPath)));
    const diff = diffGzstate(nodeDoc, gzdoomDoc);
    if (diff.identical) {
      pass++;
      console.log(`  PASS ${stack.id}/${map}`);
    } else {
      fail++;
      console.log(`  FAIL ${stack.id}/${map}`);
      console.log(formatGzstateDiff(diff).slice(0, 2000));
    }
  }

  return { pass, fail, skip };
}

async function main() {
  const stacks = loadStacks();
  const arg = process.argv[2] ?? '--all';
  const selected = arg === '--all' ? stacks : stacks.filter((s) => s.id === arg);
  if (!selected.length) {
    console.error(`Unknown stack id: ${arg}`);
    process.exit(2);
  }

  let pass = 0;
  let fail = 0;
  let skip = 0;

  for (const stack of selected) {
    console.log(`\n== ${stack.id} == ${stack.description ?? ''}`);
    const result = await runStack(stack);
    pass += result.pass;
    fail += result.fail;
    skip += result.skip;
  }

  const summary = { pass, fail, skip, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(ARTIFACTS, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('\nSummary:', summary);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
