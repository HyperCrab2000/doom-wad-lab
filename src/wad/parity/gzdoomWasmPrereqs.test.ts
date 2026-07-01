/**
 * Step 2 prerequisites — gold-standard tree + GZDoom WASM binary present.
 *
 * Does NOT compare frames. Use test:gzdoom-wasm-frame for pixel parity.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const GOLD = path.join(ROOT, 'artifacts/gzrender-v2/gold-standard');
const WASM = path.join(ROOT, 'public/wasm/gzdoom/gzdoom.wasm');
const JS = path.join(ROOT, 'public/wasm/gzdoom/gzdoom.js');
const SHADER_OVERLAY = path.join(ROOT, 'public/wasm/gzdoom/gzdoom-wasm-shaders.pk3');
const REQUIRED = process.env.GZDOOM_WASM_PREREQS_REQUIRED === '1';

const EXPECTED = { DOOM: 36, DOOM2: 32 };

function listMaps(slug: string): string[] {
  const dir = path.join(GOLD, slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => n !== 'manifest.json' && fs.statSync(path.join(dir, n)).isDirectory());
}

describe('Step 2 — GZDoom WASM prerequisites', () => {
  it('gold-standard has gzdoom.gzstate + ref.png for every stock map', () => {
    let total = 0;
    for (const [slug, count] of Object.entries(EXPECTED)) {
      const maps = listMaps(slug);
      if (REQUIRED) expect(maps.length).toBe(count);
      for (const map of maps) {
        const gz = path.join(GOLD, slug, map, 'gzdoom.gzstate');
        const png = path.join(GOLD, slug, map, 'ref.png');
        expect(fs.existsSync(gz), `${slug}/${map} gzstate`).toBe(true);
        expect(fs.existsSync(png), `${slug}/${map} ref.png`).toBe(true);
        total++;
      }
    }
    if (REQUIRED) expect(total).toBe(68);
    else expect(total).toBeGreaterThan(0);
  });

  it('GZDoom WASM binary + shader overlay pk3 are built', () => {
    if (!fs.existsSync(WASM) && !REQUIRED) return;
    expect(fs.existsSync(WASM)).toBe(true);
    expect(fs.existsSync(JS)).toBe(true);
    expect(fs.statSync(WASM).size).toBeGreaterThan(1_000_000);
    if (REQUIRED || fs.existsSync(SHADER_OVERLAY)) {
      expect(fs.existsSync(SHADER_OVERLAY)).toBe(true);
      expect(fs.statSync(SHADER_OVERLAY).size).toBeGreaterThan(1_000);
    }
  });
});
