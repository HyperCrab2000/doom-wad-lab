/**
 * Layered GZDoom parity display modes — toggled via CLI `+cvar value` (batch-safe).
 * Single source of truth for native gold capture and browser WASM oracle.
 */
import { GZDOOM_PARITY_CAPTURE_ARGS } from './parityCaptureArgs';

export const DISPLAY_MODE_IDS = [
  'full',
  'notexture',
  'walls-only',
  'flats-only',
  'geometry',
  'no-portals',
  'no-fog',
  'no-post',
] as const;

export type DisplayModeId = (typeof DISPLAY_MODE_IDS)[number];

export interface DisplayModeSpec {
  id: DisplayModeId;
  /** Short label for corpus reports. */
  label: string;
  /** What this mode isolates when native ≡ WASM. */
  isolates: string;
  /** Extra CLI tokens appended after GZDOOM_PARITY_CAPTURE_ARGS (pairs of +cvar value). */
  extraArgs: readonly string[];
}

export const DISPLAY_MODES: Record<DisplayModeId, DisplayModeSpec> = {
  full: {
    id: 'full',
    label: 'full',
    isolates: 'End-to-end shaded frame (Step 2c gate)',
    extraArgs: [],
  },
  notexture: {
    id: 'notexture',
    label: 'notexture',
    isolates: 'Geometry + depth + lighting without texture sampling',
    extraArgs: ['+gl_texture', '0'],
  },
  'walls-only': {
    id: 'walls-only',
    label: 'walls-only',
    isolates: 'Wall BSP draw list and masked walls',
    extraArgs: ['+gl_render_flats', '0', '+gl_render_things', '0'],
  },
  'flats-only': {
    id: 'flats-only',
    label: 'flats-only',
    isolates: 'Floors, ceilings, sky-bound flats',
    extraArgs: ['+gl_render_walls', '0', '+gl_render_things', '0'],
  },
  geometry: {
    id: 'geometry',
    label: 'geometry',
    isolates: 'Static world without sprites or portal recursion',
    extraArgs: [
      '+gl_render_things',
      '0',
      '+gl_portals',
      '0',
      '+gl_mirrors',
      '0',
      '+gl_noskyboxes',
      '1',
    ],
  },
  'no-portals': {
    id: 'no-portals',
    label: 'no-portals',
    isolates: 'Main view only — no mirrors, sky portals, stacked sectors',
    extraArgs: ['+gl_portals', '0', '+gl_mirrors', '0', '+gl_noskyboxes', '1'],
  },
  'no-fog': {
    id: 'no-fog',
    label: 'no-fog',
    isolates: 'Lighting and texturing without distance fog',
    extraArgs: ['+gl_fogmode', '0'],
  },
  'no-post': {
    id: 'no-post',
    label: 'no-post',
    isolates: 'Scene buffer before bloom/SSAO/tonemap post stack',
    extraArgs: [
      '+gl_custompost',
      '0',
      '+gl_bloom',
      '0',
      '+gl_ssao',
      '0',
      '+gl_fxaa',
      '0',
      '+gl_lens',
      '0',
      '+gl_tonemap',
      '0',
    ],
  },
};

/** Modes run in corpus order (full first, then coarse-to-fine isolation). */
export const DISPLAY_MODE_CORPUS_ORDER: DisplayModeId[] = [
  'full',
  'notexture',
  'geometry',
  'walls-only',
  'flats-only',
  'no-portals',
  'no-fog',
  'no-post',
];

export function parseDisplayModeId(raw: string | null | undefined): DisplayModeId {
  const id = (raw ?? 'full').trim().toLowerCase() as DisplayModeId;
  if (!DISPLAY_MODES[id]) {
    throw new Error(
      `Unknown display mode "${raw}". Valid: ${DISPLAY_MODE_IDS.join(', ')}`,
    );
  }
  return id;
}

/** Gold / WASM ref PNG filename for a mode (`ref.png` for full). */
export function displayModeRefFilename(mode: DisplayModeId): string {
  return mode === 'full' ? 'ref.png' : `ref-${mode}.png`;
}

/** Build argv: parity baseline + mode overrides + optional vid_rendermode override. */
export function buildParityCaptureArgv(
  mode: DisplayModeId = 'full',
  opts?: { vidRenderMode?: string },
): string[] {
  const args: string[] = [];
  for (let i = 0; i < GZDOOM_PARITY_CAPTURE_ARGS.length; i++) {
    const token = GZDOOM_PARITY_CAPTURE_ARGS[i]!;
    if (token === '+vid_rendermode' && opts?.vidRenderMode != null) {
      args.push(token, opts.vidRenderMode);
      i++;
      continue;
    }
    args.push(token);
  }
  args.push(...DISPLAY_MODES[mode].extraArgs);
  return args;
}

/** Infer likely failure layer from per-mode pass/fail matrix. */
export function inferParityFailureLayer(
  results: Partial<Record<DisplayModeId, boolean>>,
): string {
  const pass = (m: DisplayModeId) => results[m] === true;
  const fail = (m: DisplayModeId) => results[m] === false;

  if (pass('full')) return 'none';
  // Draw-path splits all fail like full → lighting/colormap (outdoor probe), not wall vs flat BSP.
  if (fail('full') && fail('notexture') && fail('walls-only') && fail('flats-only')) {
    return 'lighting-colormap-shader';
  }
  // Lighting/colormap: notexture fails while wall/flat splits are untested.
  if (fail('notexture') && results['walls-only'] !== false && results['flats-only'] !== false) {
    return 'lighting-colormap-shader';
  }
  if (fail('geometry') && fail('walls-only') && fail('flats-only')) {
    return 'bsp-visibility-or-camera';
  }
  if (pass('notexture') && fail('full')) {
    return 'texturing-or-lighting-shader';
  }
  if (pass('walls-only') && pass('flats-only') && fail('full')) {
    return 'compositing-or-sprites-or-portals';
  }
  if (pass('geometry') && fail('no-portals')) {
    return 'portal-recursion';
  }
  if (pass('no-fog') && fail('full')) {
    return 'fog-equation';
  }
  if (pass('no-post') && fail('full')) {
    return 'postprocess-stack';
  }
  if (fail('notexture') && pass('geometry')) {
    return 'lighting-colormap-shader';
  }
  if (fail('walls-only') && pass('flats-only')) {
    return 'wall-draw-or-depth';
  }
  if (fail('flats-only') && pass('walls-only')) {
    return 'flat-draw-or-sky';
  }
  return 'unknown-mixed';
}
