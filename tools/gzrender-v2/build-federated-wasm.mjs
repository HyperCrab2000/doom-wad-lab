#!/usr/bin/env node
/**
 * Build federated GZRender WASM module into public/wasm/gzrender_federated/
 *
 * Uses wabt (WAT → WASM). When Rust/wasm-pack is installed, also builds
 * renderer-v2/federated/crates/gzrender-wasm (future).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const WAT = path.join(ROOT, 'renderer-v2/federated/wasm/gzrender_federated.wat');
const OUT_DIR = path.join(ROOT, 'public/wasm/gzrender_federated');
const OUT_WASM = path.join(OUT_DIR, 'gzrender_federated.wasm');

async function buildFromWat() {
  const { default: wabt } = await import('wabt');
  const watSource = fs.readFileSync(WAT, 'utf8');
  const wabtModule = await wabt();
  const parsed = wabtModule.parseWat('gzrender_federated.wat', watSource);
  const { buffer } = parsed.toBinary({ log: false });
  parsed.destroy();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_WASM, Buffer.from(buffer));
  console.log(`WAT → WASM: ${OUT_WASM} (${buffer.byteLength} bytes)`);
}

async function tryRustBuild() {
  const { spawnSync } = await import('node:child_process');
  const cargo = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
  if (cargo.status !== 0) return false;
  const wasmPack = spawnSync('wasm-pack', ['--version'], { encoding: 'utf8' });
  if (wasmPack.status !== 0) return false;
  const crate = path.join(ROOT, 'renderer-v2/federated/crates/gzrender-wasm');
  if (!fs.existsSync(path.join(crate, 'Cargo.toml'))) return false;
  const build = spawnSync(
    'wasm-pack',
    ['build', '--target', 'web', '--out-dir', OUT_DIR, '--out-name', 'gzrender_federated'],
    { cwd: crate, stdio: 'inherit' },
  );
  return build.status === 0;
}

async function main() {
  if (await tryRustBuild()) {
    console.log('Rust federated WASM build succeeded.');
    return;
  }
  await buildFromWat();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
