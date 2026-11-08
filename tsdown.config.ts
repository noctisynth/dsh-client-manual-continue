import { decoratorPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: {
      continuation: 'src/shared/continuation.ts',
      message: 'src/host/message.ts',
      protocol: 'src/shared/protocol.ts',
      receipt: 'src/shared/receipt.ts',
    },
    deps: { neverBundle: [/^@deepseek-ai\//] },
    platform: 'neutral',
    format: 'esm',
    target: 'es2023',
    dts: false,
    outDir: 'dist',
    clean: true,
    sourcemap: false,
  },
  {
    entry: { 'host/index': 'src/host/index.ts' },
    outputOptions: { entryFileNames: '[name].js' },
    deps: { neverBundle: [/^@deepseek-ai\//, 'zod'] },
    plugins: [decoratorPlugin()],
    platform: 'node',
    format: 'esm',
    target: 'es2023',
    dts: false,
    outDir: 'lib',
    clean: true,
    sourcemap: false,
  },
])
