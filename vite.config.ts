import fs from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode, command }) => {
  const isDevOrTest = mode === 'development' || mode === 'test'
  const localJotai = path.resolve(__dirname, 'jotai/src')
  const hasLocalJotai = fs.existsSync(localJotai)
  const alias = {
    'jotai-scope': path.resolve(__dirname, 'src'),
  }
  if (isDevOrTest && hasLocalJotai) {
    alias['jotai'] = localJotai
  }

  return {
    plugins: [
      react({ jsxRuntime: command === 'build' ? 'classic' : 'automatic' }),
    ],
    resolve: { alias },
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        name: 'jotaiScope',
        formats: ['es', 'cjs'],
        fileName: (f) => (f === 'es' ? 'index.mjs' : 'index.cjs'),
      },
      rollupOptions: {
        external: [
          'react',
          'react/jsx-runtime',
          'jotai',
          'jotai/react',
          'jotai/vanilla',
        ],
        output: { exports: 'named' },
      },
      sourcemap: true,
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      include: ['tests/**/*.test.{ts,tsx}'],
      exclude: ['jotai/**'],
    },
  }
})
