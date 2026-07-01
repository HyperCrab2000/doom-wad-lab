/**
 * Pure WASM host for GZDoom (s) — WebAssembly.instantiate, no Emscripten gzdoom.js.
 *
 * Gold oracle (gzdoom-wasm) uses createGzdoomModule + MEMFS from Emscripten; (s) uses this path only.
 * See docs/gzrender-v2/wasm-gold-and-modular.md
 */

import type { GzdoomWasmModule } from './gzdoomWasmHost';

export const GZDOOM_S_WASM_URL = '/wasm/gzdoom-s/gzdoom.wasm';
export const GZDOOM_S_PK3_BASE = '/wasm/gzdoom-s';

/** Thrown when public/wasm/gzdoom-s/gzdoom.wasm is missing or invalid. */
export class GzdoomSPureWasmNotBuiltError extends Error {
  readonly buildHint = 'npm run build:gzdoom-s-wasm';

  constructor(detail: string) {
    super(
      `GZDoom (s) artifact not available in /wasm/gzdoom-s/: ${detail}. ` +
        `Run \`npm run bootstrap:gzdoom-s\` (dev) or \`npm run build:gzdoom-s-wasm\` (pure WASM). ` +
        `Gold oracle: ?renderer=gzdoom-wasm.`,
    );
    this.name = 'GzdoomSPureWasmNotBuiltError';
  }
}

async function wasmResponseLooksValid(res: Response): Promise<boolean> {
  if (!res.ok) return false;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) return false;
  const buf = new Uint8Array(await res.clone().arrayBuffer());
  if (buf.byteLength < 4) return false;
  // WASM magic \0asm
  return buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d;
}

/** Verify the pure .wasm artifact exists before attempting instantiate. */
export async function assertGzdoomSPureArtifactPresent(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(GZDOOM_S_WASM_URL, { method: 'GET' });
  } catch (err) {
    throw new GzdoomSPureWasmNotBuiltError(
      err instanceof Error ? err.message : String(err),
    );
  }
  if (!(await wasmResponseLooksValid(res))) {
    throw new GzdoomSPureWasmNotBuiltError(
      `GET ${GZDOOM_S_WASM_URL} did not return a WASM module (status ${res.status})`,
    );
  }
}

/**
 * Load GZDoom (s) pure WASM module and bind WebGL2 on the play canvas.
 *
 * TODO (gzdoom-project pure-WASM profile): wire WASI file imports, argv marshalling,
 * and the hosted play export table (_gzr_is_ready, _main, …).
 */
export async function loadGzdoomSPureWasm(
  canvas: HTMLCanvasElement,
): Promise<GzdoomWasmModule> {
  await assertGzdoomSPureArtifactPresent();

  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('GZDoom (s) requires WebGL2 on the play canvas');
  }

  const wasmBytes = new Uint8Array(await (await fetch(GZDOOM_S_WASM_URL)).arrayBuffer());

  // Minimal import stubs until gzdoom-project exports a stable pure-WASM ABI.
  const imports: WebAssembly.Imports = {
    env: {
      gz_abort: (msgPtr: number) => {
        console.error('[gzdoom-s] abort at', msgPtr);
      },
    },
    wasi_snapshot_preview1: {
      proc_exit: () => {
        throw new Error('GZDoom (s) proc_exit — pure WASM runtime incomplete');
      },
      fd_write: () => {
        throw new Error('GZDoom (s) fd_write — wire WASI shims in gzdoomPureWasmHost');
      },
    },
  };

  let instance: WebAssembly.Instance;
  try {
    const compiled = await WebAssembly.compile(wasmBytes);
    instance = await WebAssembly.instantiate(compiled, imports);
  } catch (err) {
    throw new GzdoomSPureWasmNotBuiltError(
      `instantiate failed (${err instanceof Error ? err.message : String(err)}) — ` +
        `pure WASM import table not yet matched to gzdoom-project build`,
    );
  }

  void instance;
  throw new GzdoomSPureWasmNotBuiltError(
    'artifact present but hosted play ABI (_main, FS, _gzr_is_ready) not wired for pure WASM yet',
  );
}
