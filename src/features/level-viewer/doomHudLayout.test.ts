import { describe, expect, it } from 'vitest';
import { computeHudLayout, HUD_BAR_HEIGHT, HUD_BAR_WIDTH, HUD_FACE_RISE } from '@/features/level-viewer/doomHudLayout';

describe('computeHudLayout', () => {
  it('keeps STBAR at 320px logical width on a 320px viewport', () => {
    const layout = computeHudLayout(320, 400);
    expect(layout.scale).toBe(1);
    expect(layout.barWidth).toBe(HUD_BAR_WIDTH);
    expect(layout.barH).toBe(HUD_BAR_HEIGHT);
    expect(layout.barLeft).toBe(0);
    expect(layout.statusBandPx).toBe(64);
    expect(layout.bandHeight).toBe(64);
    expect(layout.canvasHeight).toBe(64 + HUD_FACE_RISE);
  });

  it('letterboxes and scales uniformly on wide viewports', () => {
    const layout = computeHudLayout(640, 400);
    expect(layout.scale).toBe(2);
    expect(layout.barWidth).toBe(640);
    expect(layout.barH).toBe(64);
    expect(layout.barLeft).toBe(0);
    expect(layout.statusBandPx).toBe(64);
    expect(layout.bandHeight).toBe(64);
    expect(layout.canvasHeight).toBe(64 + HUD_FACE_RISE * 2);
  });

  it('caps scale by viewport height on ultrawide screens', () => {
    const layout = computeHudLayout(2560, 1080);
    expect(layout.scale).toBe(5);
    expect(layout.barWidth).toBe(1600);
    expect(layout.barLeft).toBe(480);
    expect(layout.statusBandPx).toBe(173);
    expect(layout.bandHeight).toBe(173);
  });

  it('matches GZDoom status band at 640×480', () => {
    const layout = computeHudLayout(640, 480);
    expect(layout.scale).toBe(2);
    expect(layout.statusBandPx).toBe(77);
    expect(layout.bandHeight).toBe(77);
    expect(layout.barY).toBe(77 + HUD_FACE_RISE * 2 - 64);
  });
});
