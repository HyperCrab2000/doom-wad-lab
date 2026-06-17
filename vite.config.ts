import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import string from 'vite-plugin-string';
import path from 'path';
import { readFile } from 'fs/promises';

function patchOpl3StrictLoops(code: string): string {
  return code
    .replace(/\bfor\s*\(\s*i\s*=/g, 'for (var i =')
    .replace(/\bfor\s*\(\s*j\s*=/g, 'for (var j =')
    .replace(/\bfor\s*\(\s*k\s*=/g, 'for (var k =');
}

/** opl3 dist uses `for (i = …)` without declaring i; ES modules are strict and throw in browsers. */
function fixOpl3StrictLoops(): Plugin {
  return {
    name: 'fix-opl3-strict-loops',
    enforce: 'pre',
    async transform(code, id) {
      if (!id.includes('node_modules/opl3') || !id.endsWith('.js')) return null;
      const patched = patchOpl3StrictLoops(code);
      if (patched === code) return null;
      return { code: patched, map: null };
    },
  };
}

/** Ship browserified OPL3 (patched) as a static script — avoids broken Vite dep prebundles. */
function copyOpl3BrowserBundle(): Plugin {
  return {
    name: 'copy-opl3-browser-bundle',
    async buildStart() {
      const src = path.resolve(__dirname, 'node_modules/opl3/dist/opl3.js');
      const destDir = path.resolve(__dirname, 'public/vendor');
      const dest = path.join(destDir, 'opl3.js');
      let code = await readFile(src, 'utf8');
      code = patchOpl3StrictLoops(code);
      const { mkdir, writeFile } = await import('fs/promises');
      await mkdir(destDir, { recursive: true });
      await writeFile(dest, code);
    },
  };
}

function buildFederatedWasmPlugin(): Plugin {
  return {
    name: 'build-federated-wasm',
    async buildStart() {
      const { spawnSync } = await import('node:child_process');
      const script = path.resolve(__dirname, 'tools/gzrender-v2/build-federated-wasm.mjs');
      const result = spawnSync(process.execPath, [script], {
        cwd: __dirname,
        stdio: 'inherit',
      });
      if (result.status !== 0) {
        throw new Error('build-federated-wasm failed');
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    string({
      include: ['**/*.vert', '**/*.frag', '**/*.glsl']
    }),
    fixOpl3StrictLoops(),
    copyOpl3BrowserBundle(),
    buildFederatedWasmPlugin(),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@/shaders', replacement: path.resolve(__dirname, 'src/shaders') },
    ]
  },
  optimizeDeps: {
    entries: ['index.html'],
    exclude: ['spessasynth_core'],
  },
  assetsInclude: ['**/*.wad','**/*.kvx', '**/*.kvx?arrayBuffer'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }
          if (id.includes('node_modules/three/examples')) {
            return 'three';
          }
          if (id.includes('/wad/renderer/rtgl/')) {
            return 'rtgl-renderer';
          }
          if (id.includes('/wad/renderer/gzrender-v2/')) {
            return 'gzrender-federated';
          }
        },
      },
    },
  },
});