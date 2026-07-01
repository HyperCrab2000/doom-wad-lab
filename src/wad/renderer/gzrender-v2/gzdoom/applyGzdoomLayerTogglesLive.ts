import type { GzdoomWasmModule } from '@/gzdoom-oracle/gzdoomWasmHost';
import { buildGzdoomLayerConsoleCmds } from '@/wad/renderer/gzrender-v2/gzdoom/applyGzdoomRenderLayers';
import type { RenderLayerToggles } from '@/wad/renderer/modular/renderLayerToggles';

function stackPtrNum(ptr: number | bigint): number {
  return typeof ptr === 'bigint' ? Number(ptr) : ptr;
}

function stackPtrExec(ptr: number | bigint): number | bigint {
  return typeof ptr === 'bigint' ? ptr : BigInt(ptr);
}

function execGzdoomConsoleCmd(module: GzdoomWasmModule, cmd: string): boolean {
  const exec = module._gzr_exec_cmd;
  const stringToUTF8 = module.stringToUTF8;
  const stackAlloc = module.stackAlloc;
  const lengthBytesUTF8 = module.lengthBytesUTF8;
  if (!exec || !stringToUTF8 || !stackAlloc || !lengthBytesUTF8) {
    return false;
  }
  try {
    const len = lengthBytesUTF8(cmd) + 1;
    const ptr = stackAlloc(len);
    stringToUTF8(cmd, stackPtrNum(ptr), len);
    exec(stackPtrExec(ptr));
    return true;
  } catch (err) {
    console.warn('[gzdoom] live layer cmd failed:', cmd, err);
    return false;
  }
}

/** CVARs known to exist in GZRender browser WASM (hw_bsp + hw_drawinfo + hw_cvars). */
const LIVE_LAYER_CVARS = new Set([
  'gl_render_walls',
  'gl_render_flats',
  'gl_render_things',
  'gl_texture',
  'gl_portals',
  'gl_noskyboxes',
  'gl_fogmode',
  'gl_bandedswlight',
]);

/** Apply layer toggles to a running GZDoom WASM module without restart. */
export function applyGzdoomLayerTogglesLive(
  module: GzdoomWasmModule | null | undefined,
  toggles: RenderLayerToggles,
): boolean {
  if (!module?._gzr_exec_cmd) {
    console.warn('[gzdoom] live layer toggles unavailable — rebuild WASM with _gzr_exec_cmd export');
    return false;
  }
  const cmds = buildGzdoomLayerConsoleCmds(toggles).filter((cmd) => {
    const name = cmd.split(/\s+/)[0];
    if (!name || !LIVE_LAYER_CVARS.has(name)) {
      return false;
    }
    return true;
  });
  let ok = true;
  for (const cmd of cmds) {
    if (!execGzdoomConsoleCmd(module, cmd)) {
      ok = false;
    }
  }
  return ok;
}
