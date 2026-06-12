import { WadMap } from '@/wad/interfaces/WadMap';
import { hasValidFlags, isExcludedSpawnThing } from '@/wad/renderer/utils/hasValidFlags';
import { automapRotationRadians } from '@/wad/renderer/controls/playerView';

/** Vanilla iddt cheat cycles: normal → all lines → all lines + things. */
export type AutomapCheatLevel = 0 | 1 | 2;

export interface AutomapPlayer {
  x: number;
  y: number;
  /** World yaw in radians (same as player controls). */
  yaw: number;
}

export interface DrawAutomapOptions {
  player: AutomapPlayer;
  cheatLevel?: AutomapCheatLevel;
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
  const { player, cheatLevel = 0 } = options;
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

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(automapRotationRadians(player.yaw));

  const toScreen = (x: number, y: number) => ({
    x: (x - player.x) * scale,
    y: -(y - player.y) * scale,
  });

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
      const angle = ((thing.angle / 180) * Math.PI - player.yaw + Math.PI / 2);
      const radius = Math.max(2, lineWidth + 1);

      ctx.fillStyle = '#1fbf1f';
      ctx.strokeStyle = '#6cff6c';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(pos.x + Math.cos(angle) * (radius + 6), pos.y + Math.sin(angle) * (radius + 6));
      ctx.stroke();
    }
  }

  ctx.restore();

  drawPlayerMark(ctx, centerX, centerY, lineWidth);

  return ctx;
}

function drawPlayerMark(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  lineWidth: number
) {
  const size = Math.max(6, lineWidth * 4);
  ctx.save();
  ctx.translate(centerX, centerY);
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
