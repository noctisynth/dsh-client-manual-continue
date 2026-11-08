import { defineConfig } from 'tsdown'

// The installed SDK declares a lazy-CJS factory, not a standalone ESM browser entry.
// Keep the entire module body inside that factory; React is the page's shared module.
export default defineConfig({
  entry: { index: 'src/client/index.ts' },
  platform: 'neutral',
  inputOptions: { platform: 'browser' },
  format: 'cjs',
  target: 'es2023',
  dts: false,
  sourcemap: false,
  outDir: 'lib/client',
  clean: true,
  deps: {
    neverBundle: ['react'],
    onlyBundle: ['zod', '@deepseek-ai/dsh-typert-protocol'],
    alwaysBundle: [/^zod(?:\/|$)/, /^@deepseek-ai\/dsh-typert-protocol(?:\/|$)/],
  },
  outputOptions: {
    entryFileNames: '[name].js',
    banner: `window.__ModuleLoader__.load({
  id: 'dsh-client-manual-continue',
  factory(require) {
    'use strict';
    const module = { exports: {} };
    const exports = module.exports;`,
    footer: 'return module.exports;\n}\n});',
  },
})
