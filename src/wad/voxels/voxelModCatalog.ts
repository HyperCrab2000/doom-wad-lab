import type { Wad } from '@/wad/interfaces/Wad';

import {
  getVoxelAnimationEntriesForSprite as getBundledAnimationEntries,
  parseVoxelDefs,
  VOXEL_CATALOG,
  type VoxelCatalogEntry,
} from './voxelCatalog';

/** Runtime voxel catalog — bundled Voxel Doom defs plus optional mod WAD overrides. */
export interface VoxelCatalogView {
  getFramesForSprite(sprite: string): VoxelCatalogEntry[];
  getAnimationEntriesForSprite(sprite: string): VoxelCatalogEntry[];
  hasDefinitionForSprite(sprite: string | undefined): boolean;
}

function decodeLumpText(buffer: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(new Uint8Array(buffer));
}

/** Collect VOXELDEF text from merged IWAD/PWAD lumps (GZDoom `-file` stack). */
export function readVoxelDefTextsFromWad(wad: Wad): string[] {
  const texts: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    texts.push(trimmed);
  };

  for (const key of Object.keys(wad.lumpHash)) {
    if (key.toUpperCase().includes('VOXELDEF')) {
      push(decodeLumpText(wad.lumpHash[key]!));
    }
  }

  for (const lump of wad.lumpInfo) {
    const name = String(lump.name).toUpperCase();
    if (name.includes('VOXELDEF') && lump.data?.byteLength) {
      push(decodeLumpText(lump.data));
    }
  }

  return texts;
}

export function mergeVoxelCatalogEntries(
  base: VoxelCatalogEntry[],
  patch: VoxelCatalogEntry[],
): VoxelCatalogEntry[] {
  const byLump = new Map<string, VoxelCatalogEntry>();
  for (const entry of base) byLump.set(entry.lumpName.toUpperCase(), entry);
  for (const entry of patch) byLump.set(entry.lumpName.toUpperCase(), entry);
  return [...byLump.values()].sort((a, b) => a.lumpName.localeCompare(b.lumpName));
}

function groupBySprite(entries: VoxelCatalogEntry[]): Record<string, VoxelCatalogEntry[]> {
  return entries.reduce<Record<string, VoxelCatalogEntry[]>>((acc, entry) => {
    acc[entry.sprite] = acc[entry.sprite] ?? [];
    acc[entry.sprite].push(entry);
    return acc;
  }, {});
}

function getAnimationEntriesFromCatalog(
  sprite: string,
  framesBySprite: Record<string, VoxelCatalogEntry[]>,
): VoxelCatalogEntry[] {
  const entriesByFrame = new Map(
    (framesBySprite[sprite] ?? []).map((entry) => [entry.frame, entry]),
  );
  const bundled = getBundledAnimationEntries(sprite);
  if (bundled.length > 0) {
    const modFrames = bundled
      .map((entry) => entriesByFrame.get(entry.frame) ?? entry)
      .filter((entry): entry is VoxelCatalogEntry => Boolean(entry));
    if (modFrames.length > 0) return modFrames;
  }

  const frames = framesBySprite[sprite] ?? [];
  return frames.length > 0 ? [...frames].sort((a, b) => a.frame.localeCompare(b.frame)) : [];
}

export function createVoxelCatalogView(wad?: Wad | null): VoxelCatalogView {
  const modTexts = wad ? readVoxelDefTextsFromWad(wad) : [];
  const modEntries = modTexts.flatMap((text) => parseVoxelDefs(text));
  const merged = mergeVoxelCatalogEntries(VOXEL_CATALOG, modEntries);
  const framesBySprite = groupBySprite(merged);
  for (const entries of Object.values(framesBySprite)) {
    entries.sort((a, b) => a.frame.localeCompare(b.frame));
  }

  return {
    getFramesForSprite(sprite: string) {
      return framesBySprite[sprite] ?? [];
    },
    getAnimationEntriesForSprite(sprite: string) {
      return getAnimationEntriesFromCatalog(sprite, framesBySprite);
    },
    hasDefinitionForSprite(sprite: string | undefined) {
      return Boolean(sprite && (framesBySprite[sprite]?.length ?? 0) > 0);
    },
  };
}
