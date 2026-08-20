/**
 * `ALAP` — lo más tarde posible (§3.4, última de las ocho restricciones).
 *
 * ## Por qué no cabe donde caben las otras siete
 *
 * Las otras siete se resuelven mirando una fecha: `NO_ANTES_DE` empuja hasta la suya,
 * `DEBE_TERMINAR_EL` baja el techo de la tardía, y todas se aplican leyendo la tarea y sus
 * predecesoras. `ALAP` no tiene fecha. Dice «ponla donde más tarde quepa **sin mover el cierre**»,
 * y dónde es eso no se sabe hasta haber hecho el pase atrás — que a su vez necesita el pase
 * adelante hecho. La restricción depende del resultado del cálculo que la aplica.
 *
 * Por eso vive aquí y no en `schedule.ts`: programar con `ALAP` es programar **dos veces**.
 *
 * ## Para qué sirve de verdad
 *
 * Para lo que se compra o se contrata justo a tiempo. Pedir el hardware lo más tarde que se pueda
 * sin retrasar la salida a producción es dinero que se queda en la caja unas semanas más, y es una
 * decisión que hoy se toma a ojo porque el plan no sabe expresarla. Lo mismo con alquileres,
 * licencias que empiezan a contar al activarse, y personal externo.
 *
 * No sirve —y conviene decirlo— para trabajo propio del equipo: poner todo `ALAP` es programar el
 * proyecto entero sin holgura, y el primer tropiezo lo atrasa.
 *
 * ## Cómo se calcula, y por qué una segunda vuelta basta
 *
 * 1. Pase adelante tratando las `ALAP` como si fueran normales.
 * 2. Pase atrás. De ahí sale el inicio tardío de cada una.
 * 3. Se clava cada `ALAP` en su inicio tardío.
 * 4. Pase adelante otra vez.
 *
 * La tercera vuelta no hace falta, y la razón es que las fechas tardías **no dependen de las
 * predecesoras**: salen del cierre del plan hacia atrás, por la cadena de sucesoras. Clavar una
 * tarea más tarde no cambia el inicio tardío de nadie. Y no puede atrasar el cierre, porque el
 * inicio tardío es por definición el último sitio donde la tarea cabe sin atrasarlo: sus sucesoras
 * se mueven, como mucho, hasta su propio inicio tardío.
 *
 * ## Los dos casos en que el resultado no es el ideal, y qué hace el motor
 *
 * - **Quien lleva la tarea no está ese día.** El pase adelante desliza el arranque hasta que la
 *   persona vuelve, y eso puede pasarse del inicio tardío. La tarea sale con holgura negativa, que
 *   es exactamente el aviso correcto: en ese hueco, con esa gente, no cabe. No se corrige en
 *   silencio.
 * - **La tarea no tiene sucesoras.** Su inicio tardío es el cierre del plan menos su tramo, así que
 *   `ALAP` la manda al final. Es lo que la restricción significa —«maximizar el fin»— y coincide
 *   con MS Project.
 */

import { type CriticalPathAnalysis, analyzeCriticalPath } from './cpm'
import { type Schedule, type SchedulePlanInput, schedulePlan } from './schedule'
import type { PlanTask } from './types'
import { toIsoDate } from './date'

/** Las tareas marcadas `ALAP` del plan. */
function marcadasComoALAP(tasks: readonly PlanTask[]): readonly PlanTask[] {
  return tasks.filter((t) => t.alap === true)
}

/**
 * El plan programado con las tareas `ALAP` en su sitio.
 *
 * Sin ninguna tarea `ALAP` devuelve **exactamente** lo que devuelve `schedulePlan`, sin pagar el
 * pase atrás. Es lo que permite que todo el que hoy llama a `schedulePlan` pueda llamar a esta sin
 * que cambie nada.
 */
export function programarConALAP(input: SchedulePlanInput): Schedule {
  const tardias = marcadasComoALAP(input.tasks)
  if (tardias.length === 0) return schedulePlan(input)

  const primera = schedulePlan(input)
  const analisis: CriticalPathAnalysis = analyzeCriticalPath(primera)

  const clavadas = input.tasks.map((task) => {
    if (task.alap !== true) return task
    const inicioTardio = analisis.lateStart.get(task.id)
    if (inicioTardio === undefined) return task
    /**
     * Nunca antes del inicio temprano de la primera pasada.
     *
     * Con holgura negativa —una fecha límite que ya no se alcanza, o un `DEBE_TERMINAR_EL` que
     * el plan pasa— el inicio tardío cae **antes** que el temprano, y clavar ahí no pone la línea
     * «lo más tarde posible»: la mete debajo de sus propias predecesoras.
     *
     * Medido: `A(5d) —FS+0→ B(3d)` con `dueDate` 2026-06-05 en B y B marcada ALAP. Sin la marca,
     * B va del 8 al 10 de junio. Con la marca clavaba en el 3 —**tres días hábiles antes de que A
     * termine**— y el cierre del plan saltaba del 10 al 5 de junio. Un plan que se acorta solo
     * porque alguien pidió empezar más tarde.
     *
     * Cuando la holgura es negativa no hay «más tarde» que ganar: la línea ya no cabe, y lo más
     * tarde que puede empezar sin romper un vínculo es justo lo más temprano que sus predecesoras
     * permiten.
     */
    const inicioTemprano = primera.earlyStart.get(task.id)
    const donde = inicioTemprano === undefined ? inicioTardio : Math.max(inicioTardio, inicioTemprano)
    return {
      ...task,
      // Se clava con `DEBE_EMPEZAR_EL` y no con `NO_ANTES_DE` a propósito: `ALAP` fija el sitio, no
      // un piso. Con un piso, una predecesora corta la dejaría antes de su fecha tardía y la tarea
      // no estaría «lo más tarde posible», que es lo único que la restricción promete.
      //
      // Pisa la restricción que traía porque el `constraint` de una línea que llega del servidor es
      // el ancla de su fecha guardada, no una regla del usuario: quien marca `ALAP` está diciendo
      // que la fecha la calcule el motor.
      constraint: {
        type: 'DEBE_EMPEZAR_EL' as const,
        date: toIsoDate(input.calendar.dayOfOrdinal(donde)),
      },
    }
  })

  return schedulePlan({ ...input, tasks: clavadas })
}
