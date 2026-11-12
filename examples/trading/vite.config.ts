import { defineConfig } from 'vite-plus';

// The production build uses React's profiling build, so the toolbar's render meter (a React
// <Profiler>) still counts renders on the deployed page. Development builds count them anyway.
export default defineConfig(({ command }) => ({
  resolve:
    command === 'build'
      ? { alias: [{ find: /^react-dom\/client$/, replacement: 'react-dom/profiling' }] }
      : {},
}));
