import type { RasterImage } from '@hypercrab2000/doom-wad-core';
import type { Wad } from '@/wad/interfaces/Wad';
import {
  rasterizeFlatIndex,
  rasterizePatchIndex,
  rasterizeTextureIndex,
} from '@/wad/parity/raster/rasterizeIndex';

export class SoftwareTextureCache {
  private readonly wallByName = new Map<string, RasterImage>();
  private readonly flatByName = new Map<string, RasterImage>();
  private readonly spriteByName = new Map<string, RasterImage>();

  constructor(private readonly wad: Wad) {}

  wallTexture(name: string): RasterImage | null {
    const key = name.toUpperCase();
    let cached = this.wallByName.get(key);
    if (cached) return cached;

    const tex = this.wad.textures[name] ?? this.wad.textures[key];
    if (!tex) return null;

    cached = rasterizeTextureIndex(tex, this.wad);
    this.wallByName.set(key, cached);
    return cached;
  }

  flatTexture(name: string): RasterImage | null {
    const key = name.toUpperCase();
    let cached = this.flatByName.get(key);
    if (cached) return cached;

    const lump = this.wad.flats[name] ?? this.wad.flats[key];
    if (!lump) return null;

    cached = rasterizeFlatIndex(lump);
    this.flatByName.set(key, cached);
    return cached;
  }

  spriteTexture(name: string): RasterImage | null {
    const key = name.toUpperCase();
    let cached = this.spriteByName.get(key);
    if (cached) return cached;

    const lump = this.wad.lumpHash[name] ?? this.wad.sprites[name] ?? this.wad.sprites[key];
    if (!lump) return null;

    cached = rasterizePatchIndex(lump);
    this.spriteByName.set(key, cached);
    return cached;
  }
}

export function sampleIndexTex(
  raster: RasterImage,
  u: number,
  v: number,
  repeatU = true,
  repeatV = true,
): number {
  const w = raster.width;
  const h = raster.height;
  if (w <= 0 || h <= 0) return 0;

  let fu = u;
  let fv = v;
  if (repeatU) fu = fu - Math.floor(fu);
  if (repeatV) fv = fv - Math.floor(fv);

  const x = Math.min(w - 1, Math.max(0, Math.floor(fu * w)));
  const y = Math.min(h - 1, Math.max(0, Math.floor(fv * h)));
  const i = (y * w + x) * 4;
  const pal = raster.rgba[i]!;
  const alpha = raster.rgba[i + 3]!;
  return alpha === 0 ? 0 : pal;
}
