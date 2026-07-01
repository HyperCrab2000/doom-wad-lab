import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { mat4 } from 'gl-matrix';

import { buildBspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import { buildGzdoomDrawState } from '@/wad/renderer/bsp/gzdoomDrawState';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix } from '@/wad/renderer/controls/playerView';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import {
  buildWallRangesByLine,
  buildWallRangesByLineAndSide,
  pathTraceFlatSlicesFromFlatObjects,
  pathTraceWallSlicesFromWallObjects,
} from '@/wad/renderer/geometry/geometryCache';
import { mapToSubsectorFlats } from '@/wad/renderer/geometry/mapToSubsectorFlats';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { buildSceneTriangles } from '@/wad/renderer/rtgl/buildSceneTriangles';
import { decodePackedVertex, packSceneTriangles } from '@/wad/renderer/rtgl/packSceneTriangles';

function loadE1M1Packed() {
  const wadPath = path.resolve('public/wads/DOOM.WAD');
  const buf = fs.readFileSync(wadPath);
  const wad = loadWadFromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const map = wad.maps.E1M1;
  const player = map.THINGS.find((t) => t.type === 1)!;
  const sector = map.SECTORS[player.sectorIndex ?? 0];
  const texNames = new Set<string>();
  for (const side of map.SIDEDEFS) {
    for (const tex of [side.topTexture, side.bottomTexture, side.midTexture]) {
      if (tex && tex !== '-') texNames.add(tex);
    }
  }
  const texLookup = Object.fromEntries(
    [...texNames].map((n) => [n, { name: n, width: 64, height: 128, transparent: false, graphics: {} }])
  );
  const geometry = buildMapGeometryCpu(map, texLookup);
  const bsp = buildBspRenderIndex(map);
  const subsectorFlatObjects = mapToSubsectorFlats(map, bsp);
  const buffers = {
    bspRenderIndex: bsp,
    walls: pathTraceWallSlicesFromWallObjects(geometry.walls),
    flats: pathTraceFlatSlicesFromFlatObjects(geometry.flats),
    subsectorFlats: pathTraceFlatSlicesFromFlatObjects(subsectorFlatObjects),
    wallRangesByLine: buildWallRangesByLine(geometry.walls, map.LINEDEFS.length),
    wallRangesByLineAndSide: buildWallRangesByLineAndSide(
      geometry.walls.map((w) => ({ lineIndex: w.lineIndex ?? -1, sideDefIndex: w.sideDefIndex ?? -1 })),
      map.LINEDEFS.length,
      map
    ),
  };
  const viewMatrix = mat4.create();
  writePlayerViewMatrix(viewMatrix, {
    x: player.x,
    y: player.y,
    yaw: (player.angle * Math.PI) / 180,
    pitch: 0,
    worldFeetZ: sector.floorheight,
    sector,
  });
  const { yaw } = getViewAnglesFromViewMatrix(viewMatrix);
  const invView = mat4.invert(mat4.create(), viewMatrix)!;
  const eye: [number, number, number] = [invView[12], invView[13], invView[14]];
  const drawState = buildGzdoomDrawState({
    map,
    buffers,
    viewX: player.x,
    viewY: player.y,
    viewYaw: yaw,
    cameraPos: eye,
  });
  const tris = buildSceneTriangles(map, buffers, drawState);
  return { packed: packSceneTriangles(tris, new Map(), new Map(), new Map()), tris };
}

async function main() {
  const { packed, tris } = loadE1M1Packed();
  const cpu0 = decodePackedVertex(packed.dataBytes, 0, 0, packed.bounds);
  const cpu100 = decodePackedVertex(packed.dataBytes, 100, 0, packed.bounds);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const gpu = await page.evaluate(
    (dataBytes, bounds, tri0, tri100) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 1;
      const gl = canvas.getContext('webgl2')!;
      const vs = `#version 300 es
        in vec2 a_pos;
        void main(){ gl_Position=vec4(a_pos,0,1); }`;
      const fs = `#version 300 es
        precision highp float;
        uniform sampler2D u_tri;
        uniform vec3 u_origin, u_scale;
        uniform ivec2 u_texel;
        out vec4 fragColor;
        float tb(float c){ return c>1.0?c:c*255.0; }
        float du16(vec2 lh){ return (tb(lh.x)+tb(lh.y)*256.0)/65535.0; }
        void main(){
          vec4 xy = texelFetch(u_tri, u_texel, 0);
          vec4 zm = texelFetch(u_tri, u_texel + ivec2(1,0), 0);
          vec3 v = vec3(du16(xy.xy), du16(xy.zw), du16(zm.xy)) * u_scale + u_origin;
          fragColor = vec4(v * 0.001 + 0.5, 1.0);
        }`;
      function compile(type: number, src: string) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'cs');
        return s;
      }
      const prog = gl.createProgram()!;
      const vsh = compile(gl.VERTEX_SHADER, vs);
      const fsh = compile(gl.FRAGMENT_SHADER, fs);
      gl.attachShader(prog, vsh);
      gl.attachShader(prog, fsh);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');

      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      const w = 256;
      const height = Math.max(1, Math.ceil(((tri100 as number) + 1) * 8 / w));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(dataBytes));

      function decodeGpuTri(triIndex: number) {
        gl.useProgram(prog);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_tri'), 0);
        gl.uniform3f(gl.getUniformLocation(prog, 'u_origin')!, bounds.origin[0], bounds.origin[1], bounds.origin[2]);
        gl.uniform3f(gl.getUniformLocation(prog, 'u_scale')!, bounds.scale[0], bounds.scale[1], bounds.scale[2]);
        const slot = triIndex * 8;
        gl.uniform2i(gl.getUniformLocation(prog, 'u_texel')!, slot % w, Math.floor(slot / w));
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return [
          (px[0] / 255 - 0.5) * 1000,
          (px[1] / 255 - 0.5) * 1000,
          (px[2] / 255 - 0.5) * 1000,
        ];
      }

      return { v0: decodeGpuTri(0), v100: decodeGpuTri(100), tri0, tri100 };
    },
    Array.from(packed.dataBytes),
    packed.bounds,
    tris[0].v0,
    tris[100].v0
  );

  await browser.close();
  console.log('CPU v0', cpu0, 'src', tris[0].v0);
  console.log('GPU v0', gpu.v0);
  console.log('CPU v100', cpu100, 'src', tris[100].v0);
  console.log('GPU v100', gpu.v100);
  const err0 = Math.hypot(gpu.v0[0] - tris[0].v0[0], gpu.v0[1] - tris[0].v0[1], gpu.v0[2] - tris[0].v0[2]);
  const err100 = Math.hypot(
    gpu.v100[0] - tris[100].v0[0],
    gpu.v100[1] - tris[100].v0[1],
    gpu.v100[2] - tris[100].v0[2]
  );
  console.log('errors', { err0, err100 });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
