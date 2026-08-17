/**
 * De dónde sale el plan que dibuja la pantalla.
 *
 * Este archivo se queda **en el servidor** y es el único de la pantalla que no puede correr en el
 * navegador: leer un `.xlsx` es descomprimir un ZIP, y eso necesita `node:zlib`. Todo lo demás del
 * motor —programar, calcular la ruta crítica, clasificar, trazar— es aritmética pura y corre igual
 * en los dos lados.
 *
 * Por eso el servidor hace lo mínimo: abre el archivo y entrega **tareas y vínculos en crudo**. El
 * navegador recibe esos datos una vez y a partir de ahí recalcula solo. Un plan de 1 368 líneas se
 * programa entero en 17 milisegundos y se redibuja en 7; plegarlo o filtrarlo no necesita volver al
 * servidor, y eso es lo que hace que la pantalla se sienta inmediata.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { importPlanFromXlsx } from '@/lib/scheduling/import-plan'
import { parentsFromLevels } from '@/lib/scheduling/progress'
import type { Dependency, PlanTask } from '@/lib/scheduling/types'

/**
 * Dónde se busca el plan.
 *
 * `referencia/` no se versiona: es un artefacto de trabajo, no del producto. Si no está, la pantalla
 * lo dice con todas sus letras en vez de aparecer vacía sin explicación.
 */
const RUTA = 'referencia/PDT BU V7 - Plan Integrado.xlsx'

export interface PlanCargado {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** Primer día del plan, tal como lo declara el archivo. */
  readonly start: string
  /** Cierre declarado en el archivo. Sirve para contrastarlo con el que calcula el motor. */
  readonly declaredFinish: string
  readonly fileName: string
  /** Cuántas líneas trae el archivo. Sirve para que la pantalla diga de dónde salió lo que muestra. */
  readonly rowCount: number
  readonly warnings: readonly string[]
}

export type ResultadoCarga =
  | { readonly ok: true; readonly plan: PlanCargado }
  | { readonly ok: false; readonly ruta: string; readonly motivo: string }

/**
 * Lee el plan de referencia y lo deja listo para el motor.
 *
 * Dos decisiones que no son obvias y conviene dejar escritas:
 *
 * **Las fechas del archivo se toman como piso.** Cada línea entra con una restricción «no antes de»
 * su fecha declarada. Es un plan ya construido y negociado, no uno por programar desde cero: si el
 * motor lo reprogramara libre, daría un plan más corto y distinto del que se firmó.
 *
 * **Los desfases negativos se aplican sin el día de separación de MS Project.** El archivo aplica
 * sus seis solapamientos como `inicio = fin + desfase`, no `fin + 1 + desfase`. Con la convención
 * estándar el plan cierra el 2026-12-02; con la del archivo, el 2026-11-30 exacto, que es su fecha
 * de compromiso. Se declara a propósito en vez de adivinarla.
 */
export function cargarPlan(): ResultadoCarga {
  const ruta = resolve(process.cwd(), RUTA)

  if (!existsSync(ruta)) {
    return {
      ok: false,
      ruta: RUTA,
      motivo: 'El archivo del plan no está en el proyecto.',
    }
  }

  try {
    const buffer = readFileSync(ruta)
    const plan = importPlanFromXlsx(buffer, {
      file: RUTA.split('/').at(-1),
      negativeLagConvention: 'SIN_DIA_INTERMEDIO',
    })

    // El árbol sale del nivel de sangría de cada fila: el archivo no guarda la relación padre-hija,
    // la insinúa con la indentación. Sin este paso no hay resúmenes que plegar.
    const padres = parentsFromLevels(
      plan.rows.map((fila) => ({ id: fila.id, name: fila.name, level: fila.level })),
    )

    const tasks: PlanTask[] = plan.tasks.map((tarea) => {
      const fila = plan.byId.get(tarea.id)!
      const padre = padres.get(tarea.id)
      return {
        ...tarea,
        ...(padre ? { parentId: padre } : {}),
        ...(fila.declaredStart
          ? { constraint: { type: 'NO_ANTES_DE' as const, date: fila.declaredStart } }
          : {}),
      }
    })

    return {
      ok: true,
      plan: {
        tasks,
        dependencies: plan.dependencies,
        start: plan.declaredStart,
        declaredFinish: plan.declaredFinish,
        fileName: RUTA.split('/').at(-1)!,
        rowCount: plan.rows.length,
        warnings: plan.warnings,
      },
    }
  } catch (error) {
    return {
      ok: false,
      ruta: RUTA,
      motivo: error instanceof Error ? error.message : 'No se pudo leer el archivo.',
    }
  }
}
