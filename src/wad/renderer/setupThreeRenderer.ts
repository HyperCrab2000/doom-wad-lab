import * as THREE from 'three';

let threeScene: THREE.Scene;
let threeCamera: THREE.PerspectiveCamera;
let threeRenderer: THREE.WebGLRenderer;
let yawGroup: THREE.Group;

export function setupThreeRenderer(canvas: HTMLCanvasElement, fov = 45) {
  threeScene = new THREE.Scene();
  yawGroup = new THREE.Group();
  threeScene.add(yawGroup);

  const aspect = canvas.width / canvas.height;
  threeCamera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100000);
  threeCamera.position.set(0, 0, 1000);
  threeCamera.lookAt(0, 0, 0);

  threeRenderer = new THREE.WebGLRenderer({
    canvas,
    context: canvas.getContext('webgl2')!,
    antialias: true,
  });
  threeRenderer.setSize(canvas.width, canvas.height);
  threeRenderer.autoClear = false;
}

export function updateThreeCamera(pos: THREE.Vector3, target: THREE.Vector3) {
  threeCamera.position.copy(pos);
  threeCamera.lookAt(target);
}

export function clearThreeScene() {
  yawGroup.clear();
}