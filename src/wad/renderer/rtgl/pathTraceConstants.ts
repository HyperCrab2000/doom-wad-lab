/** Max triangles traced per pixel (must match pathTrace.frag loop bound). */
export const MAX_TRACE_TRIANGLES = 16384;

/** surfaceKind in packed triangle metadata */
export const SURFACE_WALL = 0;
export const SURFACE_FLAT_FLOOR = 1;
export const SURFACE_SPRITE = 2;
export const SURFACE_FLAT_CEILING = 3;

/** @deprecated use SURFACE_FLAT_FLOOR */
export const SURFACE_FLAT = SURFACE_FLAT_FLOOR;

export function isFlatSurfaceKind(surfaceKind: number): boolean {
  return surfaceKind === SURFACE_FLAT_FLOOR || surfaceKind === SURFACE_FLAT_CEILING;
}
