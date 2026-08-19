import { Wad } from '@/wad/interfaces/Wad';

export interface WadLoadStep {
  label: string;
  message: string;
  complete: boolean;
  active: boolean;
  /** 0–1 fill while active and not yet complete */
  progress: number;
}

export interface WadLoadStatus {
  state: 'idle' | 'cache-hit' | 'loading' | 'ready' | 'error';
  title: string;
  detail: string;
  steps: WadLoadStep[];
  statusLine: string;
  fromCache: boolean;
  loadedAt?: number;
  error?: string;
}

const STEP_DEFS = [
  { label: 'Z_Init', message: 'Init zone memory allocation daemon.' },
  { label: 'W_Init', message: 'Init WADfiles.' },
  { label: 'P_Init', message: 'Init playloop state.' },
  { label: 'R_Init', message: 'Init renderer data.' },
  { label: 'S_Init', message: 'Setting up sound.' },
  { label: 'HU/ST_Init', message: 'Init status bar and HUD.' },
] as const;

export const WAD_LOAD_STEPS = STEP_DEFS.map((step) => step.label);

function createSteps(
  patch: Partial<Record<(typeof STEP_DEFS)[number]['label'], Partial<WadLoadStep>>>
): WadLoadStep[] {
  return STEP_DEFS.map((def) => {
    const override = patch[def.label] ?? {};
    return {
      label: def.label,
      message: override.message ?? def.message,
      complete: override.complete ?? false,
      active: override.active ?? false,
      progress: override.progress ?? 0,
    };
  });
}

function statusFromSteps(steps: WadLoadStep[], fallback: string): string {
  const active = steps.filter((step) => step.active && !step.complete);
  if (active.length > 0) {
    return active.map((step) => `${step.label}: ${step.message}`).join('  ·  ');
  }
  const lastComplete = [...steps].reverse().find((step) => step.complete);
  return lastComplete ? `${lastComplete.label}: ${lastComplete.message}` : fallback;
}

export const initialWadLoadStatus: WadLoadStatus = {
  state: 'idle',
  title: 'No WAD selected',
  detail: 'Choose DOOM.WAD, DOOM2.WAD, or the bundled test WAD to begin.',
  steps: createSteps({}),
  statusLine: 'Select an IWAD to continue.',
  fromCache: false,
};

export function createOpeningStatus(path: string): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { active: true, progress: 0.35, message: 'Init zone memory allocation daemon.' },
    W_Init: { active: true, progress: 0.15, message: `Init WADfiles: ${path}` },
  });

  return {
    ...initialWadLoadStatus,
    state: 'loading',
    title: 'Opening WAD directory',
    detail: `Node.js doom-wad-core · ${path}`,
    steps,
    statusLine: statusFromSteps(steps, 'M_LoadDefaults: Load system defaults.'),
    fromCache: false,
  };
}

export function createReadingStatus(previous: WadLoadStatus): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: {
      active: true,
      progress: 0.72,
      message: 'Building lump directory.',
    },
  });

  return {
    ...previous,
    state: 'loading',
    title: 'Reading bytes',
    detail: 'Fetching IWAD data from public/wads...',
    steps,
    statusLine: statusFromSteps(steps, 'W_AddFile: reading WAD header and directory.'),
    fromCache: false,
  };
}

/** Advance W_Init while doom-wad-core indexes LMP lumps in the parse worker. */
export function tickLumpParseProgress(previous: WadLoadStatus, progress: number): WadLoadStatus {
  const clamped = Math.min(0.98, Math.max(0.15, progress));
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: {
      active: true,
      progress: clamped,
      message: clamped < 0.55 ? 'Reading lump directory.' : 'Decoding TEXTURE1, PNAMES, flats, sprites…',
    },
    P_Init: clamped > 0.85 ? { active: true, progress: (clamped - 0.85) / 0.15 } : {},
  });

  return {
    ...previous,
    state: 'loading',
    title: 'Indexing WAD lumps',
    detail: 'Node.js doom-wad-core parse (LMP decode)',
    steps,
    statusLine: statusFromSteps(steps, 'W_Init: lump directory.'),
    fromCache: false,
  };
}

export function createReadyStatus(wad: Wad, fromCache: boolean, loadedAt: number): WadLoadStatus {
  const mapCount = Object.keys(wad.maps).length;
  const textureCount = Object.keys(wad.textures).length;
  const spriteCount = Object.keys(wad.sprites).length;
  const flatCount = Object.keys(wad.flats).length;

  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: {
      complete: true,
      progress: 1,
      message: fromCache ? 'Using cached lump directory.' : `${wad.lumpInfo.length} lumps indexed.`,
    },
    P_Init: { complete: true, progress: 1, message: 'Playloop state ready.' },
  });

  return {
    state: fromCache ? 'cache-hit' : 'ready',
    title: fromCache ? 'WAD restored from cache' : 'WAD decoded',
    detail: `${wad.indentification.trim()} · ${mapCount} maps · ${wad.lumpInfo.length} lumps · ${textureCount} textures · ${spriteCount} sprites · ${flatCount} flats`,
    steps,
    statusLine: `${wad.indentification.trim()} · ${mapCount} maps ready`,
    fromCache,
    loadedAt,
  };
}

export function createLaunchingStatus(
  previous: WadLoadStatus,
  mapName: string
): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: { complete: true, progress: 1 },
    P_Init: { complete: true, progress: 1, message: `P_SetupLevel: ${mapName}` },
    R_Init: { active: true, progress: 0.62, message: 'Textures, flats, walls, things.' },
    S_Init: { active: true, progress: 0.48, message: 'Sound tables and music lumps.' },
  });

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'ready',
    title: `Launching ${mapName}`,
    detail: 'Building renderer buffers in parallel.',
    steps,
    statusLine: statusFromSteps(steps, `P_SetupLevel: ${mapName}`),
  };
}

/** GZDoom WASM gold path — skips classic WebGL geometry build. */
export function createGzdoomLaunchingStatus(
  previous: WadLoadStatus,
  mapName: string,
): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: { complete: true, progress: 1 },
    P_Init: { complete: true, progress: 1, message: `P_SetupLevel: ${mapName}` },
    R_Init: { active: true, progress: 0.55, message: 'GZDoom GLES renderer (WASM).' },
  });

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'ready',
    title: `GZDoom WASM · ${mapName}`,
    detail: 'Loading gzdoom.wasm and PK3 assets…',
    steps,
    statusLine: 'R_Init: GZDoom gold renderer…',
  };
}

export function createGzdoomWasmIndexStatus(path: string, mapCount: number): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: {
      complete: true,
      progress: 1,
      message: `Raw IWAD indexed (${mapCount} maps) — lumps parsed by GZDoom.`,
    },
    P_Init: { complete: true, progress: 1, message: 'Playloop state ready.' },
  });

  const basename = path.split('/').pop() ?? path;
  return {
    state: 'ready',
    title: 'IWAD ready (GZDoom parses lumps)',
    detail: `${basename} · ${mapCount} maps · raw IWAD mount (no Node lump parse)`,
    steps,
    statusLine: `${basename} · ${mapCount} maps ready`,
    fromCache: false,
  };
}

/** GZDoom WASM Play — mount raw IWAD; GZDoom parses lumps internally (no Node re-encode). */
export function createGzdoomPlayInjectStatus(
  previous: WadLoadStatus,
  mapName: string,
): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: {
      complete: true,
      progress: 1,
      message: 'Mounting raw IWAD into GZDoom MEMFS.',
    },
    P_Init: { active: true, progress: 0.55, message: `Warping to ${mapName}…` },
    R_Init: { active: true, progress: 0.35, message: `Loading GZDoom WASM · ${mapName}…` },
  });

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'loading',
    title: `GZDoom WASM Play · ${mapName}`,
    detail: 'Raw IWAD → GZDoom MEMFS (GZDoom W_Init parses lumps)',
    steps,
    statusLine: statusFromSteps(steps, `W_Init: mounting raw IWAD`),
  };
}

export function createGzdoomPlayReadyStatus(
  previous: WadLoadStatus,
  mapName: string,
): WadLoadStatus {
  const steps = createSteps(
    Object.fromEntries(
      STEP_DEFS.map((def) => [
        def.label,
        {
          complete: true,
          progress: 1,
          message:
            def.label === 'W_Init'
              ? 'Raw IWAD mounted — GZDoom parsed lumps.'
              : def.label === 'HU/ST_Init'
                ? `${mapName} · GZDoom WASM play ready.`
                : def.message,
        },
      ]),
    ) as Partial<Record<(typeof STEP_DEFS)[number]['label'], Partial<WadLoadStep>>>,
  );

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'ready',
    title: `${mapName} ready`,
    detail: `GZDoom WASM play · raw IWAD (GZDoom parses lumps)`,
    steps,
    statusLine: `D_DoomMain: ${mapName} ready (GZDoom WASM · raw IWAD).`,
  };
}

/** GZDoom (s) WASM Play — Node NODE_LUMPS.WAD + GZSTATE (-loadgzstate; no MAP lump parse). */
export function createGzdoomSPlayInjectStatus(
  previous: WadLoadStatus,
  mapName: string,
  lumpCount: number,
): WadLoadStatus {
  const steps = createSteps({
    Z_Init: { complete: true, progress: 1 },
    W_Init: {
      complete: true,
      progress: 1,
      message: `${lumpCount} lumps → NODE_LUMPS.WAD (doom-wad-core).`,
    },
    P_Init: { active: true, progress: 0.55, message: `Exporting GZSTATE for ${mapName}…` },
    R_Init: { active: true, progress: 0.35, message: 'Loading GZDoom (s) WASM…' },
  });

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'loading',
    title: `GZDoom (s) · ${mapName}`,
    detail: 'Node parses lumps → NODE_LUMPS.WAD + GZSTATE (-loadgzstate)',
    steps,
    statusLine: statusFromSteps(steps, `P_Init: exporting GZSTATE`),
  };
}

export function createGzdoomSPlayReadyStatus(
  previous: WadLoadStatus,
  mapName: string,
  lumpCount: number,
  gzstateBytes: number,
): WadLoadStatus {
  const steps = createSteps(
    Object.fromEntries(
      STEP_DEFS.map((def) => [
        def.label,
        {
          complete: true,
          progress: 1,
          message:
            def.label === 'W_Init'
              ? `${lumpCount} lumps · NODE_LUMPS.WAD · GZSTATE ${gzstateBytes} bytes.`
              : def.label === 'HU/ST_Init'
                ? `${mapName} · GZDoom (s) play ready.`
                : def.message,
        },
      ]),
    ) as Partial<Record<(typeof STEP_DEFS)[number]['label'], Partial<WadLoadStep>>>,
  );

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'ready',
    title: `${mapName} ready`,
    detail: `GZDoom (s) · NODE_LUMPS.WAD + GZSTATE (${gzstateBytes} bytes, map via -loadgzstate)`,
    steps,
    statusLine: `D_DoomMain: ${mapName} ready (GZDoom (s) · Node GZSTATE).`,
  };
}

export function createGzdoomMapReadyStatus(previous: WadLoadStatus, mapName: string): WadLoadStatus {
  const steps = createSteps(
    Object.fromEntries(
      STEP_DEFS.map((def) => [
        def.label,
        {
          complete: true,
          progress: 1,
          message: def.label === 'HU/ST_Init' ? `${mapName} · GZDoom WASM frame ready.` : def.message,
        },
      ]),
    ) as Partial<Record<(typeof STEP_DEFS)[number]['label'], Partial<WadLoadStep>>>,
  );

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'ready',
    title: `${mapName} ready`,
    detail: 'GZDoom WASM gold renderer · spawn view captured',
    steps,
    statusLine: `D_DoomMain: ${mapName} ready (GZDoom WASM).`,
  };
}

export function createMapReadyStatus(previous: WadLoadStatus, mapName: string): WadLoadStatus {
  const steps = createSteps(
    Object.fromEntries(
      STEP_DEFS.map((def) => [
        def.label,
        {
          complete: true,
          progress: 1,
          message: def.label === 'HU/ST_Init' ? `${mapName} ready.` : def.message,
        },
      ])
    ) as Partial<Record<(typeof STEP_DEFS)[number]['label'], Partial<WadLoadStep>>>
  );

  return {
    ...previous,
    state: previous.fromCache ? 'cache-hit' : 'ready',
    title: `${mapName} ready`,
    detail: 'Click/drag the game canvas to turn · WASD move · Shift walk · Space jump · Click use',
    steps,
    statusLine: `D_DoomMain: ${mapName} ready.`,
  };
}

export function createMapLoadErrorStatus(error: unknown, mapName: string): WadLoadStatus {
  const message = error instanceof Error ? error.message : `Could not load ${mapName}`;

  return {
    state: 'error',
    title: `${mapName} failed to load`,
    detail: message,
    steps: createSteps({
      Z_Init: { complete: true, progress: 1 },
      W_Init: { complete: true, progress: 1 },
      P_Init: { complete: true, progress: 1 },
      R_Init: { active: true, progress: 0.35, message: 'Renderer init failed.' },
    }),
    statusLine: `I_Error: ${message}`,
    fromCache: false,
    error: message,
  };
}

export function createErrorStatus(error: unknown, path: string): WadLoadStatus {
  const message = error instanceof Error ? error.message : `Could not load ${path}`;

  return {
    ...initialWadLoadStatus,
    state: 'error',
    title: 'WAD load failed',
    detail: message,
    steps: createSteps({
      W_Init: { active: true, progress: 0.2, message: message },
    }),
    statusLine: `I_Error: ${message}`,
    fromCache: false,
    error: error instanceof Error ? error.message : String(error),
  };
}
