import { Thing } from '@/wad/interfaces/Thing';
import { Vertex } from '@/wad/interfaces/Vertex';
import { SideDef } from '@/wad/interfaces/SideDef';
import { LineDef } from '@/wad/interfaces/LineDef';
import { Sector } from '@/wad/interfaces/Sector';

export interface WadMap {
  THINGS: Array<Thing>;
  VERTEXES: Array<Vertex>;
  LINEDEFS: Array<LineDef>;
  SIDEDEFS: Array<SideDef>;
  SECTORS: Array<Sector>;
  [key: string]: any;
}
