import { ColourPalette } from '@/wad/interfaces/ColourPalette';
import { Lump } from '@/wad/interfaces/Lump';
import { WadMap } from '@/wad/interfaces/WadMap';
import { Texture } from '@/wad/interfaces/Texture';

export interface Wad {
  indentification: string;
  lumpInfo: Array<Lump>;
  lumpHash: Record<string, ArrayBuffer>;

  playpal: ColourPalette;
  colormap: Array<number>;
  enddoom: Array<number>;
  pnames: Array<string>;
  genmidi?: ArrayBuffer;
  dmxgus?: ArrayBuffer;
  demo1?: ArrayBuffer;
  demo2?: ArrayBuffer;
  demo3?: ArrayBuffer;

  textures: Record<string, Texture>;
  sprites: Record<string, ArrayBuffer>;
  flats: Record<string, ArrayBuffer>;
  maps: Record<string, WadMap>;

  animatedFlats: Record<string, Array<string>>;
  animatedTextures: Record<string, Array<string>>;
}
