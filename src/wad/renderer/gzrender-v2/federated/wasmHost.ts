import type { FederatedWasmInstance } from './types';

const WASM_URL = '/wasm/gzrender_federated/gzrender_federated.wasm';

type WasmExports = {
  memory: WebAssembly.Memory;
  init: () => number;
  validate_gzstate: (ptr: number, len: number) => number;
  set_counts?: (vertices: number, sectors: number) => void;
  clear_state: () => void;
  get_vertex_count: () => number;
  get_sector_count: () => number;
  get_linedef_count?: () => number;
  get_seg_count?: () => number;
  get_section_count?: () => number;
  has_full_gzstate_parse?: () => number;
  is_loaded: () => number;
  tick: () => number;
};

function hasFullGzstateParse(exports: WasmExports): boolean {
  if (typeof exports.has_full_gzstate_parse === 'function') {
    return exports.has_full_gzstate_parse() === 1;
  }
  return typeof exports.get_section_count === 'function' && typeof exports.get_linedef_count === 'function';
}

let instancePromise: Promise<FederatedWasmInstance> | null = null;

function wrapExports(exports: WasmExports): FederatedWasmInstance {
  const fullParse = hasFullGzstateParse(exports);
  return {
    memory: exports.memory,
    init: () => exports.init(),
    validateGzstate: (ptr, len) => exports.validate_gzstate(ptr, len),
    setCounts: (vertices, sectors) => exports.set_counts?.(vertices, sectors),
    clearState: () => exports.clear_state(),
    getVertexCount: () => exports.get_vertex_count(),
    getSectorCount: () => exports.get_sector_count(),
    getLinedefCount: () => exports.get_linedef_count?.() ?? 0,
    getSegCount: () => exports.get_seg_count?.() ?? 0,
    getSectionCount: () => exports.get_section_count?.() ?? 0,
    hasFullGzstateParse: () => fullParse,
    isLoaded: () => exports.is_loaded(),
    tick: () => exports.tick(),
    copyGzstateBytes(bytes: Uint8Array): number {
      const mem = exports.memory;
      if (bytes.byteLength > mem.buffer.byteLength) {
        const pagesNeeded = Math.ceil(bytes.byteLength / 65536);
        mem.grow(Math.max(1, pagesNeeded - mem.buffer.byteLength / 65536));
      }
      const view = new Uint8Array(mem.buffer);
      view.set(bytes, 0);
      return 0;
    },
  };
}

async function fetchWasmBytes(): Promise<ArrayBuffer> {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.join(process.cwd(), 'public/wasm/gzrender_federated/gzrender_federated.wasm');
    const buf = await fs.readFile(file);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const response = await fetch(WASM_URL);
  if (!response.ok) {
    throw new Error(`Federated WASM not found at ${WASM_URL} — run: npm run build:wasm`);
  }
  return response.arrayBuffer();
}

export async function loadFederatedWasmInstance(): Promise<FederatedWasmInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const wasmBytes = await fetchWasmBytes();
      const { instance } = await WebAssembly.instantiate(wasmBytes, {});
      const wrapped = wrapExports(instance.exports as unknown as WasmExports);
      const ok = wrapped.init();
      if (!ok) {
        throw new Error('Federated WASM init() failed');
      }
      return wrapped;
    })();
    instancePromise.catch(() => {
      instancePromise = null;
    });
  }
  return instancePromise;
}

export function clearFederatedWasmInstanceCache(): void {
  instancePromise = null;
}
