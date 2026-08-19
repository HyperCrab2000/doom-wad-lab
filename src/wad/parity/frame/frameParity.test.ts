import { describe, expect, it } from 'vitest';

import { colormapBandV, sectorColormapBand, buildColormapLutRgba } from '@/wad/parity/frame/colormapParity';
import {
  doomVerticalFovDegrees,
  readFrameParityModeFromSearch,
  resolvePlayfieldLayout,
} from '@/wad/parity/frame/frameParity';
import {
  gzdoomPlaneDepth,
  gzdoomScreenToDoom,
  gzdoomScreenZ,
  gzdoomViewport,
  gzdoomWallScreenX,
  gzdoomWallScreenY,
} from '@/wad/parity/frame/gzdoomScreenZ';
import { gzdoomViewRegion } from '@/wad/parity/frame/frameDiff';

describe('frameParity', () => {
  it('detects frameParity=1 in query string', () => {
    expect(readFrameParityModeFromSearch('?renderer=classic&frameParity=1')).toBe(true);
    expect(readFrameParityModeFromSearch('?renderer=classic')).toBe(false);
  });

  it('uses GZDoom parity layout at 640×480 (403px view height)', () => {
    const layout = resolvePlayfieldLayout(640, 480, true);
    expect(layout.width).toBe(640);
    expect(layout.height).toBe(403);
    expect(layout.offsetY).toBe(0);
  });

  it('maps GZDoom 90° horizontal FOV to vertical FOV on 640×403', () => {
    const vfov = doomVerticalFovDegrees(640, 403, 90);
    expect(vfov).toBeCloseTo(64.4, 0);
  });
});

describe('colormapParity', () => {
  it('maps sector light 160 to band 20', () => {
    expect(sectorColormapBand(160)).toBe(20);
    expect(colormapBandV(160)).toBeCloseTo(20.5 / 32, 3);
  });

  it('builds distinct colormap bands from an ArrayBuffer COLORMAP lump', () => {
    const colormap = new Uint8Array(256 * 32);
    colormap[1 * 256 + 76] = 76;
    colormap[21 * 256 + 76] = 2;
    const playpal: Array<[number, number, number]> = Array.from({ length: 256 }, (_, i) => [i, i, i]);
    playpal[2] = [23, 15, 7];
    playpal[76] = [75, 55, 27];
    const lut = buildColormapLutRgba(playpal, colormap.buffer);
    const bright = (1 * 256 + 76) * 4;
    const dark = (21 * 256 + 76) * 4;
    expect([lut[bright]!, lut[bright + 1]!, lut[bright + 2]!]).toEqual([75, 55, 27]);
    expect([lut[dark]!, lut[dark + 1]!, lut[dark + 2]!]).toEqual([23, 15, 7]);
  });
});

describe('gzdoomViewRegion', () => {
  it('extracts top 640×403 from 640×480', () => {
    expect(gzdoomViewRegion(640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 403 });
  });
});

describe('gzdoomScreenZ', () => {
  it('projects a point ahead of E1M1 spawn', () => {
    const yaw = Math.PI / 2;
    const vp = gzdoomViewport(640, 403, yaw);
    const viewX = 1056;
    const viewY = -3616;
    const sz = gzdoomScreenZ(1056, -3500, viewX, viewY, yaw);
    expect(sz).toBeGreaterThan(50);
    const sx = gzdoomWallScreenX(1056, -3500, viewX, viewY, vp);
    expect(sx).not.toBeNull();
    expect(sx!).toBeGreaterThan(200);
    expect(sx!).toBeLessThan(440);
    const sy = gzdoomWallScreenY(0, 41, sz, vp);
    expect(sy).toBeGreaterThan(0);
    expect(sy).toBeLessThan(403);
  });

  it('plane depth + screen-to-doom round-trips floor UV at spawn', () => {
    const yaw = Math.PI / 2;
    const vp = gzdoomViewport(640, 403, yaw);
    const viewX = 1056;
    const viewY = -3616;
    const planeH = 41;
    const py = 300;
    const px = 320;
    const dist = gzdoomPlaneDepth(py, planeH, vp);
    expect(dist).toBeGreaterThan(planeH);
    const { doomX, doomY } = gzdoomScreenToDoom(px, dist, viewX, viewY, vp);
    expect(doomX).toBeGreaterThan(viewX);
    expect(doomY).toBeGreaterThan(viewY);
    const sz = gzdoomScreenZ(doomX, doomY, viewX, viewY, yaw);
    expect(sz).toBeCloseTo(dist, 0);
  });
});
