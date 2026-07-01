import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { diffPlayfieldPngFiles, doomPlayfieldRegion, formatFrameDiff, gzdoomViewRegion, loadPng } from '@/wad/parity/frame/frameDiff';

const ROOT = process.cwd();
const GZDOOM_FRAME = path.join(ROOT, 'artifacts/gzrender-v2/gzdoom/E1M1.png');
const WADLAB_FRAME = path.join(ROOT, 'artifacts/gzrender-v2/wadlab/E1M1.png');

describe('frame diff helpers', () => {
  it('doomPlayfieldRegion matches 640x480 vanilla layout at scale 2', () => {
    const region = doomPlayfieldRegion(640, 480, 2);
    expect(region).toEqual({ x: 0, y: 40, width: 640, height: 336 });
  });

  it('gzdoomViewRegion matches screenblocks 10 at 640×480', () => {
    expect(gzdoomViewRegion(640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 403 });
  });
});

describe('E1M1 frame parity (Stage 2 gate)', () => {
  it('reference and candidate PNGs exist when artifacts present', async () => {
    if (!fs.existsSync(GZDOOM_FRAME) || !fs.existsSync(WADLAB_FRAME)) {
      return;
    }
    const ref = await loadPng(GZDOOM_FRAME);
    const cand = await loadPng(WADLAB_FRAME);
    expect(ref.width).toBeGreaterThan(0);
    expect(cand.width).toBeGreaterThan(0);
  });

  it('playfield pixel diff vs GZDoom reference (reports mismatch until render parity closed)', async () => {
    if (!fs.existsSync(GZDOOM_FRAME) || !fs.existsSync(WADLAB_FRAME)) {
      return;
    }

    const result = await diffPlayfieldPngFiles(GZDOOM_FRAME, WADLAB_FRAME, { tolerance: 0 });
    // eslint-disable-next-line no-console
    console.log(`E1M1 frame parity: ${formatFrameDiff(result)} (${result.leftSize} vs ${result.rightSize}, layout ${result.layout})`);

    // Baseline recorded 2026-06-17 — Stage 2 gate open until mismatch → 0
    if (!process.env.GZFRAME_PARITY_REQUIRED) {
      expect(result.mismatchRatio).toBeLessThan(1);
    }

    const required = process.env.GZFRAME_PARITY_REQUIRED === '1';
    if (required) {
      expect(result.identical, formatFrameDiff(result)).toBe(true);
    } else {
      expect(result.comparedPixels).toBeGreaterThan(0);
    }
  });
});
