import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, './public'), // ✅ Set public as the root
  server: {
    port: 8081, // Serve on port 8081
  },
  resolve: {
    alias: {
      // ✅ Correct the alias properly
      '@': path.resolve(__dirname, '../../../../'), // Points to root, not just src
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(__dirname, './public/index.html'),
    },
  },
});
