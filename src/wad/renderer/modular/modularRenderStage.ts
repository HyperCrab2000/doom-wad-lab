/**
 * Incremental render stages — same order as classic `drawScene` / GZDoom HW pipeline.
 * Path Trace mode runs forward passes stage-by-stage (not the monolithic GPU ray loop).
 *
 * @see docs/rendering.md frame pipeline
 * @see src/wad/renderer/renderGame/drawScene.ts
 */

export type ModularRenderStage =
  /** Chromakey clear + letterboxed viewport only. */
  | 'clear'
  /** BSP-visible linedefs from `buildGzdoomDrawState` (proves visibility). */
  | 'visibilityWireframe'
  /** Pre-baked wall + flat mesh edges for BSP-visible geometry. */
  | 'meshWireframe'
  /** Cylindrical skybox (`drawSkybox`). */
  | 'sky'
  /** Sector + subsector flats, flat-shaded (sector ambient, no texture sample). */
  | 'flatsUnlit'
  /** Sector + subsector flats, classic `flat.frag` (textures, POM, liquid, lights). */
  | 'flats'
  /** Opaque walls, flat-shaded (no texture sample). */
  | 'wallsUnlit'
  /** Opaque + masked mid walls, classic `walls.frag`. */
  | 'wallsOpaque'
  /** Alpha-sorted transparent walls. */
  | 'wallsTransparent'
  /** KVX voxel things (same as classic). */
  | 'voxels'
  /** Sprite billboards (same as classic). */
  | 'sprites';

/** Canonical GZDoom / drawScene pass order. */
export const MODULAR_STAGE_ORDER: readonly ModularRenderStage[] = [
  'clear',
  'visibilityWireframe',
  'meshWireframe',
  'sky',
  'flatsUnlit',
  'flats',
  'wallsUnlit',
  'wallsOpaque',
  'wallsTransparent',
  'voxels',
  'sprites',
] as const;

export const MODULAR_STAGE_LABELS: Record<ModularRenderStage, string> = {
  clear: 'Clear viewport',
  visibilityWireframe: 'BSP visibility wireframe',
  meshWireframe: 'Mesh wireframe',
  sky: 'Skybox',
  flatsUnlit: 'Flats (unlit)',
  flats: 'Flats (textured)',
  wallsUnlit: 'Walls (unlit)',
  wallsOpaque: 'Walls (opaque)',
  wallsTransparent: 'Walls (transparent)',
  voxels: 'Voxels',
  sprites: 'Sprites (full)',
};

const STAGE_INDEX = new Map(MODULAR_STAGE_ORDER.map((s, i) => [s, i]));

export function modularStageIndex(stage: ModularRenderStage): number {
  return STAGE_INDEX.get(stage) ?? -1;
}

/** True when `stage` should run given cap (null = all stages, classic backend). */
export function modularStageEnabled(
  cap: ModularRenderStage | null | undefined,
  stage: ModularRenderStage
): boolean {
  if (cap == null) return true;
  return modularStageIndex(stage) <= modularStageIndex(cap);
}

const STAGE_ALIASES: Record<string, ModularRenderStage> = {
  clear: 'clear',
  vis: 'visibilityWireframe',
  visibility: 'visibilityWireframe',
  wire: 'visibilityWireframe',
  wireframe: 'visibilityWireframe',
  mesh: 'meshWireframe',
  meshwire: 'meshWireframe',
  sky: 'sky',
  flatsunlit: 'flatsUnlit',
  flatunlit: 'flatsUnlit',
  flats: 'flats',
  floor: 'flats',
  floors: 'flats',
  wallsunlit: 'wallsUnlit',
  wallunlit: 'wallsUnlit',
  walls: 'wallsOpaque',
  wall: 'wallsOpaque',
  opaque: 'wallsOpaque',
  transparent: 'wallsTransparent',
  trans: 'wallsTransparent',
  voxels: 'voxels',
  voxel: 'voxels',
  sprites: 'sprites',
  sprite: 'sprites',
  full: 'sprites',
  classic: 'sprites',
  all: 'sprites',
};

export function parseModularRenderStage(raw: string | null | undefined): ModularRenderStage | null {
  if (raw == null || raw === '') return null;
  const key = raw.trim().toLowerCase();
  const asNum = Number(key);
  if (Number.isInteger(asNum) && asNum >= 0 && asNum < MODULAR_STAGE_ORDER.length) {
    return MODULAR_STAGE_ORDER[asNum]!;
  }
  return STAGE_ALIASES[key] ?? (MODULAR_STAGE_ORDER.includes(raw as ModularRenderStage) ? (raw as ModularRenderStage) : null);
}

/** Path Trace backend stage cap from `?ptStage=` (name, alias, or 0-based index). Default: full classic parity. */
export function readModularStageCap(): ModularRenderStage {
  if (typeof window === 'undefined') return 'sprites';
  const raw = new URLSearchParams(window.location.search).get('ptStage');
  return parseModularRenderStage(raw) ?? 'sprites';
}

/** Optional stage cap for Classic / WASM modular parity (`?modStage=` or `?ptStage=`). Null = all stages. */
export function readRenderModularStageCap(): ModularRenderStage | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('modStage') ?? params.get('ptStage');
  if (raw == null || raw === '') return null;
  return parseModularRenderStage(raw);
}

export function isModularParityMode(): boolean {
  if (typeof process !== 'undefined' && process.env.MODULAR_PARITY === '1') return true;
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has('modParity');
}

/** Debug wireframe stages use forward GL lines; geometry stages use GPU primary rays. */
export function usesGpuRayTrace(cap: ModularRenderStage): boolean {
  return modularStageIndex(cap) >= modularStageIndex('flatsUnlit');
}

/** Triangle filter for modular GPU stages (0 = both, 1 = walls, 2 = flats). */
export function gpuSurfaceMaskForStage(cap: ModularRenderStage): number {
  if (cap === 'flatsUnlit' || cap === 'flats') return 2;
  if (cap === 'wallsUnlit' || cap === 'wallsOpaque') return 1;
  return 0;
}

/** True when stage is within [min, cap] inclusive (null bounds = open). */
export function modularStageInRange(
  cap: ModularRenderStage | null | undefined,
  min: ModularRenderStage | null | undefined,
  stage: ModularRenderStage
): boolean {
  const idx = modularStageIndex(stage);
  if (min != null && idx < modularStageIndex(min)) return false;
  if (cap != null && idx > modularStageIndex(cap)) return false;
  return true;
}

export function modularStageLabel(stage: ModularRenderStage): string {
  switch (stage) {
    case 'clear':
      return 'clear';
    case 'visibilityWireframe':
      return 'BSP visibility wireframe';
    case 'meshWireframe':
      return 'mesh wireframe';
    case 'sky':
      return 'skybox';
    case 'flatsUnlit':
      return 'flats (unlit)';
    case 'flats':
      return 'flats (textured + light)';
    case 'wallsUnlit':
      return 'walls (unlit)';
    case 'wallsOpaque':
      return 'walls (textured + light)';
    case 'wallsTransparent':
      return 'transparent walls';
    case 'voxels':
      return 'voxels';
    case 'sprites':
      return 'sprites';
    default:
      return stage;
  }
}
