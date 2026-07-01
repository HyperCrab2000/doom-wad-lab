import { WadMap } from '@/wad/interfaces/WadMap';
import { hasValidFlags, isExcludedSpawnThing } from '@/wad/renderer/utils/hasValidFlags';
import {
  automapFollowRotationRadians,
  doomYawToCanvasAngle,
  projectDoomOffsetToAutomapCanvas,
} from '@/wad/renderer/controls/playerView';

/** Vanilla iddt cheat cycles: normal → all lines → all lines + things. */
export type AutomapCheatLevel = 0 | 1 | 2;

export interface AutomapPlayer {
  x: number;
  y: number;
  /** World yaw in radians — use the same source as the 3D view matrix / BSP trace. */
  yaw: number;
}

export interface DrawAutomapOptions {
  player: AutomapPlayer;
  cheatLevel?: AutomapCheatLevel;
  /** When true (default), rotate the map so forward matches the 3D view (classic follow mode). */
  followMode?: boolean;
}

const VIEW_RADIUS = 960;

export function cycleAutomapCheat(level: AutomapCheatLevel): AutomapCheatLevel {
  return ((level + 1) % 3) as AutomapCheatLevel;
}

export function drawAutomap(
  canvas: HTMLCanvasElement,
  map: WadMap,
  options: DrawAutomapOptions
): CanvasRenderingContext2D {
  const { player, cheatLevel = 0, followMode = true } = options;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2d context for automap');
  }

  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width, height) / (VIEW_RADIUS * 2);
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  const toScreen = (x: number, y: number) => {
    const offset = projectDoomOffsetToAutomapCanvas(x - player.x, y - player.y);
    return { x: offset.x * scale, y: offset.y * scale };
  };

  ctx.save();
  ctx.translate(centerX, centerY);
  if (followMode) {
    ctx.rotate(automapFollowRotationRadians(player.yaw));
  }

  const lineWidth = Math.max(1, Math.floor(scale * 1.35));
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'square';

  for (const line of map.LINEDEFS) {
    const hidden = line.flags.notOnMap || line.flags.secret;
    if (hidden && cheatLevel < 1) continue;

    const v1 = map.VERTEXES[line.v1];
    const v2 = map.VERTEXES[line.v2];
    const p1 = toScreen(v1.x, v1.y);
    const p2 = toScreen(v2.x, v2.y);

    if (line.flags.impassible || !line.flags.twoSided || line.sidenum[1] < 0) {
      ctx.strokeStyle = hidden ? '#ff4040' : '#d31b1b';
    } else {
      ctx.strokeStyle = hidden ? '#bdbdbd' : '#8a8a8a';
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  if (cheatLevel >= 2) {
    for (const thing of map.THINGS) {
      if (!hasValidFlags(thing) || isExcludedSpawnThing(thing.type)) continue;
      if (thing.type === 1) continue;

      const pos = toScreen(thing.x, thing.y);
      const thingYaw = -(thing.angle / 180) * Math.PI;
      const radius = Math.max(2, lineWidth + 1);

      ctx.fillStyle = '#1fbf1f';
      ctx.strokeStyle = '#6cff6c';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(pos.x, pos.y);
      if (!followMode) {
        ctx.rotate(thingYaw);
      } else {
        ctx.rotate(thingYaw - automapFollowRotationRadians(player.yaw));
      }
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -(radius + 6));
      ctx.stroke();
      ctx.restore();
    }
  }

  if (followMode) {
    drawFollowViewRay(ctx, scale, lineWidth);
  } else {
    drawViewRay(ctx, scale, player.yaw, lineWidth);
  }
  ctx.restore();

  drawPlayerMark(ctx, centerX, centerY, lineWidth, followMode ? null : player.yaw);

  return ctx;
}

function drawFollowViewRay(
  ctx: CanvasRenderingContext2D,
  scale: number,
  lineWidth: number
): void {
  const len = Math.max(48, lineWidth * 18);
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.55)';
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -len * scale);
  ctx.stroke();
}

function drawViewRay(
  ctx: CanvasRenderingContext2D,
  scale: number,
  yaw: number,
  lineWidth: number
): void {
  const forward = projectDoomOffsetToAutomapCanvas(Math.cos(yaw), Math.sin(yaw));
  const len = Math.max(48, lineWidth * 18);
  ctx.strokeStyle = 'rgba(120, 180, 255, 0.55)';
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(forward.x * len * scale, forward.y * len * scale);
  ctx.stroke();
}

function drawPlayerMark(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  lineWidth: number,
  yaw: number | null
) {
  const size = Math.max(6, lineWidth * 4);
  ctx.save();
  ctx.translate(centerX, centerY);
  if (yaw !== null) {
    ctx.rotate(doomYawToCanvasAngle(yaw));
  }
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, lineWidth);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.62, size * 0.72);
  ctx.lineTo(0, size * 0.35);
  ctx.lineTo(-size * 0.62, size * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
