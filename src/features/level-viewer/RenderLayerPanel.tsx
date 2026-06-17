import React from 'react';

import {
  DEFAULT_RENDER_LAYER_TOGGLES,
  WIREFRAME_MODE_LABELS,
  type RenderLayerToggles,
  type WireframeMode,
} from '@/wad/renderer/modular/renderLayerToggles';
import {
  MODULAR_STAGE_LABELS,
  MODULAR_STAGE_ORDER,
  type ModularRenderStage,
} from '@/wad/renderer/modular/modularRenderStage';

const WIREFRAME_MODES: WireframeMode[] = ['off', 'bsp', 'mesh', 'sight'];

const TOGGLE_ROWS: Array<{ key: keyof RenderLayerToggles; label: string; hint?: string }> = [
  { key: 'meshTriangles', label: 'Mesh triangle edges' },
  { key: 'courtyardSky', label: 'Courtyard sky (window lips)' },
  { key: 'solidWalls', label: 'Solid walls' },
  { key: 'wallTextures', label: 'Wall textures' },
  { key: 'solidFloors', label: 'Solid floors' },
  { key: 'floorTextures', label: 'Floor textures' },
  { key: 'solidCeilings', label: 'Solid ceilings' },
  { key: 'ceilingTextures', label: 'Ceiling textures' },
  { key: 'animatedLiquid', label: 'Liquids' },
  { key: 'sky', label: 'Skybox' },
  { key: 'voxels', label: 'Voxels' },
  { key: 'dynamicLighting', label: 'Dynamic lighting' },
  { key: 'coloredLighting', label: 'Colored sector lighting' },
];

export const RenderLayerPanel: React.FC<{
  toggles: RenderLayerToggles;
  onChange: (next: RenderLayerToggles) => void;
  backendLabel: string;
  modularStageCap: ModularRenderStage | null;
  onModularStageCapChange: (stage: ModularRenderStage | null) => void;
}> = ({ toggles, onChange, backendLabel, modularStageCap, onModularStageCapChange }) => {
  const setBool = (key: keyof RenderLayerToggles, value: boolean) => {
    onChange({ ...toggles, [key]: value });
  };

  const setWireframeMode = (mode: WireframeMode) => {
    onChange({ ...toggles, wireframeMode: mode });
  };

  const reset = () => onChange({ ...DEFAULT_RENDER_LAYER_TOGGLES });

  return (
    <div className="render-layer-panel" aria-label="Render layer toggles">
      <div className="render-layer-panel__header">
        <span className="render-layer-panel__title">Render layers</span>
        <span className="render-layer-panel__backend">{backendLabel}</span>
        <button type="button" className="render-layer-panel__reset" onClick={reset}>
          Reset
        </button>
      </div>

      <fieldset className="render-layer-panel__fieldset">
        <legend>Wireframe mode</legend>
        {WIREFRAME_MODES.map((mode) => (
          <label key={mode} className="render-layer-panel__item">
            <input
              type="radio"
              name="wireframeMode"
              checked={toggles.wireframeMode === mode}
              onChange={() => setWireframeMode(mode)}
            />
            <span>{WIREFRAME_MODE_LABELS[mode]}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="render-layer-panel__fieldset">
        <legend>Modular stage cap</legend>
        <label className="render-layer-panel__item">
          <input
            type="radio"
            name="modStageCap"
            checked={modularStageCap == null}
            onChange={() => onModularStageCapChange(null)}
          />
          <span>Full pipeline</span>
        </label>
        {MODULAR_STAGE_ORDER.map((stage) => (
          <label key={stage} className="render-layer-panel__item">
            <input
              type="radio"
              name="modStageCap"
              checked={modularStageCap === stage}
              onChange={() => onModularStageCapChange(stage)}
            />
            <span>{MODULAR_STAGE_LABELS[stage]}</span>
          </label>
        ))}
      </fieldset>

      <div className="render-layer-panel__grid">
        {TOGGLE_ROWS.map(({ key, label }) => (
          <label key={key} className="render-layer-panel__item">
            <input
              type="checkbox"
              checked={Boolean(toggles[key])}
              onChange={(e) => setBool(key, e.target.checked)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {toggles.wireframeMode === 'sight' ? (
        <p className="render-layer-panel__warn" role="status">
          Ray sight is slow (CPU primary rays, throttled). Combine with solid walls/floors for a
          textured view plus wireframe overlay. BSP mode shows raw RenderBSP lists (pass-wall leaks).
          Mesh mode shows the portal-filtered HW submit pool.
        </p>
      ) : null}
    </div>
  );
};
