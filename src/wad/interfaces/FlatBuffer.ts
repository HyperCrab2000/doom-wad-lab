import { Buffer, ElementBuffer } from 'apl-easy-gl';
import { Sector } from '@/wad/interfaces/Sector';

export interface FlatBuffer {
  position: Buffer;
  indices: ElementBuffer;
  flatName: string;
  sector: Sector;
  sectorIndex: number;
  subsectorIndex?: number;
  normal: Buffer;
  uv: Buffer;
  /** CPU copies for path trace (must match GPU uploads). */
  cpuPosition: Float32Array;
  cpuUv: Float32Array;
  cpuIndices: Uint16Array;
  center: [number, number, number];
  boundsRadius: number;
}
