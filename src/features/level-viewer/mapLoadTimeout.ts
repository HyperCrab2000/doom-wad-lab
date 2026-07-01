/** Classic WebGL map geometry + prewarm can stall on slow workers or WASM init. */
export const CLASSIC_MAP_LOAD_TIMEOUT_MS = 120_000;

/** GZDoom WASM first run includes wasm compile + PK3 fetch. */
export const GZDOOM_WASM_MAP_LOAD_TIMEOUT_MS = 180_000;
