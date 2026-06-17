import {
  prewarmFederatedWasmMap,
  resetFederatedWasmBackend,
  getFederatedWasmDebugInfo,
} from './federatedWasmBackend';
import { loadFederatedWasmInstance } from './wasmHost';

let backendReady: Promise<void> | null = null;

export function loadFederatedWasmBackend(): Promise<void> {
  if (!backendReady) {
    backendReady = loadFederatedWasmInstance().then(() => undefined);
    backendReady.catch(() => {
      backendReady = null;
    });
  }
  return backendReady;
}

export function clearFederatedWasmBackendCache(): void {
  backendReady = null;
  resetFederatedWasmBackend();
}

export {
  prewarmFederatedWasmMap,
  getFederatedWasmDebugInfo,
  resetFederatedWasmBackend,
};
