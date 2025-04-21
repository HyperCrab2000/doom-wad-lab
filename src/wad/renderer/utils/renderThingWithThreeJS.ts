import * as THREE from 'three';

export function renderThingWithThreeJS(kvx: any, anchor: [number, number, number]) {
  const group = new THREE.Group();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const anchorVec = new THREE.Vector3(...anchor);

  for (const voxel of kvx.voxdata) {
    const color = kvx.getColor(voxel.col);
    const [r, g, b] = color.match(/\d+/g)!.map(n => parseInt(n, 10) / 255);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
    const mesh = new THREE.Mesh(box, mat);
    mesh.position.copy(fileToWorld(voxel));
    group.add(mesh);
  }

  group.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(group);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const offset = new THREE.Vector3().subVectors(anchorVec, center);
  group.position.add(offset);

  yawGroup.add(group);
}

export function fileToWorld(v: { x: number; y: number; z: number }) {
  return new THREE.Vector3(v.x, -v.z, v.y);
}