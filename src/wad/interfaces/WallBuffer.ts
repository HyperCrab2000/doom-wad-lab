import { Sector } from 'src/wad/interfaces/Sector';
import { Buffer, ElementBuffer } from 'apl-easy-gl';

export interface WallBuffer {
  indices: ElementBuffer;
  position: Buffer;
  uv: Buffer;
  normal: Buffer;
  /** Cached byte lengths to avoid gl.getBufferParameter on every door refresh. */
  positionBytes: number;
  uvBytes: number;
  normalBytes: number;
  indicesBytes: number;
  texName: string;
  sector: Sector;
  sectorIndex: number;
  lineIndex: number;
  transparent: boolean;
  twoSidedMiddle: boolean;
  repeatVertical: boolean;
  center: [number, number, number];
}
