/**
 * Top-down BSP visibility debug view (2D automap-style).
 * Colors each **seg** by classic BSP reject reason.
 */

import type { WadMap } from '@/wad/interfaces/WadMap';
import type { BspRenderIndex } from '@/wad/renderer/bsp/bspRenderIndex';
import {
  traceClassicBsp,
  type ClassicBspTrace,
  type SegVisibilityReason,
} from '@/wad/renderer/bsp/classicBspTrace';
import { angleToPseudoAngle } from '@/wad/renderer/bsp/bspClipper';
import { bspDebugMapRotationRadians } from '@/wad/renderer/controls/playerView';

export interface BspDebugPlayer {
  x: number;
  y: number;
  yaw: number;
}

export interface DrawBspDebugViewOptions {
  player: BspDebugPlayer;
  index: BspRenderIndex;
  /** Yaw used for BSP trace; defaults to player.yaw. Match 3D view matrix yaw. */
  traceYaw?: number;
  /** Precomputed trace; built automatically if omitted. */
  trace?: ClassicBspTrace;
}

const VIEW_RADIUS = 1024;

const REASON_COLOR: Record<SegVisibilityReason, string> = {
  visible: '#00ff66',
  validcount: '#00aa44',
  backface: '#ffcc00',
  clip: '#ff3333',
  no_linedef: '#888888',
  no_side: '#666666',
  not_reached: '#2a2a2a',
};

export function buildBspDebugTrace(
  map: WadMap,
  index: BspRenderIndex,
  player: BspDebugPlayer,
  viewYaw = player.yaw
): ClassicBspTrace {
  return traceClassicBsp({
    map,
    index,
    viewX: player.x,
    viewY: player.y,
    viewYaw,
  });
}

export function drawBspDebugView(
  canvas: HTMLCanvasElement,
  map: WadMap,
  options: DrawBspDebugViewOptions
): ClassicBspTrace {
  const { player, index } = options;
  const trace =
    options.trace ??
    buildBspDebugTrace(map, index, player, options.traceYaw ?? player.yaw);

  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2d context for BSP debug view');
  }

  ctx.fillStyle = '#080808';
  ctx.fillRect(0, 0, width, height);

  const scale = Math.min(width, height) / (VIEW_RADIUS * 2);
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(bspDebugMapRotationRadians(player.yaw));

  const toScreen = (x: number, y: number) => ({
    x: (x - player.x) * scale,
    y: -(y - player.y) * scale,
  });

  const lineWidth = Math.max(1, Math.floor(scale * 1.8));
  ctx.lineCap = 'square';

  // Draw in layer order: unreachable → rejected → visible.
  const drawOrder: SegVisibilityReason[] = [
    'not_reached',
    'no_linedef',
    'no_side',
    'backface',
    'clip',
    'validcount',
    'visible',
  ];

  for (const reason of drawOrder) {
    ctx.strokeStyle = REASON_COLOR[reason];
    ctx.lineWidth = reason === 'visible' ? lineWidth + 1 : lineWidth;
    ctx.globalAlpha = reason === 'not_reached' ? 0.35 : reason === 'clip' ? 0.85 : 1;

    for (const entry of trace.segByIndex.values()) {
      if (entry.reason !== reason) continue;
      const seg = map.SEGS[entry.segIndex];
      if (!seg) continue;
      const v1 = map.VERTEXES[seg.v1];
      const v2 = map.VERTEXES[seg.v2];
      if (!v1 || !v2) continue;
      const p1 = toScreen(v1.x, v1.y);
      const p2 = toScreen(v2.x, v2.y);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;

  // View frustum in player-local space (canvas already rotated: forward = screen up).
  drawViewCone(ctx, scale, player.yaw);

  ctx.restore();

  drawPlayerMark(ctx, centerX, centerY, lineWidth);
  drawLegend(ctx, width, height, trace);

  return trace;
}

function drawViewCone(ctx: CanvasRenderingContext2D, scale: number, yaw: number): void {
  const halfFov = Math.PI / 2 - 0.001;
  const len = 120 * (scale / 4);
  const forward = Math.PI / 2;
  const left = forward + halfFov;
  const right = forward - halfFov;

  ctx.strokeStyle = 'rgba(100, 180, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(left) * len, -Math.sin(left) * len);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(right) * len, -Math.sin(right) * len);
  ctx.stroke();

  // Forward hemisphere seed (matches BspClipper.seedFromViewYaw).
  const forwardPseudo = angleToPseudoAngle(yaw);
  const halfPseudo = 0.25;
  const start = forwardPseudo - halfPseudo;
  const end = forwardPseudo + halfPseudo;
  ctx.fillStyle = 'rgba(40, 80, 40, 0.2)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  if (start <= end) {
    ctx.arc(0, 0, len * 0.85, pseudoToLocalCanvasAngle(start, forwardPseudo, halfPseudo * 2), pseudoToLocalCanvasAngle(end, forwardPseudo, halfPseudo * 2));
  } else {
    ctx.arc(0, 0, len * 0.85, pseudoToLocalCanvasAngle(start, forwardPseudo, halfPseudo * 2), pseudoToLocalCanvasAngle(1, forwardPseudo, halfPseudo * 2));
    ctx.arc(0, 0, len * 0.85, pseudoToLocalCanvasAngle(0, forwardPseudo, halfPseudo * 2), pseudoToLocalCanvasAngle(end, forwardPseudo, halfPseudo * 2));
  }
  ctx.closePath();
  ctx.fill();
}

/** Map BSP pseudo-angle to canvas angle in the rotated (forward-up) view. */
function pseudoToLocalCanvasAngle(pseudo: number, forwardPseudo: number, rearSpan: number): number {
  const offset = normalizePseudoOffset(pseudo - forwardPseudo);
  const t = rearSpan > 0 ? offset / rearSpan : 0;
  const halfFov = Math.PI / 2 - 0.001;
  return Math.PI / 2 + Math.PI + t * halfFov * 2;
}

function normalizePseudoOffset(delta: number): number {
  let d = delta;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

function unsignedPseudoSpan(start: number, end: number): number {
  const diff = start - end;
  return diff >= 0 ? diff : diff + 1;
}

function drawPlayerMark(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  lineWidth: number
): void {
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

function drawLegend(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  trace: ClassicBspTrace
): void {
  const pad = 10;
  const lineH = 14;
  const entries: Array<[SegVisibilityReason, string]> = [
    ['visible', 'VISIBLE (new linedef)'],
    ['validcount', 'SEEN (linedef already drawn)'],
    ['backface', 'BACKFACE'],
    ['clip', 'CLIPPER BLOCKED'],
    ['not_reached', 'BSP NOT REACHED'],
    ['no_linedef', 'NO LINEDEF'],
  ];

  ctx.font = '11px monospace';
  ctx.textBaseline = 'top';

  let y = pad;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(pad - 4, pad - 4, 220, entries.length * lineH + 52);

  ctx.fillStyle = '#ccc';
  ctx.fillText('BSP VISIBILITY DEBUG', pad, y);
  y += lineH + 4;

  for (const [reason, label] of entries) {
    ctx.fillStyle = REASON_COLOR[reason];
    ctx.fillRect(pad, y + 2, 10, 10);
    ctx.fillStyle = '#aaa';
    const count =
      reason === 'visible'
        ? trace.stats.visible
        : reason === 'validcount'
          ? trace.stats.validcount
          : reason === 'backface'
            ? trace.stats.backface
            : reason === 'clip'
              ? trace.stats.clip
              : reason === 'not_reached'
                ? trace.stats.notReached
                : trace.stats.noLinedef;
    ctx.fillText(`${label}: ${count}`, pad + 14, y);
    y += lineH;
  }

  y += 4;
  ctx.fillStyle = '#7af';
  ctx.fillText(`wall draws: ${trace.stats.wallDrawEntries}`, pad, y);
  y += lineH;
  ctx.fillText(`sector: ${trace.cameraSectorIndex}  sub: ${trace.cameraSubsector}`, pad, y);
  y += lineH;
  ctx.fillText(`visited subsectors: ${trace.stats.visitedSubsectorCount}`, pad, y);
}
