import { describe, expect, it } from 'vitest'

import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { schedulePlan } from '@/lib/scheduling/schedule'

import { planDeCarga } from './carga.fixture'

/**
 * Los objetivos del §3.8, medidos a la escala que el spec pide.
 *
 * «Medidos con 10 000 tareas y 8 000 dependencias»: `schedule()` completo por debajo de 400 ms.
 *
 * Hasta ahora nadie llegaba a esa escala. `schedule.test.ts` mide 5 000 tareas **en cadena simple**
 * con un umbral de 2 000 ms, y de ahí salía un «cumple» que medía otra cosa: la mitad de las tareas,
 * una forma sin ramificación y un techo cinco veces más flojo. Un umbral que se cumple con el caso
 * fácil no dice nada del difícil.
 *
 * ## Por qué el umbral de aquí no es 400 ms
 *
 * El del spec es un objetivo de producto sobre la máquina del usuario; esto corre donde corra la
 * suite, que puede ser mucho más lenta y con vecinos ruidosos. Poner 400 aquí convertiría la
 * medición en una prueba que parpadea, y una prueba que falla sola se acaba ignorando.
 *
 * Así que el umbral es un **techo de regresión** holgado y la cifra real se imprime. Lo que esta
 * prueba protege es que nadie multiplique el coste por diez sin enterarse; lo que dice si se cumple
 * el §3.8 es el número de la consola, leído en una máquina representativa.
 */
describe('§3.8 · el motor a la escala que pide el spec', () => {
  const TECHO_DE_REGRESION = 8000

  it('programa 10 000 tareas con 8 000 dependencias', () => {
    const { tasks, dependencies } = planDeCarga(10000, 8000)
    expect(tasks.length).toBe(10000)
    expect(dependencies.length).toBe(8000)

    const calendar = createWorkCalendar()
    const t0 = performance.now()
    const plan = schedulePlan({ tasks, dependencies, calendar, start: '2027-01-04' })
    const ms = performance.now() - t0

    expect(plan.byId.size).toBe(10000)
    // eslint-disable-next-line no-console
    console.log(`  §3.8 schedule() con 10 000 tareas: ${Math.round(ms)} ms (el spec pide < 400)`)
    expect(ms).toBeLessThan(TECHO_DE_REGRESION)
  })

  it('y calcula la ruta crítica encima', () => {
    const { tasks, dependencies } = planDeCarga(10000, 8000)
    const calendar = createWorkCalendar()
    const plan = schedulePlan({ tasks, dependencies, calendar, start: '2027-01-04' })

    const t0 = performance.now()
    const analisis = analyzeCriticalPath(plan)
    const ms = performance.now() - t0

    expect(analisis.byId.size).toBe(10000)
    // eslint-disable-next-line no-console
    console.log(`  §3.8 ruta crítica con 10 000 tareas: ${Math.round(ms)} ms`)
    expect(ms).toBeLessThan(TECHO_DE_REGRESION)
  })
})
