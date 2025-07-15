import fs from 'fs'
import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const localJotai = path.resolve(__dirname, 'jotai/src')
  const hasLocalJotai = fs.existsSync(localJotai)
  const alias = {}
  if ((mode === 'development' || mode === 'test') && hasLocalJotai) {
    alias['jotai'] = localJotai
    alias['jotai-scope'] = path.resolve(__dirname, 'src')
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
