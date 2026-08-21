/**
 * Rellena `durationMinutes` desde las fechas que ya tiene cada línea (§2).
 *
 * ## Por qué existe y por qué es idempotente
 *
 * La migración a minutos no puede pedirle a nadie que vuelva a teclear mil trescientas duraciones.
 * Lo que hay son fechas, y de ellas sale la duración en días hábiles; con la jornada del proyecto,
 * los minutos. Este guion hace esa traducción **una vez** y se puede volver a correr sin daño: sólo
 * escribe donde `durationMinutes` está vacío, así que no pisa lo que alguien haya ajustado a mano.
 *
 * Un hito dura cero, y eso es correcto: no consume calendario. Se escribe el cero explícito en vez
 * de dejarlo nulo para que «no lo hemos calculado» y «dura cero» no se confundan.
 */
import { PrismaClient } from '@prisma/client'

import { createWorkCalendar } from '../lib/scheduling/calendar'
import { toDayNumber } from '../lib/scheduling/date'
import { esClaseDeHito } from '../lib/scheduling/kinds'
import { aMinutos } from '../lib/scheduling/unidades'

const prisma = new PrismaClient()
const calendar = createWorkCalendar()
const soloMirar = process.argv.includes('--dry-run')

async function main(): Promise<void> {
  const proyectos = await prisma.project.findMany({ select: { id: true, name: true, minutosPorJornada: true } })
  let total = 0

  for (const proyecto of proyectos) {
    const lineas = await prisma.workItem.findMany({
      where: { projectId: proyecto.id, durationMinutes: null },
      select: { id: true, kind: true, startDate: true, estimatedEndDate: true },
    })
    if (lineas.length === 0) continue

    let escritas = 0
    for (const linea of lineas) {
      let minutos = 0
      if (!esClaseDeHito(linea.kind) && linea.startDate && linea.estimatedEndDate) {
        const desde = calendar.ordinalOf(calendar.next(toDayNumber(linea.startDate.toISOString().slice(0, 10))))
        const hasta = calendar.ordinalOf(calendar.previous(toDayNumber(linea.estimatedEndDate.toISOString().slice(0, 10))))
        // Ambos extremos cuentan, como `NETWORKDAYS`: del lunes al viernes son cinco días.
        const dias = Math.max(1, hasta - desde + 1)
        minutos = aMinutos(dias, proyecto.minutosPorJornada)
      }
      if (!soloMirar) {
        await prisma.workItem.update({ where: { id: linea.id }, data: { durationMinutes: minutos } })
      }
      escritas += 1
    }
    total += escritas
    console.log(`${proyecto.name.slice(0, 40).padEnd(42)} ${escritas} lineas · jornada ${proyecto.minutosPorJornada} min`)
  }

  console.log(soloMirar ? `\n(solo mirar) se habrian escrito ${total}` : `\nescritas ${total}`)
  await prisma.$disconnect()
}

void main()
