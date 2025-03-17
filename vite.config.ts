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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, 'src') },
      { find: '@/shaders', replacement: path.resolve(__dirname, 'src/shaders') }
    ]
  },
  assetsInclude: ['**/*.wad']
});