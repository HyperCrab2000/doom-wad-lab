import { getVoxelAnimationEntriesForSprite, VoxelCatalogEntry } from '@/wad/voxels/voxelCatalog';
import { WadMap } from '@/wad/interfaces/WadMap';
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
  entry: VoxelCatalogEntry;
  mesh?: RuntimeVoxelMesh;
}

export type VoxelThingFrameMap = Map<string, VoxelThingFrame[]>;

const KVX_ASSET_VERSION = '2026-05-24-doom2-voxels';

export function createVoxelThingFrameMap(map: WadMap): VoxelThingFrameMap {
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
    const entries = getVoxelAnimationEntriesForSprite(sprite);
    if (entries.length > 0) {
      framesBySprite.set(sprite, entries.map((entry) => ({ entry })));
    }
  }

  void hydrateVoxelThingMeshes(framesBySprite);
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

async function hydrateVoxelThingMeshes(framesBySprite: VoxelThingFrameMap): Promise<void> {
  const uniqueFrames = new Map<string, VoxelThingFrame>();
  for (const frames of framesBySprite.values()) {
    for (const frame of frames) {
      uniqueFrames.set(frame.entry.lumpName, frame);
    }
  }

  await Promise.all(
    [...uniqueFrames.values()].map(async (frame) => {
      try {
        const response = await fetch(`/voxels/${frame.entry.fileName}.kvx?v=${KVX_ASSET_VERSION}`);
        if (!response.ok) return;
        const buffer = await response.arrayBuffer();
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
        // Sprite fallback will handle missing or invalid voxel frames.
      }
    })
  );

  for (const frames of framesBySprite.values()) {
    for (const frame of frames) {
      frame.mesh = uniqueFrames.get(frame.entry.lumpName)?.mesh;
    }
  }
}
