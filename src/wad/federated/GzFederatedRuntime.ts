import type { GztickPatch } from '@hypercrab2000/doom-gzengine-core';
import { createGzEngineHost } from '@hypercrab2000/doom-gzengine-core';
import { createBridgeEngineHost } from '@/wad/federated/bridgeEngineHost';
import type { Wad } from '@/wad/interfaces/Wad';
import type { WadMap } from '@/wad/interfaces/WadMap';
import type { MapActionController } from '@/wad/game/mapActionController';
import { loadGzstateFromWad } from '@/wad/renderer/gzrender-v2/federated/stateLoader';
import {
  getFederatedWasmDebugInfo,
  prewarmFederatedWasmMap,
  resetFederatedWasmBackend,
} from '@/wad/renderer/gzrender-v2/federated/federatedWasmBackend';
import {
  readFederatedEngineMode,
  type FederatedEngineMode,
} from '@/wad/federated/federatedEngineMode';
import { patchesFromDirtySectors } from '@/wad/federated/typescriptEngineBridge';
import { exportGztickFromMap } from '@/wad/federated/exportGztickFromMap';

export interface FederatedSimulationMotion {
  playOpen: boolean;
  playClose: boolean;
  playStart: boolean;
  sound: 'door' | 'blaze' | 'lift' | 'mover';
}

export interface FederatedAdvanceResult {
  patches: GztickPatch[];
  motion: FederatedSimulationMotion;
  engineMode: FederatedEngineMode;
}

export interface FederatedRuntimeDebug {
  engineMode: FederatedEngineMode;
  engineWasmLoaded: boolean;
  engineFallbackReason?: string;
  rendererWasmLoaded: boolean;
  patchesLastFrame: number;
  tickNumber: number;
  mapName: string;
  gzstateBytes: number;
  vertexCount: number;
  sectorCount: number;
  voxelsDrawn?: number;
  voxelsPending?: number;
  error?: string;
}

/**
 * Browser host for separated engine + renderer WASM modules.
 * WAD parse stays in doom-wad-core; music/SFX stay in LevelViewer hooks.
 */
export class GzFederatedRuntime {
  private engineMode: FederatedEngineMode = readFederatedEngineMode();
  private engineHost = createGzEngineHost();
  private bridgeHost = createBridgeEngineHost({
    exportSnapshot: () => ({
      header: { magic: 0, version: 0, tickNumber: 0, mapName: '', engineTag: 'GZENGINE', flags: 0 },
      strings: [],
      sectorDynamics: [],
      things: [],
      eventLog: [],
    }),
  });
  private liveMap: WadMap | null = null;
  private engineWasmLoaded = false;
  private engineFallbackReason?: string;
  private loaded = false;
  private tickNumber = 0;
  private lastPatchCount = 0;
  private gzstateBytes = 0;
  private mapName = '';
  private loadError?: string;

  isLoaded(): boolean {
    return this.loaded;
  }

  getEngineMode(): FederatedEngineMode {
    return this.engineMode;
  }

  async loadMap(
    wad: Wad,
    mapName: string,
    map: WadMap,
    options?: { skipRendererPrewarm?: boolean },
  ): Promise<void> {
    this.reset();
    this.engineMode = readFederatedEngineMode();

    const { bytes } = loadGzstateFromWad(wad, mapName);
    this.gzstateBytes = bytes.byteLength;
    this.mapName = mapName;
    this.liveMap = map;
    this.bridgeHost.dispose();
    this.bridgeHost = createBridgeEngineHost({
      exportSnapshot: (tickNumber) => exportGztickFromMap(map, mapName, tickNumber),
    });
    await this.bridgeHost.loadGzstate();

    if (!options?.skipRendererPrewarm) {
      await prewarmFederatedWasmMap(wad, mapName, map);
    }

    if (this.engineMode === 'wasm') {
      try {
        await this.engineHost.loadGzstate(bytes.buffer.slice(0));
        this.engineWasmLoaded = true;
      } catch (err) {
        this.engineFallbackReason =
          err instanceof Error ? err.message : 'gzengine WASM unavailable';
        this.engineMode = 'typescript';
        this.engineWasmLoaded = false;
      }
    }

    this.loaded = true;
  }

  /**
   * Advance simulation one host frame. Returns patches for the renderer and motion cues for SFX.
   * TS engine uses existing MapActionController; WASM engine uses doom-gzengine-core when built.
   */
  advanceFrame(
    dtSeconds: number,
    mapActions: MapActionController,
    map: WadMap,
  ): FederatedAdvanceResult {
    if (!this.loaded) {
      return {
        patches: [],
        motion: { playOpen: false, playClose: false, playStart: false, sound: 'door' },
        engineMode: this.engineMode,
      };
    }

    this.tickNumber++;

    if (this.engineMode === 'wasm' && this.engineWasmLoaded) {
      const tics = Math.max(1, Math.round(dtSeconds * 35));
      this.engineHost.tick(tics);
      const patches = this.engineHost.drainPatches();
      this.lastPatchCount = patches.length;
      return {
        patches,
        motion: { playOpen: false, playClose: false, playStart: false, sound: 'door' },
        engineMode: 'wasm',
      };
    }

    const motion = mapActions.tick(dtSeconds);
    const patches = patchesFromDirtySectors(map, mapActions.getDirtySectors());
    this.bridgeHost.tick(Math.max(1, Math.round(dtSeconds * 35)));
    this.bridgeHost.queuePatches(patches);
    this.lastPatchCount = patches.length;

    return {
      patches,
      motion,
      engineMode: 'typescript',
    };
  }

  exportGztick(): ArrayBuffer {
    if (!this.loaded || !this.liveMap) return new ArrayBuffer(0);
    if (this.engineMode === 'typescript' || !this.engineWasmLoaded) {
      return this.bridgeHost.exportGztick();
    }
    return this.engineHost.exportGztick();
  }

  getDebugInfo(): FederatedRuntimeDebug {
    const renderer = getFederatedWasmDebugInfo();
    return {
      engineMode: this.engineMode,
      engineWasmLoaded: this.engineWasmLoaded,
      engineFallbackReason: this.engineFallbackReason,
      rendererWasmLoaded: renderer?.wasmLoaded ?? false,
      patchesLastFrame: this.lastPatchCount,
      tickNumber: this.tickNumber,
      mapName: this.mapName,
      gzstateBytes: this.gzstateBytes,
      vertexCount: renderer?.vertexCount ?? 0,
      sectorCount: renderer?.sectorCount ?? 0,
      voxelsDrawn: renderer?.voxelsDrawn,
      voxelsPending: renderer?.voxelsPending,
      error: this.loadError ?? renderer?.error,
    };
  }

  reset(): void {
    this.loaded = false;
    this.tickNumber = 0;
    this.lastPatchCount = 0;
    this.gzstateBytes = 0;
    this.mapName = '';
    this.liveMap = null;
    this.loadError = undefined;
    this.engineWasmLoaded = false;
    this.engineFallbackReason = undefined;
    this.bridgeHost.dispose();
    this.bridgeHost = createBridgeEngineHost({
      exportSnapshot: () => ({
        header: { magic: 0, version: 0, tickNumber: 0, mapName: '', engineTag: 'GZENGINE', flags: 0 },
        strings: [],
        sectorDynamics: [],
        things: [],
        eventLog: [],
      }),
    });
    this.engineHost.dispose();
    this.engineHost = createGzEngineHost();
    resetFederatedWasmBackend();
  }
}

let runtimeSingleton: GzFederatedRuntime | null = null;

export function getFederatedRuntime(): GzFederatedRuntime {
  if (!runtimeSingleton) {
    runtimeSingleton = new GzFederatedRuntime();
  }
  return runtimeSingleton;
}

export function resetFederatedRuntime(): void {
  runtimeSingleton?.reset();
  runtimeSingleton = null;
}
