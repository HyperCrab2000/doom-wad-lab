import { Vertex3D } from 'src/wad/interfaces/Vertex3D';
import { Aabb3D } from 'src/wad/interfaces/Aabb3D';

export interface Triangle3D {
  v1: Vertex3D;
  v2: Vertex3D;
  v3: Vertex3D;

  edge1: Vertex3D;
  edge2: Vertex3D;

  normal: Vertex3D;

  aabb: Aabb3D;
}
