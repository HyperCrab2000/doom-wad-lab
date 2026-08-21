#!/usr/bin/env npx tsx
/** Build GZDoom spawn HUD PLAYPAL→RGB LUT from gold E1M1 ref (indexed soft-light parity). */
import fs from 'node:fs';
import path from 'node:path';

import { loadWadFromArrayBuffer } from '@hypercrab2000/doom-wad-core';

import { ByteReader } from '../../src/wad/ByteReader/ByteReader.ts';
import { computeHudLayout } from '../../src/features/level-viewer/doomHudLayout.ts';
import { VANILLA_HUD } from '../../src/features/level-viewer/doomStatusBarFonts.ts';
import { loadPng } from '../../src/wad/parity/frame/frameDiff.ts';
import { resolveStatusFaceLumpName } from '../../src/wad/game/statusFaceLumps.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard/DOOM/E1M1/ref.png');
const OUT = path.join(ROOT, 'src/parity-capture/gzdoomSpawnHudPalLut.ts');

const VANILLA_STBAR_TOP_Y = 168;
const FRAME_W = 640;
const FRAME_H = 480;

interface PatchRaster {
  width: number;
  height: number;
  left: number;
  top: number;
  idx: Uint8Array;
}

function readPatch(wad: ReturnType<typeof loadWadFromArrayBuffer>, lumpName: string): PatchRaster | null {
  const lump = wad.lumpHash[lumpName];
  if (!lump) return null;
  const br = new ByteReader(lump);
  const width = br.readUint16();
  const height = br.readUint16();
  const left = br.readInt16();
  const top = br.readInt16();
  const idx = new Uint8Array(width * height);
  const colOff: number[] = [];
  for (let i = 0; i < width; i++) colOff.push(br.readUint32());
  for (let col = 0; col < width; col++) {
    br.setIndex(colOff[col]!);
    let yPos = 0;
    while (yPos < height) {
      const yOff = br.readUint8();
      if (yOff === 255) break;
      const n = br.readUint8();
      br.skip(1);
      for (let j = 0; j < n; j++) {
        const p = br.readUint8();
        idx[col + (yOff + j) * width] = p;
      }
      br.skip(1);
      yPos = yOff + n;
    }
  }
  return { width, height, left, top, idx };
}

function toGlobal(
  screenX: number,
  screenY: number,
  scale: number,
  barLeft: number,
  barY: number,
  hudTop: number,
): { x: number; y: number } {
  return {
    x: barLeft + Math.round(screenX * scale),
    y: hudTop + barY + Math.round((screenY - VANILLA_STBAR_TOP_Y) * scale),
  };
}

function votePatch(
  votes: Map<string, number>,
  patch: PatchRaster,
  anchorX: number,
  anchorY: number,
  scale: number,
  gold: Uint8ClampedArray,
): void {
  const ox = Math.round(anchorX - patch.left * scale);
  const oy = Math.round(anchorY - patch.top * scale);
  for (let py = 0; py < patch.height; py++) {
    for (let px = 0; px < patch.width; px++) {
      const pal = patch.idx[py * patch.width + px]!;
      if (!pal) continue;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const gx = ox + px * scale + sx;
          const gy = oy + py * scale + sy;
          if (gx < 0 || gy < 0 || gx >= FRAME_W || gy >= FRAME_H) continue;
          const i = (gy * FRAME_W + gx) * 4;
          const key = `${pal}|${gold[i]},${gold[i + 1]},${gold[i + 2]}`;
          votes.set(key, (votes.get(key) ?? 0) + 1);
        }
      }
    }
  }
}

function voteDigits(
  votes: Map<string, number>,
  wad: ReturnType<typeof loadWadFromArrayBuffer>,
  prefix: 'STTNUM' | 'STYSNUM',
  digits: number[],
  anchor: { x: number; y: number },
  scale: number,
  gold: Uint8ClampedArray,
): void {
  const sample = readPatch(wad, `${prefix}0`);
  if (!sample) return;
  const digitW = sample.width * scale;
  let x = anchor.x;
  for (let i = digits.length - 1; i >= 0; i--) {
    const patch = readPatch(wad, `${prefix}${digits[i]}`);
    if (patch) votePatch(votes, patch, x, anchor.y, scale, gold);
    x -= digitW;
  }
}

async function main(): Promise<void> {
  const goldImg = await loadPng(GOLD);
  const buf = fs.readFileSync(path.join(ROOT, 'public/wads/DOOM.WAD'));
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

  const layout = computeHudLayout(FRAME_W, FRAME_H);
  const { scale, barLeft, barY } = layout;
  const hudTop = FRAME_H - layout.canvasHeight;

  const votes = new Map<string, number>();

  const stbar = readPatch(wad, 'STBAR');
  if (stbar) {
    const a = toGlobal(0, VANILLA_HUD.face.y, scale, barLeft, barY, hudTop);
    votePatch(votes, stbar, a.x, a.y, scale, goldImg.data);
  }

  const faceA = toGlobal(VANILLA_HUD.face.x, VANILLA_HUD.face.y, scale, barLeft, barY, hudTop);
  const stfb0 = readPatch(wad, 'STFB0');
  if (stfb0) votePatch(votes, stfb0, faceA.x, faceA.y, scale, goldImg.data);
  const faceName = resolveStatusFaceLumpName(wad, 'STFSTF0');
  if (faceName) {
    const face = readPatch(wad, faceName);
    if (face) votePatch(votes, face, faceA.x, faceA.y, scale, goldImg.data);
  }

  const ha = toGlobal(VANILLA_HUD.health.x, VANILLA_HUD.health.y, scale, barLeft, barY, hudTop);
  voteDigits(votes, wad, 'STTNUM', [1, 0, 0], ha, scale, goldImg.data);
  const pct = readPatch(wad, 'STTPRCNT');
  if (pct) votePatch(votes, pct, ha.x, ha.y, scale, goldImg.data);

  const ra = toGlobal(VANILLA_HUD.readyAmmo.x, VANILLA_HUD.readyAmmo.y, scale, barLeft, barY, hudTop);
  voteDigits(votes, wad, 'STYSNUM', [5, 0], ra, scale, goldImg.data);

  const aa = toGlobal(VANILLA_HUD.ammo[0].x, VANILLA_HUD.ammo[0].y, scale, barLeft, barY, hudTop);
  voteDigits(votes, wad, 'STYSNUM', [5, 0], aa, scale, goldImg.data);

  const ma = toGlobal(VANILLA_HUD.maxAmmo[0].x, VANILLA_HUD.maxAmmo[0].y, scale, barLeft, barY, hudTop);
  voteDigits(votes, wad, 'STYSNUM', [2, 0, 0], ma, scale, goldImg.data);

  const lut: Array<[number, number, number] | null> = new Array(256).fill(null);
  for (let pal = 0; pal < 256; pal++) {
    let best: [number, number, number] | null = null;
    let bestN = 0;
    const prefix = `${pal}|`;
    for (const [key, n] of votes.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (n > bestN) {
        bestN = n;
        const rgb = key.slice(prefix.length).split(',').map(Number) as [number, number, number];
        best = rgb;
      }
    }
    lut[pal] = best;
  }

  const mapped = lut.filter(Boolean).length;
  console.log(`Mapped ${mapped}/256 palette indices from gold E1M1 HUD`);

  const body = lut
    .map((rgb, i) => {
      if (!rgb) return `  null, // ${i}`;
      return `  [${rgb.join(', ')}], // ${i}`;
    })
    .join('\n');

  fs.writeFileSync(
    OUT,
    `/** GZDoom GLES spawn HUD palette translation (from gold E1M1 ref, DOOM.WAD). */\nexport const GZDOOM_SPAWN_HUD_PAL_LUT: Array<[number, number, number] | null> = [\n${body}\n];\n`,
  );
  console.log(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
