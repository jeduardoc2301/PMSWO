import type { Dependency, PlanTask } from '@/lib/scheduling/types'

/**
 * Un plan de la escala que pide el §3.8: 10 000 tareas y 8 000 dependencias.
 *
 * ## Por qué hace falta que sea un archivo aparte
 *
 * Los objetivos de rendimiento del spec se miden «con 10 000 tareas y 8 000 dependencias», y hasta
 * ahora ninguna prueba llegaba a esa escala: la de `schedule.test.ts` usa 5 000 en cadena simple y
 * la de `reschedule.test.ts` 1 368. Comparar contra un umbral con la mitad de las tareas y una forma
 * más fácil no es medir de menos, es **medir otra cosa** — y sale «cumple».
 *
 * ## Por qué está sembrado y no es aleatorio
 *
 * Un generador aleatorio da una cifra distinta en cada corrida y convierte una regresión en ruido.
 * Éste es determinista: el mismo plan en cada ejecución y en cada máquina, así que dos medidas se
 * pueden comparar. El generador congruente de abajo es el de siempre; no hace falta que sea bueno,
 * hace falta que sea **el mismo**.
 *
 * ## La forma importa tanto como el tamaño
 *
 * Una cadena de 10 000 tareas en fila es el caso fácil: un solo camino, sin ramificación, y el orden
 * topológico sale casi gratis. Un plan real tiene jerarquía, varias predecesoras por línea, los
 * cuatro tipos de vínculo y restricciones sueltas. Esto imita eso: siete niveles, hasta dos
 * predecesoras, mezcla de FS/SS/FF/SF con desfases, y un 5 % de líneas con restricción.
 */

/**
 * Congruente lineal de 32 bits. No hace falta que sea bueno, hace falta que sea el mismo siempre.
 *
 * Va con `Math.imul` y no con `*` por una razón que se vio midiendo: la multiplicación normal se
 * sale de los 2^53 que JavaScript mantiene exactos, el generador degenera y repite. La primera
 * versión pedía 8 000 vínculos distintos y sólo conseguía 5 195 — un plan más flojo que el que dice
 * generar, que es la peor manera de que una prueba de carga mienta.
 */
function semilla(inicial: number): () => number {
  let x = inicial >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

export interface PlanDeCarga {
  readonly tasks: PlanTask[]
  readonly dependencies: Dependency[]
}

export function planDeCarga(tareas = 10000, vinculos = 8000): PlanDeCarga {
  const azar = semilla(20260823)
  const tasks: PlanTask[] = []

  // Siete niveles de jerarquía, con las madres repartidas por delante para que el árbol tenga fondo.
  const madres: string[] = []
  for (let i = 0; i < tareas; i++) {
    const id = `t${i}`
    const nivel = i < 500 ? Math.min(6, Math.floor(i / 80)) : 6
    const padre = i === 0 || nivel === 0 ? undefined : madres[Math.floor(azar() * madres.length)]
    const duracion = 1 + Math.floor(azar() * 9)
    const task: Record<string, unknown> = { id, name: `Linea ${i}`, duration: duracion, progress: 0 }
    if (padre) task.parentId = padre
    // Un 5 % con restricción, repartidas entre las que amarran arranque y las que amarran fin.
    if (azar() < 0.05) {
      const tipo = azar() < 0.5 ? 'NO_EMPIEZA_ANTES_DE' : 'NO_TERMINA_DESPUES_DE'
      task.constraint = { type: tipo, date: '2027-01-15' }
    }
    tasks.push(task as unknown as PlanTask)
    if (i < 500) madres.push(id)
  }

  /*
    El motor prohíbe vincular una línea con su propia descendiente —un resumen hereda las fechas de
    sus hijas, así que un vínculo entre ambas no significa nada— y lanza `VINCULO_CON_DESCENDIENTE`.
    La primera versión de este generador emparejaba por índice y creaba justamente eso: el plan no
    llegaba a programarse. El inválido era el generador, no el motor.
  */
  const TIPOS = ['FS', 'SS', 'FF', 'SF'] as const
  const padreDe = new Map<string, string>()
  for (const t of tasks as unknown as Array<{ id: string; parentId?: string }>) {
    if (t.parentId) padreDe.set(t.id, t.parentId)
  }
  const emparentadas = (x: string, y: string): boolean => {
    for (let p: string | undefined = padreDe.get(y); p; p = padreDe.get(p)) if (p === x) return true
    for (let p: string | undefined = padreDe.get(x); p; p = padreDe.get(p)) if (p === y) return true
    return false
  }

  const dependencies: Dependency[] = []
  const vistos = new Set<string>()

  /*
    Una espina dorsal: una cadena que atraviesa el plan de punta a punta.

    Sin ella el generador sólo enlaza vecinos cercanos, y eso deja un plan de 10 000 líneas **sin
    ningún camino largo**: la ruta crítica sale trivial y mover una tarea arrastra a trece. Ningún
    plan real es así — tiene una secuencia larga que lo gobierna, que es justamente lo que hace caro
    reprogramar y lo que el §3.8 quiere medir.

    Va primero para que sobreviva al cupo de vínculos, y de 25 en 25 para que la cadena sea larga
    sin comerse el presupuesto entero.
  */
  for (let i = 25; i < tareas && dependencies.length < vinculos; i += 25) {
    const llave = `${i - 25}>${i}`
    if (emparentadas(`t${i - 25}`, `t${i}`)) continue
    vistos.add(llave)
    dependencies.push({
      predecessorId: `t${i - 25}`,
      successorId: `t${i}`,
      type: 'FS',
      lag: 0,
    } as unknown as Dependency)
  }
  let intentos = 0
  while (dependencies.length < vinculos && intentos < vinculos * 20) {
    intentos++
    // El sucesor siempre va después que la predecesora: así el grafo no tiene ciclos por
    // construcción, que es lo que hay que medir — un ciclo mediría el detector, no el programador.
    const a = Math.floor(azar() * (tareas - 1))
    const b = a + 1 + Math.floor(azar() * Math.min(40, tareas - a - 1))
    if (b >= tareas) continue
    const llave = `${a}>${b}`
    if (vistos.has(llave)) continue
    if (emparentadas(`t${a}`, `t${b}`)) continue
    vistos.add(llave)
    dependencies.push({
      predecessorId: `t${a}`,
      successorId: `t${b}`,
      type: TIPOS[Math.floor(azar() * 4)],
      lag: Math.floor(azar() * 3),
    } as unknown as Dependency)
  }

  return { tasks, dependencies }
}
