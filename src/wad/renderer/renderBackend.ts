export type RenderBackend = 'classic' | 'pathtrace' | 'wasm-federated';

const BACKEND_VALUES: RenderBackend[] = ['classic', 'pathtrace', 'wasm-federated'];

function parseBackend(value: string | null): RenderBackend | null {
  if (value && BACKEND_VALUES.includes(value as RenderBackend)) {
    return value as RenderBackend;
  }
  return null;
}

export function isFullResPathTraceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const pt = new URLSearchParams(window.location.search).get('pt');
  return pt === 'full' || pt === 'bruteforce';
}

export function isAdaptivePathTraceEnabled(): boolean {
  return !isFullResPathTraceEnabled();
}

export function readDefaultRenderBackend(): RenderBackend {
  if (typeof window === 'undefined') return 'classic';
  const fromUrl = parseBackend(new URLSearchParams(window.location.search).get('renderer'));
  if (fromUrl) return fromUrl;
  const stored = parseBackend(sessionStorage.getItem('doom-render-backend'));
  if (stored) return stored;
  return 'classic';
}

export function persistRenderBackend(backend: RenderBackend): void {
  sessionStorage.setItem('doom-render-backend', backend);
}
