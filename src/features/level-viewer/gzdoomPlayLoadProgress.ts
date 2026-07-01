import type { WadLoadStep } from '@/features/level-viewer/wadLoaderStatus';

export type GzdoomLoadPhase =
  | 'fetch-iwad'
  | 'parse-wad'
  | 'export-gzstate'
  | 'load-script'
  | 'compile-wasm'
  | 'load-pk3'
  | 'mount-data'
  | 'init-engine'
  | 'ready';

export interface GzdoomLoadProgress {
  phase: GzdoomLoadPhase;
  label: string;
  detail?: string;
  /** 0–100 */
  percent: number;
}

export type GzdoomLoadProgressReporter = (progress: GzdoomLoadProgress) => void;

export type GzdoomProgressVariant = 'wasm-play' | 'wasm-gold' | 'modular-s';

export const INITIAL_GZDOOM_LOAD_PROGRESS: GzdoomLoadProgress = {
  phase: 'load-script',
  label: 'Starting…',
  percent: 0,
};

/** GZDoom WASM (gold + play): engine loads raw IWAD — no Node lump parse in UI. */
const WASM_STEP_LABELS = [
  'WASM script',
  'Instantiate',
  'GZDoom assets',
  'Mount IWAD',
  'R_Init',
  'Ready',
] as const;

/** GZDoom (s): Node parses lumps → NODE_LUMPS.WAD + GZSTATE, then WASM. */
const MODULAR_STEP_LABELS = [
  'Fetch IWAD',
  'Parse lumps',
  'GZSTATE',
  'WASM script',
  'Mount data',
  'P_SetupLevel',
  'Ready',
] as const;

function phaseToStepIndex(phase: GzdoomLoadPhase, variant: GzdoomProgressVariant): number {
  if (variant === 'modular-s') {
    switch (phase) {
      case 'fetch-iwad':
        return 0;
      case 'parse-wad':
        return 1;
      case 'export-gzstate':
        return 2;
      case 'load-script':
      case 'compile-wasm':
        return 3;
      case 'load-pk3':
        return 3;
      case 'mount-data':
        return 4;
      case 'init-engine':
        return 5;
      case 'ready':
        return 6;
      default:
        return 0;
    }
  }

  // wasm-play / wasm-gold
  switch (phase) {
    case 'fetch-iwad':
      return 0;
    case 'load-script':
      return 0;
    case 'compile-wasm':
      return 1;
    case 'load-pk3':
      return 2;
    case 'mount-data':
      return 3;
    case 'init-engine':
      return 4;
    case 'ready':
      return 5;
    default:
      return 0;
  }
}

function stepLabels(variant: GzdoomProgressVariant): readonly string[] {
  return variant === 'modular-s' ? MODULAR_STEP_LABELS : WASM_STEP_LABELS;
}

function buildSteps(
  labels: readonly string[],
  activeIndex: number,
  partial: number,
  message: string,
): WadLoadStep[] {
  return labels.map((label, index) => {
    if (index < activeIndex) {
      return { label, message, complete: true, active: false, progress: 1 };
    }
    if (index === activeIndex) {
      return {
        label,
        message,
        complete: false,
        active: true,
        progress: Math.max(0.08, Math.min(1, partial || 0.15)),
      };
    }
    return { label, message: '', complete: false, active: false, progress: 0 };
  });
}

/** Map progress to segmented bar — variant selects WASM vs Node lump pipeline. */
export function gzdoomProgressToSteps(
  progress: GzdoomLoadProgress,
  variant: GzdoomProgressVariant,
): WadLoadStep[] {
  const labels = stepLabels(variant);
  const activeIndex = Math.min(labels.length - 1, phaseToStepIndex(progress.phase, variant));
  const partial = (progress.percent / 100) * labels.length - activeIndex;
  const message = progress.detail ?? progress.label;
  return buildSteps(labels, activeIndex, partial, message);
}

export function gzdoomProgressKicker(variant: GzdoomProgressVariant): string {
  switch (variant) {
    case 'modular-s':
      return 'W_Init · Node';
    case 'wasm-gold':
      return 'Gold · WASM';
    default:
      return 'GZDoom · WASM';
  }
}

export function reportGzdoomProgress(
  reporter: GzdoomLoadProgressReporter | undefined,
  progress: GzdoomLoadProgress,
): void {
  reporter?.(progress);
}
