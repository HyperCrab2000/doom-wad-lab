#!/usr/bin/env npx tsx
/**
 * Honest Classic WebGL parity corpus — DOOM + DOOM II spawn views vs GZDoom gold.
 *
 * - Headless parity-capture.html (production preview, no dev UI)
 * - honestParity=1: frozen spawn + GZDoom layout, NO gold/oracle pixel patches
 * - WebGL playfield + patch-drawn status bar (not React HUD)
 * - Fails hard on capture errors (no gold PNG fallback)
 *
 * Usage:
 *   npm run build && npm run test:honest-parity -- E1M1
 *   npm run test:honest-parity
 *
 * Env:
 *   HONEST_PARITY_CAPTURE=1     refresh PNGs before diff
 *   HONEST_PARITY_MAX_MISMATCH  bucket/full gate % (default 5 when HONEST_PARITY_REQUIRED=1)
 *   HONEST_PARITY_REQUIRED=1    exit non-zero on failure
 *   HONEST_PARITY_TOLERANCE      per-channel tol (default 8)
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  diffRgbaBuffers,
  extractGzdoomView,
  loadPng,
  resizePlayfieldToVanilla,
} from '../../src/wad/parity/frame/frameDiff.ts';
import { resolveGoldIwadSlug } from '../../src/wad/parity/frame/goldIwad.ts';
import {
  captureHonestParityFrame,
  ensureParityServer,
  launchParityBrowser,
  prepareParityPage,
  stopParityPreviewServer,
} from './lib/parityHarness.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD_ROOT = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const NATIVE_PLAYFIELD = process.env.HONEST_PARITY_NATIVE === '1';
const OUT_DIR = path.join(ROOT, 'artifacts/gzrender-v2', NATIVE_PLAYFIELD ? 'honest-parity-native' : 'honest-parity');
const TOLERANCE = Number(process.env.HONEST_PARITY_TOLERANCE ?? '8');
const W = 320;
const H = 168;
const REQUIRED = process.env.HONEST_PARITY_REQUIRED === '1';
const GATE_PCT =
  process.env.HONEST_PARITY_MAX_MISMATCH != null && process.env.HONEST_PARITY_MAX_MISMATCH !== ''
    ? Number(process.env.HONEST_PARITY_MAX_MISMATCH)
    : 5;

const REGIONS = [
  { id: 'ceiling', y0: 0, y1: 42, layer: 'rendering/sky' },
  { id: 'mid-upper', y0: 42, y1: 84, layer: 'rendering/walls-upper' },
  { id: 'mid-lower', y0: 84, y1: 126, layer: 'rendering/walls-lower' },
  { id: 'floor', y0: 126, y1: 168, layer: 'rendering/floor' },
] as const;

const HUD_REGION = { id: 'hud', y0: 403, y1: 480, layer: 'hud/status-bar' } as const;

function listCorpusMaps(): Array<{ slug: 'DOOM' | 'DOOM2'; map: string }> {
  const out: Array<{ slug: 'DOOM' | 'DOOM2'; map: string }> = [];
  for (const slug of ['DOOM', 'DOOM2'] as const) {
    const dir = path.join(GOLD_ROOT, slug);
    if (!fs.existsSync(dir)) continue;
    for (const map of fs.readdirSync(dir)) {
      if (fs.existsSync(path.join(dir, map, 'ref.png'))) out.push({ slug, map });
    }
  }
  return out.sort((a, b) => `${a.slug}/${a.map}`.localeCompare(`${b.slug}/${b.map}`));
}

async function loadPlayfield(pngPath: string) {
  const img = await loadPng(path.resolve(pngPath));
  const view = extractGzdoomView(img.data, img.width, img.height);
  return resizePlayfieldToVanilla(view.data, view.width, view.height);
}

function bucketMismatchPct(
  classic: Uint8ClampedArray,
  gold: Uint8ClampedArray,
  y0: number,
  y1: number,
): number {
  const region = { x: 0, y: y0, width: W, height: y1 - y0 };
  const diff = diffRgbaBuffers(classic, gold, W, H, region, TOLERANCE);
  return diff.mismatchRatio * 100;
}

async function evalMap(
  map: string,
  captureFn: (map: string) => Promise<void>,
): Promise<Record<string, unknown>> {
  const slug = resolveGoldIwadSlug(map);
  const capturePath = path.join(OUT_DIR, `${map}.png`);
  const goldPath = path.join(GOLD_ROOT, slug, map, 'ref.png');

  if (process.env.HONEST_PARITY_CAPTURE === '1' || !fs.existsSync(capturePath)) {
    await captureFn(map);
  }
  if (!fs.existsSync(capturePath)) {
    return { map, slug, pass: false, error: 'capture missing' };
  }
  if (!fs.existsSync(goldPath)) {
    return { map, slug, pass: false, error: 'missing gold ref' };
  }

  const classicImg = await loadPng(capturePath);
  const goldImg = await loadPng(goldPath);
  const classic = await loadPlayfield(capturePath);
  const gold = await loadPlayfield(goldPath);
  const playfield = diffRgbaBuffers(classic.data, gold.data, W, H, { x: 0, y: 0, width: W, height: H }, TOLERANCE);
  const fullFrame = diffRgbaBuffers(
    classicImg.data,
    goldImg.data,
    classicImg.width,
    classicImg.height,
    { x: 0, y: 0, width: classicImg.width, height: classicImg.height },
    TOLERANCE,
  );
  const buckets = REGIONS.map((region) => {
    const pct = bucketMismatchPct(classic.data, gold.data, region.y0, region.y1);
    return { id: region.id, layer: region.layer, pct, pass: pct <= GATE_PCT };
  });
  const hudPct =
    classicImg.height >= HUD_REGION.y1
      ? (() => {
          const region = {
            x: 0,
            y: HUD_REGION.y0,
            width: classicImg.width,
            height: HUD_REGION.y1 - HUD_REGION.y0,
          };
          return diffRgbaBuffers(classicImg.data, goldImg.data, classicImg.width, classicImg.height, region, TOLERANCE)
            .mismatchRatio * 100;
        })()
      : 100;
  const playfieldPct = playfield.mismatchRatio * 100;
  const fullFramePct = fullFrame.mismatchRatio * 100;
  const pass =
    playfieldPct <= GATE_PCT &&
    fullFramePct <= GATE_PCT &&
    hudPct <= GATE_PCT &&
    buckets.every((b) => b.pass);

  return {
    map,
    slug,
    pass,
    playfieldPct,
    fullFramePct,
    hudPct,
    buckets,
  };
}

async function main(): Promise<void> {
  const filter = process.argv.slice(2);
  let maps = listCorpusMaps();
  if (filter.length) {
    maps = maps.filter((m) => filter.includes(m.map));
  }
  if (!maps.length) {
    console.error('No maps with gold refs found.');
    process.exit(2);
  }

  const baseUrl = await ensureParityServer();
  const browser = await launchParityBrowser();
  const page = await browser.newPage();
  await prepareParityPage(page);

  const captureFn = async (map: string) => {
    const png = await captureHonestParityFrame(page, baseUrl, map, undefined, { nativePlayfield: NATIVE_PLAYFIELD });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${map}.png`), png);
  };

  console.log(`Honest parity corpus: ${maps.length} maps @ ${baseUrl}/parity-capture.html${NATIVE_PLAYFIELD ? ' (native playfield)' : ''}`);
  console.log(`Gate: ≤${GATE_PCT}% playfield + HUD + full frame + buckets (tol=${TOLERANCE}, required=${REQUIRED})\n`);

  const results: Record<string, unknown>[] = [];
  for (const { slug, map } of maps) {
    process.stdout.write(`${slug}/${map} … `);
    try {
      const result = await evalMap(map, captureFn);
      results.push(result);
      if (result.error) {
        console.log(`FAIL (${result.error})`);
        continue;
      }
      console.log(
        result.pass
          ? `PASS pf ${(result.playfieldPct as number).toFixed(2)}% hud ${(result.hudPct as number).toFixed(2)}%`
          : `FAIL pf ${(result.playfieldPct as number).toFixed(2)}% hud ${(result.hudPct as number).toFixed(2)}% frame ${(result.fullFramePct as number).toFixed(2)}%`,
      );
      if (!result.pass) {
        for (const b of result.buckets as Array<{ id: string; pct: number; pass: boolean }>) {
          if (!b.pass) console.log(`  ${b.id}: ${b.pct.toFixed(2)}%`);
        }
      }
    } catch (err) {
      results.push({ map, slug, pass: false, error: err instanceof Error ? err.message : String(err) });
      console.log(`FAIL (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  await browser.close();
  stopParityPreviewServer();

  const summaryPath = path.join(OUT_DIR, 'summary.json');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        mode: NATIVE_PLAYFIELD ? 'honest-parity-native' : 'honest-parity',
        tolerance: TOLERANCE,
        maxMismatchPct: GATE_PCT,
        required: REQUIRED,
        results,
      },
      null,
      2,
    ),
  );

  const passed = results.filter((r) => r.pass === true).length;
  const failed = results.length - passed;
  console.log(`\n--- summary ---`);
  console.log(`PASS ${passed}/${results.length}  FAIL ${failed}/${results.length}`);
  console.log(`Wrote ${summaryPath}`);

  if (REQUIRED && failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
