/** Simulation backend for wasm-federated mode (renderer stays separate). */
export type FederatedEngineMode = 'typescript' | 'wasm';

const ENGINE_MODES: FederatedEngineMode[] = ['typescript', 'wasm'];

export function readFederatedEngineMode(): FederatedEngineMode {
  if (typeof window === 'undefined') return 'typescript';
  const fromUrl = new URLSearchParams(window.location.search).get('engine');
  if (fromUrl && ENGINE_MODES.includes(fromUrl as FederatedEngineMode)) {
    return fromUrl as FederatedEngineMode;
  }
  const stored = sessionStorage.getItem('doom-federated-engine');
  if (stored && ENGINE_MODES.includes(stored as FederatedEngineMode)) {
    return stored as FederatedEngineMode;
  }
  return 'typescript';
}

export function persistFederatedEngineMode(mode: FederatedEngineMode): void {
  sessionStorage.setItem('doom-federated-engine', mode);
}
