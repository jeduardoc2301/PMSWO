import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { cargarPlan } from '../plan-source'

/**
 * La carga del plan desde el archivo.
 *
 * Es la única pieza de la pantalla que toca el disco, y la que decide dos cosas que cambian todas
 * las cifras de la pantalla: que las fechas del archivo se toman como piso, y con qué convención se
 * aplican los desfases negativos. Las dos se comprueban aquí contra el archivo real.
 *
 * Si el archivo no está, las pruebas se saltan en vez de fallar: `referencia/` no se versiona.
 */
const HAY_ARCHIVO = existsSync(resolve(process.cwd(), 'referencia', 'PDT BU V7 - Plan Integrado.xlsx'))

describe.skipIf(!HAY_ARCHIVO)('Cargar el plan de referencia', () => {
  const resultado = cargarPlan()

  it('lo encuentra y lo lee entero', () => {
    expect(resultado.ok).toBe(true)
    if (!resultado.ok) return

    expect(resultado.plan.rowCount).toBe(1368)
    expect(resultado.plan.tasks).toHaveLength(1368)
    expect(resultado.plan.dependencies).toHaveLength(1665)
  })

  it('trae las fechas que declara el archivo, sin recalcularlas', () => {
    if (!resultado.ok) return

    expect(resultado.plan.start).toBe('2026-06-12')
    expect(resultado.plan.declaredFinish).toBe('2026-11-30')
  })

  /**
   * El árbol no viene en el archivo: se deduce del nivel de sangría de cada fila. Sin este paso no
   * hay resúmenes que plegar, y plegar es lo que vuelve legible un plan de mil líneas.
   */
  it('deduce el árbol de la sangría, con seis niveles de profundidad', () => {
    if (!resultado.ok) return

    const conPadre = resultado.plan.tasks.filter((tarea) => tarea.parentId !== undefined)
    expect(conPadre.length).toBeGreaterThan(1000)

    const porId = new Map(resultado.plan.tasks.map((tarea) => [tarea.id, tarea]))
    const profundidad = (id: string): number => {
      let n = 0
      for (let padre = porId.get(id)?.parentId; padre !== undefined; padre = porId.get(padre)?.parentId) {
        n += 1
      }
      return n
    }
    expect(Math.max(...resultado.plan.tasks.map((t) => profundidad(t.id)))).toBe(5)
  })

  /**
   * Cada línea entra con una restricción «no antes de» su fecha declarada. Es un plan ya construido
   * y negociado: si el motor lo reprogramara libre, daría uno más corto y distinto del que se firmó.
   */
  it('ancla cada línea a la fecha que trae el archivo', () => {
    if (!resultado.ok) return

    const ancladas = resultado.plan.tasks.filter((tarea) => tarea.constraint?.type === 'NO_ANTES_DE')
    expect(ancladas.length).toBe(1368)
    expect(ancladas.every((tarea) => /^\d{4}-\d{2}-\d{2}$/.test(tarea.constraint!.date))).toBe(true)
  })

  /**
   * La convención de desfase negativo se declara, no se adivina: vale un día por vínculo y ese día
   * se propaga hasta el cierre. Con la del archivo el plan cierra en su fecha de compromiso.
   */
  it('aplica los seis solapamientos con la convención del archivo', () => {
    if (!resultado.ok) return

    const negativos = resultado.plan.dependencies.filter((vinculo) => vinculo.lag < 0)
    expect(negativos).toHaveLength(6)
    // Declarada la convención, el importador ya no tiene por qué advertir sobre ellos.
    expect(resultado.plan.warnings.join(' ')).not.toMatch(/desfase negativo|convención/i)
  })

  it('el resultado es el mismo dos veces: leer el archivo no depende del reloj', () => {
    const otra = cargarPlan()
    expect(otra.ok).toBe(resultado.ok)
    if (!otra.ok || !resultado.ok) return
    expect(otra.plan.start).toBe(resultado.plan.start)
    expect(otra.plan.tasks.length).toBe(resultado.plan.tasks.length)
  })
})
