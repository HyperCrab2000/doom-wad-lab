import { Sector } from '@/wad/interfaces/Sector';

export interface FlatObject {
  sector: Sector;
  sectorIndex: number;
  /** BSP subsector index when geometry is a subsector span (GZDoom `HWFlat`). */
  subsectorIndex?: number;
  flatName: string;
  position: Float32Array;
  indices: Uint16Array;
  normal: Float32Array;
  uv: Float32Array;
  center: [number, number, number];
  /** Max distance from center to any vertex; used for frustum culling. */
  boundsRadius: number;
}
