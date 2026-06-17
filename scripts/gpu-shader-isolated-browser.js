function runGpuPathTrace(
  vertSrc,
  fragSrc,
  dataBytes,
  colorBytes,
  bounds,
  invM,
  triCount,
  texW,
  texH,
  colorW,
  colorH,
  rw,
  rh
) {
  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true, alpha: false });
  if (!gl) throw new Error('no webgl2');
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'compile');
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');

  const triTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, triTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, texW, texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(dataBytes));

  const colorTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, colorTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, colorW, colorH, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(colorBytes));

  const lightTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  const light = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) light[i * 4] = 191;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, light);

  const atlasTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([58, 58, 58, 255]));

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const color = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, color);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rw, rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);

  gl.viewport(0, 0, rw, rh);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_invViewProj'), false, new Float32Array(invM));
  gl.uniform3f(gl.getUniformLocation(prog, 'u_packOrigin'), bounds.origin[0], bounds.origin[1], bounds.origin[2]);
  gl.uniform3f(gl.getUniformLocation(prog, 'u_packScale'), bounds.scale[0], bounds.scale[1], bounds.scale[2]);
  gl.uniform2f(gl.getUniformLocation(prog, 'u_traceSize'), rw, rh);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_triangleCount'), triCount);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_triangleTexWidth'), texW);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_atlasCols'), 1);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_atlasRows'), 1);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_surfaceMask'), 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, triTex);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_triangles'), 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, colorTex);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_triColors'), 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_sectorLight'), 2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, atlasTex);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_atlas'), 3);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_position');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  const px = new Uint8Array(rw * rh * 4);
  gl.readPixels(0, 0, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let nonSky = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!(px[i] === 115 && px[i + 1] === 158 && px[i + 2] === 224)) nonSky++;
  }
  const cx = Math.floor(rw / 2);
  const cy = Math.floor(rh / 2);
  const ci = (cy * rw + cx) * 4;
  return {
    nonSky,
    total: rw * rh,
    center: [px[ci], px[ci + 1], px[ci + 2]],
  };
}
