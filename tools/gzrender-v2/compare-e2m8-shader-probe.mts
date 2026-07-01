#!/usr/bin/env tsx
/**
 * Compare E2M8 gold vs WASM `-gzrender_probe` lines and frame pixels.
 *
 * Usage:
 *   npx tsx tools/gzrender-v2/compare-e2m8-shader-probe.mts [x,y]
 *
 * Env:
 *   GZRENDER_PROBE=x,y     probe playfield coord (default 60,105 horizon seam)
 *   GZRENDER_SHADER_DEBUG=N  pass -gzrender_shader_debug to WASM capture (requires rebuild)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractGzdoomView, loadPng, resizePlayfieldToVanilla } from '../../src/wad/parity/frame/frameDiff.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MAP = 'E2M8';
const probe = process.env.GZRENDER_PROBE ?? process.argv[2] ?? '60,105';
const shaderDebug = process.env.GZRENDER_SHADER_DEBUG;
const [px, py] = probe.split(',').map((s) => Number(s.trim()));

const refPng = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E2M8/ref.png');
const wasmPng = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom-wasm-corpus/DOOM/E2M8/wasm.png');
const gzstate = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E2M8/gzdoom.gzstate');
const gzdoom = process.env.GZDOOM_BIN
  ?? '/Users/williamfarmer/IdeaProjects/doom/gzdoom-project/build/gzdoom.app/Contents/MacOS/gzdoom';

async function pixelRgb(pngPath: string, x: number, y: number): Promise<string> {
  const img = await loadPng(pngPath);
  const view = extractGzdoomView(img.data, img.width, img.height);
  const norm = resizePlayfieldToVanilla(view.data, view.width, view.height);
  const i = (y * 320 + x) * 4;
  return `${norm.data[i]},${norm.data[i + 1]},${norm.data[i + 2]}`;
}

function runGoldProbe(): string | null {
  const log = `/tmp/e2m8-gold-probe-${probe}.log`;
  const args = [
    '-errorlog', '/dev/stderr',
    '+vid_preferbackend', '2', '+vid_hidpi', '0', '+vid_defwidth', '640', '+vid_defheight', '480',
    '-iwad', path.join(ROOT, 'public/wads/DOOM.WAD'),
    '-warp', '2', '8',
    '-loadgzstate', gzstate,
    '-gzrender_only', '-gzrender_probe', probe,
    '-gzstate_refframe', '/tmp/e2m8-gold-probe-out.png',
  ];
  if (shaderDebug) args.push('-gzrender_shader_debug', shaderDebug);
  spawnSync(gzdoom, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000, encoding: 'utf8', env: { ...process.env, HOME: `/tmp/gzdoom-probe-${Date.now()}` } });
  if (!fs.existsSync(log)) {
    // stdout merged via redirect in simpler path
    return null;
  }
  const text = fs.readFileSync(log, 'utf8');
  const line = text.split('\n').find((l) => l.includes('GZRENDER_PROBE playfield'));
  return line ?? null;
}

async function runWasmProbe(): Promise<string | null> {
  const out = `/tmp/e2m8-wasm-probe-${probe.replace(',', '-')}.png`;
  const env = { ...process.env, GZRENDER_PROBE: probe };
  if (shaderDebug) env.GZRENDER_SHADER_DEBUG = shaderDebug;
  const res = spawnSync('npx', ['tsx', 'tools/gzrender-v2/capture-gzdoom-wasm-frame.mts', MAP, out], {
    cwd: ROOT,
    env,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 180_000,
  });
  const logPath = `${out}.log.txt`;
  if (!fs.existsSync(logPath)) return res.stdout + res.stderr;
  const text = fs.readFileSync(logPath, 'utf8');
  return text.split('\n').find((l) => l.includes('GZRENDER_PROBE playfield')) ?? text.split('\n').slice(-5).join('\n');
}

async function main(): Promise<void> {
  console.log(`E2M8 shader probe @ playfield (${px},${py})`);
  const refRgb = await pixelRgb(refPng, px, py);
  const wasmRgb = await pixelRgb(wasmPng, px, py);
  console.log(`frame ref.png rgb: ${refRgb}`);
  console.log(`frame wasm.png rgb: ${wasmRgb}`);

  console.log('\n--- native gold probe (live) ---');
  const goldArgs = [
    '-errorlog', '/dev/stderr',
    '+vid_preferbackend', '2', '+vid_hidpi', '0', '+vid_defwidth', '640', '+vid_defheight', '480',
    '-iwad', path.join(ROOT, 'public/wads/DOOM.WAD'),
    '-warp', '2', '8',
    '-loadgzstate', gzstate,
    '-gzrender_only', '-gzrender_probe', probe,
    '-gzstate_refframe', '/tmp/e2m8-gold-probe-out.png',
  ];
  if (shaderDebug) goldArgs.push('-gzrender_shader_debug', shaderDebug);
  const gold = spawnSync(gzdoom, goldArgs, { cwd: ROOT, encoding: 'utf8', timeout: 120_000 });
  const goldLines = (gold.stdout + gold.stderr).split('\n').filter((l) => l.includes('GZRENDER_PROBE'));
  for (const l of goldLines) console.log(l.replace(/\x1b\[[0-9;]*m/g, ''));

  console.log('\n--- wasm probe (live) ---');
  const wasmLine = await runWasmProbe();
  if (wasmLine) console.log(wasmLine.replace(/\x1b\[[0-9;]*m/g, ''));

  console.log('\nShader debug modes (after rebuild with -gzrender_shader_debug N):');
  console.log('  1 = getTexel RGB (raw texture sample after manipulation)');
  console.log('  2 = colormap index, pixelpos.w/8192, uGlobVis');
  console.log('  3 = texcoord fract*8, palette index alpha');
  console.log('  4 = vColor * uObjectColor');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
