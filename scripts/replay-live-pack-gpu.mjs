import fs from 'node:fs';
import puppeteer from 'puppeteer';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browserFn = fs.readFileSync('scripts/gpu-shader-isolated-browser.js', 'utf8');
const vert = fs.readFileSync('src/wad/renderer/rtgl/shaders/pathTrace.vert', 'utf8');
const frag = fs.readFileSync('src/wad/renderer/rtgl/shaders/pathTrace.frag', 'utf8');

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto(`http://127.0.0.1:5150/?renderer=pathtrace&ptDebug=1&_=${Date.now()}`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector('.level-toolbar select');
await page.select('.level-toolbar select', '/wads/DOOM.WAD');
const mapSelect = await page.$$('select');
if (mapSelect[1]) await mapSelect[1].select('E1M1');
await page.waitForFunction(
  () => window.__ptExport?.count > 0,
  { timeout: 120_000, polling: 500 }
);

const gpuOffscreen = await page.evaluate(
  (fnSource, vertSrc, fragSrc) => {
    const exp = window.__ptExport;
    const fn = new Function(fnSource + '; return runGpuPathTrace;')();
    return fn(
      vertSrc,
      fragSrc,
      exp.dataBytes,
      exp.colorData,
      exp.bounds,
      exp.invViewProj,
      exp.count,
      exp.width,
      exp.height,
      exp.colorWidth,
      exp.colorHeight,
      exp.rw,
      exp.rh
    );
  },
  browserFn,
  vert,
  frag
);

const gpuSameContext = await page.evaluate(
  (fnSource, vertSrc, fragSrc) => {
    const exp = window.__ptExport;
    const canvas = document.querySelector('.game-canvas');
    const gl = canvas?.getContext('webgl2');
    if (!gl) return { error: 'no gl' };
    const fn = new Function(fnSource + '; return runGpuPathTraceOnGl;')();
    return fn(gl, vertSrc, fragSrc, exp);
  },
  browserFn +
    `
function runGpuPathTraceOnGl(gl, vertSrc, fragSrc, exp) {
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
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, exp.width, exp.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(exp.dataBytes));
  const colorTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, colorTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, exp.colorWidth, exp.colorHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(exp.colorData));
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
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, exp.rw, exp.rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
  gl.viewport(0, 0, exp.rw, exp.rh);
  gl.useProgram(prog);
  gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_invViewProj'), false, new Float32Array(exp.invViewProj));
  gl.uniform3f(gl.getUniformLocation(prog, 'u_packOrigin'), exp.bounds.origin[0], exp.bounds.origin[1], exp.bounds.origin[2]);
  gl.uniform3f(gl.getUniformLocation(prog, 'u_packScale'), exp.bounds.scale[0], exp.bounds.scale[1], exp.bounds.scale[2]);
  gl.uniform2f(gl.getUniformLocation(prog, 'u_traceSize'), exp.rw, exp.rh);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_triangleCount'), exp.count);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_triangleTexWidth'), exp.width);
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
  const px = new Uint8Array(exp.rw * exp.rh * 4);
  gl.readPixels(0, 0, exp.rw, exp.rh, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let nonSky = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!(px[i] === 115 && px[i + 1] === 158 && px[i + 2] === 224)) nonSky++;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { nonSky, total: exp.rw * exp.rh };
}
`,
  vert,
  frag
);

console.log(
  JSON.stringify(
    {
      offscreen: { ratio: (gpuOffscreen.nonSky / gpuOffscreen.total).toFixed(3) },
      sameContext: gpuSameContext.error
        ? gpuSameContext
        : { ratio: (gpuSameContext.nonSky / gpuSameContext.total).toFixed(3) },
      liveFbo: (await page.evaluate(() => window.__ptDebug?.fboNonSkyRatio)),
    },
    null,
    2
  )
);
await browser.close();
