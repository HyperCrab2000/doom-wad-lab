/** Palette fallback only — do not override atlas texels with liquid tints. */
export function dampEmissiveForPathTrace(
  _name: string,
  rgb: [number, number, number],
  _surfaceKind: 0 | 1 | 2
): [number, number, number] {
  const lum = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  if (lum > 0.88) {
    return [rgb[0] * 0.52, rgb[1] * 0.52, rgb[2] * 0.52];
  }
  return rgb;
}

export function remapColorsForPathTrace(
  source: ReadonlyMap<string, [number, number, number]>,
  surfaceKind: 0 | 1 | 2
): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  for (const [name, rgb] of source) {
    out.set(name, dampEmissiveForPathTrace(name, rgb, surfaceKind));
  }
  return out;
}
