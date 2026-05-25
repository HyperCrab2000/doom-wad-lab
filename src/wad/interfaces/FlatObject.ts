import { Sector } from '@/wad/interfaces/Sector';

export interface FlatObject {
  sector: Sector;
  sectorIndex: number;
  flatName: string;
  position: Float32Array;
  indices: Uint16Array;
  normal: Float32Array;
  uv: Float32Array;
  center: [number, number, number];
}
