/**
 * GET /api/v1/projects/[id]/export/xlsx — el plan como libro de Excel.
 *
 * Este archivo es el **adaptador**: lo único de todo el exportador que sabe cómo guarda las cosas
 * *esta* base de datos. Traduce columnas y relaciones a la forma neutra que pide
 * `construirLibroDePlan`, y ahí se acaba su trabajo.
 *
 * La frontera importa y conviene decir dónde cae, porque las dos cosas se parecen:
 *
 * - Que la clase `HITO` de este sistema tenga duración cero es **modelo de datos**. Vive aquí.
 * - Que las «Olas» de *un plan concreto* se pinten como contenedores mayores es **tema**. Vive en
 *   la configuración del proyecto, y este archivo se limita a pasarla.
 *
 * Sin esa distinción el exportador acabaría con un `if` por cada plan que llegara, que es
 * exactamente lo que el encargo prohíbe.
 */

import { NextRequest, NextResponse } from 'next/server'

import prisma from '@/lib/prisma'
import { exigirPermiso } from '@/lib/middleware/exigir-permiso'
import { type AuthContext, withAuth } from '@/lib/middleware/withAuth'
import { esClaseDeHito } from '@/lib/scheduling/kinds'
import { createWorkCalendar } from '@/lib/scheduling/calendar'
import { esPapel } from '@/lib/export/plan/roles'
import {
  construirLibroDePlan,
  type CampoDinamico,
  type LineaDePlan,
  type PlanParaExportar,
} from '@/lib/export/plan/workbook'
import { esTipoDeCampo, leerValor, type OpcionDeCampo } from '@/lib/projects/campos-personalizados'
import { Permission } from '@/types'

/**
 * Cómo se llama en pantalla cada clase de línea.
 *
 * Es presentación, no comportamiento: sale en la columna «Tipo» y sirve para buscar el papel en el
 * mapa del proyecto. Nada de lo que decide el exportador depende de estos textos — si mañana se
 * traducen, el libro sale igual de bien.
 */
const NOMBRE_DE_CLASE: Readonly<Record<string, string>> = Object.freeze({
  ACTIVIDAD: 'Actividad',
  HITO: 'Hito',
  PUNTO_DE_CONTROL: 'Punto de control',
  APROBACION_CLIENTE: 'Aprobación cliente',
  ENTREGA_CLIENTE: 'Entrega cliente',
  COMPUERTA: 'Compuerta',
  RESUMEN: 'Resumen',
})

/** Número de día del motor: días enteros desde el 1 de enero de 1970, en hora civil. */
function numeroDeDia(fecha: Date): number {
  return Math.floor(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) / 86_400_000)
}

function nombreDeArchivo(nombre: string): string {
  // Se queda con lo que un sistema de archivos acepta en cualquier plataforma. Un plan llamado
  // «Migración BU 2026/2027» produciría una ruta con un directorio inventado.
  const limpio = nombre.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80)
  return `${limpio || 'plan'}.xlsx`
}

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
  authContext: AuthContext,
): Promise<NextResponse> {
  const { id } = await context.params

  const negado = await exigirPermiso(
    authContext.userId,
    id,
    'view_gantt',
    'No tienes acceso al plan de este proyecto, así que tampoco a su exportación.',
  )
  if (negado) return negado

  const proyecto = await prisma.project.findFirst({
    // La organización va explícita: sin ella, un identificador de proyecto ajeno bastaría para
    // descargarse el plan entero.
    where: { id, organizationId: authContext.organizationId },
    include: {
      calendar: { include: { holidays: true } },
      exportConfig: true,
      customFields: {
        where: { archivedAt: null },
        orderBy: { orderIndex: 'asc' },
      },
      workItems: {
        orderBy: [{ templateOrder: 'asc' }, { startDate: 'asc' }],
        include: { customFieldValues: true },
      },
      taskDependencies: true,
    },
  })

  if (!proyecto) {
    return NextResponse.json({ error: 'NOT_FOUND', message: 'Proyecto no encontrado' }, { status: 404 })
  }

  // El mismo calendario con el que el motor programa. Si el libro contara los días laborables por
  // su cuenta, el «Atraso» de Excel y el del Timeline dirían cosas distintas del mismo plan.
  const diasHabiles = proyecto.calendar?.workingWeekdays
  const calendario = createWorkCalendar({
    workingWeekdays: Array.isArray(diasHabiles) ? (diasHabiles as number[]) : undefined,
    holidays: (proyecto.calendar?.holidays ?? []).map((h) => h.date.toISOString().slice(0, 10)),
  })

  // ── Predecesoras, agrupadas por sucesora ───────────────────────────────────
  const predecesorasDe = new Map<string, string[]>()
  for (const vinculo of proyecto.taskDependencies) {
    const lista = predecesorasDe.get(vinculo.successorId)
    if (lista) lista.push(vinculo.predecessorId)
    else predecesorasDe.set(vinculo.successorId, [vinculo.predecessorId])
  }

  // ── Campos personalizados ──────────────────────────────────────────────────
  const campos: CampoDinamico[] = proyecto.customFields.map((campo) => ({
    id: campo.id,
    etiqueta: campo.name,
  }))

  /** Para los tipos de lista, el valor guardado es el id de la opción; se enseña su etiqueta. */
  const etiquetasDeOpcion = new Map<string, Map<string, string>>()
  for (const campo of proyecto.customFields) {
    const opciones = Array.isArray(campo.options) ? (campo.options as unknown as OpcionDeCampo[]) : []
    if (opciones.length === 0) continue
    etiquetasDeOpcion.set(campo.id, new Map(opciones.map((o) => [o.id, o.label])))
  }

  // ── Líneas ─────────────────────────────────────────────────────────────────
  const lineas: LineaDePlan[] = proyecto.workItems.map((item) => {
    const inicio = numeroDeDia(item.startDate)
    const fin = numeroDeDia(item.estimatedEndDate)

    // Un hito no dura: llega o no llega. Se pregunta por la clase con el mismo predicado que usa
    // el motor —no con un literal escrito aquí— para que las dos vistas no puedan divergir.
    const esHito = esClaseDeHito(item.kind, undefined)
    const duracion = esHito ? 0 : calendario.countBetween(inicio, fin)

    const personalizados: Record<string, string | number | boolean | null> = {}
    for (const guardado of item.customFieldValues) {
      const campo = proyecto.customFields.find((c) => c.id === guardado.fieldId)
      if (!campo || !esTipoDeCampo(campo.type)) continue
      const valor = leerValor(campo.type, guardado.value)
      if (valor === null) continue
      if (Array.isArray(valor)) {
        const etiquetas = etiquetasDeOpcion.get(campo.id)
        personalizados[campo.id] = valor.map((v) => etiquetas?.get(v) ?? v).join(', ')
      } else if (typeof valor === 'string') {
        personalizados[campo.id] = etiquetasDeOpcion.get(campo.id)?.get(valor) ?? valor
      } else {
        personalizados[campo.id] = valor
      }
    }

    return {
      id: item.id,
      nombre: item.title,
      tipo: NOMBRE_DE_CLASE[item.kind] ?? item.kind,
      parentId: item.parentId,
      inicio,
      fin,
      duracion,
      // Los puntos base mandan sobre el porcentaje: un tercio son 3 333, que es exacto, y
      // 0.3333333333333333 no lo es.
      avance: item.progressBp / 10_000,
      // Sin campo de esfuerzo, el peso son los días laborables de la línea, que es lo que el
      // encargo pide. Un hito pesa cero: no aporta trabajo que ponderar.
      peso: null,
      predecesoras: predecesorasDe.get(item.id) ?? [],
      personalizados,
    }
  })

  // ── Configuración del proyecto ─────────────────────────────────────────────
  const guardada = proyecto.exportConfig
  const papeles: Record<string, string> = {}
  if (guardada?.roleMap && typeof guardada.roleMap === 'object' && !Array.isArray(guardada.roleMap)) {
    for (const [clave, valor] of Object.entries(guardada.roleMap as Record<string, unknown>)) {
      // Un papel desconocido se ignora en vez de tumbar la exportación: una configuración con una
      // errata debe costar un color, no el archivo entero.
      if (typeof valor === 'string' && esPapel(valor)) papeles[clave] = valor
    }
  }

  const advertencias = Array.isArray(guardada?.headerWarnings)
    ? (guardada.headerWarnings as unknown[]).filter((a): a is string => typeof a === 'string')
    : []

  const plan: PlanParaExportar = {
    nombre: proyecto.name,
    lineas,
    campos,
    configuracion: {
      papeles: Object.keys(papeles).length > 0 ? papeles : null,
      descripcion: guardada?.headerDescription ?? null,
      advertencias,
    },
  }

  const { contenido } = construirLibroDePlan(plan)

  return new NextResponse(new Uint8Array(contenido), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreDeArchivo(proyecto.name)}"`,
      'Content-Length': String(contenido.length),
      // El plan cambia en cuanto alguien mueve una línea; servir una copia guardada haría que el
      // archivo descargado no fuera el plan.
      'Cache-Control': 'no-store',
    },
  })
}

export const GET = withAuth(handler, { requiredPermissions: [Permission.EXPORT_PROJECT] })
