import { describe, expect, it } from 'vitest';
import { mat4 } from 'gl-matrix';
import { playerEyeHeight } from '@/wad/constants/GameInfo';
import { Sector } from '@/wad/interfaces/Sector';
import {
  doomAngleToYaw,
  getPlayerEyeZ,
  getViewAnglesFromViewMatrix,
  writePlayerViewMatrix,
} from './playerView';

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
