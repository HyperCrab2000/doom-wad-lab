import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { animatedFlatFps, animatedSpriteFps, animatedWallFps } from '@/wad/constants/WadInfo';
import { mat4, vec3 } from 'gl-matrix';

import { setupCamera, updateCameraFromViewMatrix } from './camera';
import { drawScene } from './drawScene';
import { LoadedWadData, loadWad } from './loadWad';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import { doomPlayerControls, PlayerSnapshot } from '@/wad/renderer/controls/doomPlayerControls';
import { invalidateBlockingSegmentCache } from '@/wad/renderer/controls/doomCollision';
import { DoorSystem, DoorTriggerResult } from '@/wad/game/doorSystem';
import { playDoorMotionSound, playDoorTriggerSounds } from '@/wad/game/doorSounds';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { refreshDoorWallGeometry } from '@/wad/renderer/geometry/refreshMapGeometry';

let wadData: LoadedWadData | null = null;
let currentMap: WadMap | null = null;
let presentationVisible = false;
let automapActive = false;
let doorSystem: DoorSystem | null = null;
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
  const gl = canvas.getContext('webgl2', { antialias: true }) as WebGL2RenderingContext;
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
  const lastRefreshedCeilings = new Map<number, number>();
  let forceDoorGeometryRefresh = false;

  const refreshDoorGeometry = () => {
    if (!wadData || !currentMap || !doorSystem) return;
    if (!doorSystem.isDirty() && !forceDoorGeometryRefresh) return;

    invalidateBlockingSegmentCache();

    const dirtySectors = doorSystem.getDirtySectors();
    const hasActiveDoors = doorSystem.getActiveDoorCount() > 0;
    let shouldUpload = forceDoorGeometryRefresh || hasActiveDoors;

    if (!shouldUpload) {
      for (const sectorIndex of dirtySectors) {
        const ceiling = Math.floor(currentMap.SECTORS[sectorIndex]?.ceilingheight ?? 0);
        if (lastRefreshedCeilings.get(sectorIndex) !== ceiling) {
          lastRefreshedCeilings.set(sectorIndex, ceiling);
          shouldUpload = true;
        }
      }
    } else {
      for (const sectorIndex of dirtySectors) {
        const ceiling = Math.floor(currentMap.SECTORS[sectorIndex]?.ceilingheight ?? 0);
        lastRefreshedCeilings.set(sectorIndex, ceiling);
      }
    }

    forceDoorGeometryRefresh = false;

    if (shouldUpload) {
      refreshDoorWallGeometry(
        gl,
        currentMap,
        wadData.wallTexturesByName,
        wadData.buffers,
        dirtySectors
      );
    }

    doorSystem.clearDirty();
  };

  const handleDoorTrigger = (result: DoorTriggerResult) => {
    if (wadData && sfxPlayer) {
      playDoorTriggerSounds(wadData.wad, sfxPlayer, result);
    }
    if (result.triggered) {
      forceDoorGeometryRefresh = true;
      invalidateBlockingSegmentCache();
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
      wadData = loaded;
      currentMap = gameMap;
      doorSystem = new DoorSystem(gameMap);
      lastRefreshedCeilings.clear();
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
        onLiquidTransition: (event) => triggerPixelSplash(canvas, event.color, event.kind),
        doorSystem,
        onDoorUse: handleDoorTrigger,
        onWalkDoor: handleDoorTrigger,
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

    if (presentationVisible && wadData && currentMap && doorSystem) {
      const doorMotion = doorSystem.tick(Math.min(dt / 1000, 0.05));
      if (doorMotion.playOpen || doorMotion.playClose) {
        playDoorMotionSound(
          wadData.wad,
          sfxPlayer!,
          doorMotion.sound ?? 'door',
          doorMotion.playOpen ? 'open' : 'close'
        );
      }
      if (doorSystem.isDirty() || forceDoorGeometryRefresh) {
        refreshDoorGeometry();
      } else if (doorSystem.getActiveDoorCount() > 0) {
        invalidateBlockingSegmentCache();
      }
    }

    if (presentationVisible && wadData && currentMap && doorSystem && !automapActive) {
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
        renderableThings: wadData.renderableThings,
        voxelThingFrames: wadData.voxelThingFrames,
        pointLights: wadData.pointLights,
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

  return { load, setPresentationVisible, setAutomapActive, getPlayerState, waitForRenderedFrame };
};

function triggerPixelSplash(
  canvas: HTMLCanvasElement,
  color: [number, number, number],
  kind: 'enter' | 'exit'
) {
  const host = canvas.parentElement;
  if (!host) return;

  host.classList.add('splash-host');
  const splash = document.createElement('div');
  splash.className = `pixel-splash ${kind}`;
  splash.style.setProperty('--splash-color', rgbCss(color));

  for (let i = 0; i < 18; i++) {
    const pixel = document.createElement('i');
    const x = (Math.random() - 0.5) * 170;
    const y = -Math.random() * 90 - 12;
    pixel.style.setProperty('--x', `${x}px`);
    pixel.style.setProperty('--y', `${y}px`);
    pixel.style.animationDelay = `${Math.random() * 80}ms`;
    splash.appendChild(pixel);
  }

  host.appendChild(splash);
  window.setTimeout(() => splash.remove(), 720);
}

function rgbCss(color: [number, number, number]) {
  return `rgb(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(color[2] * 255)})`;
}