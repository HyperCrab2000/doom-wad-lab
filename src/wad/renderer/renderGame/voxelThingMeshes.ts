import { getVoxelAnimationEntriesForSprite, hasVoxelDefinitionForSprite } from '@/wad/voxels/voxelCatalog';
import { createVoxelCatalogView, type VoxelCatalogView } from '@/wad/voxels/voxelModCatalog';
import { resolveKvxBuffer } from '@/wad/voxels/resolveKvxBuffer';
import { WadMap } from '@/wad/interfaces/WadMap';
import { Wad } from '@/wad/interfaces/Wad';
import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';
import { buildKvxMeshInPool } from '@/wad/renderer/workers/kvxWorkerPool';

export interface RuntimeVoxelMesh {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  vao?: WebGLVertexArrayObject | null;
  positionBuffer?: WebGLBuffer | null;
  colorBuffer?: WebGLBuffer | null;
  indexBuffer?: WebGLBuffer | null;
  indexType: number;
  indexCount: number;
  height: number;
  floorLift: number;
}

export interface VoxelThingFrame {
  entry: import('@/wad/voxels/voxelCatalog').VoxelCatalogEntry;
  mesh?: RuntimeVoxelMesh;
}

export type VoxelThingFrameMap = Map<string, VoxelThingFrame[]>;

export interface VoxelThingLoadOptions {
  wad?: Wad | null;
  modPaths?: readonly string[];
  catalog?: VoxelCatalogView;
}

export function createVoxelThingFrameMap(
  map: WadMap,
  options: VoxelThingLoadOptions = {},
): VoxelThingFrameMap {
  const catalog = options.catalog ?? createVoxelCatalogView(options.wad);
  const framesBySprite = new Map<string, VoxelThingFrame[]>();
  const sprites = new Set<string>();

  for (const thing of map.THINGS) {
    if (!hasValidFlags(thing)) continue;
    const thingType = DOOM_THING_MAP_BY_ID[thing.type];
    if (thingType?.sprite && shouldUseVoxelForThing(thingType)) {
      sprites.add(thingType.sprite);
    }
  }

  for (const sprite of sprites) {
    const entries = catalog.getAnimationEntriesForSprite(sprite);
    if (entries.length > 0) {
      framesBySprite.set(sprite, entries.map((entry) => ({ entry })));
    }
  }

  void hydrateVoxelThingMeshes(framesBySprite, options.wad, options.modPaths);
  return framesBySprite;
}

function shouldUseVoxelForThing(thingType: NonNullable<(typeof DOOM_THING_MAP_BY_ID)[number]>): boolean {
  if (thingType.kind === ThingKind.Special || thingType.kind === ThingKind.Effect || thingType.kind === ThingKind.Player) {
    return false;
  }

  if (thingType.sprite === 'PLAY' && thingType.kind === ThingKind.Decoration) {
    return false;
  }

  return true;
}

async function hydrateVoxelThingMeshes(
  framesBySprite: VoxelThingFrameMap,
  wad?: Wad | null,
  modPaths: readonly string[] = [],
): Promise<void> {
  const uniqueFrames = new Map<string, VoxelThingFrame>();
  for (const frames of framesBySprite.values()) {
    for (const frame of frames) {
      uniqueFrames.set(frame.entry.lumpName, frame);
    }
  }

  await Promise.all(
    [...uniqueFrames.values()].map(async (frame) => {
      try {
        const buffer = await resolveKvxBuffer(frame.entry, wad, modPaths);
        if (!buffer) return;
        const result = await buildKvxMeshInPool(buffer);
        frame.mesh = {
          positions: result.positions,
          colors: result.colors,
          indices: result.indices,
          indexType: result.indexType,
          indexCount: result.indexCount,
          height: result.height,
          floorLift: result.floorLift,
        };
      } catch {
        // Sprite fallback handles missing meshes.
      }
    }),
  );

  for (const frames of framesBySprite.values()) {
    for (const frame of frames) {
      frame.mesh = uniqueFrames.get(frame.entry.lumpName)?.mesh;
    }
  }
}

/** Whether a sprite should draw as voxel (catalog-aware, with bundled fallback). */
export function shouldPreferVoxelSprite(
  sprite: string | undefined,
  catalog?: VoxelCatalogView | null,
): boolean {
  if (!sprite) return false;
  if (catalog?.hasDefinitionForSprite(sprite)) return true;
  return hasVoxelDefinitionForSprite(sprite);
}

/** Re-export for callers that only have sprite names. */
export function getDefaultVoxelAnimationEntries(sprite: string) {
  return getVoxelAnimationEntriesForSprite(sprite);
}

export { createVoxelCatalogView, type VoxelCatalogView };
