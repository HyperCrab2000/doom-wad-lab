import { Thing } from '@/interfaces/Thing';
import { Vertex } from '@/interfaces/Vertex';
import { LineDef } from '@/interfaces/LineDef';
import { SideDef } from '@/interfaces/SideDef';
import { Sector } from '@/interfaces/Sector';

export interface WadMap {
  THINGS: Array<Thing>;
  VERTEXES: Array<Vertex>;
  LINEDEFS: Array<LineDef>;
  SIDEDEFS: Array<SideDef>;
  SECTORS: Array<Sector>;
  [key: string]: any;
}
