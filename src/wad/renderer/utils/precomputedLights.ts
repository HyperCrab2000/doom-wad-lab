import { PointLight } from '@/wad/renderer/renderGame/sectorLighting';

export interface PrecomputedLightUniforms {
  uPointLightCount: number;
  uPointLightPosition0: [number, number, number];
  uPointLightPosition1: [number, number, number];
  uPointLightPosition2: [number, number, number];
  uPointLightPosition3: [number, number, number];
  uPointLightColor0: [number, number, number];
  uPointLightColor1: [number, number, number];
  uPointLightColor2: [number, number, number];
  uPointLightColor3: [number, number, number];
  uPointLightRadius0: number;
  uPointLightRadius1: number;
  uPointLightRadius2: number;
  uPointLightRadius3: number;
  uPointLightIntensity0: number;
  uPointLightIntensity1: number;
  uPointLightIntensity2: number;
  uPointLightIntensity3: number;
}

export const EMPTY_LIGHT_UNIFORMS: PrecomputedLightUniforms = {
  uPointLightCount: 0,
  uPointLightPosition0: [0, 0, 0],
  uPointLightPosition1: [0, 0, 0],
  uPointLightPosition2: [0, 0, 0],
  uPointLightPosition3: [0, 0, 0],
  uPointLightColor0: [0, 0, 0],
  uPointLightColor1: [0, 0, 0],
  uPointLightColor2: [0, 0, 0],
  uPointLightColor3: [0, 0, 0],
  uPointLightRadius0: 1,
  uPointLightRadius1: 1,
  uPointLightRadius2: 1,
  uPointLightRadius3: 1,
  uPointLightIntensity0: 0,
  uPointLightIntensity1: 0,
  uPointLightIntensity2: 0,
  uPointLightIntensity3: 0,
};

function distanceSq(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function radialContribution(
  light: PointLight,
  worldPos: [number, number, number]
): [number, number, number] {
  const dist = Math.sqrt(distanceSq(light.position, worldPos));
  if (dist >= light.radius) {
    return [0, 0, 0];
  }

  const t = 1 - dist / light.radius;
  const falloff = t * t * (3 - 2 * t);
  const strength = light.intensity * falloff;
  return [
    light.color[0] * strength,
    light.color[1] * strength,
    light.color[2] * strength,
  ];
}

export interface DynamicLightOptions {
  excludeThing?: Thing;
}

function shouldIncludeLight(light: PointLight, options?: DynamicLightOptions): boolean {
  if (!options?.excludeThing || !light.sourceThing) return true;
  return light.sourceThing !== options.excludeThing;
}

export function selectNearbyPointLights(
  lights: PointLight[],
  worldPos: [number, number, number],
  maxLights = 4,
  options?: DynamicLightOptions
): PointLight[] {
  return lights
    .filter((light) => shouldIncludeLight(light, options))
    .map((light) => ({
      light,
      distanceSq: distanceSq(light.position, worldPos),
    }))
    .filter(({ light, distanceSq: distSq }) => distSq <= light.radius * light.radius)
    .sort((a, b) => a.distanceSq - b.distanceSq)
    .slice(0, maxLights)
    .map((entry) => entry.light);
}

export function computeDynamicLightAt(
  lights: PointLight[],
  worldPos: [number, number, number],
  options?: DynamicLightOptions
): [number, number, number] {
  const nearby = selectNearbyPointLights(lights, worldPos, 4, options);
  let r = 0;
  let g = 0;
  let b = 0;

  for (const light of nearby) {
    const contribution = radialContribution(light, worldPos);
    r += contribution[0];
    g += contribution[1];
    b += contribution[2];
  }

  return [r, g, b];
}

export function computeNearestLightUniforms(
  lights: PointLight[],
  worldPos: [number, number, number],
  options?: DynamicLightOptions
): PrecomputedLightUniforms {
  const nearest = selectNearbyPointLights(lights, worldPos, 4, options);
  if (nearest.length === 0) return EMPTY_LIGHT_UNIFORMS;

  const uniforms: PrecomputedLightUniforms = {
    ...EMPTY_LIGHT_UNIFORMS,
    uPointLightCount: nearest.length,
  };

  nearest.forEach((light, index) => {
    switch (index) {
      case 0:
        uniforms.uPointLightPosition0 = light.position;
        uniforms.uPointLightColor0 = light.color;
        uniforms.uPointLightRadius0 = light.radius;
        uniforms.uPointLightIntensity0 = light.intensity;
        break;
      case 1:
        uniforms.uPointLightPosition1 = light.position;
        uniforms.uPointLightColor1 = light.color;
        uniforms.uPointLightRadius1 = light.radius;
        uniforms.uPointLightIntensity1 = light.intensity;
        break;
      case 2:
        uniforms.uPointLightPosition2 = light.position;
        uniforms.uPointLightColor2 = light.color;
        uniforms.uPointLightRadius2 = light.radius;
        uniforms.uPointLightIntensity2 = light.intensity;
        break;
      case 3:
        uniforms.uPointLightPosition3 = light.position;
        uniforms.uPointLightColor3 = light.color;
        uniforms.uPointLightRadius3 = light.radius;
        uniforms.uPointLightIntensity3 = light.intensity;
        break;
      default:
        break;
    }
  });

  return uniforms;
}
