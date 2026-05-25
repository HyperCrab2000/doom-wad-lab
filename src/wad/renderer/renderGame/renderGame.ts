import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { animatedFlatFps, animatedSpriteFps, animatedWallFps } from '@/wad/constants/WadInfo';
import { mat4, vec3 } from 'gl-matrix';

import { setupCamera, updateCameraFromViewMatrix } from './camera';
import { drawScene } from './drawScene';
import { LoadedWadData, loadWad } from './loadWad';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';
import { doomPlayerControls } from '@/wad/renderer/controls/doomPlayerControls';
import { DoorSystem } from '@/wad/game/doorSystem';
import { playDoorMotionSound, playDoorTriggerSounds } from '@/wad/game/doorSounds';
import { DoomSfxPlayer } from '@/features/level-viewer/sfx/doomSfxPlayer';
import { refreshMapGeometry } from '@/wad/renderer/geometry/refreshMapGeometry';

let wadData: LoadedWadData | null = null;
let currentMap: WadMap | null = null;
let presentationVisible = false;
let doorSystem: DoorSystem | null = null;
let sfxPlayer: DoomSfxPlayer | null = null;

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
  let frameRequest: number | null = null;

  const fpsCounter = document.getElementById("fps-counter") as HTMLDivElement | null;
  let lastFrameTime = performance.now();
  let lastGeometryRefresh = 0;
  const GEOMETRY_REFRESH_MS = 32;

  const setPresentationVisible = (visible: boolean) => {
    presentationVisible = visible;
  };

  const load = (wad: Wad, map: WadMap, mapName: string, wadPath?: string | null): Promise<void> => {
    presentationVisible = false;
    return loadWad(gl, wad, map, mapName, wadPath).then((loaded) => {
      wadData = loaded;
      currentMap = map;
      doorSystem = new DoorSystem(map);
      sfxPlayer = sfxPlayer ?? new DoomSfxPlayer();

      const { playerStart, playerZ, cameraAngle } = wadData;
      vec3.set(camera.pos, playerStart.x, playerZ, -playerStart.y);

      mat4.identity(viewMatrix);
      mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - cameraAngle);
      mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), camera.pos));

      unbindControls?.();
      unbindControls = doomPlayerControls({
        canvas,
        viewMatrix,
        map,
        buffers: wadData.buffers,
        start: { x: playerStart.x, y: playerStart.y, angle: cameraAngle },
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
      const start = performance.now();
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
          refreshMapGeometry(
            gl,
            currentMap,
            wadData.wallTexturesByName,
            wadData.buffers,
            doorSystem.getDirtySectors()
          );
          doorSystem.clearDirty();
          lastGeometryRefresh = refreshNow;
        }
      }

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

  return { load, setPresentationVisible };
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