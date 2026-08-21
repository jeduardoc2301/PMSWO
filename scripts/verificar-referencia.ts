/**
 * El estado del plan de referencia en la base local, para poder decirlo con números después de cada
 * medición destructiva.
 *
 * Existe porque las mediciones de esta sesión escriben en la base —marcar una restricción, mover una
 * tarjeta, crear y borrar líneas— y afirmar «lo dejé como estaba» sin contar es exactamente la clase
 * de afirmación que ya salió falsa una vez.
 *
 *   DATABASE_URL=mysql://root@localhost:3307/pm npx tsx scripts/verificar-referencia.ts
 */

import prisma from '../lib/prisma'
import { createWorkCalendar } from '../lib/scheduling/calendar'
import { toDayNumber } from '../lib/scheduling/date'
import { esClaseDeHito } from '../lib/scheduling/kinds'

const calendario = createWorkCalendar()

/**
 * Días hábiles de una línea, exactamente como los cuenta el relleno de minutos.
 *
 * Se comparte el criterio a propósito: escrito dos veces, la primera vez que lo escribí por mi
 * cuenta acusé a 23 líneas sanas —conté los hitos por `kind === 'HITO'` cuando la clase de hito
 * incluye también `PUNTO_DE_CONTROL`, y no normalicé los extremos que caen en fin de semana—.
 */
function diasHabiles(desde: Date, hasta: Date): number {
  const a = calendario.ordinalOf(calendario.next(toDayNumber(desde.toISOString().slice(0, 10))))
  const b = calendario.ordinalOf(calendario.previous(toDayNumber(hasta.toISOString().slice(0, 10))))
  return Math.max(1, b - a + 1)
}

/** Lo que el plan de referencia tiene que decir siempre. */
const ESPERADO = {
  lineas: 1368,
  vinculos: 1665,
  cierre: '2026-11-30',
  conRestriccionRara: 0,
  conAvance: 0,
  alReves: 0,
  // El arranque del proyecto es el suelo desde el que el motor coloca las 1368 líneas: moverlo un
  // día mueve el cronograma entero, y ninguna de las cuentas de arriba lo notaría. Se añadió
  // después de tener que restaurarlo a mano tras medir la guardia de `PATCH /projects/[id]`.
  arranque: '2026-06-01',
  // Y las fotos, que una medición de permisos crea sin querer y nadie vuelve a mirar.
  lineasBase: 1,
  /**
   * Líneas cuya duración en minutos no cuadra con sus días (§2).
   *
   * En el plan de referencia todo dura jornadas enteras, así que `minutos = días × 480` en las
   * 1 368. La comprobación existe porque midiendo la celda de duración exacta escribí «4 h» sobre
   * una línea real, y ninguna de las siete cuentas de arriba lo habría notado: ni el número de
   * líneas, ni los vínculos, ni el cierre, ni las fechas al revés. Es el tercer verificador que
   * crece por el mismo motivo — una medición que escribe deja rastro donde nadie mira—.
   */
  minutosSinCuadrar: 0,
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? ''
  if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error('DATABASE_URL no apunta a localhost. Esto no se ejecuta contra otra base.')
  }

  const [{ projectId }] = await prisma.workItem.groupBy({
    by: ['projectId'],
    _count: { _all: true },
    orderBy: { _count: { id: 'desc' } },
    take: 1,
  })

  const lineas = await prisma.workItem.count({ where: { projectId } })
  const vinculos = await prisma.taskDependency.count({
    where: { predecessor: { projectId } },
  })
  const cierre = await prisma.workItem.aggregate({
    where: { projectId },
    _max: { estimatedEndDate: true },
  })
  const conRestriccionRara = await prisma.workItem.count({
    where: { projectId, constraintType: { not: null } },
  })
  const conAvance = await prisma.workItem.count({
    where: { projectId, progressPct: { gt: 0 } },
  })

  /**
   * Líneas con el inicio después del fin.
   *
   * No es una comprobación de adorno: midiendo la guardia de `edit_schedule` se escribió un inicio
   * de 2027 sobre una línea que terminaba en 2026, y el plan quedó con una línea degenerada que
   * ninguna de las otras cuatro cuentas habría delatado — el total de líneas, los vínculos y el
   * cierre seguían clavados. Una medición destructiva puede dejar el plan roto por dentro sin
   * cambiar ninguna cifra de tamaño.
   */
  const fechas = await prisma.workItem.findMany({
    where: { projectId },
    select: { id: true, title: true, startDate: true, estimatedEndDate: true },
  })
  const alReves = fechas.filter((f) => f.startDate > f.estimatedEndDate)
  for (const f of alReves) {
    console.log(
      `     ${f.title.slice(0, 60)}  ${f.startDate.toISOString().slice(0, 10)} → ${f.estimatedEndDate.toISOString().slice(0, 10)}`,
    )
  }

  /**
   * Los minutos contra los días, línea a línea.
   *
   * Los días hábiles se cuentan con el mismo criterio que el resto del sistema —ambos extremos
   * incluidos—, así que una línea de un día tiene 480 minutos y un hito, cero.
   */
  const minutos = await prisma.workItem.findMany({
    where: { projectId },
    select: { id: true, title: true, kind: true, durationMinutes: true, startDate: true, estimatedEndDate: true },
  })
  const jornada = (await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { minutosPorJornada: true },
  })).minutosPorJornada
  const sinCuadrar = minutos.filter((m) => {
    const dias = diasHabiles(m.startDate, m.estimatedEndDate)
    const esperados = esClaseDeHito(m.kind) ? 0 : dias * jornada
    return m.durationMinutes !== esperados
  })
  for (const m of sinCuadrar.slice(0, 10)) {
    console.log(
      `     ${m.title.slice(0, 50)}  ${m.durationMinutes} min contra ${diasHabiles(m.startDate, m.estimatedEndDate)} d`,
    )
  }

  const proyecto = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { startDate: true },
  })
  const lineasBase = await prisma.baseline.count({ where: { projectId } })

  const real = {
    lineas,
    vinculos,
    cierre: cierre._max.estimatedEndDate ? cierre._max.estimatedEndDate.toISOString().slice(0, 10) : '(sin fechas)',
    conRestriccionRara,
    conAvance,
    alReves: alReves.length,
    arranque: proyecto.startDate.toISOString().slice(0, 10),
    lineasBase,
    minutosSinCuadrar: sinCuadrar.length,
  }

  let todoBien = true
  for (const clave of Object.keys(ESPERADO) as (keyof typeof ESPERADO)[]) {
    const ok = real[clave] === ESPERADO[clave]
    if (!ok) todoBien = false
    console.log(
      `${ok ? 'ok  ' : 'MAL '} ${clave.padEnd(20)} ${String(real[clave]).padStart(10)}   (esperado ${ESPERADO[clave]})`,
    )
  }
  console.log(todoBien ? '\nEl plan de referencia está como debe.' : '\nAlgo quedó tocado.')
  if (!todoBien) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
