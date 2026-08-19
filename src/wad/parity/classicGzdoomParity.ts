/**
 * Classic WebGL ↔ GZDoom (s) HW renderer parity mode.
 *
 * Default ON for Classic play: shelve voxels, parallax POM, dynamic point lights,
 * liquid animation, and colored sector tints. Uses PLAYPAL index + COLORMAP like GZDoom.
 *
 * Opt back into legacy embellishments with `?classicExtras=1`.
 */
import type { RenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';

export const CLASSIC_EXTRAS_QUERY = 'classicExtras';

export function readClassicExtrasFromSearch(search: string): boolean {
  return new URLSearchParams(search).get(CLASSIC_EXTRAS_QUERY) === '1';
}

export function readClassicGzdoomParityMode(loc?: Pick<Location, 'search'>): boolean {
  if (typeof window !== 'undefined') {
    const injected = (window as Window & { __DOOM_CLASSIC_GZDOOM_PARITY__?: boolean })
      .__DOOM_CLASSIC_GZDOOM_PARITY__;
    if (injected === false) return false;
    if (injected === true) return true;
  }
  const search = loc?.search ?? (typeof globalThis.location !== 'undefined' ? globalThis.location.search : '');
  if (readClassicExtrasFromSearch(search)) return false;
  return true;
}

/** Layer toggles aligned with GZDoom (s) CVAR defaults — no Classic-only embellishments. */
export const CLASSIC_GZDOOM_PARITY_LAYER_TOGGLES: RenderLayerToggles = {
  wireframeMode: 'off',
  meshTriangles: false,
  courtyardSky: true,
  solidWalls: true,
  wallTextures: true,
  solidFloors: true,
  floorTextures: true,
  solidCeilings: true,
  ceilingTextures: true,
  animatedLiquid: false,
  sky: true,
  dynamicLighting: false,
  coloredLighting: false,
  voxels: false,
};

export function mergeClassicParityLayerToggles(
  stored: RenderLayerToggles,
  parity: boolean,
): RenderLayerToggles {
  if (!parity) return stored;
  return {
    ...CLASSIC_GZDOOM_PARITY_LAYER_TOGGLES,
    wireframeMode: stored.wireframeMode,
    meshTriangles: stored.meshTriangles,
  };
}
