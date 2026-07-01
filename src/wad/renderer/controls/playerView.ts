import { mat4, vec3 } from 'gl-matrix';
import { playerEyeHeight } from '@/wad/constants/GameInfo';
import { Sector } from '@/wad/interfaces/Sector';

export interface PlayerViewState {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  worldFeetZ: number;
  sector: Sector | null;
}

export function doomAngleToYaw(angleDegrees: number): number {
  return normalizeRadians((angleDegrees * Math.PI) / 180);
}

export function getPlayerEyeZ(sector: Sector | null, worldFeetZ: number): number {
  const ceilingHeight = sector?.ceilingheight ?? worldFeetZ + playerEyeHeight;
  return Math.min(worldFeetZ + playerEyeHeight, ceilingHeight - 4);
}

export function writePlayerViewMatrix(viewMatrix: mat4, state: PlayerViewState): void {
  const cameraPos = vec3.fromValues(state.x, getPlayerEyeZ(state.sector, state.worldFeetZ), -state.y);

  mat4.identity(viewMatrix);
  // Positive pitch = look up; negate for the view matrix X rotation.
  mat4.rotateX(viewMatrix, viewMatrix, -state.pitch);
  mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - state.yaw);
  mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), cameraPos));
}

export function getViewAnglesFromViewMatrix(viewMatrix: mat4): { yaw: number; pitch: number } {
  const invView = mat4.invert(mat4.create(), viewMatrix);
  if (!invView) {
    return { yaw: 0, pitch: 0 };
  }

  const forward = vec3.fromValues(-invView[8], -invView[9], -invView[10]);
  vec3.normalize(forward, forward);

  return {
    yaw: normalizeRadians(Math.atan2(-forward[2], forward[0])),
    pitch: Math.asin(Math.max(-1, Math.min(1, forward[1]))),
  };
}

function normalizeRadians(value: number): number {
  const fullTurn = Math.PI * 2;
  return ((value % fullTurn) + fullTurn) % fullTurn;
}

/** Canvas rotation (Y-down) for a Doom yaw on north-up automap / player arrow. */
export function doomYawToCanvasAngle(yaw: number): number {
  return Math.PI / 2 - yaw;
}

/** Project a Doom XY offset to north-up automap canvas coords (Y-down, north at top). */
export function projectDoomOffsetToAutomapCanvas(dx: number, dy: number): { x: number; y: number } {
  return { x: dx, y: -dy };
}

/** Rotate north-up automap so player forward points toward the top of the screen. */
export function automapFollowRotationRadians(yaw: number): number {
  return yaw - Math.PI / 2;
}

/** @deprecated Use automapFollowRotationRadians for follow-mode map rotation. */
export function automapRotationRadians(yaw: number): number {
  return doomYawToCanvasAngle(yaw);
}

/** BSP debug overlay — rotate the map so player forward points up (follow mode). */
export function bspDebugMapRotationRadians(yaw: number): number {
  return automapFollowRotationRadians(yaw);
}
