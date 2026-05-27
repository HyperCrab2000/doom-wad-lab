import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { animatedFlatFps, animatedSpriteFps, animatedWallFps } from '@/wad/constants/WadInfo';
import { mat4, vec3 } from 'gl-matrix';

import { setupCamera, updateCameraFromViewMatrix } from './camera';
import { drawScene, invalidateDrawSceneCaches } from './drawScene';
import { LoadedWadData, loadWad } from './loadWad';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import { doomPlayerControls, PlayerSnapshot } from '@/wad/renderer/controls/doomPlayerControls';
import { invalidateBlockingSegmentCache } from '@/wad/renderer/controls/doomCollision';
import { MapActionController, MapActionResult } from '@/wad/game/mapActionController';
import {
  playDoorMotionSound,
  playDoorTriggerSounds,
  playMoverTriggerSounds,
} from '@/wad/game/doorSounds';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { refreshDoorWallGeometry } from '@/wad/renderer/geometry/refreshMapGeometry';
import { getLineIndicesForSides } from '@/wad/renderer/geometry/sectorLineIndex';
import { LevelStatsTracker } from '@/wad/game/levelStats';
import {
  createDefaultInventory,
  applySectorEffects,
  inventoryHudSnapshot,
  type PlayerInventory,
} from '@/wad/game/playerInventory';
import { HudMessageQueue } from '@/wad/game/hudMessages';
import { PickupTracker, tryPickups } from '@/wad/game/pickupSystem';
import { getSectorPlayerEffects } from '@/wad/game/sectorSpecialRuntime';
import { playerRadius } from '@/wad/constants/GameInfo';
import {
  createDefaultPowerups,
  powerupsHudSnapshot,
  resetPowerups,
  tickPowerups,
  type PlayerPowerups,
} from '@/wad/game/playerPowerups';
import { handlePlayerFire } from '@/wad/game/playerCombat';
import { selectWeaponBySlot, cycleWeapon } from '@/wad/game/playerWeapons';
import { getStatusFaceLump, PAIN_FACE_MS } from '@/wad/game/statusFace';

function mergeLineIndexSets(
  primary: ReadonlySet<number>,
  extra?: ReadonlySet<number>
): ReadonlySet<number> | undefined {
  if (primary.size === 0 && (!extra || extra.size === 0)) return undefined;
  if (!extra || extra.size === 0) return primary.size > 0 ? primary : undefined;
  if (primary.size === 0) return extra;
  const merged = new Set(primary);
  for (const lineIndex of extra) merged.add(lineIndex);
  return merged;
}

let wadData: LoadedWadData | null = null;
let currentMap: WadMap | null = null;
let presentationVisible = false;
let automapActive = false;
let mapActions: MapActionController | null = null;
let liquidWake: { x: number; z: number; strength: number; startedAt: number } | null = null;
let sfxPlayer: DoomSfxPlayer | null = null;
let playerControls: ReturnType<typeof doomPlayerControls> | null = null;

function resizeCanvasToParent(canvas: HTMLCanvasElement, onResize: () => void): () => void {
  const parent = canvas.parentElement;
  if (!parent) return () => {};

  const apply = () => {
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
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
    antialias: true,
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext;
  if (!gl) throw new Error('WebGL2 not supported!');

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
  let lastGeometryRefreshAt = 0;
  const levelStats = new LevelStatsTracker();
  const playerInventory: PlayerInventory = createDefaultInventory();
  const pickupTracker = new PickupTracker();
  const hudMessages = new HudMessageQueue();
  const playerPowerups: PlayerPowerups = createDefaultPowerups();
  const fireState = { lastFireAt: 0 };
  let painFaceUntil = 0;
  let onLevelExit: ((info: { secret: boolean }) => void) | null = null;
  const GEOMETRY_REFRESH_INTERVAL_MS = 48;

  const handleFire = (snapshot: PlayerSnapshot) => {
    if (!mapActions || !currentMap || !wadData || !sfxPlayer) return;
    if (playerInventory.health <= 0) return;
    const { sound } = handlePlayerFire({
      map: currentMap,
      mapActions,
      inventory: playerInventory,
      fireState,
      x: snapshot.x,
      y: snapshot.y,
      yaw: snapshot.yaw,
      onLineAction: handleLineAction,
    });
    if (sound) {
      sfxPlayer.play(wadData.wad, sound, 0.7);
    }
  };

  const refreshDoorGeometry = (immediate = false) => {
    if (!wadData || !currentMap || !mapActions) return;
    if (!mapActions.isDirty() && !forceDoorGeometryRefresh) return;

    const now = performance.now();
    if (
      !immediate &&
      !forceDoorGeometryRefresh &&
      now - lastGeometryRefreshAt < GEOMETRY_REFRESH_INTERVAL_MS
    ) {
      if (mapActions.getActiveMoverCount() > 0) {
        invalidateBlockingSegmentCache();
      }
      return;
    }

    invalidateBlockingSegmentCache();

    const dirtySectors = mapActions.getDirtySectors();
    const switchedLines = mapActions.getSwitchedLineIndices();
    const scrollSides = mapActions.scrolls.getDirtySides();
    const scrollLines =
      scrollSides.size > 0 ? getLineIndicesForSides(currentMap, scrollSides) : undefined;

    let shouldUpload = forceDoorGeometryRefresh || (scrollLines?.size ?? 0) > 0;

    if (!shouldUpload) {
      for (const sectorIndex of dirtySectors) {
        const sector = currentMap.SECTORS[sectorIndex];
        if (!sector) continue;
        const floor = Math.floor(sector.floorheight);
        const ceiling = Math.floor(sector.ceilingheight);
        const prev = lastRefreshedSectorHeights.get(sectorIndex);
        if (!prev || prev.floor !== floor || prev.ceiling !== ceiling) {
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

    if (shouldUpload) {
      lastGeometryRefreshAt = now;
      refreshDoorWallGeometry(
        gl,
        currentMap,
        wadData.wallTexturesByName,
        wadData.buffers,
        dirtySectors,
        mergeLineIndexSets(switchedLines, scrollLines)
      );
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
      refreshDoorGeometry(true);
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

  const getPlayerState = (): PlayerSnapshot | null => playerControls?.getPlayerState() ?? null;

  unbindResize = resizeCanvasToParent(canvas, resizeScene);

  const load = (wad: Wad, map: WadMap, mapName: string, wadPath?: string | null): Promise<void> => {
    presentationVisible = false;
    const gameMap = structuredClone(map);
    return loadWad(gl, wad, gameMap, mapName, wadPath).then((loaded) => {
      invalidateDrawSceneCaches();
      wadData = loaded;
      currentMap = gameMap;
      const freshInventory = createDefaultInventory();
      playerInventory.health = freshInventory.health;
      playerInventory.armor = freshInventory.armor;
      playerInventory.armorType = freshInventory.armorType;
      playerInventory.weapons = freshInventory.weapons;
      playerInventory.selectedWeapon = freshInventory.selectedWeapon;
      playerInventory.ammo = { ...freshInventory.ammo };
      playerInventory.keys = { ...freshInventory.keys };
      playerInventory.backpack = freshInventory.backpack;
      pickupTracker.clear();
      hudMessages.clear();
      resetPowerups(playerPowerups);
      fireState.lastFireAt = 0;
      painFaceUntil = 0;
      mapActions = new MapActionController(gameMap, {
        getKeys: () => playerInventory.keys,
      });
      levelStats.reset(gameMap);
      liquidWake = null;
      lastRefreshedSectorHeights.clear();
      forceDoorGeometryRefresh = false;
      sfxPlayer = sfxPlayer ?? new DoomSfxPlayer();

      const { playerStart, playerZ, cameraAngle } = wadData;
      vec3.set(camera.pos, playerStart.x, playerZ, -playerStart.y);

      mat4.identity(viewMatrix);
      mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - cameraAngle);
      mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), camera.pos));

      unbindControls?.();
      playerControls = doomPlayerControls({
        canvas,
        viewMatrix,
        map: gameMap,
        buffers: wadData.buffers,
        start: { x: playerStart.x, y: playerStart.y, angle: cameraAngle },
        isAutomapActive: () => automapActive,
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
        skipBlockingThing: (thing) => pickupTracker.isPicked(thing),
        onFire: handleFire,
        onSelectWeaponSlot: (slot) => selectWeaponBySlot(playerInventory, slot),
        onWeaponScroll: (dir) => cycleWeapon(playerInventory, dir),
      });
      unbindControls = playerControls.unbind;

      lastFrameTime = performance.now();
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

    updateCameraFromViewMatrix(viewMatrix, invViewMatrix, camera);

    if (presentationVisible && wadData && currentMap && mapActions) {
      const motion = mapActions.tick(Math.min(dt / 1000, 0.05));
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
      const world = playerControls?.getPlayerWorld();
      const dtSeconds = Math.min(dt / 1000, 0.05);
      if (world?.sector) {
        levelStats.updateFromPlayer(currentMap, world.sector, world.x, world.y);

        tickPowerups(playerPowerups, now);

        if (playerInventory.health > 0) {
          const sectorFx = getSectorPlayerEffects(world.sector);
          const healthBefore = playerInventory.health;
          const died = applySectorEffects(
            playerInventory,
            sectorFx,
            dtSeconds,
            playerPowerups,
            now
          );
          if (playerInventory.health < healthBefore) {
            painFaceUntil = now + PAIN_FACE_MS;
          }
          if (died) {
            hudMessages.push('You died.');
          }
        }

        const pickup = tryPickups(
          currentMap,
          world.x,
          world.y,
          playerRadius,
          playerInventory,
          pickupTracker,
          { powerups: playerPowerups }
        );
        if (pickup.message) {
          hudMessages.push(pickup.message);
        }
        if (pickup.sfx && sfxPlayer && wadData) {
          sfxPlayer.play(
            wadData.wad,
            pickup.sfx === 'weapon' ? 'DSWPNUP' : 'DSITEMUP',
            0.75
          );
        }
        if (pickup.thingIndex != null) {
          levelStats.registerItemPickup(pickup.thingIndex);
        }
      }
      hudMessages.tick(now);

      if (mapActions.isExitRequested()) {
        const secret = mapActions.exits.isSecretExit();
        mapActions.exits.clearExitRequest();
        onLevelExit?.({ secret });
      }

      if (mapActions.isDirty() || forceDoorGeometryRefresh) {
        refreshDoorGeometry(forceDoorGeometryRefresh);
      } else if (mapActions.getActiveMoverCount() > 0) {
        invalidateBlockingSegmentCache();
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

    if (presentationVisible && wadData && currentMap && mapActions && !automapActive) {
      const start = performance.now();
      drawScene({
        gl,
        shaders,
        projectionMatrix,
        modelMatrix,
        viewMatrix,
        modelViewMatrix,
        modelViewProjMatrix,
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
        renderableThings: wadData.renderableThings.filter(
          (entry) => !pickupTracker.isPicked(entry.thingObj)
        ),
        voxelThingFrames: wadData.voxelThingFrames,
        pointLights: wadData.pointLights,
        liquidWake: liquidWake
          ? {
              x: liquidWake.x,
              z: liquidWake.z,
              strength: liquidWake.strength,
              ageSeconds: (performance.now() - liquidWake.startedAt) / 1000,
            }
          : null,
      });

      const end = performance.now();
      const drawTime = end - start;
      const fps = Math.round(1000 / dt);

      if (fpsCounter) {
        fpsCounter.textContent = `FPS: ${fps} (${drawTime.toFixed(2)} ms)`;
      }
      notifyRenderedFrame();
    }
  }

  const setOnLevelExit = (callback: ((info: { secret: boolean }) => void) | null) => {
    onLevelExit = callback;
  };

  const getHudState = () => {
    const now = performance.now();
    const snapshot = inventoryHudSnapshot(playerInventory);
    return {
      ...snapshot,
      message: hudMessages.get(),
      powerups: powerupsHudSnapshot(playerPowerups, now),
      faceLump: getStatusFaceLump(snapshot.health, snapshot.alive, {
        invulnerable: playerPowerups.invulnUntil > now,
        berserk: playerPowerups.berserkUntil > now,
        painUntil: painFaceUntil,
        now,
      }),
    };
  };

  return {
    load,
    setPresentationVisible,
    setAutomapActive,
    getPlayerState,
    waitForRenderedFrame,
    setOnLevelExit,
    getLevelStats: () => levelStats.snapshot(),
    getHudState,
  };
};
