export interface MonsterState {
  angle: number; // in degrees
  pitch: number; // in degrees
  roll: number; // in degrees
  targetX: number; // world-space target x
  targetY: number; // world-space target y
  smooth: boolean; // smooth interpolation toggle
}

/**
 * Calculates the minimal difference between two angles (-180 to +180).
 */
export function deltaAngle(current: number, target: number): number {
  let diff = target - current;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

/**
 * Updates the monster's angle smoothly or instantly.
 */
export function updateAngle(state: MonsterState, speed: number = 9): void {
  const { angle, targetX, targetY, smooth } = state;

  const desiredAngle = Math.atan2(targetY, targetX) * (180 / Math.PI);
  const diff = deltaAngle(angle, desiredAngle);

  if (smooth) {
    if (Math.abs(diff) <= speed) {
      state.angle = desiredAngle;
    } else {
      state.angle += diff < 0 ? -speed : speed;
    }
  } else {
    state.angle = desiredAngle;
  }
  // Normalize
  if (state.angle >= 360) state.angle -= 360;
  if (state.angle < 0) state.angle += 360;
}
