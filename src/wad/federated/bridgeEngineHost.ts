import {
  writeGztick,
  type GztickDocument,
  type GztickPatch,
} from '@hypercrab2000/doom-gzengine-core';

export interface GzEngineStateProvider {
  exportSnapshot(tickNumber: number): GztickDocument;
  tickSimulation?(tics: number): void;
}

/** TS simulation bridge until doom-gzengine-core publishes createBridgeEngineHost. */
export function createBridgeEngineHost(provider: GzEngineStateProvider) {
  let tickNumber = 0;
  let pendingPatches: GztickPatch[] = [];

  return {
    async loadGzstate() {
      tickNumber = 0;
      pendingPatches = [];
    },
    tick(tics: number) {
      provider.tickSimulation?.(tics);
      tickNumber += tics;
    },
    drainPatches(): GztickPatch[] {
      const patches = pendingPatches;
      pendingPatches = [];
      return patches;
    },
    exportGztick(): ArrayBuffer {
      return writeGztick(provider.exportSnapshot(tickNumber));
    },
    queuePatches(patches: readonly GztickPatch[]) {
      pendingPatches.push(...patches);
    },
    dispose() {
      pendingPatches = [];
      tickNumber = 0;
    },
  };
}

export type BridgeEngineHost = ReturnType<typeof createBridgeEngineHost>;
