import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

const root = import.meta.dirname;

/** Builds the two benchmark pages. Both get the same production React from one shared chunk. */
export default defineConfig({
  root,
  base: './',
  logLevel: 'warn',
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    minify: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        legacy: resolve(root, 'legacy/index.html'),
        next: resolve(root, 'next/index.html'),
        dockview: resolve(root, 'dockview/index.html'),
      },
    },
  },
});
