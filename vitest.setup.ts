import { expect } from 'vitest'

/**
 * Los ayudantes de `jest-dom` sólo donde hay DOM.
 *
 * `@testing-library/jest-dom/vitest` añade a `expect` cosas como `toBeInTheDocument`, y para
 * instalarlas necesita un documento. Cargarlo siempre obligaba a montar `happy-dom` en las 184
 * suites, y la mayoría no dibuja nada: las 39 de `lib/scheduling` son aritmética de días hábiles.
 *
 * Medido sobre la suite entera: montar el DOM para todas costaba **461 segundos acumulados** de
 * preparación de entorno y la ejecución tardaba 117 s de reloj; pidiéndolo sólo donde hace falta,
 * el entorno baja a milisegundos. La condición es lo que permite esa separación.
 */
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}

// Se deja `expect` importado para que quede claro que este archivo extiende el de vitest y no otro.
void expect
