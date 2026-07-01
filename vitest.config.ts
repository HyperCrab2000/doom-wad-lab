import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'path';

const cpuCount = os.cpus().length;
const isCoverageRun = process.env.VITEST_COVERAGE === '1';
const maxWorkers = (() => {
  const fromEnv = process.env.VITEST_MAX_WORKERS;
  if (fromEnv === '100%') return cpuCount;
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return Math.max(2, cpuCount - 1);
})();

/** Shared pool defaults — file-level parallelism across ~130 unit test files. */
const parallelPool = {
  pool: 'threads' as const,
  maxWorkers,
  fileParallelism: true,
  isolate: true,
  // Bound it.concurrent within a file — avoids Vitest worker RPC timeouts.
  maxConcurrency: isCoverageRun ? 4 : Math.max(4, Math.min(cpuCount, 16)),
};

/** Pure logic and parsers — unit-testable without WebGL/browser runtime. */
const coverageInclude = [
  'src/wad/ByteReader/**',
  'src/wad/utils/**',
  'src/wad/voxels/**',
  'src/wad/game/**',
  'src/wad/loader/fetchWad.ts',
  'src/wad/loader/validateWadBuffer.ts',
  'src/wad/parser/loadWadFromArrayBuffer.ts',
  'src/wad/parser/thingFlags.ts',
  'src/wad/parity/**',
  'gzstate/**',
  'src/wad/renderer/geometry/**',
  'src/wad/renderer/utils/**',
  'src/wad/renderer/renderGame/mapLoadCache.ts',
  'src/wad/renderer/renderGame/lightingHeuristics.ts',
  'src/wad/renderer/renderGame/sectorLighting.ts',
  'src/wad/renderer/renderGame/heightTextures.ts',
  'src/wad/renderer/controls/doomCollision.ts',
  'src/wad/renderer/controls/playerView.ts',
  'src/features/level-viewer/wadCache.ts',
  'src/features/level-viewer/wadLoaderStatus.ts',
  'src/features/level-viewer/music/doomMusic.ts',
  'src/features/level-viewer/music/mus2midi.ts',
  'src/features/level-viewer/music/musicPreload.ts',
  'src/config/**',
];

const coverageExclude = [
  '**/*.test.ts',
  '**/*.integration.test.ts',
  '**/__test__/**',
  '**/*.d.ts',
  'src/wad/interfaces/**',
  'src/wad/parser/wadParse.worker.ts',
  'src/wad/parser/parseWadInWorker.ts',
  'src/wad/logic/monsterAi.ts',
  'src/wad/game/doorSounds.ts',
  'src/wad/game/monsterStates.ts',
  'src/wad/game/lineSpecialAudit.ts',
  'src/wad/game/lineSpecialSimulator.ts',
  'src/wad/game/mapActionController.ts',
  'src/wad/game/switchTextures.ts',
  'src/wad/renderer/utils/renderThingWithThreeJS.ts',
  'src/wad/constants/SectorSpecials.ts',
  'src/wad/constants/LineDefSpecials.ts',
  'src/wad/constants/doomThingTypes.ts',
  'src/parser/**',
  'src/features/level-viewer/music/opl3.d.ts',
];

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./test/setupWebGL.ts'],
    hookTimeout: isCoverageRun ? 300_000 : 120_000,
    ...parallelPool,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: coverageInclude,
      exclude: coverageExclude,
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 82,
        statements: 90,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'gzstate/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', 'test/integration/**'],
          environment: 'node',
          testTimeout: isCoverageRun ? 180_000 : 60_000,
          ...parallelPool,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.integration.test.ts'],
          environment: 'node',
          setupFiles: ['./test/setup/integrationCanvas.ts'],
          testTimeout: 180_000,
          // Browser/integration tests: fewer forks to avoid Puppeteer contention.
          pool: 'forks',
          maxWorkers: Math.min(4, maxWorkers),
          fileParallelism: true,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/shaders': path.resolve(__dirname, './src/shaders'),
    },
  },
});
