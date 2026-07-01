/** Wireframe overlay mode (mutually exclusive). */
export type WireframeMode = 'off' | 'bsp' | 'mesh' | 'sight';

/** Independent render layers for Classic + Path Trace. */
export interface RenderLayerToggles {
  /** Mutually exclusive wireframe visibility (radio in UI). */
  wireframeMode: WireframeMode;
  /** Draw mesh triangle edges (can combine with any wireframe mode). */
  meshTriangles: boolean;
  /** Courtyard sky flats through window lips (mesh pool only). */
  courtyardSky: boolean;
  solidWalls: boolean;
  wallTextures: boolean;
  solidFloors: boolean;
  floorTextures: boolean;
  solidCeilings: boolean;
  ceilingTextures: boolean;
  animatedLiquid: boolean;
  sky: boolean;
  dynamicLighting: boolean;
  coloredLighting: boolean;
  voxels: boolean;
}

export const WIREFRAME_MODE_LABELS: Record<WireframeMode, string> = {
  off: 'Off',
  bsp: 'BSP sight (RenderBSP lists)',
  mesh: 'Mesh pool (portal-filtered HW submit)',
  sight: 'Ray sight (slow — primary hits on solid mesh)',
};

export const DEFAULT_RENDER_LAYER_TOGGLES: RenderLayerToggles = {
  wireframeMode: 'off',
  meshTriangles: false,
  courtyardSky: true,
  solidWalls: true,
  wallTextures: true,
  solidFloors: true,
  floorTextures: true,
  solidCeilings: true,
  ceilingTextures: true,
  animatedLiquid: true,
  sky: true,
  dynamicLighting: true,
  coloredLighting: true,
  voxels: true,
};

// v6 intentionally does not read v5: older sessions can persist debugging states that hide core
// Classic passes (walls/sky/textures), making the renderer look catastrophically incomplete.
const STORAGE_KEY = 'doom-render-layers-v6';

interface LegacyRenderLayerToggles {
  wireframe?: boolean;
  wireframePortalFilter?: boolean;
  meshTriangles?: boolean;
  solidWalls?: boolean;
  solidCeilings?: boolean;
  solidFloors?: boolean;
  animatedLiquid?: boolean;
  dynamicLighting?: boolean;
  coloredLighting?: boolean;
  voxels?: boolean;
}

function migrateStoredToggles(parsed: Partial<RenderLayerToggles> & LegacyRenderLayerToggles): RenderLayerToggles {
  if (parsed.wireframeMode) {
    return { ...DEFAULT_RENDER_LAYER_TOGGLES, ...parsed };
  }
  let wireframeMode: WireframeMode = 'off';
  if (parsed.wireframePortalFilter) wireframeMode = 'sight';
  else if (parsed.wireframe) wireframeMode = 'bsp';

  return {
    ...DEFAULT_RENDER_LAYER_TOGGLES,
    wireframeMode,
    meshTriangles: parsed.meshTriangles ?? false,
    courtyardSky: true,
    solidWalls: parsed.solidWalls ?? true,
    wallTextures: parsed.solidWalls !== false,
    solidFloors: parsed.solidFloors ?? true,
    floorTextures: parsed.solidFloors !== false,
    solidCeilings: parsed.solidCeilings ?? true,
    ceilingTextures: parsed.solidCeilings !== false,
    animatedLiquid: parsed.animatedLiquid ?? true,
    sky: true,
    dynamicLighting: parsed.dynamicLighting ?? true,
    coloredLighting: parsed.coloredLighting ?? true,
    voxels: parsed.voxels ?? true,
  };
}

export function readStoredRenderLayerToggles(): RenderLayerToggles {
  if (typeof window === 'undefined') return { ...DEFAULT_RENDER_LAYER_TOGGLES };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem('doom-render-layers-v4');
    if (!raw) return { ...DEFAULT_RENDER_LAYER_TOGGLES };
    return sanitizeRenderLayerToggles(
      migrateStoredToggles(JSON.parse(raw) as Partial<RenderLayerToggles> & LegacyRenderLayerToggles),
    );
  } catch {
    return { ...DEFAULT_RENDER_LAYER_TOGGLES };
  }
}

/** Prevent persisted debug states that leave Classic looking catastrophically incomplete. */
export function sanitizeRenderLayerToggles(toggles: RenderLayerToggles): RenderLayerToggles {
  if (toggles.wireframeMode !== 'off') return toggles;

  if (!hasCompositeGeometry(toggles)) {
    return { ...DEFAULT_RENDER_LAYER_TOGGLES };
  }

  // Floors/ceilings without walls reads as floating shards in a black void — common accidental toggle.
  const missingWallsWithSolids =
    !toggles.solidWalls && (toggles.solidFloors || toggles.solidCeilings);
  if (!missingWallsWithSolids) return toggles;

  return {
    ...toggles,
    solidWalls: true,
    wallTextures: toggles.wallTextures || true,
  };
}

export function persistRenderLayerToggles(toggles: RenderLayerToggles): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toggles));
}

/** Any solid/textured world layer (not wireframe-only black view). */
export function hasCompositeGeometry(toggles: RenderLayerToggles): boolean {
  return (
    toggles.solidWalls ||
    toggles.solidFloors ||
    toggles.solidCeilings ||
    toggles.animatedLiquid ||
    toggles.sky ||
    toggles.voxels
  );
}

export function isWireframeOnlyView(toggles: RenderLayerToggles): boolean {
  return toggles.wireframeMode !== 'off' && !hasCompositeGeometry(toggles);
}

/** @deprecated */
export function isDebugOverlayOnly(toggles: RenderLayerToggles): boolean {
  return isWireframeOnlyView(toggles);
}

/** Path-trace triangle filter bitmask: 1=walls, 2=floors, 4=ceilings. */
export function pathTraceSurfaceMask(toggles: RenderLayerToggles): number {
  let mask = 0;
  if (toggles.solidWalls) mask |= 1;
  if (toggles.solidFloors) mask |= 2;
  if (toggles.solidCeilings) mask |= 4;
  return mask;
}

export function pathTracePortalWireframeSurfaceMask(): number {
  return 7;
}

export interface RenderLayerDrawPlan {
  wireframeMode: WireframeMode;
  meshTriangles: boolean;
  courtyardSky: boolean;
  wallsUnlit: boolean;
  wallsTextured: boolean;
  drawCeilingFlats: boolean;
  drawFloorFlats: boolean;
  ceilingsUnlit: boolean;
  floorsUnlit: boolean;
  floorsTextured: boolean;
  ceilingsTextured: boolean;
  liquidAnimated: boolean;
  dynamicLights: boolean;
  coloredLights: boolean;
  useTextures: boolean;
  voxels: boolean;
  sprites: boolean;
  sky: boolean;
}

export function buildRenderLayerDrawPlan(toggles: RenderLayerToggles): RenderLayerDrawPlan {
  const wireframeOnly = isWireframeOnlyView(toggles);
  return {
    wireframeMode: toggles.wireframeMode,
    meshTriangles: toggles.meshTriangles,
    courtyardSky: toggles.courtyardSky,
    wallsUnlit: toggles.solidWalls && !toggles.wallTextures,
    wallsTextured: toggles.solidWalls && toggles.wallTextures,
    drawCeilingFlats: toggles.solidCeilings,
    drawFloorFlats: toggles.solidFloors || toggles.animatedLiquid,
    ceilingsUnlit: toggles.solidCeilings && !toggles.ceilingTextures,
    floorsUnlit: toggles.solidFloors && !toggles.floorTextures && !toggles.animatedLiquid,
    floorsTextured: toggles.solidFloors && toggles.floorTextures,
    ceilingsTextured: toggles.solidCeilings && toggles.ceilingTextures,
    liquidAnimated: toggles.animatedLiquid,
    dynamicLights: toggles.dynamicLighting,
    coloredLights: toggles.coloredLighting,
    useTextures:
      (toggles.solidWalls && toggles.wallTextures) ||
      (toggles.solidFloors && toggles.floorTextures) ||
      (toggles.solidCeilings && toggles.ceilingTextures) ||
      toggles.animatedLiquid,
    voxels: toggles.voxels,
    sprites: !wireframeOnly && (toggles.solidWalls || toggles.solidFloors || toggles.solidCeilings),
    sky: toggles.sky,
  };
}

export function pathTraceNeedsGpuTrace(toggles: RenderLayerToggles): boolean {
  if (toggles.wireframeMode !== 'off' || toggles.meshTriangles) {
    return false;
  }
  return pathTraceSurfaceMask(toggles) !== 0;
}

export function pathTraceNeedsHybridOverlay(toggles: RenderLayerToggles): boolean {
  return (
    toggles.wireframeMode !== 'off' ||
    toggles.meshTriangles ||
    toggles.animatedLiquid ||
    toggles.voxels
  );
}
