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
  yaw: number,
  pitch: number,
  parityUniforms?: Record<string, number | WebGLTexture>,
) => {
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.depthMask(false);

  gl.useProgram(shader.program);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  const paritySkyScale =
    typeof parityUniforms?.paritySkyScale === 'number'
      ? parityUniforms.paritySkyScale
      : 1.0;
  const parityColormap =
    typeof parityUniforms?.parityColormap === 'number'
      ? parityUniforms.parityColormap
      : 0;

  const playfieldWidth =
    typeof parityUniforms?.playfieldWidth === 'number'
      ? parityUniforms.playfieldWidth
      : 640;
  const playfieldHeight =
    typeof parityUniforms?.playfieldHeight === 'number'
      ? parityUniforms.playfieldHeight
      : 480;
  const playfieldGlY =
    typeof parityUniforms?.playfieldGlY === 'number'
      ? parityUniforms.playfieldGlY
      : 0;

  shader.setUniforms({
    tex: texture,
    yaw,
    pitch,
    parityColormap,
    paritySkyScale,
    playfieldWidth,
    playfieldHeight,
    playfieldGlY,
  });

  shader.setAttributes({
    aPosition: buffers.position,
    aUv: buffers.uv,
  });

  buffers.indices.draw();

  gl.depthMask(true);
  gl.depthFunc(gl.LESS);
};
