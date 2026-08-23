import { describe, expect, it } from 'vitest'

import { analyzeCriticalPath } from '@/lib/scheduling/cpm'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import type { IsoDate } from '@/lib/scheduling/date'
import { reprogramarDesde } from '@/lib/scheduling/reschedule'
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

  /**
   * La otra mitad del §3.8: mover UNA tarea y dejar el plan coherente, por debajo de 50 ms.
   *
   * Es el objetivo más exigente de la tabla, y con razón: esto corre mientras alguien arrastra una
   * barra. Los 400 ms del `schedule()` completo se pagan una vez al abrir; estos 50 se pagan en cada
   * gesto, y por encima de ahí el arrastre deja de sentirse como arrastrar.
   *
   * La prueba que había mide 1 368 tareas en cadena simple contra un techo de 500 ms — diez veces el
   * objetivo, sobre un plan siete veces más pequeño y de la forma más fácil.
   */
  it('reprograma desde una tarea movida en un plan de 10 000', () => {
    const { tasks, dependencies } = planDeCarga(10000, 8000)
    const calendar = createWorkCalendar()
    const plan = schedulePlan({ tasks, dependencies, calendar, start: '2027-01-04' })

    const fechas = new Map(
      [...plan.byId.entries()].map(([id, p]) => [id, { start: p.start, finish: p.finish }]),
    )
    /*
      Se mueve la línea que MÁS arrastra, no la primera.

      Con `t0` salían «1 línea tocada»: en un grafo con grado de salida menor que uno, la primera
      tarea puede no tener sucesoras y entonces reprogramar no propaga nada. Medir eso da 21 ms y no
      mide **nada** — es el caso vacío disfrazado de caso rápido, y habría quedado escrito como si
      el motor cumpliera el objetivo más exigente del spec.

      Se elige por grado de salida y se exige que la cascada sea de verdad: si un cambio en el
      generador la deja en nada, esta prueba se cae en vez de mentir.
    */
    // La cabeza de la espina dorsal, que es la que arrastra la cadena larga. Elegir por grado de
    // salida no servía: un nodo con tres vecinos locales gana al de la espina, que sólo tiene uno,
    // y la cascada se quedaba en quince líneas — el caso fácil disfrazado de caso peor.
    const masTira = 't0'

    const t0 = performance.now()
    const r = reprogramarDesde({
      tasks,
      dependencies,
      calendar,
      fechas,
      movida: { id: masTira, start: '2027-03-01' as IsoDate },
    })
    const ms = performance.now() - t0

    // Si la cascada no es profunda, esto no mide reprogramar: mide no hacer nada.
    expect(r.cambios.length).toBeGreaterThan(100)
    // eslint-disable-next-line no-console
    console.log(`  §3.8 reprogramar tras mover 1 tarea: ${Math.round(ms)} ms (el spec pide < 50) · ${r.cambios.length} líneas tocadas`)
    expect(ms).toBeLessThan(TECHO_DE_REGRESION)
  })
})
