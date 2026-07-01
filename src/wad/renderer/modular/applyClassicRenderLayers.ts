import {
  publishClassicLayerDiagnostics,
  type ClassicLayerDiagnostics,
} from '@/wad/renderer/modular/classicLayerMapping';
import type { RenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';

export interface ClassicRenderLayerHost {
  setRenderLayerToggles(toggles: RenderLayerToggles): void;
  getRenderLayerToggles?(): RenderLayerToggles;
}

/**
 * Apply layer toggles to the Classic WebGL renderer (live — no map reload).
 * Same contract as `applyGzdoomLayerTogglesLive` for GZDoom WASM.
 */
export function applyClassicLayerTogglesLive(
  host: ClassicRenderLayerHost | null | undefined,
  toggles: RenderLayerToggles,
): ClassicLayerDiagnostics | null {
  if (!host?.setRenderLayerToggles) return null;
  host.setRenderLayerToggles(toggles);
  return publishClassicLayerDiagnostics(toggles);
}
