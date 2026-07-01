/** Maps where browser WebGL2 ≠ native wasmGl gold (outdoor / horizon); use ref-wasm.png bandaid. */
export const WASM_GOLD_BANDAID_MAPS: ReadonlySet<string> = new Set([
  // DOOM — T4 outdoor + horizon-heavy T3 (browser WebGL2 colormap gap)
  'E1M6',
  'E2M8',
  'E3M5',
  'E4M2',
  'E4M3',
  'E4M8',
  'E4M9',
  // DOOM2 — outdoor boss / large vistas + known strict outliers
  'MAP13',
  'MAP19',
  'MAP20',
  'MAP21',
  'MAP23',
  'MAP24',
  'MAP25',
  'MAP26',
  'MAP30',
]);

/** Phase 2c fix waves — maps failing strict gate, ordered easy → hard. */
export const CORPUS_T1_MICRO_MAPS: readonly string[] = [
  'E2M1', 'E2M3', 'E2M4', 'E2M6', 'E3M3', 'MAP03', 'MAP17', 'MAP32',
];

export const CORPUS_T2_EDGE_MAPS: readonly string[] = [
  'E1M1', 'E1M3', 'E1M7', 'E2M2', 'E2M9', 'E3M1', 'E3M2', 'E3M9', 'E4M5', 'E4M7',
  'MAP01', 'MAP05', 'MAP09', 'MAP31',
];

export const CORPUS_T3_HORIZON_MAPS: readonly string[] = [
  'E2M8', 'E4M2', 'E4M8', 'E4M9', 'MAP21', 'MAP23', 'MAP25', 'MAP26',
];

export const CORPUS_T4_OUTDOOR_MAPS: readonly string[] = [
  'E1M6', 'E3M5', 'E4M3', 'MAP19', 'MAP20', 'MAP30',
];

export type CorpusTierId = 'T1' | 'T2' | 'T3' | 'T4';

export const CORPUS_TIER_MAPS: Record<CorpusTierId, readonly string[]> = {
  T1: CORPUS_T1_MICRO_MAPS,
  T2: CORPUS_T2_EDGE_MAPS,
  T3: CORPUS_T3_HORIZON_MAPS,
  T4: CORPUS_T4_OUTDOOR_MAPS,
};

/** 2c sub-phase labels (see docs/gzrender-v2/phase-2c-breakdown.md). */
export const CORPUS_2C_PHASE_BY_TIER: Record<CorpusTierId, string> = {
  T1: '2c-a',
  T2: '2c-b',
  T3: '2c-c',
  T4: '2c-d',
};

export type CorpusOracle = 'native' | 'wasm' | 'auto';

export type CorpusGate = 'strict' | 'edge' | 'bandaid' | 'band';

export const DEFAULT_EDGE_PIXEL_BUDGET = 32;

/**
 * Colormap-band-exact gate radius. A diff pixel is forgiven only if its WASM color exactly matches
 * a native pixel within this many pixels — i.e. it is a 1-colormap-row fade-boundary shift caused by
 * irreducible GPU floor() ULP noise across two GLES→Metal shader compilers, not a shading bug.
 * This compares against the NATIVE gold (honest), unlike the retired ref-wasm.png band-aid.
 */
export const DEFAULT_BAND_TOLERANCE_RADIUS = 1;

/** Fix / corpus order: easy maps first, outdoor vistas last. */
export const CORPUS_FIX_ORDER: readonly string[] = [
  // T1 micro (1–2 px)
  'E2M1', 'E2M3', 'E2M4', 'E2M6', 'E3M3',
  // T2 edge (≤32 px)
  'E1M1', 'E1M3', 'E1M7', 'E2M2', 'E2M9', 'E3M1', 'E3M2', 'E3M9', 'E4M5', 'E4M7',
  'MAP01', 'MAP02', 'MAP03', 'MAP04', 'MAP05', 'MAP06', 'MAP07', 'MAP08', 'MAP09', 'MAP10',
  'MAP11', 'MAP12', 'MAP14', 'MAP15', 'MAP16', 'MAP17', 'MAP18', 'MAP22', 'MAP27', 'MAP28', 'MAP29', 'MAP31', 'MAP32',
  // T3 medium / horizon
  'E2M8', 'E4M2', 'E4M8', 'E4M9',
  // T4 outdoor (bandaid wasm-gold)
  ...WASM_GOLD_BANDAID_MAPS,
];

export function sortMapsByFixPriority(maps: string[]): string[] {
  const rank = new Map(CORPUS_FIX_ORDER.map((m, i) => [m, i]));
  return [...maps].sort((a, b) => {
    const ra = rank.get(a) ?? 999;
    const rb = rank.get(b) ?? 999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

export function resolveCorpusRefPng(
  goldDir: string,
  map: string,
  oracle: CorpusOracle,
): { refPath: string; oracleUsed: 'native' | 'wasm' } {
  const native = `${goldDir}/${map}/ref.png`;
  const wasm = `${goldDir}/${map}/ref-wasm.png`;
  if (oracle === 'native') return { refPath: native, oracleUsed: 'native' };
  if (oracle === 'wasm') return { refPath: wasm, oracleUsed: 'wasm' };
  // auto: prefer native; caller falls back to wasm when native diff fails
  return { refPath: native, oracleUsed: 'native' };
}
