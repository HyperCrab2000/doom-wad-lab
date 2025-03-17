import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import string from 'vite-plugin-string';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    string({
      include: ['**/*.vert', '**/*.frag']
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }
  },
  assetsInclude: ['**/*.wad']
});