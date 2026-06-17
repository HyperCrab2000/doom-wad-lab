import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';
import { playerEyeHeight } from '@/wad/constants/GameInfo';
import { Sector } from '@/wad/interfaces/Sector';
import {
  automapFollowRotationRadians,
  bspDebugMapRotationRadians,
  doomAngleToYaw,
  doomYawToCanvasAngle,
  getPlayerEyeZ,
  getViewAnglesFromViewMatrix,
  projectDoomOffsetToAutomapCanvas,
  writePlayerViewMatrix,
} from '@/wad/renderer/controls/playerView';

describe('player view placement', () => {
  it('converts Doom start angles to normalized yaw radians', () => {
    expect(doomAngleToYaw(0)).toBeCloseTo(0);
    expect(doomAngleToYaw(90)).toBeCloseTo(Math.PI / 2);
    expect(doomAngleToYaw(360)).toBeCloseTo(0);
    expect(doomAngleToYaw(-90)).toBeCloseTo(Math.PI * 1.5);
  });

  it('places the camera at Doomguy eye height above the feet', () => {
    expect(getPlayerEyeZ(sector(24, 128), 24)).toBe(24 + playerEyeHeight);
  });

  it('keeps the eye below low ceilings', () => {
    expect(getPlayerEyeZ(sector(0, 40), 0)).toBe(36);
  });

  it('writes the expected world-space camera translation for Doom coordinates', () => {
    const view = mat4.create();
    writePlayerViewMatrix(view, {
      x: 10,
      y: 20,
      yaw: doomAngleToYaw(0),
      pitch: 0,
      worldFeetZ: 0,
      sector: sector(0, 128),
    });

    const inverse = mat4.invert(mat4.create(), view)!;
    expect(inverse[12]).toBeCloseTo(10);
    expect(inverse[13]).toBeCloseTo(playerEyeHeight);
    expect(inverse[14]).toBeCloseTo(-20);
  });

  it('can recover yaw and pitch from the player view matrix for sky rendering', () => {
    const view = mat4.create();
    writePlayerViewMatrix(view, {
      x: 0,
      y: 0,
      yaw: doomAngleToYaw(90),
      pitch: 0.25,
      worldFeetZ: 0,
      sector: sector(0, 128),
    });

    const angles = getViewAnglesFromViewMatrix(view);
    expect(angles.yaw).toBeCloseTo(Math.PI / 2);
    expect(angles.pitch).toBeCloseTo(0.25);
  });

  it('uses positive pitch to look upward in the Y-up world', () => {
    const view = mat4.create();
    writePlayerViewMatrix(view, {
      x: 0,
      y: 0,
      yaw: 0,
      pitch: 0.2,
      worldFeetZ: 0,
      sector: sector(0, 128),
    });

    const invView = mat4.invert(mat4.create(), view)!;
    const forwardY = -invView[9];
    expect(forwardY).toBeGreaterThan(0);
  });

  it('maps mouse-up to increasing pitch (look up)', () => {
    let pitch = 0;
    const sensitivity = 0.0024;
    const mouseUpDelta = -12;
    pitch = pitch - mouseUpDelta * sensitivity;
    expect(pitch).toBeGreaterThan(0);

    const view = mat4.create();
    writePlayerViewMatrix(view, {
      x: 0,
      y: 0,
      yaw: 0,
      pitch,
      worldFeetZ: 0,
      sector: sector(0, 128),
    });

    const angles = getViewAnglesFromViewMatrix(view);
    expect(angles.pitch).toBeGreaterThan(0);
  });

  it('faces into the E1M1 hangar from the player start (angle 90, south on map)', () => {
    const yaw = doomAngleToYaw(90);
    const view = mat4.create();
    writePlayerViewMatrix(view, {
      x: 1056,
      y: -3616,
      yaw,
      pitch: 0,
      worldFeetZ: 0,
      sector: sector(0, 128),
    });

    const invView = mat4.invert(mat4.create(), view)!;
    const forward = [-invView[8], -invView[9], -invView[10]];
    const len = Math.hypot(forward[0], forward[1], forward[2]);
    const doomX = forward[0] / len;
    const doomY = -forward[2] / len;

    // Spawn is 32 units from the north wall; gameplay forward is south (+y).
    expect(doomX).toBeCloseTo(0, 5);
    expect(doomY).toBeGreaterThan(0.9);
    expect(getViewAnglesFromViewMatrix(view).yaw).toBeCloseTo(yaw, 5);
  });

  it('maps Doom forward to the north-up automap canvas direction', () => {
    const south = projectDoomOffsetToAutomapCanvas(Math.cos(Math.PI / 2), Math.sin(Math.PI / 2));
    expect(south.x).toBeCloseTo(0);
    expect(south.y).toBeLessThan(0);

    const east = projectDoomOffsetToAutomapCanvas(Math.cos(0), Math.sin(0));
    expect(east.x).toBeGreaterThan(0);
    expect(east.y).toBeCloseTo(0);

    expect(doomYawToCanvasAngle(Math.PI / 2)).toBeCloseTo(0);
    expect(doomYawToCanvasAngle(0)).toBeCloseTo(Math.PI / 2);
  });

  it('matches 3D view yaw to the automap arrow rotation', () => {
    for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const yaw = doomAngleToYaw(degrees);
      const view = mat4.create();
      writePlayerViewMatrix(view, {
        x: 0,
        y: 0,
        yaw,
        pitch: 0.2,
        worldFeetZ: 0,
        sector: sector(0, 128),
      });
      expect(getViewAnglesFromViewMatrix(view).yaw).toBeCloseTo(yaw, 5);
      expect(doomYawToCanvasAngle(getViewAnglesFromViewMatrix(view).yaw)).toBeCloseTo(
        doomYawToCanvasAngle(yaw),
        5
      );
    }
  });

  it('uses the same rotation as the automap so forward points up on screen', () => {
    expect(bspDebugMapRotationRadians(Math.PI / 2)).toBeCloseTo(automapFollowRotationRadians(Math.PI / 2));
    expect(bspDebugMapRotationRadians(0)).toBeCloseTo(-Math.PI / 2);
  });

  it('rotates follow-mode forward to the top of the canvas', () => {
    for (const degrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const yaw = doomAngleToYaw(degrees);
      const forward = projectDoomOffsetToAutomapCanvas(Math.cos(yaw), Math.sin(yaw));
      const angle = automapFollowRotationRadians(yaw);
      const rotatedX = forward.x * Math.cos(angle) - forward.y * Math.sin(angle);
      const rotatedY = forward.x * Math.sin(angle) + forward.y * Math.cos(angle);
      expect(rotatedX).toBeCloseTo(0, 3);
      expect(rotatedY).toBeLessThan(0);
    }
  });
});

function sector(floorheight: number, ceilingheight: number): Sector {
  return {
    floorheight,
    ceilingheight,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel: 255,
    type: 0,
    tag: 0,
  };
}
