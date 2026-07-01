#!/usr/bin/env npx tsx
/**
 * Tier 2 GZDRAW corpus — native baseline and optional native vs WASM diff.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/gzdraw-corpus.mts [iwad] [options]
 *
 * Options:
 *   --maps E1M1,MAP01     filter maps
 *   --probes 0,1,2        filter probe ids (default: all)
 *   --max-probes N        cap probes per map (for smoke)
 *   --native-only         skip WASM diff (baseline capture only)
 *   --wasm                diff against WASM (requires dev server on 5150)
 *   --force               re-capture even when artifact exists
 *   --jobs N              parallel native captures (default 4)
 *
 * Artifacts:
 *   artifacts/gzrender-v2/gzdraw-corpus/<IWAD>/<MAP>/probe-<id>.gzdraw
 *   artifacts/gzrender-v2/gzdraw-corpus/<IWAD>/<MAP>/probe-<id>-wasm.gzdraw
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { discoverMapNames } from '@hypercrab2000/doom-wad-core';

import { diffGzdraw, formatGzdrawDiff, readGzdrawFile } from '../../src/wad/parity/gzdraw/index.ts';
import { enumerateViewProbesForMap, type ViewProbeRecord } from './enumerate-view-probes.mts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CAPTURE_NATIVE = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-gzdraw.sh');
const CAPTURE_WASM = path.join(ROOT, 'tools/gzrender-v2/capture-gzdoom-wasm-gzdraw.mts');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const OUT = path.join(ROOT, 'artifacts/gzrender-v2/gzdraw-corpus');
const DEV_URL = process.env.TEST_URL ?? 'http://localhost:5150';

interface CliOptions {
  iwad: string;
  mapFilter?: string[];
  probeFilter?: number[];
  maxProbes?: number;
  nativeOnly: boolean;
  wasm: boolean;
  force: boolean;
  jobs: number;
}

function parseArgs(argv: string[]): CliOptions {
  let iwad = path.join(ROOT, 'public/wads/DOOM.WAD');
  let mapFilter: string[] | undefined;
  let probeFilter: number[] | undefined;
  let maxProbes: number | undefined;
  let nativeOnly = false;
  let wasm = false;
  let force = false;
  let jobs = Math.min(8, Math.max(1, os.cpus().length));

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--maps') mapFilter = argv[++i]?.split(',').map((s) => s.trim().toUpperCase());
    else if (arg === '--probes') probeFilter = argv[++i]?.split(',').map((s) => Number(s.trim()));
    else if (arg === '--max-probes') maxProbes = Number(argv[++i]);
    else if (arg === '--native-only') nativeOnly = true;
    else if (arg === '--wasm') wasm = true;
    else if (arg === '--force') force = true;
    else if (arg === '--jobs') jobs = Math.max(1, Number(argv[++i]));
    else if (!arg.startsWith('-')) iwad = path.resolve(arg);
  }

  if (!nativeOnly && !wasm) nativeOnly = true;
  return { iwad, mapFilter, probeFilter, maxProbes, nativeOnly, wasm, force, jobs };
}

function iwadSlug(iwadPath: string): string {
  return path.basename(iwadPath, path.extname(iwadPath)).toUpperCase();
}

function viewString(probe: ViewProbeRecord): string {
  return `${probe.viewX},${probe.viewY},${probe.yawDeg}`;
}

function goldGzstate(slug: string, map: string): string {
  return path.join(GOLD, slug, map, 'gzdoom.gzstate');
}

function probeOutPath(slug: string, map: string, probeId: number, wasm = false): string {
  const name = wasm ? `probe-${probeId}-wasm.gzdraw` : `probe-${probeId}.gzdraw`;
  return path.join(OUT, slug, map, name);
}

function runNativeCapture(
  iwad: string,
  map: string,
  gzstate: string,
  view: string,
  out: string,
  probeId: number,
): void {
  const env = { ...process.env, GZDOOM_TIMEOUT: '90' };
  const res = spawnSync(
    'bash',
    [CAPTURE_NATIVE, iwad, map, gzstate, view, out, String(probeId)],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', env },
  );
  if (res.status !== 0) {
    throw new Error(
      `native capture failed map=${map} probe=${probeId} view=${view}\n${res.stdout}\n${res.stderr}`,
    );
  }
}

function runWasmCapture(map: string, view: string, probeId: number, out: string): void {
  const res = spawnSync(
    'npx',
    ['tsx', CAPTURE_WASM, map, view, String(probeId), out],
    { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', env: process.env },
  );
  if (res.status !== 0) {
    throw new Error(
      `wasm capture failed map=${map} probe=${probeId}\n${res.stdout?.slice(-2000)}\n${res.stderr?.slice(-2000)}`,
    );
  }
}

async function devServerUp(): Promise<boolean> {
  try {
    const res = await fetch(DEV_URL, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

interface WorkItem {
  slug: string;
  iwad: string;
  wadName: string;
  map: string;
  probe: ViewProbeRecord;
}

function filterProbes(probes: ViewProbeRecord[], opts: CliOptions): ViewProbeRecord[] {
  let list = probes;
  if (opts.probeFilter?.length) {
    const set = new Set(opts.probeFilter);
    list = list.filter((p) => set.has(p.probeId));
  }
  if (opts.maxProbes != null) list = list.slice(0, opts.maxProbes);
  return list;
}

async function processNativeBatch(items: WorkItem[], opts: CliOptions): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      const { slug, iwad, map, probe } = items[i]!;
      const gzstate = goldGzstate(slug, map);
      if (!fs.existsSync(gzstate)) {
        throw new Error(`Missing gold gzstate: ${gzstate}`);
      }
      const out = probeOutPath(slug, map, probe.probeId);
      if (!opts.force && fs.existsSync(out)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      runNativeCapture(iwad, map, gzstate, viewString(probe), out, probe.probeId);
    }
  }
  await Promise.all(Array.from({ length: opts.jobs }, () => worker()));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(opts.iwad)) {
    console.error(`IWAD not found: ${opts.iwad}`);
    process.exit(1);
  }

  if (opts.wasm && !(await devServerUp())) {
    console.error(`Dev server not reachable at ${DEV_URL} — run: npm run dev`);
    process.exit(2);
  }

  const { loadWadFromArrayBuffer } = await import('@hypercrab2000/doom-wad-core');
  const buf = fs.readFileSync(opts.iwad);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  let maps = discoverMapNames(wad);
  if (opts.mapFilter?.length) maps = maps.filter((m) => opts.mapFilter!.includes(m));

  const slug = iwadSlug(opts.iwad);
  const wadName = path.basename(opts.iwad).toUpperCase();
  fs.mkdirSync(path.join(OUT, slug), { recursive: true });

  const work: WorkItem[] = [];
  for (const map of maps) {
    const probes = filterProbes(enumerateViewProbesForMap(wadName, map), opts);
    for (const probe of probes) {
      work.push({ slug, iwad: opts.iwad, wadName, map, probe });
    }
  }

  console.log(`GZDRAW corpus: ${slug} — ${maps.length} maps, ${work.length} probes (jobs=${opts.jobs})`);

  if (!opts.wasm) {
    console.log('Capturing native baseline…');
    await processNativeBatch(work, opts);
  }

  let pass = 0;
  let fail = 0;
  let skip = 0;
  const failures: string[] = [];

  if (opts.wasm) {
    console.log('Capturing WASM + diff vs native…');
    for (const item of work) {
      const { map, probe } = item;
      const nativePath = probeOutPath(slug, map, probe.probeId);
      const wasmPath = probeOutPath(slug, map, probe.probeId, true);

      if (!fs.existsSync(nativePath)) {
        const gzstate = goldGzstate(slug, map);
        fs.mkdirSync(path.dirname(nativePath), { recursive: true });
        runNativeCapture(opts.iwad, map, gzstate, viewString(probe), nativePath, probe.probeId);
      }

      if (!opts.force && fs.existsSync(wasmPath)) {
        skip++;
      } else {
        fs.mkdirSync(path.dirname(wasmPath), { recursive: true });
        try {
          runWasmCapture(map, viewString(probe), probe.probeId, wasmPath);
        } catch (err) {
          fail++;
          failures.push(`${map} probe-${probe.probeId}: wasm capture — ${err instanceof Error ? err.message : err}`);
          continue;
        }
      }

      const left = readGzdrawFile(fs.readFileSync(nativePath));
      const right = readGzdrawFile(fs.readFileSync(wasmPath));
      const diff = diffGzdraw(left, right);
      if (diff.identical) {
        pass++;
      } else {
        fail++;
        failures.push(`${map} probe-${probe.probeId}: ${formatGzdrawDiff(diff).split('\n')[1] ?? 'diff'}`);
      }
    }
  } else {
    pass = work.filter((w) => fs.existsSync(probeOutPath(slug, w.map, w.probe.probeId))).length;
  }

  const summary = {
    iwad: slug,
    maps: maps.length,
    probes: work.length,
    mode: opts.wasm ? 'native-vs-wasm' : 'native-only',
    pass,
    fail,
    skip,
    failures: failures.slice(0, 100),
  };
  fs.writeFileSync(path.join(OUT, slug, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nDone: pass=${pass} fail=${fail} skip=${skip}`);
  if (fail > 0) {
    for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
