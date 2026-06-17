import { Sector } from 'src/wad/interfaces/Sector';
import { Buffer, ElementBuffer } from 'apl-easy-gl';

export interface WallBuffer {
  indices: ElementBuffer;
  position: Buffer;
  uv: Buffer;
  normal: Buffer;
  /** CPU copies used by path trace (must match GPU buffer uploads). */
  cpuPosition: Float32Array;
  cpuUv: Float32Array;
  cpuIndices: Uint16Array;
  /** Cached byte lengths to avoid gl.getBufferParameter on every door refresh. */
  positionBytes: number;
  uvBytes: number;
  normalBytes: number;
  indicesBytes: number;
  texName: string;
  sector: Sector;
  sectorIndex: number;
  lineIndex: number;
  sideDefIndex: number;
  transparent: boolean;
  twoSidedMiddle: boolean;
  repeatVertical: boolean;
  center: [number, number, number];
  /** Max distance from center to any vertex; used for frustum culling. */
  boundsRadius: number;
  /** Outward-facing unit normal for CPU back-face culling. */
  facingNormal: [number, number, number];
  /** Sectors on either side of the parent linedef (portal visibility). */
  portalSectors: readonly number[];
}
