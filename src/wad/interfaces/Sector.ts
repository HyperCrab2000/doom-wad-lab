export interface Sector {
  floorheight: number;
  ceilingheight: number;
  floorpic: string;
  ceilingpic: string;
  lightlevel: number;
  type: number;
  tag: number;

  lightIntensity?: number; //normalised light level

  ambientColor?: [number, number, number];

  ambientColorFromWall?: [number, number, number];

  skyLightTint?: [number, number, number];

  glowColor?: [number, number, number];

  fogColor?: [number, number, number];

  fogDensity?: number;

  visibilityDistance?: number;

  pointLightColor?: [number, number, number];

  pointLightIntensity?: number;

  liquidKind?: 'water' | 'slime' | 'lava' | 'blood';

  liquidColor?: [number, number, number];

  liquidStrength?: number;
}
