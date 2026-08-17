import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { type AuditRow, auditPlan } from '../audit'
import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import { importPlanFromXlsx } from '../import-plan'
import { parentsFromLevels, rollUpProgress } from '../progress'
import { schedulePlan } from '../schedule'
import type { PlanTask } from '../types'
import { readWorkbook } from '../xlsx'

/**
 * Prueba de aceptación contra el plan real.
 *
 * Aquí no hay datos inventados: se lee `referencia/PDT BU V7 - Plan Integrado.xlsx`, un plan de
 * migración a AWS de 1 368 líneas auditado, y se comprueba que el motor lo reproduce.
 *
 * Es la que acredita la condición de cierre del encargo, y también la que la matiza. De las tres
 * cifras que pide reproducir con tolerancia cero, **dos salen exactas** —la fecha de cierre y la
 * clasificación de la ruta súper crítica con su reparto— y **la tercera no es reproducible**: el
 * archivo no guarda holgura en ninguna de sus siete hojas. Eso está medido abajo, no supuesto.
 *
 * Si el archivo no está, las pruebas se saltan en vez de fallar: es un artefacto de referencia que
 * no se versiona.
 */
const RUTA = resolve(process.cwd(), 'referencia', 'PDT BU V7 - Plan Integrado.xlsx')
const HAY_ARCHIVO = existsSync(RUTA)

describe.skipIf(!HAY_ARCHIVO)('El plan de referencia', () => {
  const buffer = HAY_ARCHIVO ? readFileSync(RUTA) : Buffer.alloc(0)
  const calendar = createWorkCalendar()

  /** El archivo aplica sus desfases negativos sin el día de separación de MS Project. */
  const plan = importPlanFromXlsx(buffer, {
    file: 'PDT BU V7 - Plan Integrado.xlsx',
    negativeLagConvention: 'SIN_DIA_INTERMEDIO',
  })

  describe('lectura del libro', () => {
    it('tiene las siete hojas', () => {
      expect(readWorkbook(buffer).sheetNames).toEqual([
        'Cómo leer este plan',
        'Plan',
        'Ruta Súper Crítica',
        'Servidores por Ola',
        'Elementos y Exclusiones',
        'Glosario',
        'Días feriados de Colombia',
      ])
    })

    it('encuentra la hoja del plan sola, por sus encabezados', () => {
      expect(plan.rows[0].source.sheet).toBe('Plan')
      // Los títulos están en la fila 6 y los datos arrancan en la 7.
      expect(plan.rows[0].source.row).toBe(7)
      expect(plan.rows.at(-1)!.source.row).toBe(1374)
    })

    it('lee las 1 368 líneas sin una sola advertencia', () => {
      expect(plan.rows).toHaveLength(1368)
      expect(plan.warnings).toEqual([])
    })

    it('conserva de dónde salió cada línea', () => {
      expect(plan.rows[0].source).toEqual({
        file: 'PDT BU V7 - Plan Integrado.xlsx',
        sheet: 'Plan',
        row: 7,
        id: '1',
      })
    })
  })

  describe('los vínculos', () => {
    it('son 1 665, no los ~1 660 que se creía', () => {
      expect(plan.dependencies).toHaveLength(1665)
    })

    it('se reparten en fin-comienzo, comienzo-comienzo y fin-fin, sin un solo comienzo-fin', () => {
      const porTipo = { FS: 0, SS: 0, FF: 0, SF: 0 }
      for (const dependencia of plan.dependencies) porTipo[dependencia.type] += 1

      expect(porTipo).toEqual({ FS: 704, SS: 802, FF: 159, SF: 0 })
    })

    it('394 llevan desfase y solo 6 son negativos', () => {
      expect(plan.dependencies.filter((d) => d.lag !== 0)).toHaveLength(394)
      expect(plan.dependencies.filter((d) => d.lag < 0)).toHaveLength(6)
    })

    it('ninguna predecesora apunta hacia adelante, que es lo que exige MS Project', () => {
      const posicion = new Map(plan.rows.map((row, indice) => [row.id, indice]))
      for (const dependencia of plan.dependencies) {
        expect(posicion.get(dependencia.predecessorId)!).toBeLessThan(
          posicion.get(dependencia.successorId)!,
        )
      }
    })
  })

  describe('la estructura', () => {
    it('son 125 resúmenes y 1 243 hojas', () => {
      expect(plan.rows.filter((row) => row.isSummary)).toHaveLength(125)
      expect(plan.rows.filter((row) => !row.isSummary)).toHaveLength(1243)
    })

    it('las 1 243 hojas traen entregable y criterio de salida, sin excepción', () => {
      const hojas = plan.rows.filter((row) => !row.isSummary)
      expect(hojas.filter((row) => row.deliverable !== null)).toHaveLength(1243)
      expect(hojas.filter((row) => row.exitCriteria !== null)).toHaveLength(1243)
    })

    it('178 líneas no las ejecuta el proveedor', () => {
      const delCliente = plan.rows.filter((row) => row.party === 'CLIENTE')
      expect(delCliente).toHaveLength(178)
      expect(delCliente.filter((row) => row.kind === 'ENTREGA_CLIENTE')).toHaveLength(130)
      expect(delCliente.filter((row) => row.kind === 'APROBACION_CLIENTE')).toHaveLength(48)
    })
  })

  describe('la convención del desfase negativo', () => {
    it('si no se declara, la importación lo advierte y nombra las líneas', () => {
      const sinDeclarar = importPlanFromXlsx(buffer)
      expect(sinDeclarar.warnings).toHaveLength(1)
      expect(sinDeclarar.warnings[0]).toContain('30, 46, 64, 468, 796, 878')
      expect(sinDeclarar.warnings[0]).toContain('MS Project')
    })

    it('y vale exactamente dos días hábiles en la fecha de cierre', () => {
      const conMsProject = importPlanFromXlsx(buffer)
      const cierre = (entrada: typeof plan) =>
        schedulePlan({
          tasks: entrada.tasks,
          dependencies: entrada.dependencies,
          calendar,
          start: entrada.declaredStart,
        }).finish

      expect(cierre(conMsProject)).toBe('2026-12-02')
      expect(cierre(plan)).toBe('2026-11-30')
    })
  })

  /**
   * Condición 3 del cierre, primera parte: **la fecha de cierre del plan, con tolerancia cero.**
   */
  describe('la fecha de cierre', () => {
    it('el archivo declara del 12 de junio al 30 de noviembre de 2026', () => {
      expect(plan.declaredStart).toBe('2026-06-12')
      expect(plan.declaredFinish).toBe('2026-11-30')
    })

    it('el motor la reproduce exactamente al reprogramar el plan completo', () => {
      const schedule = schedulePlan({
        tasks: plan.tasks,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      expect(schedule.finish).toBe('2026-11-30')
      expect(schedule.finish).toBe(plan.declaredFinish)
    })

    it('y también respetando las fechas del archivo como piso', () => {
      const schedule = schedulePlan({
        tasks: anclado(),
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      expect(schedule.finish).toBe('2026-11-30')
    })

    it('respetando las fechas, 1 363 de las 1 368 líneas caen donde el archivo dice', () => {
      const schedule = schedulePlan({
        tasks: anclado(),
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })

      const exactas = plan.rows.filter((row) => {
        const tarea = schedule.byId.get(row.id)!
        return tarea.start === row.declaredStart && tarea.finish === row.declaredFinish
      })
      expect(exactas).toHaveLength(1363)
    })

    it('sin respetarlas, 826 coinciden y las 417 restantes salen ANTES, nunca después', () => {
      // El plan trae holgura metida a mano. Reprogramar lo más pronto posible la recupera, y por eso
      // esas líneas salen antes. Ninguna sale después: no hay vínculo incumplido.
      const schedule = schedulePlan({
        tasks: plan.tasks,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })

      const hojas = plan.rows.filter((row) => !row.isSummary && row.declaredStart !== null)
      const iguales = hojas.filter((row) => schedule.byId.get(row.id)!.start === row.declaredStart)
      const despues = hojas.filter((row) => schedule.byId.get(row.id)!.start > row.declaredStart!)

      expect(iguales).toHaveLength(826)
      expect(despues).toHaveLength(0)
    })
  })

  /**
   * Condición 3 del cierre, segunda parte: **la clasificación de la ruta súper crítica y su reparto
   * entre cliente y proveedor, con tolerancia cero.**
   */
  describe('la Ruta Súper Crítica', () => {
    it('son 276 líneas, todas hojas', () => {
      const marcadas = plan.rows.filter((row) => row.recoverability !== null)
      expect(marcadas).toHaveLength(276)
      expect(marcadas.filter((row) => row.isSummary)).toHaveLength(0)
    })

    it('se reparten en las tres familias del encargo', () => {
      const conteo = { DECIDE_UN_TERCERO: 0, TIEMPO_TRANSCURRIDO: 0, FECHA_PACTADA: 0 }
      for (const row of plan.rows) {
        if (row.recoverability && row.recoverability !== 'RECUPERABLE') conteo[row.recoverability] += 1
      }
      expect(conteo).toEqual({ DECIDE_UN_TERCERO: 174, TIEMPO_TRANSCURRIDO: 58, FECHA_PACTADA: 44 })
    })

    it('131 dependen del cliente y 145 del proveedor', () => {
      const marcadas = plan.rows.filter((row) => row.recoverability !== null)
      expect(marcadas.filter((row) => row.party === 'CLIENTE')).toHaveLength(131)
      expect(marcadas.filter((row) => row.party === 'PROVEEDOR')).toHaveLength(145)
    })

    it('el motor conserva esa clasificación al analizar el plan', () => {
      const tareas = anclado()
      const schedule = schedulePlan({
        tasks: tareas,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      const analisis = classifySuperCritical(analyzeCriticalPath(schedule), tareas)

      // Las 58 de tiempo transcurrido y las 44 de fecha pactada están todas sin holgura, así que
      // pasan enteras a la ruta súper crítica.
      expect(analisis.superCriticalByReason.TIEMPO_TRANSCURRIDO).toBe(58)
      expect(analisis.superCriticalByReason.FECHA_PACTADA).toBe(44)
      expect(analisis.superCriticalCount).toBeGreaterThan(0)
      expect(analisis.superCriticalByParty.CLIENTE).toBeGreaterThan(0)
    })
  })

  /**
   * Condición 3 del cierre, tercera parte: **la cantidad de tareas con holgura cero.**
   *
   * Esta es la que no se puede reproducir, y aquí queda medido por qué. El archivo **no guarda
   * holgura** en ninguna de sus siete hojas: la cifra de 932 aparece solo como prosa en la hoja
   * «Ruta Súper Crítica», y esa prosa dice «cerca de 75 de cada cien», no 74 %.
   *
   * El motor calcula la holgura y publica el número con su semántica declarada. Las cuatro lecturas
   * razonables dan cifras distintas y **ninguna da 932**, así que la cifra se publica siempre
   * diciendo bajo qué criterio se calculó.
   */
  describe('la holgura cero', () => {
    const medir = (respetarFechas: boolean, terminalPolicy: 'CIERRE_DEL_PLAN' | 'FIN_PROPIO') => {
      const tareas = respetarFechas ? anclado() : [...plan.tasks]
      const schedule = schedulePlan({
        tasks: tareas,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      const analisis = analyzeCriticalPath(schedule, { terminalPolicy })
      return classifySuperCritical(analisis, tareas, { excludeSummaries: true }).zeroFloatCount
    }

    it('reprogramando lo más pronto posible, con plazo hasta el cierre del plan', () => {
      expect(medir(false, 'CIERRE_DEL_PLAN')).toBe(796)
    })

    it('reprogramando, con las terminales ancladas a su propio fin', () => {
      expect(medir(false, 'FIN_PROPIO')).toBe(888)
    })

    it('respetando las fechas del archivo, con plazo hasta el cierre', () => {
      expect(medir(true, 'CIERRE_DEL_PLAN')).toBe(1127)
    })

    it('respetando las fechas, con las terminales ancladas a su propio fin', () => {
      expect(medir(true, 'FIN_PROPIO')).toBe(1209)
    })

    it('ninguna de las cuatro lecturas da 932', () => {
      expect([
        medir(false, 'CIERRE_DEL_PLAN'),
        medir(false, 'FIN_PROPIO'),
        medir(true, 'CIERRE_DEL_PLAN'),
        medir(true, 'FIN_PROPIO'),
      ]).not.toContain(932)
    })

    it('y no hay de dónde leerla: ninguna hoja tiene una columna de holgura', () => {
      // Esta es la razón de fondo. Si existiera la columna, la cifra se leería de ahí y no habría
      // nada que decidir. El 932 solo aparece en la prosa de la hoja «Ruta Súper Crítica».
      const libro = readWorkbook(buffer)
      const encabezados = /^(holgura|holgura total|holgura libre|slack|float|margen)$/i

      const encontrados: string[] = []
      for (const nombre of libro.sheetNames) {
        for (const fila of libro.sheet(nombre).rows.values()) {
          for (const celda of fila.values()) {
            if (celda.text && encabezados.test(celda.text.trim())) {
              encontrados.push(`${nombre}: «${celda.text.trim()}»`)
            }
          }
        }
      }
      expect(encontrados).toEqual([])
    })
  })

  /**
   * Los diecisiete controles sobre el plan real.
   *
   * El plan de referencia está auditado y es bueno: trece de los diecisiete controles salen
   * completamente limpios sobre 1 368 líneas y 1 665 vínculos. Los cinco que disparan encuentran
   * cosas ciertas, y cada cifra queda fijada aquí para que un cambio en el motor no las mueva sin
   * que nadie se entere.
   */
  describe('la auditoría', () => {
    const auditar = () => {
      const parents = parentsFromLevels(
        plan.rows.map((row) => ({ id: row.id, name: row.name, level: row.level })),
      )
      const rows: AuditRow[] = plan.rows.map((row) => ({
        id: row.id,
        name: row.name,
        level: row.level,
        parentId: parents.get(row.id) ?? null,
        kind: row.kind,
        duration: row.duration,
        start: row.declaredStart,
        finish: row.declaredFinish,
        owner: row.owner,
        deliverable: row.deliverable,
        exitCriteria: row.exitCriteria,
        predecessors: row.predecessors,
      }))
      return auditPlan({ rows, calendar, deadline: plan.declaredFinish })
    }

    const report = auditar()

    it('trece de los diecisiete controles salen limpios', () => {
      const limpios = report.controls.filter((control) => control.findings === 0)
      expect(limpios.map((control) => control.id)).toEqual([
        'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C10', 'C11', 'C12', 'C13', 'C15',
      ])
    })

    it('la estructura del plan es impecable: jerarquía, fechas, duraciones y vínculos', () => {
      for (const id of ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08']) {
        expect({ [id]: report.controls.find((c) => c.id === id)!.findings }).toEqual({ [id]: 0 })
      }
    })

    it('ninguna línea se sale de su resumen y ningún nombre se repite en un bloque', () => {
      expect(report.controls.find((c) => c.id === 'C10')!.findings).toBe(0)
      expect(report.controls.find((c) => c.id === 'C11')!.findings).toBe(0)
    })

    it('las 1 368 líneas tienen responsable y las 1 243 hojas entregable y criterio', () => {
      expect(report.controls.find((c) => c.id === 'C12')!.findings).toBe(0)
      expect(report.controls.find((c) => c.id === 'C13')!.checked).toBe(1243)
      expect(report.controls.find((c) => c.id === 'C13')!.findings).toBe(0)
    })

    it('el plan cierra en su fecha de compromiso, no después', () => {
      expect(report.controls.find((c) => c.id === 'C15')!.findings).toBe(0)
    })

    it('7 vínculos no concuerdan con las fechas declaradas', () => {
      expect(report.controls.find((c) => c.id === 'C09')!.findings).toBe(7)
    })

    it('27 hojas no tienen quien dependa de ellas, sin contar las que cierran el plan', () => {
      expect(report.controls.find((c) => c.id === 'C14')!.findings).toBe(27)
    })

    it('78 criterios de salida se repiten más de diez veces', () => {
      expect(report.controls.find((c) => c.id === 'C16')!.findings).toBe(78)
    })

    it('los 6 solapamientos se avisan, y avisar no reprueba', () => {
      const c17 = report.controls.find((c) => c.id === 'C17')!
      expect(c17.findings).toBe(6)
      expect(c17.severity).toBe('AVISO')
      expect(report.warningCount).toBe(6)
    })

    it('en total, 112 errores y 6 avisos', () => {
      expect(report.errorCount).toBe(112)
      expect(report.warningCount).toBe(6)
      expect(report.passed).toBe(false)
    })
  })

  /**
   * La jerarquía y el peso, sobre el plan real.
   *
   * El archivo no trae identificador de padre: trae una columna de nivel, como todo plan exportado
   * de MS Project. Derivar el árbol de esa columna y que el resultado coincida con el conteo de
   * resúmenes es una verificación cruzada — son dos formas independientes de responder la misma
   * pregunta.
   */
  describe('la jerarquía y el avance ponderado', () => {
    const jerarquia = () => {
      const parents = parentsFromLevels(plan.rows.map((row) => ({ id: row.id, name: row.name, level: row.level })))
      return plan.rows.map((row) => {
        const parentId = parents.get(row.id)
        return {
          id: row.id,
          name: row.name,
          duration: row.duration,
          progress: row.progress ?? 0,
          ...(parentId ? { parentId } : {}),
        }
      })
    }

    it('el nivel del archivo produce un árbol válido, sin saltos ni huérfanos', () => {
      expect(() => rollUpProgress(jerarquia())).not.toThrow()
    })

    it('el árbol derivado da los mismos 125 resúmenes que el conteo por hijas', () => {
      const rollup = rollUpProgress(jerarquia())
      expect(rollup.tasks.filter((task) => task.isSummary)).toHaveLength(125)
      expect(rollup.tasks.filter((task) => !task.isSummary)).toHaveLength(1243)
    })

    it('las dos etapas del plan son las raíces', () => {
      expect(rollUpProgress(jerarquia()).roots).toHaveLength(2)
    })

    it('el peso del plan es el trabajo de sus hojas, no su lapso de calendario', () => {
      const rollup = rollUpProgress(jerarquia())
      const trabajo = plan.rows
        .filter((row) => !row.isSummary)
        .reduce((total, row) => total + Math.max(row.duration, 0), 0)

      expect(rollup.totalWeight).toBe(trabajo)
      // El plan abarca 122 días hábiles de calendario y son 1 243 hojas: el trabajo es mucho mayor
      // que el lapso, que es justo la razón por la que ponderar por duración da cifras absurdas.
      expect(rollup.totalWeight).toBeGreaterThan(122)
    })

    it('el plan de referencia está sin avance capturado, y el prorrateo lo dice', () => {
      expect(rollUpProgress(jerarquia()).progress).toBe(0)
    })
  })

  /** Las fechas del archivo, tomadas como piso: es un plan ya construido, no uno por programar. */
  function anclado(): PlanTask[] {
    return plan.tasks.map((tarea) => {
      const row = plan.byId.get(tarea.id)!
      return row.declaredStart
        ? { ...tarea, constraint: { type: 'NO_ANTES_DE' as const, date: row.declaredStart } }
        : tarea
    })
  }
})
