/** Minimum per-sector shader draw distance (dark sectors). */
export const MIN_VISIBILITY_DISTANCE = 640;

/** Maximum per-sector shader draw distance (bright sectors). */
export const MAX_VISIBILITY_DISTANCE = 3200;

/** CPU-side distance margin added on top of per-sector visibility. */
export const VISIBILITY_DISTANCE_MARGIN = 384;

/** Max horizontal reach for portal flood-fill from the camera sector. */
export const PORTAL_VISIBILITY_RADIUS = 4096;

/** Safety cap on portal graph traversal depth. */
export const MAX_PORTAL_TRAVERSAL_DEPTH = 96;

/** Sphere radius used for frustum point tests (map units). */
export const FRUSTUM_CULL_RADIUS = 160;

/** Extra margin added to mesh bounds for frustum tests. */
export const FRUSTUM_BOUNDS_MARGIN = 16;

/** Skip CPU back-face cull when the camera is this close to the wall plane. */
export const WALL_FACING_CULL_DISTANCE = 96;

/** Fallback when a sector has no precomputed visibility distance. */
export const DEFAULT_VISIBILITY_DISTANCE = 2200;
