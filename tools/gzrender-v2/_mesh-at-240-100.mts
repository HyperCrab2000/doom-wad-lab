#!/usr/bin/env tsx
import fs from 'node:fs';
import { mat4, vec4 } from 'gl-matrix';
import { buildMapGeometryCpu } from '@/wad/renderer/geometry/buildMapGeometryCpu';
import { loadWadFromArrayBuffer } from '@/wad/parser/loadWadFromArrayBuffer';
import { getPlayerEyeZ, writePlayerViewMatrix } from '@/wad/renderer/controls/playerView';
import { FROZEN_GOLD_PARITY_PITCH } from '@/wad/parity/frame/frameParity';
import { computeGzdoomParityViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';

function project(
  mvp: mat4,
  x: number,
  y: number,
  z: number,
  layout: ReturnType<typeof computeGzdoomParityViewLayout>,
): { pfX: number; pfY: number } | null {
  const out = vec4.create();
  vec4.transformMat4(out, vec4.fromValues(x, y, z, 1), mvp);
  if (out[3]! <= 0) return null;
  const ndcX = out[0]! / out[3]!;
  const ndcY = out[1]! / out[3]!;
  const glX = ((ndcX + 1) * layout.width) / 2;
  const glY = layout.glY + ((ndcY + 1) * layout.height) / 2;
  const pfX = glX * (320 / layout.width);
  const pfY = (layout.height - (glY - layout.glY)) * (168 / layout.height);
  return { pfX, pfY };
}

const wad = loadWadFromArrayBuffer(fs.readFileSync('public/wads/DOOM.WAD').buffer);
const map = wad.maps.E1M1;
const player = map.THINGS.find((t) => t.type === 1)!;
const sector = map.SECTORS[29]!;
const geometry = buildMapGeometryCpu(map, {});
const viewMatrix = mat4.create();
writePlayerViewMatrix(viewMatrix, {
  x: player.x,
  y: player.y,
  yaw: Math.PI / 2,
  pitch: FROZEN_GOLD_PARITY_PITCH,
  worldFeetZ: sector.floorheight,
  sector,
});
const layout = computeGzdoomParityViewLayout(640, 480);
const projectionMatrix = mat4.create();
mat4.perspective(projectionMatrix, (106 * Math.PI) / 180, 640 / 480, 5, 65536);
const mvp = mat4.create();
mat4.multiply(mvp, projectionMatrix, viewMatrix);

const xi = 240;
const yi = 100;
for (const wall of geometry.walls) {
  const pos = wall.cpuPosition;
  if (!pos) continue;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const p = project(mvp, pos[i]!, pos[i + 1]!, pos[i + 2]!, layout);
    if (!p) continue;
    minX = Math.min(minX, p.pfX);
    maxX = Math.max(maxX, p.pfX);
    minY = Math.min(minY, p.pfY);
    maxY = Math.max(maxY, p.pfY);
  }
  if (!Number.isFinite(minX)) continue;
  if (xi < minX - 1 || xi > maxX + 1 || yi < minY - 1 || yi > maxY + 1) continue;
  console.log(
    `line ${wall.lineIndex} tex=${wall.textureName ?? wall.texName} x=${minX.toFixed(0)}-${maxX.toFixed(0)} y=${minY.toFixed(0)}-${maxY.toFixed(0)}`,
  );
}
