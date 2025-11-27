import fs from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const alias = {}
  if (mode === 'development' || mode === 'test') {
    alias['jotai-scope'] = path.resolve(__dirname, 'src')
    const localJotai = path.resolve(__dirname, 'jotai/src')
    const hasLocalJotai = fs.existsSync(localJotai)
    if (hasLocalJotai) {
      alias['jotai'] = localJotai
    }
    const localJotaiEffect = path.resolve(__dirname, 'jotai-effect/src')
    const hasLocalJotaiEffect = fs.existsSync(localJotaiEffect)
    if (hasLocalJotaiEffect) {
      alias['jotai-effect'] = localJotaiEffect
    }
  }

  return {
    plugins: [react()],
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
          'jotai/react/utils',
          'jotai/vanilla',
          'jotai/vanilla/utils',
          'jotai/vanilla/internals',
          'jotai/utils',
        ],
      },
      sourcemap: true,
    },
    test: {
      environment: 'happy-dom',
      globals: true,
      include: ['tests/**/*.test.{ts,tsx}'],
      exclude: ['jotai/**'],
      env: {
        FORCE_COLOR: '1',
      },
    },
  }
})
