import type { RtglBackend } from './rtglRenderer';

let backendPromise: Promise<RtglBackend> | null = null;

export function loadRtglBackend(): Promise<RtglBackend> {
  if (!backendPromise) {
    backendPromise = import('./rtglRenderer').then(({ createRtglBackend }) => createRtglBackend());
    backendPromise.catch(() => {
      backendPromise = null;
    });
  }
  return backendPromise;
}

export function clearRtglBackendCache(): void {
  backendPromise = null;
}
