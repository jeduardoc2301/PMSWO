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
    setupFiles: ['./vitest.setup.ts'],
    /**
     * DOM solo donde se dibuja.
     *
     * Estaba `environment: 'happy-dom'` para las 185 suites, y la mayoria no toca el DOM: las 39 de
     * `lib/scheduling` son aritmetica de dias habiles, y las de `services` tampoco dibujan nada.
     * Montar un documento entero por archivo para no usarlo era **el gasto mas grande de la
     * ejecucion**: 461 segundos acumulados de preparacion de entorno contra 275 de pruebas.
     *
     * El corte es por extension y no por carpeta, que es lo que de verdad separa los dos mundos:
     * `.test.tsx` dibuja, `.test.ts` no. Un `.test.ts` que necesite documento lo pide en su cabecera
     * con `// @vitest-environment happy-dom`, y asi la excepcion se ve en el archivo que la necesita.
     *
     * Se usa `projects` y no `environmentMatchGlobs`: eso ultimo dejo de existir en Vitest 4 y se
     * ignora en silencio — puesto en la configuracion parecia funcionar y lo que hacia era correrlo
     * TODO en `node`, con 810 pruebas en rojo.
     */
    projects: [
      {
        extends: true,
        test: {
          name: 'motor',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/.next/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'pantalla',
          environment: 'happy-dom',
          include: ['**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/.next/**'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
