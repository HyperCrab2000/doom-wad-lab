import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { WallTexture } from '@/wad/interfaces/WallTexture';
import { Wad } from '@/wad/interfaces/Wad';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { validateWadBuffer } from '@/wad/loader/validateWadBuffer';
import { clearMapLoadCache } from '@/wad/renderer/renderGame/mapLoadCache';
import { clearWadAssetsCache } from '@/wad/renderer/drawAssets/wadAssetsCache';
import { clearHeightUrlMissCache } from '@/wad/renderer/renderGame/heightTextures';
import { clearWadCache } from '@/features/level-viewer/wadCache';

const INTEGRATION_WAD_CANDIDATES = [
  'public/wads/DOOM2.WAD',
  'wads/DOOM2.WAD',
  'public/wads/DOOM.WAD',
  'public/wads/test.wad',
  'wads/test.wad',
] as const;

export function resetIntegrationCaches(): void {
  clearWadCache();
  clearMapLoadCache();
  clearWadAssetsCache();
  clearHeightUrlMissCache();
}

export function resolveWadFixture(...relativePaths: string[]): string {
  for (const relativePath of relativePaths) {
    const absolutePath = path.resolve(process.cwd(), relativePath);
    if (isValidWadFile(absolutePath)) {
      return absolutePath;
    }
  }

  throw new Error(`No valid WAD fixture found. Tried: ${relativePaths.join(', ')}`);
}

export function resolveIntegrationWad(): string {
  return resolveWadFixture(...INTEGRATION_WAD_CANDIDATES);
}

export function readWadFixture(...relativePaths: string[]): { path: string; buffer: ArrayBuffer } {
  const wadPath = resolveWadFixture(...relativePaths);
  const bytes = readFileSync(wadPath);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { path: wadPath, buffer };
}

export function loadWadFixture(...relativePaths: string[]): { path: string; wad: Wad } {
  const { path: wadPath, buffer } = readWadFixture(...relativePaths);
  validateWadBuffer(buffer, wadPath);
  const wad = loadWadFromArrayBuffer(buffer);
  return { path: wadPath, wad };
}

export function loadWadForMap(mapName: string): { path: string; wad: Wad; map: WadMap } {
  const relativePaths =
    mapName.startsWith('MAP')
      ? ['public/wads/DOOM2.WAD', 'wads/DOOM2.WAD']
      : ['public/wads/DOOM.WAD'];

  const loaded = loadWadFixture(...relativePaths);
  const map = loaded.wad.maps[mapName];
  if (!map) {
    throw new Error(`Map ${mapName} not found in ${loaded.path}`);
  }

  return { ...loaded, map };
}

export function buildMapTextureLookup(map: WadMap, wad?: Wad): Record<string, WallTexture> {
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }

  const texturesByName: Record<string, WallTexture> = {};
  for (const name of texNames) {
    const def = wad?.textures[name] ?? wad?.textures[name.toUpperCase()];
    texturesByName[name] = {
      name,
      width: def?.width ?? 64,
      height: def?.height ?? 128,
      transparent: false,
      graphics: {} as WallTexture['graphics'],
    };
  }

  return texturesByName;
}

export function createMockWebGL2Context(): WebGL2RenderingContext {
  const canvas = document.createElement('canvas');
  return canvas.getContext('webgl2') as WebGL2RenderingContext;
}

function isValidWadFile(absolutePath: string): boolean {
  if (!existsSync(absolutePath)) {
    return false;
  }

  const bytes = readFileSync(absolutePath);
  if (bytes.byteLength < 12) {
    return false;
  }

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    validateWadBuffer(buffer, absolutePath);
    return true;
  } catch {
    return false;
  }
}
