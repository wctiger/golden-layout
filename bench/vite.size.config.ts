import { resolve } from 'node:path';
import { defineConfig } from 'vite-plus';

const root = import.meta.dirname;

/** Minifies each library on its own, without React, to compare download size. */
export default defineConfig({
  root,
  logLevel: 'warn',
  build: {
    outDir: resolve(root, 'dist-size'),
    emptyOutDir: true,
    minify: true,
    target: 'esnext',
    cssCodeSplit: true,
    lib: {
      entry: {
        next: resolve(root, 'size/next.ts'),
        legacy: resolve(root, 'size/legacy.js'),
        'legacy-jquery': resolve(root, 'size/legacy-jquery.js'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      // The legacy files are classic scripts: keep them whole.
      treeshake: false,
    },
  },
});
