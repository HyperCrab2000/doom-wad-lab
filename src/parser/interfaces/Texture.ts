import { Patch } from '@/parser/interfaces/Patch';

export interface Texture {
  texName: string;
  texWidth: number;
  texHeight: number;
  patches: Array<Patch>;
}
