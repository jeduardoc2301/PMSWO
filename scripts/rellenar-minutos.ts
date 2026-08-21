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
import { minutosDesdeLasFechas } from '../lib/scheduling/duracion-guardada'

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
      // La misma traducción que usa la ruta al guardar un cambio de fechas, compartida y no
      // repetida: escrita dos veces se separarían el día que una cambie.
      const minutos =
        linea.startDate && linea.estimatedEndDate
          ? minutosDesdeLasFechas(
              calendar,
              linea.kind,
              linea.startDate.toISOString().slice(0, 10) as never,
              linea.estimatedEndDate.toISOString().slice(0, 10) as never,
              proyecto.minutosPorJornada,
            )
          : 0
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
