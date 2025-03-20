import { createBuffer, createElementBuffer, ShaderProgram } from 'apl-easy-gl';

export const createSkyboxBuffers = (gl: WebGLRenderingContext) => {
  const positions = new Float32Array([
    -1,
    -1,
    0, // bottom left
    1,
    -1,
    0, // bottom right
    -1,
    1,
    0, // top left
    1,
    1,
    0, // top right
  ]);

  const uvs = new Float32Array([
    0,
    0, // bottom left
    1,
    0, // bottom right
    0,
    1, // top left
    1,
    1, // top right
  ]);

  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);

  return {
    position: createBuffer(gl, positions, 3),
    uv: createBuffer(gl, uvs, 2),
    indices: createElementBuffer(gl, indices, 1),
  };
};

export const drawSkybox = (
  gl: WebGLRenderingContext,
  shader: ShaderProgram,
  buffers: ReturnType<typeof createSkyboxBuffers>,
  texture: WebGLTexture,
  yaw: number // just pass yaw directly now!
) => {
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);

  gl.useProgram(shader.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  shader.setUniforms({
    tex: texture,
    yaw,
  });

  shader.setAttributes({
    aPosition: buffers.position,
    aUv: buffers.uv,
  });

  buffers.indices.draw();

  // Restore depth state
  gl.depthMask(true);
  gl.enable(gl.DEPTH_TEST);
};
