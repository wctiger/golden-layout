import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    platform: 'browser',
    dts: true,
    clean: true,
    deps: { neverBundle: ['react', 'react-dom', 'react/jsx-runtime'] },
    copy: [{ from: 'src/styles/golden-layout.css', to: 'dist' }],
  },
  lint: {
    ignorePatterns: ['dist/**', 'bench/legacy/vendor/**', 'bench/results/**'],
    options: { typeAware: true, typeCheck: true },
    plugins: ['typescript', 'react', 'oxc'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'react/rules-of-hooks': 'error',
      'react/exhaustive-deps': 'warn',
    },
    overrides: [{ files: ['bench/**', 'examples/**'], rules: { 'no-console': 'off' } }],
  },
  fmt: {
    ignorePatterns: ['dist/**', 'bench/legacy/vendor/**', 'bench/results/**', 'bench/REPORT.md'],
    singleQuote: true,
    semi: true,
    printWidth: 100,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'model',
          environment: 'node',
          include: ['tests/model/**/*.test.ts'],
        },
      },
      {
        extends: true,
        resolve: { dedupe: ['react', 'react-dom'] },
        optimizeDeps: {
          include: [
            'react',
            'react-dom',
            'react-dom/client',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'vitest-browser-react',
          ],
        },
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium', viewport: { width: 1000, height: 700 } }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
