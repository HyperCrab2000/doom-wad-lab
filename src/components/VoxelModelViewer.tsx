import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { DOOM_THING_MAP } from '@/wad/constants/doomThingMap';
import { ThingKind, ThingType } from '@/wad/constants/ThingTypes';
import { KvxModel, KvxVoxel, loadKvxSlab6Full } from '@/wad/parser/kvxLoader';
import { VOXEL_ASSET_ROOT } from '@/config/doomAssets';
import {
  getVoxelAnimationEntriesForSprite,
  getVoxelAnimationForSprite,
  getVoxelFramesForSprite,
  VoxelCatalogEntry,
} from '@/wad/voxels/voxelCatalog';
import { buildKvxSurfaceMesh, getBrightPaletteColor } from '@/wad/voxels/kvxMesh';

interface SelectableThing {
  key: string;
  label: string;
  sprite: string;
  thing: ThingType;
}

interface LoadedVoxelFrame {
  label: string;
  entry?: VoxelCatalogEntry;
  model: KvxModel;
}

const VIEW_SIZE = 220;
const DEFAULT_FRAME = 'A';
const INITIAL_ROTATION_SPEED = 0.01;
const DEFAULT_ANIMATION_FPS = 8;
const surfaceGeometryCache = new WeakMap<KvxModel, THREE.BufferGeometry>();
const KVX_ASSET_VERSION = '2026-05-24-doom2-voxels';

const selectableThings = Object.entries(DOOM_THING_MAP)
  .filter(([, thing]) => Boolean(thing.sprite))
  .filter(([, thing]) => getVoxelFramesForSprite(thing.sprite!).length > 0)
  .filter(([, thing]) =>
    [
      ThingKind.Monster,
      ThingKind.Boss,
      ThingKind.Pickup,
      ThingKind.Weapon,
      ThingKind.Key,
      ThingKind.Powerup,
      ThingKind.Decoration,
      ThingKind.Barrel,
    ].includes(thing.kind ?? ThingKind.Special)
  )
  .map(([key, thing]) => ({
    key,
    label: thing.description ?? key,
    sprite: thing.sprite!,
    thing,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const VoxelModelViewer: React.FC = () => {
  const [selectedKey, setSelectedKey] = useState(selectableThings[0]?.key ?? '');
  const [selectedVoxelName, setSelectedVoxelName] = useState('');
  const [loadedFrames, setLoadedFrames] = useState<LoadedVoxelFrame[]>([]);
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [status, setStatus] = useState('Choose an enemy/item or upload a KVX file.');
  const [isLoading, setIsLoading] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [animateVoxels, setAnimateVoxels] = useState(true);
  const [animationFps, setAnimationFps] = useState(DEFAULT_ANIMATION_FPS);

  const selectedThing = useMemo(
    () => selectableThings.find((thing) => thing.key === selectedKey) ?? selectableThings[0],
    [selectedKey]
  );

  const voxelFrames = useMemo(
    () => getVoxelAnimationEntriesForSprite(selectedThing?.sprite ?? ''),
    [selectedThing?.sprite]
  );
  const uniqueVoxelFrames = useMemo(
    () => Array.from(new Map(voxelFrames.map((entry) => [entry.lumpName, entry])).values()),
    [voxelFrames]
  );
  const voxelAnimation = useMemo(
    () => getVoxelAnimationForSprite(selectedThing?.sprite ?? ''),
    [selectedThing?.sprite]
  );

  const selectedVoxel =
    uniqueVoxelFrames.find((entry) => entry.lumpName === selectedVoxelName) ?? uniqueVoxelFrames[0];

  const assetName = selectedVoxel?.fileName ?? `${selectedThing?.sprite ?? 'SARG'}${DEFAULT_FRAME}`;
  const assetPath = `${VOXEL_ASSET_ROOT}/${assetName}.kvx`;
  const activeFrame = loadedFrames[activeFrameIndex] ?? loadedFrames[0];
  const activeModel = activeFrame?.model ?? null;

  useEffect(() => {
    setSelectedVoxelName(uniqueVoxelFrames[0]?.lumpName ?? '');
    setActiveFrameIndex(0);
  }, [selectedKey, uniqueVoxelFrames]);

  useEffect(() => {
    if (uniqueVoxelFrames.length === 0) return;
    void loadSelectedFrameSet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  useEffect(() => {
    if (!selectedVoxelName || loadedFrames.length === 0) return;
    const nextIndex = loadedFrames.findIndex((frame) => frame.entry?.lumpName === selectedVoxelName);
    if (nextIndex >= 0) {
      setActiveFrameIndex(nextIndex);
    }
  }, [loadedFrames, selectedVoxelName]);

  useEffect(() => {
    if (!animateVoxels || loadedFrames.length <= 1) return;
    const interval = window.setInterval(() => {
      setActiveFrameIndex((index) => (index + 1) % loadedFrames.length);
    }, 1000 / animationFps);

    return () => window.clearInterval(interval);
  }, [animateVoxels, animationFps, loadedFrames.length]);

  const loadFromBuffer = async (buffer: ArrayBuffer, label: string) => {
    setIsLoading(true);
    try {
      const nextModel = await loadKvxSlab6Full(buffer);
      setLoadedFrames([{ label, model: nextModel }]);
      setActiveFrameIndex(0);
      setStatus(
        `Loaded ${label}: ${nextModel.voxdata.length.toLocaleString()} voxels (${nextModel.xsiz}x${nextModel.ysiz}x${nextModel.zsiz}).`
      );
    } catch (error) {
      setLoadedFrames([]);
      setStatus(error instanceof Error ? error.message : `Failed to load ${label}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedFrameSet = async () => {
    if (!selectedThing || voxelFrames.length === 0) return;
    setIsLoading(true);

    const loaded: LoadedVoxelFrame[] = [];
    const loadedByLump = new Map<string, LoadedVoxelFrame>();
    const missingByPath = new Set<string>();

    for (const entry of uniqueVoxelFrames) {
      const path = `${VOXEL_ASSET_ROOT}/${entry.fileName}.kvx`;
      try {
        const response = await fetch(`${path}?v=${KVX_ASSET_VERSION}`, { cache: 'no-store' });
        if (!response.ok) {
          missingByPath.add(path);
          continue;
        }

        loadedByLump.set(entry.lumpName, {
          label: entry.fileName,
          entry,
          model: await loadKvxSlab6Full(await response.arrayBuffer()),
        });
      } catch {
        missingByPath.add(path);
      }
    }

    for (const entry of voxelFrames) {
      const loadedFrame = loadedByLump.get(entry.lumpName);
      if (loadedFrame) {
        loaded.push(loadedFrame);
      }
    }

    const missing = [...missingByPath];
    setLoadedFrames(loaded);
    setActiveFrameIndex(0);
    setIsLoading(false);

    if (loaded.length === 0) {
      setStatus(
        `Expected ${uniqueVoxelFrames.length} KVX files for ${selectedThing.label} (${selectedThing.sprite}), but none are present in public/voxels. First missing file: ${missing[0] ?? assetPath}.`
      );
      return;
    }

    setStatus(
      `Loaded ${loadedByLump.size}/${uniqueVoxelFrames.length} KVX files for ${selectedThing.label} (${selectedThing.sprite}); animating ${loaded.length} frames from ${voxelAnimation.source === 'zscript' ? `Voxel Doom ${voxelAnimation.state}` : 'VOXELDEF'} order${missing.length ? `; ${missing.length} expected files are missing.` : '.'}`
    );
  };

  return (
    <section className="doom-panel voxel-viewer">
      <div className="voxel-toolbar">
        <label className="doom-field">
          <span>Doom thing</span>
          <select
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value)}
          >
            {selectableThings.map((thing) => (
              <option key={thing.key} value={thing.key}>
                {thing.label} ({thing.sprite})
              </option>
            ))}
          </select>
        </label>

        <label className="doom-field">
          <span>Voxel frame</span>
          <select
            value={selectedVoxel?.lumpName ?? ''}
            onChange={(event) => setSelectedVoxelName(event.target.value)}
          >
            {uniqueVoxelFrames.map((entry) => (
              <option key={entry.lumpName} value={entry.lumpName}>
                {entry.lumpName}.kvx
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="doom-button" onClick={() => loadSelectedFrameSet()} disabled={isLoading || uniqueVoxelFrames.length === 0}>
          Reload {selectedThing?.sprite ?? 'KVX'} frame set
        </button>

        <label className="doom-field">
          <span>Upload KVX</span>
          <input
            type="file"
            accept=".kvx"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await loadFromBuffer(await file.arrayBuffer(), file.name);
            }}
          />
        </label>

        <label className="doom-check">
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(event) => setAutoRotate(event.target.checked)}
          />
          Auto rotate around model center
        </label>

        <label className="doom-check">
          <input
            type="checkbox"
            checked={animateVoxels}
            onChange={(event) => setAnimateVoxels(event.target.checked)}
          />
          Animate KVX frames
        </label>

        <label className="doom-field compact">
          <span>FPS</span>
          <input
            type="number"
            min={1}
            max={30}
            value={animationFps}
            onChange={(event) => setAnimationFps(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
      </div>

      <p className={`voxel-status ${activeModel ? 'ready' : ''}`}>
        {status}
        {activeFrame ? ` Current frame: ${activeFrame.label}.kvx` : ''}
      </p>

      {activeModel ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <VoxelThreePreview model={activeModel} autoRotate={autoRotate} />
          <p className="voxel-help">
            Slab6 axes: file X is left/right, file Y is depth, and file Z is vertical downward.
            The 3D preview maps that to Three.js X/right, Y/up, Z/depth and rotates around the
            model bounding-box center. Animation order is read from the Voxel Doom ZScript when
            available.
          </p>
          <div className="voxel-projections">
            <VoxelProjection title="Top" model={activeModel} axisH="x" axisV="y" axisD="z" />
            <VoxelProjection title="Bottom" model={activeModel} axisH="x" axisV="y" axisD="z" reverseDepth />
            <VoxelProjection title="Front" model={activeModel} axisH="x" axisV="z" axisD="y" reverseDepth />
            <VoxelProjection title="Back" model={activeModel} axisH="x" axisV="z" axisD="y" />
            <VoxelProjection title="Side" model={activeModel} axisH="y" axisV="z" axisD="x" reverseDepth />
          </div>
        </div>
      ) : null}
    </section>
  );
};

const VoxelThreePreview: React.FC<{ model: KvxModel; autoRotate: boolean }> = ({ model, autoRotate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationYRef = useRef(0);
  const autoRotateRef = useRef(autoRotate);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rotationGroupRef = useRef<THREE.Group | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const helperGroupRef = useRef<THREE.Group | null>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    rendererRef.current = renderer;
    renderer.setSize(720, 420, false);
    renderer.setClearColor(0x20242f, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, 720 / 420, 0.1, 5000);
    cameraRef.current = camera;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6f7899, 3.0));
    scene.add(new THREE.AmbientLight(0xffffff, 1.6));

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(96, 192, 96);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x9fc5ff, 1.4);
    fillLight.position.set(-96, 96, -48);
    scene.add(fillLight);

    const rotationGroup = new THREE.Group();
    rotationGroupRef.current = rotationGroup;
    rotationGroup.rotation.y = rotationYRef.current;
    const modelGroup = new THREE.Group();
    modelGroupRef.current = modelGroup;
    const helperGroup = new THREE.Group();
    helperGroupRef.current = helperGroup;
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    materialRef.current = material;

    rotationGroup.add(modelGroup);
    rotationGroup.add(helperGroup);
    scene.add(rotationGroup);

    let animationFrame = 0;
    const animate = () => {
      if (autoRotateRef.current) {
        rotationGroup.rotation.y += INITIAL_ROTATION_SPEED;
        rotationYRef.current = rotationGroup.rotation.y;
      }
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      disposeObject3D(scene);
      material.dispose();
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rotationGroupRef.current = null;
      modelGroupRef.current = null;
      helperGroupRef.current = null;
      materialRef.current = null;
    };
  }, []);

  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    const helperGroup = helperGroupRef.current;
    const camera = cameraRef.current;
    const material = materialRef.current;
    if (!modelGroup || !helperGroup || !camera || !material) return;

    disposeObject3D(modelGroup, { disposeMaterials: false });
    disposeObject3D(helperGroup);
    modelGroup.clear();
    helperGroup.clear();

    const maxSize = Math.max(model.xsiz, model.ysiz, model.zsiz);
    camera.position.set(maxSize * 1.9, maxSize * 1.35, maxSize * 1.9);
    camera.lookAt(0, 0, 0);

    const mesh = new THREE.Mesh(getSurfaceGeometry(model), material);
    modelGroup.add(mesh);

    const dimensions = new THREE.Vector3(model.xsiz, model.zsiz, model.ysiz);
    const boxGeometry = new THREE.BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
    const boxEdges = new THREE.EdgesGeometry(boxGeometry);
    helperGroup.add(new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0xff66ff })));
    helperGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(1, maxSize * 0.035), 16, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      )
    );
    helperGroup.add(createAxisGuide(Math.max(24, maxSize * 0.75)));

    const grid = new THREE.GridHelper(maxSize * 2.2, 8, 0x445066, 0x283044);
    grid.position.y = -dimensions.y / 2;
    helperGroup.add(grid);
  }, [model]);

  return <canvas ref={canvasRef} width={720} height={420} style={{ width: '100%', maxWidth: 720 }} />;
};

interface VoxelProjectionProps {
  title: string;
  model: KvxModel;
  axisH: 'x' | 'y' | 'z';
  axisV: 'x' | 'y' | 'z';
  axisD: 'x' | 'y' | 'z';
  reverseDepth?: boolean;
}

const VoxelProjection: React.FC<VoxelProjectionProps> = ({
  title,
  model,
  axisH,
  axisV,
  axisD,
  reverseDepth = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    drawProjection(context, canvas.width, canvas.height, model, axisH, axisV, axisD, reverseDepth);
  }, [axisD, axisH, axisV, model, reverseDepth]);

  return (
    <figure style={{ margin: 0 }}>
      <figcaption>{title}</figcaption>
      <canvas
        ref={canvasRef}
        width={VIEW_SIZE}
        height={VIEW_SIZE}
        style={{ border: '1px solid #444', background: '#080808' }}
      />
    </figure>
  );
};

function drawProjection(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  model: KvxModel,
  axisH: VoxelProjectionProps['axisH'],
  axisV: VoxelProjectionProps['axisV'],
  axisD: VoxelProjectionProps['axisD'],
  reverseDepth: boolean
) {
  context.clearRect(0, 0, width, height);

  const sizeH = getAxisSize(model, axisH);
  const sizeV = getAxisSize(model, axisV);
  const pixels = new Array<number>(sizeH * sizeV).fill(-1);

  for (const voxel of model.voxdata) {
    const hVal = getAxisValue(voxel, axisH);
    const vVal = getAxisValue(voxel, axisV);
    const dVal = getAxisValue(voxel, axisD);
    const index = vVal * sizeH + hVal;
    const current = pixels[index];
    const currentDepth = current >>> 16;

    if (current === -1 || (reverseDepth ? dVal > currentDepth : dVal < currentDepth)) {
      pixels[index] = (voxel.col & 0xffff) | (dVal << 16);
    }
  }

  const cellSize = Math.max(1, Math.floor(Math.min(width / sizeH, height / sizeV)));
  const offsetX = (width - cellSize * sizeH) / 2;
  const offsetY = (height - cellSize * sizeV) / 2;

  for (let y = 0; y < sizeV; y++) {
    for (let x = 0; x < sizeH; x++) {
      const colorIndex = pixels[y * sizeH + x] & 0xffff;
      if (pixels[y * sizeH + x] === -1) continue;
      context.fillStyle = model.getColor(colorIndex);
      context.fillRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize);
    }
  }
}

function getAxisValue(voxel: KvxVoxel, axis: VoxelProjectionProps['axisH']) {
  return voxel[axis];
}

function getAxisSize(model: KvxModel, axis: VoxelProjectionProps['axisH']) {
  if (axis === 'x') return model.xsiz;
  if (axis === 'y') return model.ysiz;
  return model.zsiz;
}

function colorFromPalette(palette: Uint8Array, colorIndex: number, target: THREE.Color) {
  const [r, g, b] = getBrightPaletteColor(palette, colorIndex);
  target.setRGB(r, g, b);
}

function getSurfaceGeometry(model: KvxModel) {
  const cached = surfaceGeometryCache.get(model);
  if (cached) return cached;

  const mesh = buildKvxSurfaceMesh(model);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  geometry.userData.kvxCachedSurface = true;
  surfaceGeometryCache.set(model, geometry);
  return geometry;
}

function createAxisGuide(axisLength: number) {
  const group = new THREE.Group();

  group.add(createAxisLine(new THREE.Vector3(axisLength, 0, 0), 0xff4a4a));
  group.add(createAxisLine(new THREE.Vector3(0, axisLength, 0), 0x50ff50));
  group.add(createAxisLine(new THREE.Vector3(0, 0, axisLength), 0x5d8cff));

  group.add(createAxisLabel('X', new THREE.Vector3(axisLength * 1.08, 0, 0), 0xff4a4a));
  group.add(createAxisLabel('Y', new THREE.Vector3(0, axisLength * 1.08, 0), 0x50ff50));
  group.add(createAxisLabel('Z', new THREE.Vector3(0, 0, axisLength * 1.08), 0x5d8cff));

  return group;
}

function createAxisLine(end: THREE.Vector3, color: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), end]);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
}

function createAxisLabel(text: string, position: THREE.Vector3, color: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.font = 'bold 42px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.shadowColor = `#${color.toString(16).padStart(6, '0')}`;
  context.shadowBlur = 8;
  context.fillText(text, 32, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color,
      depthTest: false,
    })
  );
  sprite.position.copy(position);
  sprite.scale.setScalar(Math.max(8, position.length() * 0.15));
  return sprite;
}

function disposeObject3D(
  object: THREE.Object3D,
  options: { disposeMaterials?: boolean } = { disposeMaterials: true }
) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (geometry && !geometry.userData.kvxCachedSurface) {
      geometry.dispose();
    }

    if (options.disposeMaterials !== false) {
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial);
      } else if (material) {
        disposeMaterial(material);
      }
    }
  });
}

function disposeMaterial(material: THREE.Material) {
  const maybeMap = material as THREE.Material & { map?: THREE.Texture };
  maybeMap.map?.dispose();
  material.dispose();
}
