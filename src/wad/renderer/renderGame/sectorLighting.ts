import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import {
  MAX_VISIBILITY_DISTANCE,
  MIN_VISIBILITY_DISTANCE,
} from '@/wad/constants/RenderInfo';
import { Sector } from '@/wad/interfaces/Sector';
import { Thing } from '@/wad/interfaces/Thing';
import { WadMap } from '@/wad/interfaces/WadMap';
import { hasValidFlags } from '@/wad/renderer/utils/hasValidFlags';

export interface ThingLight {
  color: [number, number, number];
  intensity: number;
  radius: number;
  /** Where the point light sits on the sprite; electrical columns glow along the full height. */
  emitMode: 'flameTop' | 'fullColumn';
  /** 0 = sprite base, 1 = sprite top; used when emitMode is flameTop. */
  flameHeight?: number;
}

export interface PointLight {
  position: [number, number, number];
  color: [number, number, number];
  intensity: number;
  radius: number;
  sourceThing?: Thing;
}

export interface LiquidSurface {
  kind: NonNullable<Sector['liquidKind']>;
  color: [number, number, number];
  strength: number;
}

export interface FlatSurfaceLighting {
  glowColor: [number, number, number];
  fogColor: [number, number, number];
  fogDensity: number;
  lightBoost: number;
}

export interface SurfaceGlow {
  color: [number, number, number];
  strength: number;
  animated: boolean;
}

const LIQUID_BY_KIND: Record<NonNullable<Sector['liquidKind']>, LiquidSurface & { emissive: number }> = {
  slime: { kind: 'slime', color: [0.12, 0.88, 0.14], strength: 1.0, emissive: 1.0 },
  water: { kind: 'water', color: [0.16, 0.24, 0.32], strength: 0.32, emissive: 0.0 },
  lava: { kind: 'lava', color: [1.0, 0.22, 0.02], strength: 0.95, emissive: 1.0 },
  blood: { kind: 'blood', color: [0.88, 0.05, 0.03], strength: 0.55, emissive: 0.85 },
};

const spriteLights: Record<string, ThingLight> = {
  CAND: { color: [1.0, 0.62, 0.28], intensity: 0.38, radius: 112, emitMode: 'flameTop', flameHeight: 0.94 },
  CBRA: { color: [1.0, 0.68, 0.32], intensity: 0.48, radius: 136, emitMode: 'flameTop', flameHeight: 0.86 },
  CEYE: { color: [1.0, 0.12, 0.05], intensity: 0.42, radius: 128, emitMode: 'flameTop', flameHeight: 0.72 },
  COL5: { color: [0.2, 1.0, 0.25], intensity: 0.4, radius: 120, emitMode: 'flameTop', flameHeight: 0.78 },
  COL6: { color: [1.0, 0.2, 0.08], intensity: 0.4, radius: 120, emitMode: 'flameTop', flameHeight: 0.78 },
  ELEC: { color: [0.35, 0.7, 1.0], intensity: 0.46, radius: 168, emitMode: 'fullColumn' },
  FSKU: { color: [1.0, 0.18, 0.08], intensity: 0.38, radius: 112, emitMode: 'flameTop', flameHeight: 0.8 },
  TBLU: { color: [0.18, 0.45, 1.0], intensity: 0.5, radius: 248, emitMode: 'flameTop', flameHeight: 0.92 },
  TGRN: { color: [0.18, 1.0, 0.24], intensity: 0.48, radius: 240, emitMode: 'flameTop', flameHeight: 0.92 },
  TRED: { color: [1.0, 0.22, 0.08], intensity: 0.5, radius: 248, emitMode: 'flameTop', flameHeight: 0.92 },
  SMBT: { color: [0.22, 0.48, 1.0], intensity: 0.42, radius: 168, emitMode: 'flameTop', flameHeight: 0.9 },
  SMGT: { color: [0.2, 1.0, 0.26], intensity: 0.4, radius: 160, emitMode: 'flameTop', flameHeight: 0.9 },
  SMRT: { color: [1.0, 0.24, 0.08], intensity: 0.42, radius: 168, emitMode: 'flameTop', flameHeight: 0.9 },
};

export function getTextureSurfaceGlow(texName: string): SurfaceGlow | null {
  const liquid = classifyFlatLiquid(texName);
  if (liquid) {
    if (liquid.kind === 'water') return null;
    const surface = getFlatFogAndGlow(texName);
    return {
      color: surface.glowColor,
      strength: liquid.kind === 'lava' ? 1.0 : liquid.kind === 'blood' ? 0.85 : 0.75,
      animated: true,
    };
  }

  const name = normalizeFlatName(texName);
  if (
    name.includes('FIRE') ||
    name.includes('MAGMA') ||
    name.includes('LAV') ||
    name.startsWith('BLOD') ||
    name.startsWith('WFALL') ||
    name.startsWith('BFALL')
  ) {
    return {
      color: name.includes('FIRE') || name.includes('LAV') ? [1.0, 0.34, 0.05] : [0.9, 0.08, 0.04],
      strength: 0.72,
      animated: true,
    };
  }

  return null;
}

export function normalizeFlatName(flatName: string): string {
  return flatName.toUpperCase().trim();
}

export function classifyFlatLiquid(flatName: string): LiquidSurface | null {
  const name = normalizeFlatName(flatName);

  if (
    name.startsWith('NUKAGE') ||
    name.startsWith('SLIME') ||
    name.startsWith('SFALL') ||
    name.startsWith('DBRAIN')
  ) {
    return LIQUID_BY_KIND.slime;
  }

  if (name.startsWith('FWATER') || name.startsWith('SWATER') || name.startsWith('WFALL')) {
    return LIQUID_BY_KIND.water;
  }

  if (name.startsWith('LAVA') || name.startsWith('FIRELAVA') || name.startsWith('FIRLAV')) {
    return LIQUID_BY_KIND.lava;
  }

  if (name.startsWith('BLOOD') || name.startsWith('BFALL')) {
    return LIQUID_BY_KIND.blood;
  }

  return null;
}

export function getFloorLiquidDrawUniforms(floorFlatName: string): {
  liquidColor: [number, number, number];
  liquidStrength: number;
  liquidEmissive: number;
  glowColor: [number, number, number];
} {
  const liquid = classifyFlatLiquid(floorFlatName);
  if (!liquid) {
    return {
      liquidColor: [0, 0, 0],
      liquidStrength: 0,
      liquidEmissive: 0,
      glowColor: [0, 0, 0],
    };
  }

  const entry = LIQUID_BY_KIND[liquid.kind];

  return {
    liquidColor: liquid.color,
    liquidStrength: liquid.strength,
    liquidEmissive: entry.emissive,
    glowColor: getFlatFogAndGlow(floorFlatName).glowColor,
  };
}

export function getSectorLiquidDrawUniforms(sector: Sector): {
  liquidColor: [number, number, number];
  liquidStrength: number;
  liquidEmissive: number;
  glowColor: [number, number, number];
} {
  if (!sector.liquidKind) return getFloorLiquidDrawUniforms(sector.floorpic);
  const entry = LIQUID_BY_KIND[sector.liquidKind];
  return {
    liquidColor: sector.liquidColor ?? entry.color,
    liquidStrength: sector.liquidStrength ?? entry.strength,
    liquidEmissive: entry.emissive,
    glowColor: sector.glowColor ?? entry.color,
  };
}

export function getThingLight(thing: Thing): ThingLight | null {
  const thingType = DOOM_THING_MAP_BY_ID[thing.type];
  if (!thingType?.sprite) return null;

  return spriteLights[thingType.sprite] ?? null;
}

export function createThingPointLights(
  map: WadMap,
  sectorsByThing: Map<Thing, Sector>,
  getSpriteHeight?: (thing: Thing) => number | null
): PointLight[] {
  const lights: PointLight[] = [];

  for (const thing of map.THINGS) {
    if (!hasValidFlags(thing)) continue;
    const light = getThingLight(thing);
    const sector = sectorsByThing.get(thing);
    if (!light || !sector) continue;

    const spriteHeight = getSpriteHeight?.(thing) ?? 64;
    const emitHeight =
      light.emitMode === 'fullColumn'
        ? spriteHeight * 0.55
        : spriteHeight * (light.flameHeight ?? 0.92);

    lights.push({
      position: [thing.x, sector.floorheight + emitHeight, -thing.y],
      color: light.color,
      intensity: light.intensity,
      radius: light.radius,
      sourceThing: thing,
    });
  }

  return lights;
}

export function getThingEmissiveUniforms(thing: Thing): {
  emissiveColor: [number, number, number];
  emissiveTopExtent: number;
  emissiveFullColumn: number;
  emissiveStrength: number;
} {
  const light = getThingLight(thing);
  if (!light) {
    return {
      emissiveColor: [0, 0, 0],
      emissiveTopExtent: 0,
      emissiveFullColumn: 0,
      emissiveStrength: 0,
    };
  }

  return {
    emissiveColor: light.color,
    emissiveTopExtent:
      light.emitMode === 'fullColumn' ? 1.0 : Math.max(0.08, 1 - (light.flameHeight ?? 0.85)),
    emissiveFullColumn: light.emitMode === 'fullColumn' ? 1 : 0,
    emissiveStrength: light.intensity,
  };
}

export function getFlatFogAndGlow(flatName: string): FlatSurfaceLighting {
  const liquid = classifyFlatLiquid(flatName);
  if (liquid) {
    switch (liquid.kind) {
      case 'slime':
        return {
          glowColor: [0.12, 0.95, 0.16],
          fogColor: [0.04, 0.18, 0.05],
          fogDensity: 0.9,
          lightBoost: 1.45,
        };
      case 'water':
        return {
          glowColor: [0.0, 0.0, 0.0],
          fogColor: [0.025, 0.028, 0.032],
          fogDensity: 0.35,
          lightBoost: 1.0,
        };
      case 'lava':
        return {
          glowColor: [1.0, 0.28, 0.05],
          fogColor: [0.22, 0.05, 0.02],
          fogDensity: 0.75,
          lightBoost: 1.65,
        };
      case 'blood':
        return {
          glowColor: [0.92, 0.08, 0.04],
          fogColor: [0.18, 0.03, 0.02],
          fogDensity: 0.7,
          lightBoost: 1.55,
        };
    }
  }

  const name = normalizeFlatName(flatName);
  if (name.includes('FIRE')) {
    return {
      glowColor: [1.0, 0.62, 0.16],
      fogColor: [0.22, 0.11, 0.03],
      fogDensity: 0.55,
      lightBoost: 1.45,
    };
  }

  return {
    glowColor: [0, 0, 0],
    fogColor: [0.025, 0.022, 0.02],
    fogDensity: 0.25,
    lightBoost: 1.0,
  };
}

export function getSectorVisibilityDistance(sector: Sector): number {
  const normalized = Math.max(0, Math.min(1, sector.lightlevel / 255));
  return MIN_VISIBILITY_DISTANCE + normalized * (MAX_VISIBILITY_DISTANCE - MIN_VISIBILITY_DISTANCE);
}

/** @deprecated Use classifyFlatLiquid instead. */
export function getLiquidSurface(flatName: string): LiquidSurface | null {
  return classifyFlatLiquid(flatName);
}

export function getFlatAmbientTint(flatName: string): [number, number, number] | null {
  const liquid = classifyFlatLiquid(flatName);
  if (!liquid) return null;

  switch (liquid.kind) {
    case 'slime':
      return [0.18, 0.82, 0.2];
    case 'water':
      return [0.9, 0.91, 0.93];
    case 'lava':
      return [0.92, 0.24, 0.08];
    case 'blood':
      return [0.82, 0.08, 0.06];
  }
}

export function applySectorFloorLighting(
  sector: Sector,
  floorName: string,
  sampledColor: [number, number, number]
): void {
  const surfaceLighting = getFlatFogAndGlow(floorName);
  const liquid = classifyFlatLiquid(floorName);
  const ambientTint = getFlatAmbientTint(floorName);

  sector.ambientColor = ambientTint ?? sampledColor;
  sector.fogColor = surfaceLighting.fogColor;
  sector.fogDensity = surfaceLighting.fogDensity;
  sector.glowColor = liquid ? surfaceLighting.glowColor : [0, 0, 0];

  if (liquid) {
    sector.liquidKind = liquid.kind;
    sector.liquidColor = liquid.color;
    sector.liquidStrength = liquid.strength;
  } else {
    delete sector.liquidKind;
    delete sector.liquidColor;
    delete sector.liquidStrength;
  }

  switch (liquid?.kind) {
    case 'lava':
    case 'blood':
      sector.lightIntensity = 2.0 * surfaceLighting.lightBoost;
      break;
    case 'slime':
      sector.lightIntensity = 1.5 * surfaceLighting.lightBoost;
      break;
    default:
      if (normalizeFlatName(floorName).includes('FIRE')) {
        sector.lightIntensity = 1.2 * surfaceLighting.lightBoost;
      }
      break;
  }
}
