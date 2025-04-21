import { Wad } from '@/wad/interfaces/Wad';
import { WadMap } from '@/wad/interfaces/WadMap';
import { animatedFlatFps, animatedSpriteFps, animatedWallFps } from '@/wad/constants/WadInfo';
import { mat4, vec3 } from 'gl-matrix';

import { setupCamera, updateCameraFromViewMatrix } from './camera';
import { drawScene } from './drawScene';
import { LoadedWadData, loadWad } from './loadWad';
import { Thing } from '@/wad/interfaces/Thing';
import { Sector } from '@/wad/interfaces/Sector';

let wadData: LoadedWadData | null = null;
let currentMap: WadMap | null = null;

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

  resizeScene();
  window.addEventListener('resize', resizeScene);

  let animateFlatIndex = 0;
  let animateWallIndex = 0;
  let animateSpriteIndex = 0;
  let time = 0;

  const fpsCounter = document.getElementById("fps-counter") as HTMLDivElement | null;
  let lastFrameTime = performance.now();

  const load = (wad: Wad, map: WadMap, mapName: string) => {
    wadData = loadWad(gl, wad, map, mapName);
    currentMap = map;

    const { playerStart, playerZ, cameraAngle } = wadData;
    vec3.set(camera.pos, playerStart.x, playerZ, -playerStart.y);

    mat4.identity(viewMatrix);
    mat4.rotateY(viewMatrix, viewMatrix, Math.PI / 2 - cameraAngle);
    mat4.translate(viewMatrix, viewMatrix, vec3.negate(vec3.create(), camera.pos));

    console.log('Loaded WAD data:', {
      flats: wadData.buffers.flats.length,
      walls: wadData.buffers.walls.length,
      triangles: wadData.buffers.sectorTriangles,
    });

    lastFrameTime = performance.now();
    requestUncappedFrame();
  };

  function requestUncappedFrame() {
    const now = performance.now();
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    time += dt;
    animateFlatIndex = Math.floor(time / (1000 / animatedFlatFps));
    animateWallIndex = Math.floor(time / (1000 / animatedWallFps));
    animateSpriteIndex = Math.floor(time / (1000 / animatedSpriteFps));

    updateCameraFromViewMatrix(viewMatrix, invViewMatrix, camera);

    if (wadData && currentMap) {
      const sectorsByThing = new Map<Thing, Sector>();
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
        sectorsByThing,
      });

      gl.finish();

      const end = performance.now();
      const drawTime = end - start;
      const fps = Math.round(1000 / dt);

      if (fpsCounter) {
        fpsCounter.textContent = `FPS: ${fps} (${drawTime.toFixed(2)} ms)`;
      }
    }

    setTimeout(requestUncappedFrame, 0); // Uncapped render loop
  }

  return { load };
};