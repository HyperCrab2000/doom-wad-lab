import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { playerRadius } from '@/wad/constants/GameInfo';
import { animatedFlatFps, animatedSpriteFps, animatedWallFps } from '@/wad/constants/WadInfo';
import { mat4, vec3 } from 'gl-matrix';

import { setupCamera, updateCameraFromViewMatrix } from './camera';
import { drawScene } from './drawScene';
import {
  bindPlayfieldViewport,
  clearPathTraceLetterbox,
  clearPlayfieldChrome,
  clearGzdoomStatusBarBand,
  createPlayfieldCamera,
  updatePlayfieldCamera,
} from '@/wad/renderer/renderGame/playfieldCamera';
import { computeGzdoomParityViewLayout } from '@/wad/renderer/renderGame/gameViewLayout';
import {
  doomVerticalFovDegrees,
  readFrameParityModeFromLocation,
  readSoftwareParityModeFromLocation,
  readSpawnLockFromLocation,
  resolvePlayfieldLayout,
  FROZEN_GOLD_PARITY_PITCH,
} from '@/wad/parity/frame/frameParity';
import { preloadGoldPlayfield, applySpawnGoldHudBandCorrection, applySpawnGoldParityCorrection } from '@/wad/parity/frame/goldPlayfieldCache';
import { resolveGoldIwadSlug } from '@/wad/parity/frame/goldIwad';
import { clearPathTraceCanvas } from '@/wad/renderer/rtgl/pathTraceGpu';
import { LoadedWadData, loadWad } from './loadWad';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import { getViewAnglesFromViewMatrix, writePlayerViewMatrix, type PlayerViewState } from '@/wad/renderer/controls/playerView';
import { doomPlayerControls, findSectorAt, PlayerSnapshot } from '@/wad/renderer/controls/doomPlayerControls';
import { invalidateBlockingSegmentCache } from '@/wad/renderer/controls/doomCollision';
import { MapActionController, MapActionResult } from '@/wad/game/mapActionController';
import { handlePlayerFire, type PlayerFireState } from '@/wad/game/playerCombat';
import {
  applyHitscanDamage,
  defaultThingHealth,
  findHitscanTarget,
  shootZFromFeet,
  WEAPON_HITSCAN_DAMAGE,
} from '@/wad/game/hitscanCombat';
import { selectWeaponBySlot } from '@/wad/game/playerWeapons';
import { PickupTracker, tryPickups } from '@/wad/game/pickupSystem';
import {
  applySectorEffects,
  createDefaultInventory,
  inventoryHudSnapshot,
  type PlayerInventory,
} from '@/wad/game/playerInventory';
import {
  createDefaultPowerups,
  powerupsHudSnapshot,
  tickPowerups,
  type PlayerPowerups,
} from '@/wad/game/playerPowerups';
import { getStatusFaceLump } from '@/wad/game/statusFace';
import { getSectorPlayerEffects } from '@/wad/game/sectorSpecialRuntime';
import { LevelStatsTracker } from '@/wad/game/levelStats';
import { DOOM_THING_MAP_BY_ID } from '@/wad/constants/doomThingMap';
import { ThingKind } from '@/wad/constants/ThingTypes';
import {
  playDoorMotionSound,
  playDoorTriggerSounds,
  playMoverTriggerSounds,
} from '@/wad/game/mapActionSounds';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { refreshDoorWallGeometry } from '@/wad/renderer/geometry/refreshMapGeometry';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { backendForMapLoad, classicUsesGzdoomColormap, readDefaultRenderBackend } from '@/wad/renderer/renderBackend';
import { withTimeout } from '@/utils/promiseTimeout';
import {
  mergeClassicParityLayerToggles,
  readClassicGzdoomParityMode,
} from '@/wad/parity/classicGzdoomParity';

const PREWARM_TIMEOUT_MS = 45_000;
import {
  pathTraceNeedsHybridOverlay,
  pathTraceNeedsGpuTrace,
  persistRenderLayerToggles,
  readStoredRenderLayerToggles,
  sanitizeRenderLayerToggles,
  type RenderLayerToggles,
} from '@/wad/renderer/modular/renderLayerToggles';
import { publishClassicLayerDiagnostics } from '@/wad/renderer/modular/classicLayerMapping';
import { readRenderModularStageCap, isModularParityMode } from '@/wad/renderer/modular/modularRenderStage';
import { StageSnapshotRecorder } from '@/wad/renderer/modular/stageSnapshotCollector';
import { getFederatedRuntime, resetFederatedRuntime, type FederatedSimulationMotion } from '@/wad/federated/GzFederatedRuntime';
import { applyGztickPatches } from '@/wad/federated/applyGztickPatches';
import { shouldRunFederatedSimulation } from '@/wad/federated/federatedSimulation';

let wadData: LoadedWadData | null = null;
let currentMap: WadMap | null = null;
let presentationVisible = false;
let automapActive = false;
let pauseMenuOpen = false;
let pauseMenuRequestHandler: (() => void) | null = null;
let bspDebugActive = false;
let mapActions: MapActionController | null = null;
let liquidWake: { x: number; z: number; strength: number; startedAt: number } | null = null;
let sfxPlayer: DoomSfxPlayer | null = null;
let playerControls: ReturnType<typeof doomPlayerControls> | null = null;
let playerInventory: PlayerInventory = createDefaultInventory();
let playerPowerups: PlayerPowerups = createDefaultPowerups();
let pickupTracker = new PickupTracker();
let pickedThingIndices = new Set<number>();
let killedThingIndices = new Set<number>();
let thingHealth = new Map<number, number>();
let fireState: PlayerFireState = { lastFireAt: 0 };
let hudMessage: string | null = null;
let hudMessageUntil = 0;
let levelStats = new LevelStatsTracker();

const SHOOTABLE_KINDS = new Set<ThingKind>([ThingKind.Monster, ThingKind.Boss, ThingKind.Barrel]);
let renderBackend: RenderBackend =
  typeof window !== 'undefined' ? backendForMapLoad(readDefaultRenderBackend()) : 'classic';
let classicUseIndexTextures = false;
let renderLayerToggles: RenderLayerToggles = readStoredRenderLayerToggles(renderBackend === 'classic' ? 'classic' : undefined);
/** Cap path-trace GPU work (~10 Hz) so the laptop stays responsive. */
const PATH_TRACE_FRAME_INTERVAL_MS = 100;
let lastPathTraceDrawAt = 0;
let currentMapName = '';
let currentWadPath: string | null = null;
let drawPathTraceSyncFn:
  | ((
      params: import('@/wad/renderer/renderGame/drawScene').DrawSceneParams,
      wadPath?: string | null,
      mapName?: string,
      options?: import('@/wad/renderer/rtgl/rtglRenderer').PathTraceDrawOptions
    ) => import('@/wad/renderer/rtgl/rtglRenderer').PathTraceDrawResult)
  | null = null;
let pathTraceModulePromise: Promise<void> | null = null;
let federatedWasmModulePromise: Promise<void> | null = null;
let drawFederatedWasmSyncFn: ((params: import('@/wad/renderer/renderGame/drawScene').DrawSceneParams) => void) | null =
  null;

function readNumberQueryParam(name: string): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get(name);
  if (raw == null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readClassicViewOverride(): { x: number; y: number; yaw: number } | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('classicView');
  if (!raw) return null;
  const [xRaw, yRaw, yawRaw] = raw.split(',');
  const x = Number(xRaw);
  const y = Number(yRaw);
  const yawDeg = Number(yawRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(yawDeg)) return null;
  return { x, y, yaw: (yawDeg * Math.PI) / 180 };
}

function readClassicStartOverride(): { x: number; y: number; yaw: number } | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('classicStart');
  if (!raw) return null;
  const [xRaw, yRaw, yawRaw] = raw.split(',');
  const x = Number(xRaw);
  const y = Number(yRaw);
  const yawDeg = Number(yawRaw);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(yawDeg)) return null;
  return { x, y, yaw: (yawDeg * Math.PI) / 180 };
}

function ensurePathTraceModule(): Promise<void> {
  if (!pathTraceModulePromise) {
    pathTraceModulePromise = import('@/wad/renderer/rtgl/drawScenePathTrace').then((drawMod) => {
      drawPathTraceSyncFn = drawMod.drawPathTraceSync;
    });
  }
  return pathTraceModulePromise;
}

function ensureFederatedWasmModule(): Promise<void> {
  if (!federatedWasmModulePromise) {
    federatedWasmModulePromise = import('@/wad/renderer/gzrender-v2/federated/drawSceneFederatedWasm').then(
      (mod) => {
        drawFederatedWasmSyncFn = mod.drawFederatedWasmSync;
      },
    );
  }
  return federatedWasmModulePromise;
}

async function prewarmFederatedWasmGeometry(
  wad: Wad,
  mapName: string,
  map: WadMap,
): Promise<void> {
  await ensureFederatedWasmModule();
  await getFederatedRuntime().loadMap(wad, mapName, map);
}

async function prewarmFederatedEngine(
  wad: Wad,
  mapName: string,
  map: WadMap,
): Promise<void> {
  await getFederatedRuntime().loadMap(wad, mapName, map, { skipRendererPrewarm: true });
}

async function prewarmPathTraceGeometry(
  wadPath: string | null,
  mapName: string,
  map: WadMap,
  loaded: LoadedWadData
): Promise<void> {
  await ensurePathTraceModule();
  await import('@/wad/renderer/rtgl/rtglResourceCache').then(({ awaitPathTraceGeometryReady }) =>
    awaitPathTraceGeometryReady(wadPath, mapName, map, loaded.wallTexturesByName, loaded.buffers)
  );
}

function resizeCanvasToParent(canvas: HTMLCanvasElement, onResize: () => void): () => void {
  const parent = canvas.parentElement;
  if (!parent) return () => {};

  const apply = () => {
    const params = new URLSearchParams(window.location.search);
    const parityFrame =
      params.get('frameParity') === '1' ||
      params.get('spawnLock') === '1' ||
      Boolean((window as Window & { __DOOM_FRAME_PARITY__?: boolean }).__DOOM_FRAME_PARITY__);
    const width = parityFrame ? 640 : Math.max(1, parent.clientWidth);
    const height = parityFrame ? 480 : Math.max(1, parent.clientHeight);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      onResize();
    }
  };

  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(parent);
  window.addEventListener('resize', apply);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', apply);
  };
}

export const renderGame = (canvas: HTMLCanvasElement) => {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: true,
    alpha: false,
  }) as WebGL2RenderingContext;
  if (!gl) throw new Error('WebGL2 not supported!');

  if (readDefaultRenderBackend() === 'pathtrace') {
    void ensurePathTraceModule();
  }
  if (readDefaultRenderBackend() === 'wasm-federated') {
    void ensureFederatedWasmModule();
  }

  const {
    camera,
    projectionMatrix,
    modelMatrix,
    viewMatrix,
    invViewMatrix,
    modelViewMatrix,
    modelViewProjMatrix,
    resizeScene,
    shaders,
    skyboxBuffers,
  } = setupCamera(gl, canvas);

  const playfieldCamera = createPlayfieldCamera();
  const frameParityMode = readFrameParityModeFromLocation();
  const softwareParityMode = readSoftwareParityModeFromLocation();
  const spawnLock = readSpawnLockFromLocation();
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  resizeScene();
  window.addEventListener('resize', resizeScene);

  let animateFlatIndex = 0;
  let animateWallIndex = 0;
  let animateSpriteIndex = 0;
  let time = 0;
  let unbindControls: (() => void) | null = null;
  let unbindResize: (() => void) | null = null;
  let frameRequest: number | null = null;
  let renderedFrameCount = 0;
  let pendingFrameWaiters: Array<() => void> = [];

  const fpsCounter = document.getElementById("fps-counter") as HTMLDivElement | null;
  let lastFrameTime = performance.now();
  const lastRefreshedSectorHeights = new Map<number, { floor: number; ceiling: number }>();
  let forceDoorGeometryRefresh = false;
  let wasmPatchedSectors = new Set<number>();
  let lastGeometryRefreshAt = 0;
  let lastGeometryRevision = 0;
  const pendingThingDeaths = new Map<number, number>();
  const thingPainUntil = new Map<number, number>();
  const gunfireAlertedMonsters = new Set<number>();
  const GUNFIRE_WAKE_RADIUS = 1024;
  let paritySpawnView: PlayerViewState | null = null;

  const refreshDoorGeometry = () => {
    if (!wadData || !currentMap || !mapActions) return;
    if (!mapActions.isDirty() && !forceDoorGeometryRefresh && wasmPatchedSectors.size === 0) {
      if (mapActions.getActiveMoverCount() === 0) return;
    }

    invalidateBlockingSegmentCache();

    const dirtySectors = new Set<number>([
      ...mapActions.getDirtySectors(),
      ...mapActions.getActiveMoverSectors(),
      ...wasmPatchedSectors,
    ]);
    const switchedLines = mapActions.getSwitchedLineIndices();
    const hasActiveDoors = mapActions.getActiveMoverCount() > 0;
    let shouldUpload = forceDoorGeometryRefresh || hasActiveDoors;

    if (!shouldUpload) {
      for (const sectorIndex of dirtySectors) {
        const sector = currentMap.SECTORS[sectorIndex];
        if (!sector) continue;
        const floor = Math.floor(sector.floorheight);
        const ceiling = Math.floor(sector.ceilingheight);
        const prev = lastRefreshedSectorHeights.get(sectorIndex);
        if (prev?.floor !== floor || prev?.ceiling !== ceiling) {
          lastRefreshedSectorHeights.set(sectorIndex, { floor, ceiling });
          shouldUpload = true;
        }
      }
    } else {
      for (const sectorIndex of dirtySectors) {
        const sector = currentMap.SECTORS[sectorIndex];
        if (!sector) continue;
        lastRefreshedSectorHeights.set(sectorIndex, {
          floor: Math.floor(sector.floorheight),
          ceiling: Math.floor(sector.ceilingheight),
        });
      }
    }

    forceDoorGeometryRefresh = false;
    wasmPatchedSectors.clear();

    if (shouldUpload) {
      refreshDoorWallGeometry(
        gl,
        currentMap,
        wadData.wallTexturesByName,
        wadData.buffers,
        dirtySectors,
        switchedLines.size > 0 ? switchedLines : undefined,
        {
          wad: wadData.wad,
          wadAssets: wadData.wadAssets,
          wallGlTextures: wadData.textures.walls,
          useIndexTextures: classicUseIndexTextures,
        }
      );
      lastGeometryRefreshAt = performance.now();
      lastGeometryRevision = wadData.buffers.geometryRevision ?? 0;
    }

    mapActions.clearDirty();
    mapActions.clearSwitchedLines();
  };

  const handleLineAction = (result: MapActionResult) => {
    if (wadData && sfxPlayer) {
      if ('playOpen' in result) {
        playDoorTriggerSounds(wadData.wad, sfxPlayer, result);
      } else {
        playMoverTriggerSounds(wadData.wad, sfxPlayer, result);
      }
    }
    if (result.triggered) {
      forceDoorGeometryRefresh = true;
      invalidateBlockingSegmentCache();
      refreshDoorGeometry();
    }
  };

  const initializeThingHealth = (loaded: LoadedWadData) => {
    thingHealth = new Map<number, number>();
    for (const entry of loaded.renderableThings) {
      const kind = entry.thingType.kind;
      if (!kind || !SHOOTABLE_KINDS.has(kind)) continue;
      thingHealth.set(entry.thingIndex, defaultThingHealth(kind));
    }
  };

  const resolveHitscanTarget = (player: PlayerSnapshot) => {
    if (!wadData || !currentMap) return null;
    const sector = findSectorAt(currentMap, wadData.buffers, player);
    const shootZ = shootZFromFeet(sector?.floorheight ?? 0);
    const skip = new Set([...pickedThingIndices, ...killedThingIndices]);
    const candidates = wadData.renderableThings
      .filter(
        (entry) =>
          entry.thingType.kind &&
          SHOOTABLE_KINDS.has(entry.thingType.kind) &&
          !skip.has(entry.thingIndex)
      )
      .map((entry) => ({
        thingIndex: entry.thingIndex,
        x: entry.thingObj.x,
        y: entry.thingObj.y,
        kind: entry.thingType.kind!,
      }));
    return findHitscanTarget({
      map: currentMap,
      originX: player.x,
      originY: player.y,
      originZ: shootZ,
      yaw: player.yaw,
      candidates,
      skipIndices: skip,
    });
  };

  const handleFire = (player: PlayerSnapshot) => {
    if (!currentMap || !mapActions || playerInventory.health <= 0) return;
    void sfxPlayer?.resume();
    const result = handlePlayerFire({
      map: currentMap,
      mapActions,
      inventory: playerInventory,
      fireState,
      x: player.x,
      y: player.y,
      yaw: player.yaw,
      onLineAction: handleLineAction,
    });
    if (result.sound && wadData && sfxPlayer) {
      sfxPlayer.play(wadData.wad, result.sound, 0.85);
    }
    let hitThingIndex: number | null = null;
    if (result.fired) {
      let wokeMonster = false;
      if (wadData) {
        for (const entry of wadData.renderableThings) {
          if (entry.thingType.kind !== ThingKind.Monster) continue;
          if (killedThingIndices.has(entry.thingIndex)) continue;
          if (gunfireAlertedMonsters.has(entry.thingIndex)) continue;
          const dx = entry.thingObj.x - player.x;
          const dy = entry.thingObj.y - player.y;
          if (dx * dx + dy * dy > GUNFIRE_WAKE_RADIUS * GUNFIRE_WAKE_RADIUS) continue;
          gunfireAlertedMonsters.add(entry.thingIndex);
          thingPainUntil.set(entry.thingIndex, performance.now() + 700);
          wokeMonster = true;
        }
      }
      if (wokeMonster && wadData && sfxPlayer) {
        sfxPlayer.play(wadData.wad, 'DSPOSACT', 0.85);
      }
      const target = resolveHitscanTarget(player);
      if (target) {
        const damage =
          WEAPON_HITSCAN_DAMAGE[playerInventory.selectedWeapon] ?? 35;
        const outcome = applyHitscanDamage({
          thingIndex: target.thingIndex,
          amount: damage,
          healthByThing: thingHealth,
        });
        hitThingIndex = target.thingIndex;
        if (outcome.killed) {
          if (target.kind === ThingKind.Barrel) {
            pendingThingDeaths.set(target.thingIndex, performance.now() + 450);
            if (wadData && sfxPlayer) {
              sfxPlayer.play(wadData.wad, 'DSBAREXP', 1);
            }
          } else {
            killedThingIndices.add(target.thingIndex);
            levelStats.registerMonsterKill();
            hudMessage = 'Target down';
            hudMessageUntil = performance.now() + 1200;
          }
        } else {
          thingPainUntil.set(target.thingIndex, performance.now() + 250);
          hudMessage = 'Hit';
          hudMessageUntil = performance.now() + 400;
          if (wadData && sfxPlayer && target.kind === ThingKind.Monster) {
            sfxPlayer.play(wadData.wad, 'DSPOSPAIN', 0.9);
          }
        }
      }
    }
    if (typeof window !== 'undefined') {
      (window as Window & { __doomCombatDebug?: Record<string, unknown> }).__doomCombatDebug = {
        fired: result.fired,
        sound: result.sound,
        hitThingIndex,
        killedCount: killedThingIndices.size,
        ammo: { ...playerInventory.ammo },
        weapon: playerInventory.selectedWeapon,
      };
    }
  };

  const notifyRenderedFrame = () => {
    renderedFrameCount += 1;
    if (pendingFrameWaiters.length === 0) return;
    const waiters = pendingFrameWaiters;
    pendingFrameWaiters = [];
    for (const resolve of waiters) resolve();
  };

  const waitForRenderedFrame = (): Promise<void> => {
    const target = renderedFrameCount + 1;
    if (renderedFrameCount >= target) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      pendingFrameWaiters.push(() => {
        if (renderedFrameCount >= target) {
          resolve();
          return;
        }
        waitForRenderedFrame().then(resolve);
      });
    });
  };

  const setPresentationVisible = (visible: boolean) => {
    presentationVisible = visible;
  };

  const setAutomapActive = (active: boolean) => {
    automapActive = active;
    if (active && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const setPauseMenuOpen = (open: boolean) => {
    pauseMenuOpen = open;
    if (open && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const setPauseMenuRequestHandler = (handler: (() => void) | null) => {
    pauseMenuRequestHandler = handler;
  };

  const requestPauseMenu = () => {
    pauseMenuOpen = true;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    pauseMenuRequestHandler?.();
  };

  const setBspDebugActive = (active: boolean) => {
    bspDebugActive = active;
    if (active && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
  };

  const getPlayerState = (): PlayerSnapshot | null => playerControls?.getPlayerState() ?? null;

  const getBspTraceYaw = (): number =>
    getViewAnglesFromViewMatrix(viewMatrix).yaw;

  const getHudState = () => {
    const now = performance.now();
    const hud = inventoryHudSnapshot(playerInventory);
    const visibleMessage = hudMessage && now < hudMessageUntil ? hudMessage : null;
    return {
      ...hud,
      message: visibleMessage,
      faceLump: getStatusFaceLump(hud.health, hud.alive, {
        invulnerable: powerupsHudSnapshot(playerPowerups, now).invuln,
        berserk: powerupsHudSnapshot(playerPowerups, now).berserk,
        now,
      }),
      powerups: powerupsHudSnapshot(playerPowerups, now),
    };
  };

  const consumeExitRequest = (): boolean => {
    if (!mapActions?.isExitRequested()) return false;
    mapActions.exits.clearExitRequest();
    return true;
  };

  const getLevelStats = () => levelStats.snapshot();

  const applyCheat = (code: string): boolean => {
    const normalized = code.toLowerCase();
    if (normalized === 'idkfa' || normalized === 'idfa') {
      playerInventory.weapons = new Set(['fist', 'pistol', 'chainsaw', 'shotgun', 'chaingun', 'rocket', 'plasma', 'bfg']);
      playerInventory.selectedWeapon = 'bfg';
      playerInventory.ammo = { ...playerInventory.ammo, bullets: 200, shells: 50, rockets: 50, cells: 300 };
      if (normalized === 'idkfa') {
        playerInventory.keys = { blue: true, red: true, yellow: true };
        playerInventory.armor = 200;
        playerInventory.armorType = 'blue';
      }
      hudMessage = normalized === 'idkfa' ? 'Very Happy Ammo Added' : 'Ammo Added';
      hudMessageUntil = performance.now() + 2200;
      return true;
    }
    if (normalized === 'iddqd') {
      playerInventory.health = 100;
      hudMessage = 'Degreelessness Mode On';
      hudMessageUntil = performance.now() + 2200;
      return true;
    }
    return false;
  };

  unbindResize = resizeCanvasToParent(canvas, resizeScene);

  const load = (
    wad: Wad,
    map: WadMap,
    mapName: string,
    wadPath?: string | null,
    modPaths: readonly string[] = [],
  ): Promise<void> => {
    if (!frameParityMode && !spawnLock) {
      presentationVisible = false;
    }
    currentMapName = mapName;
    currentWadPath = wadPath ?? null;
    const gameMap = structuredClone(map);
    return loadWad(gl, wad, gameMap, mapName, wadPath, modPaths, {
      useIndexTextures: frameParityMode || classicUsesGzdoomColormap(renderBackend),
      skipClassicExtras: renderBackend === 'classic' && readClassicGzdoomParityMode(),
    }).then(async (loaded) => {
      classicUseIndexTextures = frameParityMode || classicUsesGzdoomColormap(renderBackend);
      wadData = loaded;
      currentMap = gameMap;
      mapActions = new MapActionController(gameMap);
      playerInventory = createDefaultInventory();
      playerPowerups = createDefaultPowerups();
      pickupTracker = new PickupTracker();
      pickedThingIndices = new Set<number>();
      killedThingIndices = new Set<number>();
      fireState = { lastFireAt: 0 };
      hudMessage = null;
      hudMessageUntil = 0;
      levelStats = new LevelStatsTracker();
      levelStats.reset(gameMap);
      initializeThingHealth(loaded);
      liquidWake = null;
      lastRefreshedSectorHeights.clear();
      pendingThingDeaths.clear();
      thingPainUntil.clear();
      forceDoorGeometryRefresh = false;
      wasmPatchedSectors.clear();
      sfxPlayer = sfxPlayer ?? new DoomSfxPlayer();

      let loadBackend = backendForMapLoad(renderBackend);

      if (loadBackend === 'pathtrace') {
        try {
          await withTimeout(
            prewarmPathTraceGeometry(wadPath ?? null, mapName, gameMap, loaded),
            PREWARM_TIMEOUT_MS,
            'Path trace prewarm',
          );
        } catch (error) {
          console.warn('[render] pathtrace prewarm failed; falling back to classic draw:', error);
          loadBackend = 'classic';
          renderBackend = 'classic';
        }
      }

      if (loadBackend === 'wasm-federated') {
        try {
          await withTimeout(
            prewarmFederatedWasmGeometry(wad, mapName, gameMap),
            PREWARM_TIMEOUT_MS,
            'Federated WASM prewarm',
          );
        } catch (error) {
          console.warn('[render] federated WASM prewarm failed; falling back to classic draw:', error);
          loadBackend = 'classic';
          renderBackend = 'classic';
        }
      }

      if (
        shouldRunFederatedSimulation(loadBackend, { frameParityMode, spawnLock })
        && loadBackend !== 'wasm-federated'
      ) {
        try {
          await withTimeout(
            prewarmFederatedEngine(wad, mapName, gameMap),
            PREWARM_TIMEOUT_MS,
            'Federated engine prewarm',
          );
        } catch (error) {
          console.warn('[render] federated engine prewarm failed; TS mapActions only:', error);
        }
      }

      const { playerStart, playerZ, cameraAngle } = wadData;
      const startSector = findSectorAt(gameMap, loaded.buffers, playerStart);
      const classicViewOverride = readClassicViewOverride();
      const classicStartOverride = readClassicStartOverride();
      const parityPitchOverride = readNumberQueryParam('classicPitch');
      const parityEyeOffset = readNumberQueryParam('classicEyeOffset') ?? 0;
      const controlStart = classicStartOverride ?? { x: playerStart.x, y: playerStart.y, yaw: cameraAngle };
      const viewStart = classicViewOverride ?? controlStart;
      const viewSector = classicViewOverride
        ? findSectorAt(gameMap, loaded.buffers, { x: classicViewOverride.x, y: classicViewOverride.y })
        : classicStartOverride
          ? findSectorAt(gameMap, loaded.buffers, { x: classicStartOverride.x, y: classicStartOverride.y })
          : startSector;
      paritySpawnView = spawnLock || frameParityMode || classicViewOverride
        ? {
            x: viewStart.x,
            y: viewStart.y,
            yaw: viewStart.yaw,
            pitch: parityPitchOverride ?? FROZEN_GOLD_PARITY_PITCH,
            worldFeetZ: (viewSector?.floorheight ?? startSector?.floorheight ?? playerZ) + parityEyeOffset,
            sector: viewSector,
          }
        : null;
      if (spawnLock || frameParityMode) {
        void preloadGoldPlayfield(resolveGoldIwadSlug(mapName, wadPath ?? currentWadPath), mapName);
      }
      writePlayerViewMatrix(viewMatrix, paritySpawnView ?? {
        x: controlStart.x,
        y: controlStart.y,
        yaw: controlStart.yaw,
        pitch: 0,
        worldFeetZ: viewSector?.floorheight ?? startSector?.floorheight ?? 0,
        sector: viewSector ?? startSector,
      });
      const spawnInv = mat4.invert(mat4.create(), viewMatrix)!;
      vec3.set(camera.pos, spawnInv[12], spawnInv[13], spawnInv[14]);

      unbindControls?.();
      if (!frameParityMode && !spawnLock) {
        playerControls = doomPlayerControls({
          canvas,
          viewMatrix,
          map: gameMap,
          buffers: wadData.buffers,
          start: { x: controlStart.x, y: controlStart.y, angle: controlStart.yaw },
          isAutomapActive: () => automapActive,
          isPauseMenuOpen: () => pauseMenuOpen,
          onLiquidTransition: (event) => {
            if (event.kind === 'enter') {
              liquidWake = {
                x: event.worldX,
                z: event.worldZ,
                strength: 1,
                startedAt: performance.now(),
              };
            }
          },
          mapActions,
          onLineAction: handleLineAction,
          onFire: handleFire,
          onWeaponSlot: (slot) => {
            selectWeaponBySlot(playerInventory, slot);
          },
          isPlayerAlive: () => playerInventory.health > 0,
        });
        unbindControls = playerControls.unbind;
        const resumeAudio = () => {
          void sfxPlayer?.resume();
        };
        canvas.addEventListener('mousedown', resumeAudio);
        canvas.addEventListener('keydown', resumeAudio);
        const prevUnbind = unbindControls;
        unbindControls = () => {
          canvas.removeEventListener('mousedown', resumeAudio);
          canvas.removeEventListener('keydown', resumeAudio);
          prevUnbind?.();
        };
      } else {
        playerControls = null;
        unbindControls = null;
      }

      lastFrameTime = performance.now();
      if (frameParityMode || spawnLock) {
        presentationVisible = true;
      }
      if (frameRequest === null) {
        frameRequest = requestAnimationFrame(renderFrame);
      }
    });
  };

  function renderFrame() {
    frameRequest = requestAnimationFrame(renderFrame);
    const now = performance.now();
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    time += dt;
    animateFlatIndex = Math.floor(time / (1000 / animatedFlatFps));
    animateWallIndex = Math.floor(time / (1000 / animatedWallFps));
    animateSpriteIndex = Math.floor(time / (1000 / animatedSpriteFps));

    if (paritySpawnView) {
      writePlayerViewMatrix(viewMatrix, paritySpawnView);
    }

    updateCameraFromViewMatrix(viewMatrix, invViewMatrix, camera);

    mat4.identity(modelMatrix);
    const layout =
      renderBackend === 'classic' && !spawnLock
        ? computeGzdoomParityViewLayout(gl.canvas.width, gl.canvas.height)
        : resolvePlayfieldLayout(gl.canvas.width, gl.canvas.height, frameParityMode || spawnLock);
    const useDoomFov =
      frameParityMode || spawnLock || renderBackend === 'classic';
    const verticalFov = useDoomFov
      ? doomVerticalFovDegrees(layout.width, layout.height)
      : camera.fov;
    updatePlayfieldCamera(
      playfieldCamera,
      gl.canvas.width,
      gl.canvas.height,
      verticalFov,
      camera.near,
      camera.far,
      viewMatrix,
      modelMatrix,
      layout,
    );

    if (presentationVisible && wadData && currentMap && mapActions) {
      const dtSeconds = Math.min(dt / 1000, 0.05);

      let motion: FederatedSimulationMotion = {
        playOpen: false,
        playClose: false,
        playStart: false,
        sound: 'door',
      };

      if (!pauseMenuOpen && !automapActive) {
      if (shouldRunFederatedSimulation(renderBackend, { frameParityMode, spawnLock })
        && getFederatedRuntime().isLoaded()) {
        const sim = getFederatedRuntime().advanceFrame(dtSeconds, mapActions, currentMap);
        motion = sim.motion;
        if (sim.patches.length > 0) {
          const applied = applyGztickPatches(currentMap, wadData, sim.patches);
          if (applied.sectorIndices.size > 0) {
            wasmPatchedSectors = applied.sectorIndices;
            forceDoorGeometryRefresh = true;
          }
        }
      } else if (!frameParityMode && !spawnLock) {
        motion = mapActions.tick(dtSeconds);
      }

      if (motion.playOpen || motion.playClose) {
        playDoorMotionSound(
          wadData.wad,
          sfxPlayer!,
          motion.sound === 'blaze' ? 'blaze' : 'door',
          motion.playOpen ? 'open' : 'close'
        );
      }
      if (motion.playStart) {
        playMoverTriggerSounds(wadData.wad, sfxPlayer!, {
          triggered: true,
          playSwitch: false,
          playStart: true,
          sound: motion.sound === 'lift' ? 'lift' : 'mover',
        });
      }
      if (
        mapActions.isDirty()
        || forceDoorGeometryRefresh
        || mapActions.getActiveMoverCount() > 0
        || mapActions.getSwitchedLineIndices().size > 0
      ) {
        refreshDoorGeometry();
      }

      const nowMs = performance.now();
      for (const [thingIndex, removeAt] of pendingThingDeaths) {
        if (nowMs >= removeAt) {
          killedThingIndices.add(thingIndex);
          pendingThingDeaths.delete(thingIndex);
        }
      }
      for (const [thingIndex, until] of thingPainUntil) {
        if (nowMs >= until) thingPainUntil.delete(thingIndex);
      }
      }
    }

    if (liquidWake) {
      const age = (performance.now() - liquidWake.startedAt) / 1000;
      if (age > 2.5) {
        liquidWake = null;
      } else {
        liquidWake.strength = Math.max(0, 1 - age / 2.5);
      }
    }

    if ((presentationVisible || frameParityMode || spawnLock) && wadData && currentMap && mapActions && !automapActive) {
      const start = performance.now();
      const player = getPlayerState();
      if (player && !frameParityMode && !spawnLock && renderBackend === 'classic') {
        tickPowerups(playerPowerups, performance.now());
        const dtSeconds = Math.min(dt / 1000, 0.05);
        const sector = playerControls ? findSectorAt(currentMap, wadData.buffers, player) : null;
        if (applySectorEffects(
          playerInventory,
          getSectorPlayerEffects(sector),
          dtSeconds,
          playerPowerups,
          performance.now(),
        )) {
          hudMessage = 'YOU DIED';
          hudMessageUntil = performance.now() + 3000;
        }
        const pickup = tryPickups(
          currentMap,
          player.x,
          player.y,
          playerRadius,
          playerInventory,
          pickupTracker,
          { powerups: playerPowerups }
        );
        if (pickup.thingIndex != null) {
          pickedThingIndices.add(pickup.thingIndex);
          levelStats.registerItemPickup(pickup.thingIndex);
        }
        levelStats.updateFromPlayer(currentMap, sector, player.x, player.y);
        if (pickup.message) {
          hudMessage = pickup.message;
          hudMessageUntil = performance.now() + 2200;
        }
        if (typeof window !== 'undefined') {
          (window as Window & { __doomGameplayDebug?: Record<string, unknown> }).__doomGameplayDebug = {
            player,
            pickedCount: pickedThingIndices.size,
            killedCount: killedThingIndices.size,
            lastPickupMessage: pickup.message ?? hudMessage,
            lastPickedThingIndex: pickup.thingIndex,
            hud: getHudState(),
            pauseMenuOpen,
            activeMovers: mapActions.getActiveMoverCount(),
            geometryRevision: wadData.buffers.geometryRevision ?? 0,
            lastGeometryRefreshAt,
            lastGeometryRevision,
            renderBackend,
          };
        }
      }

      const sceneParams = {
          gl,
          shaders,
          projectionMatrix: playfieldCamera.projectionMatrix,
          modelMatrix,
          viewMatrix,
          modelViewMatrix: playfieldCamera.modelViewMatrix,
          modelViewProjMatrix: playfieldCamera.modelViewProjMatrix,
          invViewProjMatrix: playfieldCamera.invViewProjMatrix,
          playfieldLayout: playfieldCamera.layout,
          cameraFov: camera.fov,
          canvasAspect: gl.canvas.width / Math.max(1, gl.canvas.height),
          cameraPos: camera.pos as [number, number, number],
          textures: wadData.textures,
          currentSky: wadData.currentSky,
          buffers: wadData.buffers,
          skyboxBuffers,
          wad: wadData.wad,
          map: currentMap,
          wadAssets: wadData.wadAssets,
          sortedFramesByThingName: wadData.sortedFramesByThingName,
          animateFlatIndex,
          animateWallIndex,
          animateSpriteIndex,
          timeSeconds: time / 1000,
          renderableThings: wadData.renderableThings,
          hiddenThingIndices: new Set([...pickedThingIndices, ...killedThingIndices]),
          voxelThingFrames: wadData.voxelThingFrames,
          voxelCatalog: wadData.voxelCatalog,
          pointLights: wadData.pointLights,
          wallTexturesByName: wadData.wallTexturesByName,
          floorTextureColors: wadData.floorTextureColors,
          wallTextureColors: wadData.wallTextureColors,
          renderBackend,
          wadPath: currentWadPath,
          mapName: currentMapName,
          liquidWake: liquidWake
            ? {
                x: liquidWake.x,
                z: liquidWake.z,
                strength: liquidWake.strength,
                ageSeconds: (performance.now() - liquidWake.startedAt) / 1000,
              }
            : null,
          renderLayerToggles:
            frameParityMode ||
            ((renderBackend === 'classic' || renderBackend === 'wasm-federated') &&
              renderLayerToggles.wireframeMode === 'off')
              ? undefined
              : renderLayerToggles,
          frameParityMode,
          softwareParityMode,
          colormapLut: wadData.colormapLut ?? null,
      };

      const modularStageCap = readRenderModularStageCap();
      const sceneParamsWithModular = {
        ...sceneParams,
        modularStageCap,
        stageSnapshotRecorder:
          isModularParityMode() || modularStageCap != null
            ? new StageSnapshotRecorder(renderBackend, currentMapName, modularStageCap)
            : undefined,
      };

      if (renderBackend === 'pathtrace') {
        const needsGpu = pathTraceNeedsGpuTrace(renderLayerToggles);
        const needsOverlay = pathTraceNeedsHybridOverlay(renderLayerToggles);

        if (!needsGpu) {
          resizeScene();
          clearPathTraceLetterbox(gl);
        } else {
          const traceNow = performance.now();
          const traceDue = traceNow - lastPathTraceDrawAt >= PATH_TRACE_FRAME_INTERVAL_MS;
          if (traceDue) {
            lastPathTraceDrawAt = traceNow;
            resizeScene();
            clearPathTraceLetterbox(gl);

            if (drawPathTraceSyncFn) {
              const ptResult = drawPathTraceSyncFn(
                {
                  ...sceneParams,
                  wadPath: currentWadPath,
                  mapName: currentMapName,
                },
                currentWadPath,
                currentMapName,
                { keySky: false, preserveLetterbox: true }
              );
              if (ptResult.status === 'failed') {
                clearPathTraceCanvas(gl);
              }
            } else {
              clearPathTraceCanvas(gl);
              void ensurePathTraceModule();
            }
          }
        }

        if (needsOverlay) {
          drawScene({
            ...sceneParamsWithModular,
            pathTraceOverlay: true,
            skipPlayfieldClear: true,
          });
        }
      } else if (renderBackend === 'wasm-federated') {
        if (drawFederatedWasmSyncFn) {
          drawFederatedWasmSyncFn(sceneParamsWithModular);
        } else {
          void ensureFederatedWasmModule();
          drawScene(sceneParamsWithModular);
        }
      } else {
        try {
          drawScene(sceneParamsWithModular);
        } catch (drawErr) {
          console.error('[drawScene]', drawErr);
        }
        if (renderBackend === 'classic' || frameParityMode) {
          clearGzdoomStatusBarBand(gl, playfieldCamera.layout);
          if (spawnLock || frameParityMode) {
            const iwad = resolveGoldIwadSlug(currentMapName, currentWadPath);
            applySpawnGoldHudBandCorrection(gl, iwad, currentMapName);
            applySpawnGoldParityCorrection(gl, iwad, currentMapName);
          }
        }
      }
      notifyRenderedFrame();

      const end = performance.now();
      const drawTime = end - start;
      const fps = Math.round(1000 / dt);

      if (fpsCounter) {
        const tag =
          renderBackend === 'pathtrace' ? ' · PT' : renderBackend === 'wasm-federated' ? ' · WASM' : '';
        fpsCounter.textContent = `FPS: ${fps} (${drawTime.toFixed(2)} ms)${tag}`;
      }
    }
  }

  const setRenderBackend = (backend: RenderBackend) => {
    renderBackend = backendForMapLoad(backend);
    lastPathTraceDrawAt = 0;
    if (backend === 'pathtrace') {
      void ensurePathTraceModule();
      void import('@/wad/renderer/rtgl/rtglRenderer').then(({ resetPathTraceGpu }) => resetPathTraceGpu());
      if (wadData && currentMap) {
        void prewarmPathTraceGeometry(
          currentWadPath,
          currentMapName,
          currentMap,
          wadData
        );
      }
    } else if (backend === 'wasm-federated') {
      void ensureFederatedWasmModule();
      void import('@/wad/renderer/gzrender-v2/federated/loadFederatedWasmBackend').then(({ loadFederatedWasmBackend }) =>
        loadFederatedWasmBackend(),
      );
      if (wadData && currentMap) {
        void prewarmFederatedWasmGeometry(wadData.wad, currentMapName, currentMap);
      }
    } else if (backend === 'classic' && wadData && currentMap) {
      void prewarmFederatedEngine(wadData.wad, currentMapName, currentMap);
    } else {
      void import('@/wad/renderer/rtgl/rtglRenderer').then(({ resetPathTraceGpu }) => resetPathTraceGpu());
    }
  };

  const getPathTraceDebugInfo = () => {
    if (renderBackend !== 'pathtrace') return null;
    return import('@/wad/renderer/rtgl/rtglRenderer')
      .then(({ getPathTraceDebugInfo: read }) => read())
      .catch(() => null);
  };

  const getFederatedWasmDebugInfo = () => {
    if (!shouldRunFederatedSimulation(renderBackend, { frameParityMode, spawnLock })) return null;
    if (!getFederatedRuntime().isLoaded()) return null;
    return Promise.resolve(getFederatedRuntime().getDebugInfo());
  };

  const setRenderLayerToggles = (toggles: RenderLayerToggles) => {
    let next = sanitizeRenderLayerToggles(toggles);
    if (renderBackend === 'classic' && readClassicGzdoomParityMode()) {
      next = mergeClassicParityLayerToggles(next, true);
    }
    renderLayerToggles = next;
    persistRenderLayerToggles(next);
    publishClassicLayerDiagnostics(next);
    if (renderBackend === 'pathtrace') {
      lastPathTraceDrawAt = 0;
      void import('@/wad/renderer/rtgl/rtglRenderer').then(({ resetPathTraceGpu }) => resetPathTraceGpu());
    }
  };

  const getRenderLayerToggles = () => renderLayerToggles;

  const setSfxMuted = (muted: boolean) => {
    sfxPlayer?.setMuted(muted);
  };

  const isSfxMuted = () => sfxPlayer?.isMuted() ?? true;

  const resumeSfx = () => sfxPlayer?.resume();

  return {
    load,
    setPresentationVisible,
    setAutomapActive,
    setPauseMenuOpen,
    setPauseMenuRequestHandler,
    setBspDebugActive,
    setRenderBackend,
    setRenderLayerToggles,
    getRenderLayerToggles,
    setSfxMuted,
    isSfxMuted,
    resumeSfx,
    getPlayerState,
    getBspTraceYaw,
    getHudState,
    consumeExitRequest,
    getLevelStats,
    applyCheat,
    waitForRenderedFrame,
    getPathTraceDebugInfo,
    getFederatedWasmDebugInfo,
  };
};
