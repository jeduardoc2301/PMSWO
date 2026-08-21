import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { type AuditRow, auditPlan } from '../audit'
import { createWorkCalendar } from '../calendar'
import { analyzeCriticalPath } from '../cpm'
import { classifySuperCritical } from '../critical-path'
import { type CriterionRow, reviewExitCriteria } from '../exit-criteria'
import { type GanttInput, collapseToLevel, ganttLayout } from '../gantt'
import { importPlanFromXlsx } from '../import-plan'
import { parentsFromLevels, rollUpProgress } from '../progress'
import { comoHora, crearReloj, fechaDe } from '../reloj'
import { holgurasEnMinutos, programarEnMinutos } from '../programar-en-minutos'
import { schedulePlan } from '../schedule'
import { formatTraceability, reviewForClient } from '../traceability'
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
   * Los criterios de salida, sobre el plan real.
   *
   * Las dos comprobaciones más estrictas —falta el campo, o es una fórmula vacía— salen en cero
   * sobre las 1 243 hojas. Eso dice que el plan de referencia está bien redactado. Lo que sí
   * aparece es repetición: 847 líneas comparten un criterio con más de diez hermanas.
   */
  describe('los criterios de salida', () => {
    const report = reviewExitCriteria(
      plan.rows.map<CriterionRow>((row) => ({
        id: row.id,
        name: row.name,
        isSummary: row.isSummary,
        deliverable: row.deliverable,
        exitCriteria: row.exitCriteria,
      })),
    )

    it('revisa las 1 243 hojas y ninguna otra', () => {
      expect(report.checked).toBe(1243)
    })

    it('a ninguna le falta el entregable ni el criterio', () => {
      expect(report.byIssue.AUSENTE).toBe(0)
    })

    it('ninguna usa una fórmula vacía como «queda documentado»', () => {
      expect(report.byIssue.GENERICO).toBe(0)
    })

    it('pero 847 comparten criterio con más de diez hermanas', () => {
      expect(report.byIssue.REPETIDO_EN_EXCESO).toBe(847)
    })

    it('188 son demasiado cortas y 108 no dejan a qué apuntar', () => {
      expect(report.byIssue.DEMASIADO_CORTO).toBe(188)
      expect(report.byIssue.SIN_NADA_QUE_COMPROBAR).toBe(108)
    })

    it('366 líneas salen completamente limpias', () => {
      expect(report.clean).toBe(366)
    })
  })

  /**
   * La trazabilidad, sobre el plan real.
   *
   * El archivo trae una columna Q dedicada a esto. Que las 1 368 líneas la tengan **y** que ninguna
   * traiga un nombre del equipo, una versión de trabajo o un recado interno es justo lo que la regla
   * de redacción de C9 exige, medido sobre un documento que el cliente ya recibió.
   */
  describe('la trazabilidad', () => {
    const EQUIPO = ['Rafael Oliva', 'Salomón Suárez', 'José Cruz', 'Bryan Hernández']

    it('las 1 368 líneas dicen de dónde salieron', () => {
      expect(plan.rows.filter((row) => row.traceability !== null)).toHaveLength(1368)
    })

    it('ninguna trae nombres del equipo, versiones de trabajo ni recados internos', () => {
      const sucias = plan.rows.filter(
        (row) => reviewForClient(row.traceability, { internalNames: EQUIPO }).length > 0,
      )
      expect(sucias).toEqual([])
    })

    it('el importador conserva archivo, hoja, fila e identificador de origen', () => {
      const primera = plan.rows[0]
      expect(formatTraceability({
        file: 'PDT BU',
        version: 'V7',
        sheet: primera.source.sheet,
        row: primera.source.row,
        id: primera.source.id,
      })).toBe('PDT BU V7 · hoja Plan · fila 7 · origen 1')
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

  /**
   * El motor en minutos contra el motor en días, sobre el plan entero.
   *
   * Son dos programadores independientes —uno cuenta ordinales de día hábil, el otro minutos dentro
   * del día— recorriendo los mismos 1 665 vínculos, 394 de ellos con desfase. Que coincidan en las
   * 1 368 líneas es lo que autoriza a plantearse el cambio de unidad del motor; mientras no
   * coincidan, el de minutos es un experimento y no un candidato.
   *
   * El plan de referencia no tiene restricciones de fecha ni ausencias —está medido: cero de las
   * dos— así que la comparación es limpia: lo único que separa a los dos programadores es la unidad.
   */
  describe('el motor en minutos', () => {
    function ambos() {
      const tareas = conJerarquia().map((t) => ({ ...t, duracionMin: t.duration * 480 }))
      const enDias = schedulePlan({
        tasks: tareas,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      const enMinutos = programarEnMinutos({
        tasks: tareas,
        dependencies: plan.dependencies,
        reloj: crearReloj(calendar),
        comienzo: plan.declaredStart,
      })
      return { tareas, enDias, enMinutos }
    }

    it('coloca las 1 368 líneas en los mismos días que el motor de días', () => {
      const { tareas, enDias, enMinutos } = ambos()

      const distintas = tareas
        .map((t) => {
          const dia = enDias.byId.get(t.id)!
          const min = enMinutos.porId.get(t.id)!
          return { name: t.name, dia, min }
        })
        .filter(({ dia, min }) => fechaDe(min.comienzo) !== dia.start || fechaDe(min.fin) !== dia.finish)

      expect(tareas).toHaveLength(1368)
      expect(
        distintas
          .slice(0, 8)
          .map((d) => `${d.name}: ${comoHora(d.min.comienzo)}→${comoHora(d.min.fin)} contra ${d.dia.start}→${d.dia.finish}`),
      ).toEqual([])
    })

    it('y da las mismas holguras: total y libre, línea a línea', () => {
      // La trampa que el spec marca con un aviso: la holgura sale de una fórmula **por tipo de
      // vínculo y con desfase**, no de restar dos fechas. Si el pase atrás en minutos se hubiera
      // escrito a ojo, aquí saldrían cientos de líneas con holgura de más — que es la forma más
      // cara de equivocarse, porque una holgura inventada dice «esto puede esperar».
      const { tareas, enDias, enMinutos } = ambos()
      const analisis = analyzeCriticalPath(enDias)
      const holguras = holgurasEnMinutos(
        {
          tasks: tareas,
          dependencies: plan.dependencies,
          reloj: crearReloj(calendar),
          comienzo: plan.declaredStart,
        },
        enMinutos,
      )

      const distintas = tareas
        .map((t) => ({
          name: t.name,
          totalDias: analisis.totalFloat.get(t.id)!,
          totalMin: holguras.total.get(t.id)! / 480,
          libreDias: analisis.freeFloat.get(t.id)!,
          libreMin: holguras.libre.get(t.id)! / 480,
        }))
        .filter((d) => d.totalDias !== d.totalMin || d.libreDias !== d.libreMin)

      expect(
        distintas.slice(0, 8).map((d) => `${d.name}: total ${d.totalMin} contra ${d.totalDias} · libre ${d.libreMin} contra ${d.libreDias}`),
      ).toEqual([])
    })

    it('y cierra el plan el mismo día', () => {
      const { enDias, enMinutos } = ambos()
      expect(fechaDe(enMinutos.fin)).toBe(enDias.finish)
    })
  })

  /**
   * C11 · El Gantt sobre el plan real.
   *
   * Aquí es donde el plegado se gana o se pierde. Un plan de 1 368 líneas y 1 665 vínculos dibujado
   * entero no es un Gantt: es una maraña. La pregunta que estas pruebas contestan no es si el
   * trazado corre, sino **si el resultado se puede leer**.
   */
  describe('el Gantt', () => {
    function trazado(opciones: Partial<GanttInput> = {}) {
      const tareas = conJerarquia()
      const schedule = schedulePlan({
        tasks: tareas,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      return ganttLayout({
        tasks: tareas,
        dependencies: plan.dependencies,
        schedule,
        classified: classifySuperCritical(analyzeCriticalPath(schedule), tareas).tasks,
        calendar,
        ...opciones,
      })
    }

    /**
     * El reloj laborable contra el motor de días, sobre las 1 368 líneas.
     *
     * Son dos aritméticas distintas: el motor cuenta ordinales de día hábil y el reloj cuenta
     * minutos dentro de esos días. Que coincidan en un caso de tres líneas no dice gran cosa; que
     * coincidan en las 1 368 del plan real —con sus fines de semana, sus hitos y sus resúmenes de
     * ochenta días— es lo que acredita que el instante que se enseña no se ha inventado un día.
     *
     * Es también la prueba que caza el error clásico del límite: si el fin que cae al cierre de la
     * jornada contestara la apertura del día siguiente, aquí saldrían cientos de líneas terminando
     * un día tarde.
     */
    it('el instante de cada línea cae en el mismo día que el motor calculó', () => {
      const conMinutos = conJerarquia().map((t) => ({ ...t, duracionMin: t.duration * 480 }))
      const schedule = schedulePlan({
        tasks: conMinutos,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      const layout = ganttLayout({
        tasks: conMinutos,
        dependencies: plan.dependencies,
        schedule,
        classified: classifySuperCritical(analyzeCriticalPath(schedule), conMinutos).tasks,
        calendar,
      })

      const descuadres = layout.rows.filter(
        (r) => fechaDe(r.comienzoInstante) !== r.start || fechaDe(r.finInstante) !== r.finish,
      )

      expect(layout.rows).toHaveLength(1368)
      expect(descuadres.map((r) => `${r.name}: ${comoHora(r.finInstante)} contra ${r.finish}`)).toEqual([])
    })

    it('y las horas son las de la jornada: se empieza a las nueve y se cierra a las seis', () => {
      const conMinutos = conJerarquia().map((t) => ({ ...t, duracionMin: t.duration * 480 }))
      const schedule = schedulePlan({
        tasks: conMinutos,
        dependencies: plan.dependencies,
        calendar,
        start: plan.declaredStart,
      })
      const layout = ganttLayout({
        tasks: conMinutos,
        dependencies: plan.dependencies,
        schedule,
        classified: classifySuperCritical(analyzeCriticalPath(schedule), conMinutos).tasks,
        calendar,
      })

      // Todas las líneas que **trabajan** abren a las nueve y cierran a las seis, porque todas duran
      // jornadas enteras. Los hitos no: un hito no consume tiempo, así que cae donde lo deja su
      // vínculo —la apertura del día si lo trae un `FS`, el cierre si lo ata un `FF`— y las dos
      // cosas son ciertas a la vez en un plan con 109 hitos.
      const trabajan = layout.rows.filter((r) => !r.isMilestone)
      const abren = new Set(trabajan.map((r) => comoHora(r.comienzoInstante).slice(11)))
      const cierran = new Set(trabajan.map((r) => comoHora(r.finInstante).slice(11)))
      const hitos = new Set(layout.rows.filter((r) => r.isMilestone).map((r) => comoHora(r.comienzoInstante).slice(11)))

      expect([...abren]).toEqual(['09:00'])
      expect([...cierran]).toEqual(['18:00'])
      expect([...hitos].sort()).toEqual(['09:00', '18:00'])
    })

    it('dibuja las 1 368 líneas y los 1 665 vínculos del archivo', () => {
      const layout = trazado({ links: 'TODOS' })
      expect(layout.rows).toHaveLength(1368)
      expect(layout.links).toHaveLength(1665)
    })

    it('el lienzo abarca los 122 días hábiles del plan, en seis meses', () => {
      const layout = trazado()
      expect(layout.span).toBe(122)
      expect(layout.ticks).toHaveLength(6)
      expect(layout.ticks[0].label).toBe('junio 2026')
      expect(layout.ticks.at(-1)!.label).toBe('noviembre 2026')
    })

    /**
     * La cifra que justifica la regla 4. Al nivel de etapas, 1 665 flechas se convierten en 55 —una
     * por cada par de bloques que se hablan— y el plan se vuelve legible sin perder un solo vínculo:
     * cada flecha dice cuántos representa.
     */
    it('plegado por niveles, 1 665 flechas se leen como 55', () => {
      const abierto = trazado({ links: 'TODOS' })

      const porEtapas = trazado({ links: 'TODOS', collapsed: collapseToLevel(abierto.rows, 1) })
      expect(porEtapas.rows).toHaveLength(27)
      expect(porEtapas.links).toHaveLength(55)
      expect(porEtapas.foldedLinkCount).toBe(42)

      const porBloques = trazado({ links: 'TODOS', collapsed: collapseToLevel(abierto.rows, 2) })
      expect(porBloques.rows).toHaveLength(127)
      expect(porBloques.links).toHaveLength(148)
    })

    it('ningún vínculo se pierde al plegar: las flechas dicen cuántos representan', () => {
      const abierto = trazado({ links: 'TODOS' })
      const plegado = trazado({ links: 'TODOS', collapsed: collapseToLevel(abierto.rows, 1) })

      const representados = plegado.links.reduce((total, link) => total + link.foldedCount, 0)
      const internos = plan.dependencies.length - representados
      // Los que no aparecen son los que quedaron dentro de un mismo bloque cerrado: irían de una
      // fila a sí misma. No se pierden, es que no hay flecha que dibujar.
      expect(representados + internos).toBe(plan.dependencies.length)
      expect(representados).toBeGreaterThan(0)
    })

    it('los 159 vínculos fin-fin se anclan de fin a fin, no de fin a comienzo', () => {
      const layout = trazado({ links: 'TODOS' })
      const finFin = layout.links.filter((link) => link.type === 'FF')

      expect(finFin).toHaveLength(159)
      expect(finFin.every((link) => link.fromAnchor === 'FIN' && link.toAnchor === 'FIN')).toBe(true)
    })

    it('los 802 comienzo-comienzo unen comienzos', () => {
      const layout = trazado({ links: 'TODOS' })
      const ss = layout.links.filter((link) => link.type === 'SS')

      expect(ss).toHaveLength(802)
      expect(ss.every((link) => link.fromAnchor === 'INICIO' && link.toAnchor === 'INICIO')).toBe(true)
    })

    it('los 394 desfases del archivo llegan al dibujo con su signo', () => {
      const layout = trazado({ links: 'TODOS' })
      const conDesfase = layout.links.filter((link) => link.lag !== 0)

      expect(conDesfase).toHaveLength(394)
      expect(conDesfase.filter((link) => link.lag < 0)).toHaveLength(6)
    })

    it('el filtro de la ruta súper crítica deja 312 líneas y los 66 resúmenes que las ubican', () => {
      const layout = trazado({ filter: { onlySuperCritical: true } })

      expect(layout.rows.filter((row) => row.isSuperCritical)).toHaveLength(312)
      expect(layout.rows.filter((row) => row.isSummary && !row.isSuperCritical)).toHaveLength(66)
      expect(layout.rows).toHaveLength(378)
    })

    it('las barras se miden en días hábiles: ninguna se estira por cruzar un fin de semana', () => {
      const layout = trazado()
      for (const row of layout.rows) {
        const declarada = plan.byId.get(row.id)!
        if (declarada.isSummary || row.isMilestone) continue
        expect(row.width, row.id).toBe(Math.max(declarada.duration, 0))
      }
    })

    /** El árbol del archivo llega a seis niveles, y el trazado los conserva todos. */
    it('la jerarquía del archivo se conserva entera', () => {
      const niveles = new Set(trazado().rows.map((row) => row.level))
      expect([...niveles].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5])
    })
  })

  /** Las tareas con su padre y su fecha declarada: es lo que el Gantt necesita para plegar. */
  function conJerarquia(): PlanTask[] {
    const padres = parentsFromLevels(plan.rows.map((row) => ({ id: row.id, name: row.name, level: row.level })))
    return anclado().map((tarea) => {
      const padre = padres.get(tarea.id)
      return padre ? { ...tarea, parentId: padre } : tarea
    })
  }

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
