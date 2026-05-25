import { describe, expect, it } from 'vitest';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import { WadMap } from '@/wad/interfaces/WadMap';
import {
  applySectorFloorLighting,
  classifyFlatLiquid,
  createThingPointLights,
  getFlatFogAndGlow,
  getFloorLiquidDrawUniforms,
  getLiquidSurface,
  getSectorVisibilityDistance,
  getTextureSurfaceGlow,
  getThingLight,
} from './sectorLighting';
import {
  computeDynamicLightAt,
  computeNearestLightUniforms,
  selectNearbyPointLights,
} from '@/wad/renderer/utils/precomputedLights';

describe('sector lighting heuristics', () => {
  it('assigns warm light to candles and colored light to firesticks', () => {
    expect(getThingLight(thing(34))?.color).toEqual([1.0, 0.62, 0.28]);
    expect(getThingLight(thing(44))?.color).toEqual([0.18, 0.45, 1.0]);
    expect(getThingLight(thing(46))?.color).toEqual([1.0, 0.22, 0.08]);
  });

  it('derives slime fog and glow from flat names', () => {
    const slime = getFlatFogAndGlow('NUKAGE1');

    expect(slime.glowColor[1]).toBeGreaterThan(slime.glowColor[0]);
    expect(slime.fogDensity).toBeGreaterThan(0.5);
  });

  it('assigns glow to lava flats and fire wall textures', () => {
    const lava = getTextureSurfaceGlow('LAVA1');
    const fireWall = getTextureSurfaceGlow('FIRELAVA');
    const stone = getTextureSurfaceGlow('STONE3');

    expect(lava?.animated).toBe(true);
    expect(lava?.color[0]).toBeGreaterThan(lava?.color[1] ?? 0);
    expect(fireWall?.strength).toBeGreaterThan(0);
    expect(stone).toBeNull();
  });

  it('uses distinct colors for each liquid flat type', () => {
    const slime = classifyFlatLiquid('NUKAGE1');
    const water = classifyFlatLiquid('FWATER1');
    const lava = classifyFlatLiquid('LAVA1');
    const blood = classifyFlatLiquid('BLOOD1');

    expect(slime?.kind).toBe('slime');
    expect(water?.kind).toBe('water');
    expect(lava?.kind).toBe('lava');
    expect(blood?.kind).toBe('blood');

    expect(slime?.color[1]).toBeGreaterThan(slime?.color[0] ?? 0);
    expect(water?.color[2]).toBeGreaterThan(water?.color[0] ?? 0);
    expect(water?.color[2]).toBeLessThan(0.5);
    expect(lava?.color[0]).toBeGreaterThan(lava?.color[1] ?? 0);
    expect(blood?.color[0]).toBeGreaterThan(blood?.color[1] ?? 0);
  });

  it('classifies liquid surfaces for shader waves and splashes', () => {
    expect(getLiquidSurface('NUKAGE1')?.kind).toBe('slime');
    expect(getLiquidSurface('FWATER1')?.kind).toBe('water');
    expect(getLiquidSurface('SWATER2')?.kind).toBe('water');
    expect(getLiquidSurface('LAVA1')?.kind).toBe('lava');
    expect(getLiquidSurface('FLOOR0_1')).toBeNull();
  });

  it('applies floor-only liquid colors per sector', () => {
    const sector = makeSector();
    applySectorFloorLighting(sector, 'LAVA1', [1, 1, 1]);

    expect(sector.liquidKind).toBe('lava');
    expect(sector.liquidColor?.[0]).toBeGreaterThan(sector.liquidColor?.[1] ?? 0);
    expect(sector.glowColor?.[0]).toBeGreaterThan(sector.glowColor?.[1] ?? 0);
  });

  it('returns reflective water and emissive lava floors', () => {
    const water = getFloorLiquidDrawUniforms('FWATER1');
    const slime = getFloorLiquidDrawUniforms('NUKAGE1');
    const lava = getFloorLiquidDrawUniforms('LAVA1');

    expect(water.liquidStrength).toBeGreaterThan(0);
    expect(water.liquidEmissive).toBe(0);
    expect(water.glowColor).toEqual([0, 0, 0]);
    expect(water.liquidColor[2]).toBeLessThan(0.5);
    expect(slime.liquidEmissive).toBeGreaterThan(0);
    expect(lava.liquidEmissive).toBeGreaterThan(0);
  });

  it('creates radial point lights from lamp things', () => {
    const sector = makeSector();
    const candle = thing(35);
    const map = { SECTORS: [sector], THINGS: [candle] } as unknown as WadMap;
    const sectorsByThing = new Map<Thing, Sector>([[candle, sector]]);

    const lights = createThingPointLights(map, sectorsByThing, () => 56);

    expect(lights).toHaveLength(1);
    expect(lights[0].color[0]).toBeGreaterThan(lights[0].color[2]);
    expect(lights[0].radius).toBeGreaterThan(0);
    expect(lights[0].position[1]).toBeGreaterThan(sector.floorheight + 40);
    expect(lights[0].sourceThing).toBe(candle);
  });

  it('places electrical columns at mid-height and torches near the flame', () => {
    const sector = makeSector();
    const torch = thing(46);
    const pillar = thing(48);
    const map = { SECTORS: [sector], THINGS: [torch, pillar] } as unknown as WadMap;
    const sectorsByThing = new Map<Thing, Sector>([
      [torch, sector],
      [pillar, sector],
    ]);

    const lights = createThingPointLights(map, sectorsByThing, (entry) => (entry === torch ? 128 : 128));

    expect(lights).toHaveLength(2);
    const torchLight = lights.find((light) => light.sourceThing === torch)!;
    const pillarLight = lights.find((light) => light.sourceThing === pillar)!;
    expect(torchLight.position[1]).toBeGreaterThan(pillarLight.position[1]);
  });

  it('falls off with distance instead of tinting the whole sector', () => {
    const sector = makeSector();
    const blueTorch = thing(44);
    const lights = createThingPointLights(
      { SECTORS: [sector], THINGS: [blueTorch] } as unknown as WadMap,
      new Map([[blueTorch, sector]])
    );

    expect(lights).toHaveLength(1);

    const nearPos = lights[0].position;
    const farPos: [number, number, number] = [
      lights[0].position[0] + lights[0].radius * 2,
      lights[0].position[1],
      lights[0].position[2],
    ];

    const near = computeDynamicLightAt(lights, nearPos);
    const far = computeDynamicLightAt(lights, farPos);
    const selfExcluded = computeDynamicLightAt(lights, nearPos, { excludeThing: blueTorch });

    expect(near[2]).toBeGreaterThan(far[2]);
    expect(selfExcluded).toEqual([0, 0, 0]);
    expect(computeNearestLightUniforms(lights, farPos).uPointLightCount).toBe(0);
    expect(selectNearbyPointLights(lights, farPos)).toHaveLength(0);
  });

  it('maps brighter sectors to longer visibility distance', () => {
    expect(getSectorVisibilityDistance(makeSector(32))).toBeLessThan(
      getSectorVisibilityDistance(makeSector(224))
    );
  });
});

function thing(type: number): Thing {
  return {
    x: 128,
    y: 64,
    angle: 0,
    type,
    flags: {
      difficulty: 0,
      isDeaf: false,
      hideInSingleplayer: false,
      appearsOnHard: true,
    },
  };
}

function makeSector(lightlevel = 160): Sector {
  return {
    floorheight: 0,
    ceilingheight: 128,
    floorpic: 'FLOOR0_1',
    ceilingpic: 'CEIL1_1',
    lightlevel,
    lightIntensity: 0.6,
    type: 0,
    tag: 0,
  };
}
