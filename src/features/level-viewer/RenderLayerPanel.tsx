import React from 'react';

import {
  DEFAULT_RENDER_LAYER_TOGGLES,
  type RenderLayerToggles,
  type WireframeMode,
} from '@/wad/renderer/modular/renderLayerToggles';
import {
  MODULAR_STAGE_LABELS,
  MODULAR_STAGE_ORDER,
  type ModularRenderStage,
} from '@/wad/renderer/modular/modularRenderStage';
import type { RenderBackend } from '@/wad/renderer/renderBackend';
import { isGzdoomWasmFamily } from '@/wad/renderer/renderBackend';

type ToggleKey = keyof RenderLayerToggles;

interface ToggleDef {
  key: ToggleKey;
  label: string;
  title?: string;
}

interface ToggleGroup {
  title: string;
  items: ToggleDef[];
}

const GZDOOM_DEBUG_VIEWS: Array<{ value: WireframeMode; label: string; title: string }> = [
  { value: 'off', label: 'Normal (textured)', title: 'Full textured 3D view' },
  { value: 'bsp', label: 'Wall outlines', title: 'Draw wall edges only — no textures or flats' },
  { value: 'mesh', label: 'Outlines + floors', title: 'Wall and floor/ceiling edges — no textures' },
  { value: 'sight', label: 'Ray debug (slow)', title: 'Per-ray visibility test — very slow' },
];

const GZDOOM_GROUPS: ToggleGroup[] = [
  {
    title: 'Geometry',
    items: [
      { key: 'solidWalls', label: 'Walls', title: 'Vertical wall surfaces' },
      { key: 'solidFloors', label: 'Floors', title: 'Floor flats' },
      { key: 'solidCeilings', label: 'Ceilings', title: 'Ceiling flats' },
      { key: 'sky', label: 'Sky', title: 'Sky texture / outdoor backdrop' },
      { key: 'voxels', label: 'Sprites', title: 'Monsters, items, decorations' },
    ],
  },
  {
    title: 'Textures',
    items: [
      { key: 'wallTextures', label: 'Walls', title: 'Texture images on walls (off = flat color)' },
      { key: 'floorTextures', label: 'Floors', title: 'Texture images on floors' },
      { key: 'ceilingTextures', label: 'Ceilings', title: 'Texture images on ceilings' },
      { key: 'animatedLiquid', label: 'Water & lava', title: 'Animated liquid flats' },
    ],
  },
  {
    title: 'Lighting',
    items: [
      { key: 'dynamicLighting', label: 'Dynamic', title: 'Moving light on walls and sprites' },
      { key: 'coloredLighting', label: 'Sector color', title: 'Colored sector lighting' },
    ],
  },
];

const CLASSIC_GROUPS: ToggleGroup[] = [
  {
    title: 'Geometry',
    items: [
      { key: 'solidWalls', label: 'Walls' },
      { key: 'solidFloors', label: 'Floors' },
      { key: 'solidCeilings', label: 'Ceilings' },
      { key: 'sky', label: 'Sky' },
      { key: 'voxels', label: 'Sprites' },
      { key: 'courtyardSky', label: 'Courtyard sky', title: 'Sky flats visible through window openings' },
    ],
  },
  {
    title: 'Textures',
    items: [
      { key: 'wallTextures', label: 'Walls' },
      { key: 'floorTextures', label: 'Floors' },
      { key: 'ceilingTextures', label: 'Ceilings' },
      { key: 'animatedLiquid', label: 'Water & lava' },
    ],
  },
  {
    title: 'Lighting',
    items: [
      { key: 'dynamicLighting', label: 'Dynamic' },
      { key: 'coloredLighting', label: 'Sector color' },
    ],
  },
];

const CLASSIC_DEBUG_VIEWS: Array<{ value: WireframeMode; label: string; title: string }> = [
  { value: 'off', label: 'Normal', title: 'Standard textured view' },
  { value: 'bsp', label: 'BSP lines', title: 'BSP sight wireframe' },
  { value: 'mesh', label: 'Mesh pool', title: 'Portal-filtered hardware mesh' },
  { value: 'sight', label: 'Ray sight (slow)', title: 'Ray-cast visibility overlay' },
];

export function summarizeLayerToggles(toggles: RenderLayerToggles, gzdoom: boolean): string {
  if (toggles.wireframeMode !== 'off') {
    const pick = (gzdoom ? GZDOOM_DEBUG_VIEWS : CLASSIC_DEBUG_VIEWS).find(
      (v) => v.value === toggles.wireframeMode,
    );
    return pick?.label ?? 'Debug view';
  }
  const off: string[] = [];
  if (!toggles.solidWalls) off.push('walls');
  if (!toggles.solidFloors) off.push('floors');
  if (!toggles.solidCeilings) off.push('ceilings');
  if (!toggles.sky) off.push('sky');
  if (!toggles.voxels) off.push('sprites');
  if (off.length === 0) return 'All on';
  if (off.length <= 2) return `${off.join(', ')} hidden`;
  return `${off.length} layers off`;
}

export const RenderLayerPanel: React.FC<{
  toggles: RenderLayerToggles;
  onChange: (next: RenderLayerToggles) => void;
  renderBackend: RenderBackend;
  modularStageCap: ModularRenderStage | null;
  onModularStageCapChange: (stage: ModularRenderStage | null) => void;
  disabled?: boolean;
}> = ({
  toggles,
  onChange,
  renderBackend,
  modularStageCap,
  onModularStageCapChange,
  disabled = false,
}) => {
  const gzdoom = isGzdoomWasmFamily(renderBackend);
  const groups = gzdoom ? GZDOOM_GROUPS : CLASSIC_GROUPS;
  const debugViews = gzdoom ? GZDOOM_DEBUG_VIEWS : CLASSIC_DEBUG_VIEWS;

  const setBool = (key: ToggleKey, value: boolean) => {
    if (disabled) return;
    onChange({ ...toggles, [key]: value });
  };

  const setWireframeMode = (mode: WireframeMode) => {
    if (disabled) return;
    onChange({ ...toggles, wireframeMode: mode });
  };

  const reset = () => {
    if (disabled) return;
    onChange({ ...DEFAULT_RENDER_LAYER_TOGGLES });
  };

  const backendTitle =
    renderBackend === 'gzdoom-s-wasm'
      ? 'GZDoom modular'
      : renderBackend === 'gzdoom-wasm'
        ? 'GZDoom gold'
        : renderBackend === 'pathtrace'
          ? 'Path trace'
          : renderBackend === 'wasm-federated'
            ? 'WASM federated'
            : 'Classic WebGL';

  return (
    <div className={`render-layer-panel${disabled ? ' render-layer-panel--disabled' : ''}`}>
      <div className="render-layer-panel__head">
        <h3 className="render-layer-panel__title">Render layers</h3>
        <span className="render-layer-panel__backend">{backendTitle}</span>
      </div>

      <div className="render-layer-panel__body">
        {gzdoom ? (
          <p className="render-layer-panel__note">Changes apply instantly — no reload.</p>
        ) : null}

        {groups.map((group) => (
          <section key={group.title} className="render-layer-panel__group">
            <h4 className="render-layer-panel__group-title">{group.title}</h4>
            <div className="render-layer-panel__list">
              {group.items.map(({ key, label, title }) => (
                <label key={key} className="render-layer-panel__row-item" title={title}>
                  <input
                    type="checkbox"
                    checked={Boolean(toggles[key])}
                    disabled={disabled}
                    onChange={(e) => setBool(key, e.target.checked)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </section>
        ))}

        <section className="render-layer-panel__group render-layer-panel__group--debug">
          <h4 className="render-layer-panel__group-title">Debug view</h4>
          <label className="render-layer-panel__field">
            <span>Mode</span>
            <select
              value={toggles.wireframeMode}
              disabled={disabled}
              onChange={(e) => setWireframeMode(e.target.value as WireframeMode)}
            >
              {debugViews.map(({ value, label, title }) => (
                <option key={value} value={value} title={title}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="render-layer-panel__row-item" title="Draw triangle edges on top of the scene">
            <input
              type="checkbox"
              checked={toggles.meshTriangles}
              disabled={disabled}
              onChange={(e) => setBool('meshTriangles', e.target.checked)}
            />
            <span>Triangle edges</span>
          </label>
          <button
            type="button"
            className="render-layer-panel__reset"
            disabled={disabled}
            onClick={reset}
          >
            Reset all
          </button>
        </section>

        {!gzdoom ? (
          <section className="render-layer-panel__group">
            <h4 className="render-layer-panel__group-title">Pipeline cap</h4>
            <label className="render-layer-panel__field">
              <span>Stage</span>
              <select
                className="render-layer-panel__stage"
                value={modularStageCap ?? ''}
                disabled={disabled}
                onChange={(e) =>
                  onModularStageCapChange(
                    e.target.value === '' ? null : (e.target.value as ModularRenderStage),
                  )
                }
              >
                <option value="">Full pipeline</option>
                {MODULAR_STAGE_ORDER.map((stage) => (
                  <option key={stage} value={stage}>
                    {MODULAR_STAGE_LABELS[stage]}
                  </option>
                ))}
              </select>
            </label>
          </section>
        ) : null}
      </div>
    </div>
  );
};
