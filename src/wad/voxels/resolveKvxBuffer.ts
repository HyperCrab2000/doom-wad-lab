import type { Wad } from '@/wad/interfaces/Wad';

import type { VoxelCatalogEntry } from './voxelCatalog';

export const KVX_ASSET_VERSION = '2026-06-17-mod-voxels';

const DEFAULT_MOD_VOXEL_BASES = ['/mods/voxels'];

function copyBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

function lookupWadLump(wad: Wad, names: string[]): ArrayBuffer | null {
  for (const name of names) {
    const direct = wad.lumpHash[name];
    if (direct?.byteLength) return copyBuffer(direct);
    const upper = wad.lumpHash[name.toUpperCase()];
    if (upper?.byteLength) return copyBuffer(upper);
  }
  return null;
}

/** Derive optional KVX URL bases from GZDoom `-file` mod paths. */
export function modVoxelAssetBases(modPaths: readonly string[] = []): string[] {
  const bases = new Set<string>(DEFAULT_MOD_VOXEL_BASES);
  for (const modPath of modPaths) {
    const normalized = modPath.replace(/\\/g, '/');
    if (normalized.toLowerCase().endsWith('.pk3')) {
      bases.add(normalized.replace(/\.pk3$/i, '/voxels'));
    }
    if (normalized.toLowerCase().endsWith('.wad')) {
      bases.add(`${normalized.replace(/\.wad$/i, '')}/voxels`);
    }
  }
  return [...bases];
}

export async function resolveKvxBuffer(
  entry: VoxelCatalogEntry,
  wad?: Wad | null,
  modPaths: readonly string[] = [],
): Promise<ArrayBuffer | null> {
  const lumpCandidates = [
    entry.lumpName,
    entry.fileName,
    entry.lumpName.toUpperCase(),
    entry.fileName.toUpperCase(),
  ];

  if (wad) {
    const fromWad = lookupWadLump(wad, lumpCandidates);
    if (fromWad) return fromWad;
  }

  const urls = [
    `/voxels/${entry.fileName}.kvx`,
    `/voxels/${entry.lumpName}.kvx`,
    ...modVoxelAssetBases(modPaths).flatMap((base) => [
      `${base}/${entry.fileName}.kvx`,
      `${base}/${entry.lumpName}.kvx`,
    ]),
  ];

  for (const url of urls) {
    try {
      const response = await fetch(`${url}?v=${KVX_ASSET_VERSION}`);
      if (response.ok) {
        return response.arrayBuffer();
      }
    } catch {
      // Try next source.
    }
  }

  return null;
}
