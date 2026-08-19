import type { RenderBackend } from '@/wad/renderer/renderBackend';

/** Classic WebGL and wasm-federated both use the federated engine host for simulation. */
export function shouldRunFederatedSimulation(
  renderBackend: RenderBackend,
  options: { frameParityMode: boolean; spawnLock: boolean },
): boolean {
  if (options.frameParityMode || options.spawnLock) return false;
  return renderBackend === 'classic' || renderBackend === 'wasm-federated';
}
