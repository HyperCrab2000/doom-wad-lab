// Updated camera.ts to match expected usage in renderGame.ts

import { mat4, vec3 } from 'gl-matrix';
import { createProgram } from 'apl-easy-gl';

import wallsVert from '@/wad/renderer/shaders/walls.vert';
import wallsFrag from '@/wad/renderer/shaders/walls.frag';
import flatVert from '@/wad/renderer/shaders/flat.vert';
import flatFrag from '@/wad/renderer/shaders/flat.frag';
import skyVert from '@/wad/renderer/shaders/sky.vert';
import skyFrag from '@/wad/renderer/shaders/sky.frag';
import skyboxVert from '@/wad/renderer/shaders/skyBox.vert';
import skyboxFrag from '@/wad/renderer/shaders/skyBox.frag';
import thingsVert from '@/wad/renderer/shaders/things.vert';
import thingsFrag from '@/wad/renderer/shaders/things.frag';
import voxelColorVert from '@/wad/renderer/shaders/voxelColor.vert';
import voxelColorFrag from '@/wad/renderer/shaders/voxelColor.frag';
import voxelParallaxGlsl from '@/wad/renderer/shaders/voxelParallax.glsl';
import colormapParityGlsl from '@/wad/renderer/shaders/colormapParity.glsl';

import { createSkyboxBuffers } from '@/wad/renderer/drawAssets/drawSkybox';

function resolveShaderIncludes(source: string): string {
  return source
    .replace('#include "voxelParallax.glsl"', voxelParallaxGlsl)
    .replace('#include "colormapParity.glsl"', colormapParityGlsl);
}

const wallsFragSource = resolveShaderIncludes(wallsFrag);
const flatFragSource = resolveShaderIncludes(flatFrag);
const thingsFragSource = resolveShaderIncludes(thingsFrag);

export interface Camera {
  pos: vec3;
  lookAt: vec3;
  up: vec3;
  near: number;
  far: number;
  fov: number;
}

export function setupCamera(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
  const projectionMatrix = mat4.create();
  const modelMatrix = mat4.create();
  const viewMatrix = mat4.create();
  const invViewMatrix = mat4.create();
  const modelViewMatrix = mat4.create();
  const modelViewProjMatrix = mat4.create();

  const camera: Camera = {
    pos: vec3.fromValues(800.0, 900.0, -100.0),
    lookAt: vec3.fromValues(800.0, 800.0, -200.0),
    up: vec3.fromValues(0.0, 1.0, 0.0),
    near: 0.1,
    far: 64000.0,
    fov: 45,
  };

  const resizeScene = () => {
    // Playfield viewport is bound per frame in drawScene; do not clobber glY here.
    mat4.perspective(
      projectionMatrix,
      (camera.fov / 180) * Math.PI,
      gl.canvas.width / Math.max(1, gl.canvas.height),
      camera.near,
      camera.far
    );
  };

  const skyboxBuffers = createSkyboxBuffers(gl);

  const shaders = {
    walls: createProgram(gl, wallsVert, wallsFragSource),
    flats: createProgram(gl, flatVert, flatFragSource),
    sky: createProgram(gl, skyVert, skyFrag),
    skybox: createProgram(gl, skyboxVert, skyboxFrag),
    things: createProgram(gl, thingsVert, thingsFragSource),
    voxelThings: createProgram(gl, voxelColorVert, voxelColorFrag),
  };

  return {
    camera,
    projectionMatrix,
    modelMatrix,
    viewMatrix,
    invViewMatrix,
    modelViewMatrix,
    modelViewProjMatrix,
    resizeScene,
    skyboxBuffers,
    shaders,
  };
}

export function updateCameraFromViewMatrix(
  viewMatrix: mat4,
  invViewMatrix: mat4,
  camera: Camera
): void {
  mat4.invert(invViewMatrix, viewMatrix);
  vec3.set(camera.pos, invViewMatrix[12], invViewMatrix[13], invViewMatrix[14]);
}
