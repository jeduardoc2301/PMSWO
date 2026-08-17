import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Las pruebas compilan JSX en modo automático.
  //
  // `tsconfig.json` declara `jsx: "preserve"` porque quien transpila en producción es Next.js, que
  // usa el modo automático desde React 17. Vitest no hereda esa decisión: sin esta línea compila en
  // modo clásico —a `React.createElement`— y cualquier componente que no importe React explícitamente
  // truena al renderizar, aunque en el navegador funcione perfecto.
  //
  // Eran 145 pruebas fallando por eso, en 15 archivos. No es una preferencia de estilo: era la
  // diferencia entre la configuración de prueba y la de producción.
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
