import { voxelRenderer } from '@/wad/renderer/voxelRenderer';
import { mat4 } from 'gl-matrix';

export async function renderVoxelToOffscreen(voxelMesh: any): Promise<string> {
  const canvas = new OffscreenCanvas(256, 256);
  const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;

  if (!gl) throw new Error('WebGL2 not supported');

  // Setup viewport
  gl.viewport(0, 0, 256, 256);
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Init renderer
  voxelRenderer.init(gl);

  // Setup fake view/projection
  const viewMatrix = mat4.lookAt(mat4.create(), [2, 2, 2], [0, 0, 0], [0, 1, 0]);
  const projMatrix = mat4.perspective(mat4.create(), Math.PI / 4, 1, 0.1, 100);

  // Render voxel mesh
  voxelRenderer.render(gl, {
    mesh: voxelMesh,
    position: [0, 0, 0],
    rotation: 45,
    viewMatrix,
    projectionMatrix: projMatrix,
    cameraPos: [2, 2, 2],
    lightIntensity: 1,
  });

  // Flush WebGL commands
  gl.flush();

  // Extract image as PNG data URI
  const bitmap = canvas.transferToImageBitmap();
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = 256;
  finalCanvas.height = 256;
  const ctx = finalCanvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return finalCanvas.toDataURL('image/png');
}
