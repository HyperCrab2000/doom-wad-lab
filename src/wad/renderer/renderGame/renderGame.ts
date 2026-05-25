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
import { DoorSystem } from '@/wad/game/doorSystem';
import { playDoorMotionSound, playDoorTriggerSounds } from '@/wad/game/doorSounds';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { refreshMapGeometry } from '@/wad/renderer/geometry/refreshMapGeometry';

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

  const fpsCounter = document.getElementById("fps-counter") as HTMLDivElement | null;
  let lastFrameTime = performance.now();
  let lastGeometryRefresh = 0;
  let pendingFullGeometryRefresh = false;
  const GEOMETRY_REFRESH_MS = 50;
  const FULL_GEOMETRY_REFRESH_MS = 250;
  let lastFullGeometryRefresh = 0;

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
    return loadWad(gl, wad, map, mapName, wadPath).then((loaded) => {
      wadData = loaded;
      currentMap = map;
      doorSystem = new DoorSystem(map);
      pendingFullGeometryRefresh = false;
      lastGeometryRefresh = 0;
      lastFullGeometryRefresh = 0;
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
        map,
        buffers: wadData.buffers,
        start: { x: playerStart.x, y: playerStart.y, angle: cameraAngle },
        isAutomapActive: () => automapActive,
        onLiquidTransition: (event) => triggerPixelSplash(canvas, event.color, event.kind),
        doorSystem,
        onDoorUse: (result) => {
          if (wadData && sfxPlayer) {
            playDoorTriggerSounds(wadData.wad, sfxPlayer, result);
          }
        },
        onWalkDoor: (result) => {
          if (wadData && sfxPlayer) {
            playDoorTriggerSounds(wadData.wad, sfxPlayer, result);
          }
        },
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
      const doorMotion = doorSystem.tick(dt / 1000);
      if (doorMotion.playOpen || doorMotion.playClose) {
        playDoorMotionSound(
          wadData.wad,
          sfxPlayer!,
          doorMotion.sound ?? 'door',
          doorMotion.playOpen ? 'open' : 'close'
        );
      }
      if (doorSystem.isDirty()) {
        const refreshNow = performance.now();
        if (refreshNow - lastGeometryRefresh >= GEOMETRY_REFRESH_MS) {
          const dirtySectors = doorSystem.getDirtySectors();
          const result = refreshMapGeometry(
            gl,
            currentMap,
            wadData.wallTexturesByName,
            wadData.buffers,
            dirtySectors
          );
          doorSystem.clearDirty();
          lastGeometryRefresh = refreshNow;
          if (result === 'partial-pending-full') {
            pendingFullGeometryRefresh = true;
          }
        }
      }

      if (pendingFullGeometryRefresh) {
        const refreshNow = performance.now();
        if (refreshNow - lastFullGeometryRefresh >= FULL_GEOMETRY_REFRESH_MS) {
          refreshMapGeometry(gl, currentMap, wadData.wallTexturesByName, wadData.buffers);
          pendingFullGeometryRefresh = false;
          lastFullGeometryRefresh = refreshNow;
        }
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
    }
  }

  return { load, setPresentationVisible, setAutomapActive, getPlayerState };
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