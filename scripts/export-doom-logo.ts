/**
 * Regenerate public/images/doom-logo.png from M_DOOM in a shipped IWAD.
 * Usage: npx tsx scripts/export-doom-logo.ts [path/to/iwad]
 */
import { createCanvas } from 'canvas';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { drawPatch } from '@/wad/renderer/drawAssets/drawPatch';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { DOOM_LOGO_LUMP } from '@/features/level-viewer/doomWadGraphics';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultWad = path.join(root, 'public/wads/test.wad');
const outPath = path.join(root, 'public/images/doom-logo.png');

(globalThis as typeof globalThis & { document: Document }).document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      const canvas = createCanvas(1, 1);
      return canvas as unknown as HTMLCanvasElement;
    }
    return {} as HTMLElement;
  },
} as Document;

const wadPath = process.argv[2] ?? defaultWad;
const buf = readFileSync(wadPath);
const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const lump = wad.lumpHash[DOOM_LOGO_LUMP] ?? wad.lumpHash[DOOM_LOGO_LUMP.toUpperCase()];
if (!lump) {
  console.error(`No ${DOOM_LOGO_LUMP} lump in ${wadPath}`);
  process.exit(1);
}

const patch = drawPatch(lump, wad.playpal);
const src = patch.canvas as unknown as import('canvas').Canvas;
const trimmed = trimCanvasToAlpha(src, 1);
writeFileSync(outPath, trimmed.toBuffer('image/png'));
console.log(`Wrote ${outPath} (${trimmed.width}x${trimmed.height})`);

function trimCanvasToAlpha(canvas: import('canvas').Canvas, pad: number): import('canvas').Canvas {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 8) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (minX > maxX) return canvas;

  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;
  const out = createCanvas(outW, outH);
  const outCtx = out.getContext('2d')!;
  outCtx.drawImage(canvas, minX, minY, outW, outH, 0, 0, outW, outH);
  return out;
}
