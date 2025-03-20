import { Buffer, ElementBuffer } from 'apl-easy-gl';

export interface SkyBuffer {
  position: Buffer;
  uv: Buffer;
  indices: ElementBuffer;
}
