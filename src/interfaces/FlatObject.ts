import {Sector} from "@/interfaces/Sector";

export interface FlatObject {
  sector: Sector;
  flatName: string;
  position: Float32Array;
  indices: Uint16Array;
}
