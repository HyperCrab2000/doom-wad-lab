import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import string from 'vite-plugin-string';

export default defineConfig({
  plugins: [
    react(),
    string({
      include: ['**/*.vert', '**/*.frag'] // GLSL support
    })
  ],
  assetsInclude: ['**/*.wad'] // still needed for wad binary files
});