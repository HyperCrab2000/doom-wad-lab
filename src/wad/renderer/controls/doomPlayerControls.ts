import { mat4 } from 'gl-matrix';
import {
  playerEyeHeight,
  playerMaxStepHeight,
  playerRadius,
} from '@/wad/constants/GameInfo';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import { MapBuffers } from '@/wad/renderer/geometry/createBuffers';
import {
  DOOM_RUN_SPEED,
  DOOM_WALK_SPEED,
  approachWorldHeight,
  getBlockingCircles,
  getCachedBlockingSegments,
  getDesiredVelocity,
  getGroundStepSpeed,
  getPlayerFeetZ,
  invalidateBlockingSegmentCache,
  isMovementKey,
  isSectorWalkable,
  isShiftHeld,
  moveCircleAgainstObstacles,
} from './doomCollision';
import { writePlayerViewMatrix } from './playerView';
import { DoorSystem, DoorTriggerResult } from '@/wad/game/doorSystem';
import { findCrossedWalkLines, findUseLine } from '@/wad/game/useLines';
import { findSectorAt as findSectorAtPosition } from '@/wad/renderer/utils/sectorLookup';

interface DoomPlayerControlsOptions {
  canvas: HTMLCanvasElement;
  viewMatrix: mat4;
  map: WadMap;
  buffers: MapBuffers;
  start: { x: number; y: number; angle: number };
  isAutomapActive?: () => boolean;
  onLiquidTransition?: (event: {
    kind: 'enter' | 'exit';
    liquidKind: NonNullable<Sector['liquidKind']>;
    color: [number, number, number];
  }) => void;
  doorSystem?: DoorSystem;
  onDoorUse?: (result: DoorTriggerResult) => void;
  onWalkDoor?: (result: DoorTriggerResult) => void;
}

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  yaw: number;
  pitch: number;
  worldFeetZ: number;
  verticalVelocity: number;
  grounded: boolean;
  sector: Sector | null;
}

export interface PlayerSnapshot {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
}

export interface DoomPlayerControlsHandle {
  unbind: () => void;
  getPlayerState: () => PlayerSnapshot;
}

// Doom default movement is run speed; Shift is the walk/speed key (see p_user.c forwardmove).
const GROUND_ACCELERATION = 3200;
const GROUND_FRICTION = 18;
const JUMP_VELOCITY = 280;
const GRAVITY = 820;
const MOUSE_SENSITIVITY = 0.0024;
const MAX_PITCH = Math.PI * 0.47;

export function doomPlayerControls({
  canvas,
  viewMatrix,
  map,
  buffers,
  start,
  onLiquidTransition,
  doorSystem,
  onDoorUse,
  onWalkDoor,
  isAutomapActive,
}: DoomPlayerControlsOptions): DoomPlayerControlsHandle {
  const startSector = findSectorAtPosition(map, buffers.sectorTriangles, buffers.triangleHash, start);
  const state: PlayerState = {
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    yaw: start.angle,
    pitch: 0,
    worldFeetZ: startSector?.floorheight ?? 0,
    verticalVelocity: 0,
    grounded: true,
    sector: startSector,
  };
  let currentLiquidKind = state.sector?.liquidKind ?? null;

  const keys = new Set<string>();
  let lastTime = performance.now();
  let animationFrame = 0;

  const keyDown = (event: KeyboardEvent) => {
    if (isAutomapActive?.()) {
      return;
    }
    if (event.code === 'KeyE') {
      if (event.repeat) return;
      event.preventDefault();
      tryUseSwitch();
      return;
    }
    if (isMovementKey(event.code)) {
      event.preventDefault();
      keys.add(event.code);
      if (event.code === 'Space' && state.grounded) {
        state.verticalVelocity = JUMP_VELOCITY;
        state.grounded = false;
      }
    }
  };

  const keyUp = (event: KeyboardEvent) => {
    keys.delete(event.code);
  };


  const mouseDown = (event: MouseEvent) => {
    if (isAutomapActive?.()) return;
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.focus();

    // Always attempt use on click — do not wait for pointer lock.
    tryUseSwitch();

    if (document.pointerLockElement === canvas) {
      return;
    }

    void canvas.requestPointerLock().catch(() => {});
  };

  const mouseMove = (event: MouseEvent) => {
    if (isAutomapActive?.()) return;
    if (document.pointerLockElement !== canvas) return;
    state.yaw -= event.movementX * MOUSE_SENSITIVITY;
    // Positive pitch = look up. Browser movementY grows downward.
    state.pitch = clamp(state.pitch - event.movementY * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
  };

  let lastUseSwitchAt = 0;
  const USE_SWITCH_DEBOUNCE_MS = 400;

  const tryUseSwitch = (): boolean => {
    if (!doorSystem) return false;
    const now = performance.now();
    if (now - lastUseSwitchAt < USE_SWITCH_DEBOUNCE_MS) return false;
    const target = findUseLine(map, { x: state.x, y: state.y }, { yaw: state.yaw });
    if (!target) return false;
    const result = doorSystem.tryUseLine(target.lineIndex, target.line);
    if (result.triggered) {
      lastUseSwitchAt = now;
      onDoorUse?.(result);
    }
    return result.triggered;
  };

  const tick = () => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (isAutomapActive?.()) {
      updateViewMatrix(viewMatrix, state);
      animationFrame = requestAnimationFrame(tick);
      return;
    }

    const previousPosition = { x: state.x, y: state.y };
    updateHorizontalVelocity(state, keys, dt);

    const playerFeetZ = getPlayerFeetZ(state.sector, state.worldFeetZ, state.grounded);
    const floorZ = state.sector?.floorheight ?? playerFeetZ;
    const airborne = !state.grounded || state.worldFeetZ > floorZ + 0.5;
    const blockingSegments = getCachedBlockingSegments(
      map,
      playerFeetZ,
      state.sector ? map.SECTORS.indexOf(state.sector) : -1
    );
    const blockingCircles = getBlockingCircles(map, playerFeetZ, (position) =>
      findSectorAtPosition(map, buffers.sectorTriangles, buffers.triangleHash, position)
    );
    const moveAgainstObstacles = (
      position: { x: number; y: number },
      delta: { x: number; y: number }
    ) =>
      moveCircleAgainstObstacles(
        position,
        delta,
        playerRadius,
        blockingSegments,
        blockingCircles
      );

    const next = moveAgainstObstacles(
      { x: state.x, y: state.y },
      { x: state.vx * dt, y: state.vy * dt }
    );
    const nextSector = findSectorAtPosition(map, buffers.sectorTriangles, buffers.triangleHash, next) ?? state.sector;
    if (nextSector && isSectorWalkable(state.sector, nextSector, airborne)) {
      const previousSector = state.sector;
      applySectorTransition(state, next, nextSector, airborne);
      const nextLiquidKind = nextSector.liquidKind ?? null;
      if (nextLiquidKind !== currentLiquidKind) {
        if (nextLiquidKind) {
          onLiquidTransition?.({
            kind: 'enter',
            liquidKind: nextLiquidKind,
            color: nextSector.liquidColor ?? [0.18, 0.45, 0.95],
          });
        } else if (currentLiquidKind) {
          onLiquidTransition?.({
            kind: 'exit',
            liquidKind: currentLiquidKind,
            color: previousSector?.liquidColor ?? [0.18, 0.45, 0.95],
          });
        }
        currentLiquidKind = nextLiquidKind;
      }
    } else {
      const slideX = moveAgainstObstacles(
        { x: state.x, y: state.y },
        { x: state.vx * dt, y: 0 }
      );
      const slideXSector = findSectorAtPosition(map, buffers.sectorTriangles, buffers.triangleHash, slideX) ?? state.sector;
      if (slideXSector && isSectorWalkable(state.sector, slideXSector, airborne)) {
        applySectorTransition(state, slideX, slideXSector, airborne);
        state.vy = 0;
      } else {
        const slideY = moveAgainstObstacles(
          { x: state.x, y: state.y },
          { x: 0, y: state.vy * dt }
        );
        const slideYSector = findSectorAtPosition(map, buffers.sectorTriangles, buffers.triangleHash, slideY) ?? state.sector;
        if (slideYSector && isSectorWalkable(state.sector, slideYSector, airborne)) {
          applySectorTransition(state, slideY, slideYSector, airborne);
          state.vx = 0;
        } else {
          state.vx = 0;
          state.vy = 0;
        }
      }
    }

    if (doorSystem && (previousPosition.x !== state.x || previousPosition.y !== state.y)) {
      for (const crossed of findCrossedWalkLines(map, previousPosition, { x: state.x, y: state.y })) {
        const result = doorSystem.tryWalkLine(crossed.lineIndex, crossed.line);
        if (result.triggered) {
          onWalkDoor?.(result);
        }
      }
    }

    updateVerticalMotion(state, dt);
    updateViewMatrix(viewMatrix, state);
    animationFrame = requestAnimationFrame(tick);
  };

  updateViewMatrix(viewMatrix, state);
  animationFrame = requestAnimationFrame(tick);

  canvas.addEventListener('mousedown', mouseDown);
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);

  return {
    unbind: () => {
      cancelAnimationFrame(animationFrame);
      invalidateBlockingSegmentCache();
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
      canvas.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('mousemove', mouseMove);
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
    },
    getPlayerState: (): PlayerSnapshot => ({
      x: state.x,
      y: state.y,
      yaw: state.yaw,
      pitch: state.pitch,
    }),
  };
}

export function findSectorAt(
  map: WadMap,
  buffers: MapBuffers,
  position: { x: number; y: number }
): Sector | null {
  return findSectorAtPosition(map, buffers.sectorTriangles, buffers.triangleHash, position);
}

function updateViewMatrix(viewMatrix: mat4, state: PlayerState) {
  writePlayerViewMatrix(viewMatrix, state);
}

function applySectorTransition(
  state: PlayerState,
  position: { x: number; y: number },
  nextSector: Sector,
  _airborne: boolean
) {
  const previousFloor = state.sector?.floorheight ?? state.worldFeetZ;
  state.x = position.x;
  state.y = position.y;
  state.sector = nextSector;

  const drop = previousFloor - nextSector.floorheight;
  if (drop > playerMaxStepHeight) {
    state.grounded = false;
    state.verticalVelocity = 0;
  } else if (drop > 0) {
    state.worldFeetZ = nextSector.floorheight;
  }
}

function updateHorizontalVelocity(state: PlayerState, keys: Set<string>, dt: number) {
  const maxSpeed = isShiftHeld(keys) ? DOOM_WALK_SPEED : DOOM_RUN_SPEED;
  const desired = getDesiredVelocity(keys, state.yaw, 1);
  const hasInput = desired.x !== 0 || desired.y !== 0;

  if (hasInput) {
    state.vx += desired.x * GROUND_ACCELERATION * dt;
    state.vy += desired.y * GROUND_ACCELERATION * dt;
  } else {
    const friction = Math.max(0, 1 - GROUND_FRICTION * dt);
    state.vx *= friction;
    state.vy *= friction;
  }

  const speed = Math.hypot(state.vx, state.vy);
  if (speed > maxSpeed) {
    state.vx = (state.vx / speed) * maxSpeed;
    state.vy = (state.vy / speed) * maxSpeed;
  }

  if (!hasInput && Math.hypot(state.vx, state.vy) < 1) {
    state.vx = 0;
    state.vy = 0;
  }
}

function updateVerticalMotion(state: PlayerState, dt: number) {
  const floorZ = state.sector?.floorheight ?? state.worldFeetZ;
  const ceilingZ = state.sector?.ceilingheight ?? floorZ + playerEyeHeight;
  const maxFeetZ = ceilingZ - playerEyeHeight - 4;

  if (!state.grounded) {
    state.verticalVelocity -= GRAVITY * dt;
    state.worldFeetZ += state.verticalVelocity * dt;

    if (state.worldFeetZ <= floorZ) {
      state.worldFeetZ = floorZ;
      state.verticalVelocity = 0;
      state.grounded = true;
    }
  } else {
    state.verticalVelocity = 0;
    const stepSpeed = getGroundStepSpeed(Math.hypot(state.vx, state.vy));
    state.worldFeetZ = approachWorldHeight(state.worldFeetZ, floorZ, stepSpeed * dt);
  }

  if (state.worldFeetZ > maxFeetZ) {
    state.worldFeetZ = maxFeetZ;
    if (!state.grounded) {
      state.verticalVelocity = Math.min(0, state.verticalVelocity);
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

