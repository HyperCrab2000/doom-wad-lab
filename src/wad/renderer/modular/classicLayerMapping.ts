/**
 * Classic WebGL2 layer mapping — UI toggles → draw plan → modular stages → Node geometry.
 * Mirror of GZDoom (s) `applyGzdoomRenderLayers.ts` for the TypeScript renderer.
 */
import type { ModularRenderStage } from '@/wad/renderer/modular/modularRenderStage';
import {
  buildRenderLayerDrawPlan,
  type RenderLayerDrawPlan,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';

export interface ClassicLayerStageBinding {
  stage: ModularRenderStage;
  /** When false, `runStage()` skips this pass in drawScene. */
  enabledWhen: (plan: RenderLayerDrawPlan) => boolean;
}

export interface ClassicLayerNodeSource {
  /** doom-wad-core / lab module that produces GPU data. */
  module: string;
  /** What gets uploaded / cached. */
  artifact: string;
}

export interface ClassicLayerDefinition {
  id: string;
  toggleKeys: Array<keyof RenderLayerToggles>;
  label: string;
  drawPlanFields: Array<keyof RenderLayerDrawPlan>;
  stages: ClassicLayerStageBinding[];
  nodeSources: ClassicLayerNodeSource[];
  /** GZDoom WASM CVAR when applicable. */
  gzdoomCvars: string[];
  shaderPrograms: string[];
}

export const CLASSIC_LAYER_DEFINITIONS: readonly ClassicLayerDefinition[] = [
  {
    id: 'walls-solid',
    toggleKeys: ['solidWalls'],
    label: 'Walls (geometry)',
    drawPlanFields: ['wallsUnlit', 'wallsTextured'],
    stages: [
      { stage: 'wallsUnlit', enabledWhen: (p) => p.wallsUnlit },
      { stage: 'wallsOpaque', enabledWhen: (p) => p.wallsTextured },
      { stage: 'wallsTransparent', enabledWhen: (p) => p.wallsTextured },
    ],
    nodeSources: [
      { module: 'geometry/buildMapGeometryCpu.ts', artifact: 'wall quads + UVs' },
      { module: 'geometry/mapToWalls.ts', artifact: 'LINEDEFS → extruded segments' },
      { module: 'doom-wad-core loadWad.ts', artifact: 'LINEDEFS, SIDEDEFS, VERTEXES' },
    ],
    gzdoomCvars: ['gl_render_walls'],
    shaderPrograms: ['walls.frag', 'walls.vert'],
  },
  {
    id: 'walls-texture',
    toggleKeys: ['solidWalls', 'wallTextures'],
    label: 'Wall textures',
    drawPlanFields: ['wallsTextured', 'wallsUnlit'],
    stages: [
      { stage: 'wallsOpaque', enabledWhen: (p) => p.wallsTextured },
      { stage: 'wallsTransparent', enabledWhen: (p) => p.wallsTextured },
      { stage: 'wallsUnlit', enabledWhen: (p) => p.wallsUnlit },
    ],
    nodeSources: [
      { module: 'renderGame/loadWad.ts', artifact: 'PLAYPAL rasterized wall textures' },
      { module: 'doom-wad-core loadWad.ts', artifact: 'TEXTURE1/2, PNAMES, patches' },
    ],
    gzdoomCvars: ['gl_render_walls', 'gl_texture'],
    shaderPrograms: ['walls.frag'],
  },
  {
    id: 'floors',
    toggleKeys: ['solidFloors'],
    label: 'Floors',
    drawPlanFields: ['drawFloorFlats', 'floorsUnlit', 'floorsTextured'],
    stages: [
      { stage: 'flatsUnlit', enabledWhen: (p) => p.floorsUnlit },
      { stage: 'flats', enabledWhen: (p) => p.floorsTextured },
    ],
    nodeSources: [
      { module: 'geometry/mapToFlats.ts', artifact: 'sector floor triangles' },
      { module: 'doom-wad-core loadWad.ts', artifact: 'SECTORS.floorpic, VERTEXES' },
    ],
    gzdoomCvars: ['gl_render_flats'],
    shaderPrograms: ['flat.frag'],
  },
  {
    id: 'ceilings',
    toggleKeys: ['solidCeilings'],
    label: 'Ceilings',
    drawPlanFields: ['drawCeilingFlats', 'ceilingsUnlit', 'ceilingsTextured'],
    stages: [
      { stage: 'flatsUnlit', enabledWhen: (p) => p.ceilingsUnlit },
      { stage: 'flats', enabledWhen: (p) => p.ceilingsTextured },
    ],
    nodeSources: [
      { module: 'geometry/mapToFlats.ts', artifact: 'sector ceiling triangles' },
      { module: 'doom-wad-core loadWad.ts', artifact: 'SECTORS.ceilingpic' },
    ],
    gzdoomCvars: ['gl_render_flats'],
    shaderPrograms: ['flat.frag'],
  },
  {
    id: 'floor-textures',
    toggleKeys: ['solidFloors', 'floorTextures'],
    label: 'Floor textures',
    drawPlanFields: ['floorsTextured'],
    stages: [{ stage: 'flats', enabledWhen: (p) => p.floorsTextured }],
    nodeSources: [
      { module: 'renderGame/loadWad.ts', artifact: 'flat lump → GPU texture atlas' },
      { module: 'doom-wad-core loadWad.ts', artifact: 'F_START…F_END flats (4096 B)' },
    ],
    gzdoomCvars: ['gl_render_flats', 'gl_texture'],
    shaderPrograms: ['flat.frag'],
  },
  {
    id: 'ceiling-textures',
    toggleKeys: ['solidCeilings', 'ceilingTextures'],
    label: 'Ceiling textures',
    drawPlanFields: ['ceilingsTextured'],
    stages: [{ stage: 'flats', enabledWhen: (p) => p.ceilingsTextured }],
    nodeSources: [
      { module: 'renderGame/loadWad.ts', artifact: 'flat lump → GPU texture atlas' },
    ],
    gzdoomCvars: ['gl_render_flats', 'gl_texture'],
    shaderPrograms: ['flat.frag'],
  },
  {
    id: 'liquid',
    toggleKeys: ['animatedLiquid'],
    label: 'Animated liquids',
    drawPlanFields: ['liquidAnimated', 'drawFloorFlats'],
    stages: [{ stage: 'flats', enabledWhen: (p) => p.liquidAnimated }],
    nodeSources: [
      { module: 'doom-wad-core wadInfo.ts', artifact: 'animatedFlats chains' },
      { module: 'drawScene.ts', artifact: 'animateFlatIndex time scroll' },
    ],
    gzdoomCvars: ['gl_render_flats'],
    shaderPrograms: ['flat.frag'],
  },
  {
    id: 'sky',
    toggleKeys: ['sky', 'courtyardSky'],
    label: 'Sky',
    drawPlanFields: ['sky', 'courtyardSky'],
    stages: [{ stage: 'sky', enabledWhen: (p) => p.sky }],
    nodeSources: [
      { module: 'drawScene drawSkybox', artifact: 'F_SKY + SKY1 lump cylinder' },
      { module: 'bsp/gzdoomDrawState.ts', artifact: 'courtyard sky subsector filter' },
    ],
    gzdoomCvars: ['gl_portals', 'gl_noskyboxes'],
    shaderPrograms: ['skybox'],
  },
  {
    id: 'sprites',
    toggleKeys: ['voxels'],
    label: 'Sprites / voxels',
    drawPlanFields: ['voxels', 'sprites'],
    stages: [
      { stage: 'voxels', enabledWhen: (p) => p.voxels },
      { stage: 'sprites', enabledWhen: (p) => p.sprites },
    ],
    nodeSources: [
      { module: 'geometry/spriteBillboards.ts', artifact: 'THING sprites from S_* lumps' },
      { module: 'voxels/kvxMesh.ts', artifact: 'KVX voxel things' },
      { module: 'doom-wad-core loadWad.ts', artifact: 'THINGS, sprites' },
    ],
    gzdoomCvars: ['gl_render_things'],
    shaderPrograms: ['things.frag'],
  },
  {
    id: 'dynamic-light',
    toggleKeys: ['dynamicLighting'],
    label: 'Dynamic lighting',
    drawPlanFields: ['dynamicLights'],
    stages: [],
    nodeSources: [
      { module: 'renderGame/hydrateLoadedMap.ts', artifact: 'pointLights from things' },
      { module: 'drawScene.ts', artifact: 'pointLightGrid in wall/flat shaders' },
    ],
    gzdoomCvars: ['gl_fogmode'],
    shaderPrograms: ['walls.frag', 'flat.frag', 'things.frag'],
  },
  {
    id: 'sector-color',
    toggleKeys: ['coloredLighting'],
    label: 'Sector colored light',
    drawPlanFields: ['coloredLights'],
    stages: [],
    nodeSources: [
      { module: 'drawScene sectorLightCache', artifact: 'SECTORS.lightlevel → tint' },
    ],
    gzdoomCvars: ['gl_bandedswlight'],
    shaderPrograms: ['walls.frag', 'flat.frag'],
  },
  {
    id: 'wireframe-bsp',
    toggleKeys: ['wireframeMode'],
    label: 'Wireframe debug',
    drawPlanFields: ['wireframeMode', 'meshTriangles'],
    stages: [
      { stage: 'visibilityWireframe', enabledWhen: (p) => p.wireframeMode === 'bsp' },
      { stage: 'meshWireframe', enabledWhen: (p) => p.wireframeMode !== 'off' || p.meshTriangles },
    ],
    nodeSources: [
      { module: 'bsp/buildGzdoomDrawState.ts', artifact: 'BSP wall/flat draw lists' },
      { module: 'modular/wireframeDrawState.ts', artifact: 'portal-filtered mesh edges' },
    ],
    gzdoomCvars: ['gl_texture (0 in wireframe argv)'],
    shaderPrograms: ['line debug GL'],
  },
] as const;

export interface ClassicLayerDiagnostics {
  toggles: RenderLayerToggles;
  plan: RenderLayerDrawPlan;
  activeStages: ModularRenderStage[];
  inactiveStages: ModularRenderStage[];
  layers: Array<{
    id: string;
    label: string;
    active: boolean;
  }>;
}

export function describeClassicLayerState(toggles: RenderLayerToggles): ClassicLayerDiagnostics {
  const plan = buildRenderLayerDrawPlan(toggles);
  const allStages = new Set<ModularRenderStage>();
  for (const def of CLASSIC_LAYER_DEFINITIONS) {
    for (const binding of def.stages) {
      allStages.add(binding.stage);
    }
  }
  const activeStages: ModularRenderStage[] = [];
  const inactiveStages: ModularRenderStage[] = [];
  for (const stage of allStages) {
    const enabled = CLASSIC_LAYER_DEFINITIONS.some((def) =>
      def.stages.some((b) => b.stage === stage && b.enabledWhen(plan)),
    );
    if (enabled) activeStages.push(stage);
    else inactiveStages.push(stage);
  }
  const layers = CLASSIC_LAYER_DEFINITIONS.map((def) => {
    const active = def.stages.length === 0
      ? def.drawPlanFields.some((f) => Boolean(plan[f]))
      : def.stages.some((b) => b.enabledWhen(plan));
    return { id: def.id, label: def.label, active };
  });
  return { toggles, plan, activeStages, inactiveStages, layers };
}

/** Preset toggles for per-layer puppeteer / screenshot isolation. */
export function classicLayerTestPreset(layerId: string): RenderLayerToggles | null {
  const base: RenderLayerToggles = {
    wireframeMode: 'off',
    meshTriangles: false,
    courtyardSky: true,
    solidWalls: false,
    wallTextures: false,
    solidFloors: false,
    floorTextures: false,
    solidCeilings: false,
    ceilingTextures: false,
    animatedLiquid: false,
    sky: false,
    dynamicLighting: false,
    coloredLighting: false,
    voxels: false,
  };
  switch (layerId) {
    case 'all':
      return {
        ...base,
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
    case 'walls-solid':
      return { ...base, solidWalls: true, wallTextures: true };
    case 'floors':
      return { ...base, solidFloors: true, floorTextures: true, solidCeilings: false };
    case 'ceilings':
      return { ...base, solidCeilings: true, ceilingTextures: true, solidFloors: false };
    case 'sky':
      return { ...base, sky: true, solidCeilings: true, ceilingTextures: true };
    case 'sprites':
      return { ...base, solidWalls: true, wallTextures: true, voxels: true };
    case 'walls-off':
      return {
        ...base,
        solidWalls: false,
        solidFloors: true,
        floorTextures: true,
        solidCeilings: true,
        ceilingTextures: true,
        sky: true,
      };
    default:
      return null;
  }
}

export function publishClassicLayerDiagnostics(toggles: RenderLayerToggles): ClassicLayerDiagnostics {
  const diag = describeClassicLayerState(toggles);
  if (typeof window !== 'undefined') {
    (window as unknown as { __classicLayerDiagnostics?: ClassicLayerDiagnostics }).__classicLayerDiagnostics =
      diag;
  }
  return diag;
}
