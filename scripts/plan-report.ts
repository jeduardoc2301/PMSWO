/**
 * Informe del motor de planeación sobre un plan real.
 *
 * Corre todo lo que el motor sabe hacer sobre un archivo de plan y lo imprime. Existe porque el
 * motor todavía no tiene pantalla: hasta que llegue el Gantt, esta es la forma de ver lo que
 * calcula sin leer pruebas.
 *
 *     npx tsx scripts/plan-report.ts
 *     npx tsx scripts/plan-report.ts "ruta/a/otro-plan.xlsx"
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createWorkCalendar } from '../lib/scheduling/calendar'
import { clientCommitments } from '../lib/scheduling/client-commitments'
import { analyzeCriticalPath } from '../lib/scheduling/cpm'
import { classifySuperCritical } from '../lib/scheduling/critical-path'
import { holidayDates, holidaysFor } from '../lib/scheduling/holidays'
import { importPlanFromXlsx } from '../lib/scheduling/import-plan'
import { parentsFromLevels, rollUpProgress } from '../lib/scheduling/progress'
import { schedulePlan } from '../lib/scheduling/schedule'
import { simulateHolidays } from '../lib/scheduling/simulation'
import type { PlanTask } from '../lib/scheduling/types'
import { readWorkbook } from '../lib/scheduling/xlsx'

const RUTA_POR_OMISION = 'referencia/PDT BU V7 - Plan Integrado.xlsx'

function titulo(texto: string): void {
  console.log(`\n${'─'.repeat(78)}\n  ${texto.toUpperCase()}\n${'─'.repeat(78)}`)
}

function dato(etiqueta: string, valor: string | number): void {
  console.log(`  ${etiqueta.padEnd(46, '.')} ${String(valor)}`)
}

function main(): void {
  const ruta = resolve(process.cwd(), process.argv[2] ?? RUTA_POR_OMISION)

  if (!existsSync(ruta)) {
    console.error(`No se encontró el archivo:\n  ${ruta}\n`)
    console.error(`Uso:  npx tsx scripts/plan-report.ts ["ruta/al/plan.xlsx"]`)
    process.exitCode = 1
    return
  }

  const buffer = readFileSync(ruta)
  const libro = readWorkbook(buffer)

  titulo('Origen')
  dato('Archivo', ruta.split(/[\\/]/).at(-1)!)
  dato('Hojas del libro', libro.sheetNames.length)
  console.log(`  ${libro.sheetNames.join(' · ')}`)

  // El plan de referencia aplica sus desfases negativos sin el día de separación de MS Project.
  const plan = importPlanFromXlsx(buffer, {
    file: ruta.split(/[\\/]/).at(-1),
    negativeLagConvention: 'SIN_DIA_INTERMEDIO',
  })

  titulo('Estructura')
  dato('Líneas', plan.rows.length)
  dato('Resúmenes', plan.rows.filter((r) => r.isSummary).length)
  dato('Hojas (líneas de detalle)', plan.rows.filter((r) => !r.isSummary).length)
  dato('Con entregable y criterio de salida', plan.rows.filter((r) => r.deliverable && r.exitCriteria).length)

  const porClase = new Map<string, number>()
  for (const fila of plan.rows) porClase.set(fila.kind, (porClase.get(fila.kind) ?? 0) + 1)
  for (const [clase, cuantas] of [...porClase].sort((a, b) => b[1] - a[1])) {
    dato(`  ${clase.toLowerCase().replace(/_/g, ' ')}`, cuantas)
  }

  titulo('Vínculos entre tareas')
  const porTipo = { FS: 0, SS: 0, FF: 0, SF: 0 }
  for (const v of plan.dependencies) porTipo[v.type] += 1
  dato('Total', plan.dependencies.length)
  dato('  fin-comienzo (FS)', porTipo.FS)
  dato('  comienzo-comienzo (SS)', porTipo.SS)
  dato('  fin-fin (FF)', porTipo.FF)
  dato('  comienzo-fin (SF)', porTipo.SF)
  dato('Con desfase distinto de cero', plan.dependencies.filter((v) => v.lag !== 0).length)
  dato('  de ellos, negativos (solapamiento)', plan.dependencies.filter((v) => v.lag < 0).length)

  if (plan.warnings.length > 0) {
    titulo('Advertencias de la importación')
    for (const aviso of plan.warnings) console.log(`  • ${aviso}`)
  }

  // ── El motor ───────────────────────────────────────────────────────────────
  const calendar = createWorkCalendar()

  // Las fechas del archivo se respetan como piso: es un plan ya construido, no uno por programar.
  const anclado: PlanTask[] = plan.tasks.map((t) => {
    const fila = plan.byId.get(t.id)!
    return fila.declaredStart ? { ...t, constraint: { type: 'NO_ANTES_DE' as const, date: fila.declaredStart } } : t
  })

  const schedule = schedulePlan({
    tasks: anclado,
    dependencies: plan.dependencies,
    calendar,
    start: plan.declaredStart,
  })

  titulo('Fechas')
  dato('Arranque', plan.declaredStart)
  dato('Cierre declarado en el archivo', plan.declaredFinish)
  dato('Cierre que calcula el motor', schedule.finish)
  dato(
    'Coinciden',
    schedule.finish === plan.declaredFinish ? 'sí, con tolerancia cero' : 'NO — revisar convenciones',
  )
  dato('Días hábiles que abarca', calendar.countBetween(
    calendar.ordinalOf ? toDay(plan.declaredStart) : 0,
    toDay(schedule.finish),
  ))

  const exactas = plan.rows.filter((fila) => {
    const t = schedule.byId.get(fila.id)!
    return t.start === fila.declaredStart && t.finish === fila.declaredFinish
  }).length
  dato('Líneas que caen donde el archivo dice', `${exactas} de ${plan.rows.length}`)

  const analysis = analyzeCriticalPath(schedule)
  const clasificado = classifySuperCritical(analysis, anclado, { excludeSummaries: true })

  titulo('Holgura y ruta crítica')
  dato('Universo (líneas de detalle)', clasificado.total)
  dato('Con holgura cero', `${clasificado.zeroFloatCount}  (${pct(clasificado.zeroFloatCount, clasificado.total)})`)
  dato('Con holgura cero o negativa', clasificado.criticalCount)
  dato('Criterio de cálculo', 'plazo hasta el cierre del plan · semántica MS Project')

  titulo('Ruta súper crítica — lo que no se recupera con más gente')
  dato('Total', `${clasificado.superCriticalCount}  (${pct(clasificado.superCriticalCount, clasificado.total)})`)
  dato('  lo decide un tercero', clasificado.superCriticalByReason.DECIDE_UN_TERCERO)
  dato('  tiempo transcurrido', clasificado.superCriticalByReason.TIEMPO_TRANSCURRIDO)
  dato('  fecha pactada', clasificado.superCriticalByReason.FECHA_PACTADA)
  console.log()
  dato('Depende del cliente', clasificado.superCriticalByParty.CLIENTE)
  dato('Depende del proveedor', clasificado.superCriticalByParty.PROVEEDOR)
  dato('De ambos', clasificado.superCriticalByParty.AMBOS)

  // ── Lo que debe el cliente ─────────────────────────────────────────────────
  const hoy = plan.declaredStart
  const compromisos = clientCommitments(
    classifySuperCritical(analysis, anclado),
    schedule.graph,
    anclado,
    { asOf: hoy },
  )

  titulo(`Lo que debe entregar o decidir el cliente  (al ${hoy})`)
  dato('Compromisos', compromisos.commitments.length)
  dato('  vencidos', compromisos.overdueCount)
  dato('  por vencer', compromisos.atRiskCount)
  dato('  pendientes', compromisos.pendingCount)
  dato('  cumplidos', compromisos.completedCount)
  dato('En la ruta súper crítica', compromisos.superCriticalCount)
  dato('Líneas del plan detenidas por el cliente', compromisos.blockedTaskCount)

  console.log('\n  Los diez que más arrastran:\n')
  const top = [...compromisos.commitments].sort((a, b) => b.blocks - a.blocks).slice(0, 10)
  for (const c of top) {
    console.log(`  ${c.dueDate}  arrastra ${String(c.blocks).padStart(4)} líneas   ${recorta(c.name, 52)}`)
  }

  // ── Avance ponderado ───────────────────────────────────────────────────────
  const parents = parentsFromLevels(plan.rows.map((r) => ({ id: r.id, name: r.name, level: r.level })))
  const jerarquia: PlanTask[] = plan.rows.map((r) => {
    const padre = parents.get(r.id)
    return {
      id: r.id,
      name: r.name,
      duration: r.duration,
      progress: r.progress ?? 0,
      ...(padre ? { parentId: padre } : {}),
    }
  })
  const rollup = rollUpProgress(jerarquia)

  titulo('Avance ponderado por trabajo')
  dato('Raíces del árbol', rollup.roots.length)
  dato('Trabajo total (días hábiles de las hojas)', rollup.totalWeight)
  dato('Días hábiles ya cubiertos', rollup.earnedDays)
  dato('Avance del plan', pct(rollup.earnedDays, rollup.totalWeight))
  console.log()
  for (const raiz of rollup.roots) {
    const t = rollup.byId.get(raiz)!
    dato(`  ${recorta(t.name, 40)}`, `peso ${t.weight}  ·  avance ${pct(t.earnedDays, t.weight)}`)
  }

  // ── Simulación de feriados ─────────────────────────────────────────────────
  const anio = Number(plan.declaredStart.slice(0, 4))
  const feriados = holidayDates(holidaysFor('CO', anio))
  const simulacion = simulateHolidays({
    plan: { tasks: anclado, dependencies: plan.dependencies, calendar, start: plan.declaredStart },
    holidays: feriados,
    deadline: plan.declaredFinish,
  })

  titulo(`Simulación — ¿y si se respetaran los feriados de Colombia ${anio}?`)
  dato(`Feriados de Colombia en ${anio}`, feriados.length)
  dato('  que sí quitan un día de trabajo', simulacion.appliedHolidays.length)
  dato('Cierre hoy', simulacion.baselineFinish)
  dato('Cierre si se respetaran', simulacion.simulatedFinish)
  dato('Corrimiento', `${simulacion.shiftInWorkingDays} días hábiles`)
  dato('Margen contra el compromiso', `${simulacion.baselineMargin} → ${simulacion.simulatedMargin}`)
  dato('Tareas que se moverían', simulacion.movedTasks.length)

  console.log(`\n${'─'.repeat(78)}\n`)
}

function pct(parte: number, total: number): string {
  if (total === 0) return '—'
  return `${((parte / total) * 100).toFixed(1)} %`
}

function recorta(texto: string, largo: number): string {
  return texto.length <= largo ? texto : `${texto.slice(0, largo - 1)}…`
}

function toDay(iso: string): number {
  return Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000)
}

main()
