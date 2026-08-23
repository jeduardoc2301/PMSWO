import { describe, it, expect, beforeEach, vi } from 'vitest'
import { templateApplicationService } from '../template-application.service'
import prisma from '@/lib/prisma'
import { templateService } from '../template.service'
import { WorkItemPriority } from '@/types'

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: vi.fn(),
    project: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    kanbanColumn: { findFirst: vi.fn() },
    workItem: { create: vi.fn() },
  },
}))

vi.mock('../template.service', () => ({
  templateService: { getTemplateById: vi.fn(), recordTemplateUsage: vi.fn() },
}))

// Los minutos salen del calendario del proyecto, que aquí no existe. Lo que esta prueba mira es la
// forma del árbol, no cuántos minutos cabe en un día.
vi.mock('@/services/duracion.service', () => ({ minutosDeLaLinea: vi.fn(async () => 480) }))

/**
 * Aplicar una plantilla tiene que **construir el árbol**, no repartir etiquetas.
 *
 * Durante mucho tiempo creaba el plan plano: decenas de líneas todas en la raíz, con el nombre de su
 * fase copiado en un campo de texto. Se notaba poco mientras el Tablero agrupaba por ese campo; en
 * cuanto pasó a agrupar por el árbol —que es lo que el Esquema ya llamaba «Fase»— los proyectos
 * nacidos de plantilla se quedaron **sin ninguna banda**, y el mismo plan importado de un Excel sí
 * las tenía. La misma idea guardada de dos maneras, una de ellas incapaz de sostener la vista.
 *
 * Este archivo no existía: el servicio no tenía ninguna prueba propia.
 */
describe('§5.1 · aplicar una plantilla construye el árbol de fases', () => {
  const PLANTILLA = {
    id: 'tpl-1',
    name: 'Migración a la nube',
    phases: [
      {
        id: 'f1', name: 'Descubrimiento', order: 1,
        activities: [
          { id: 'a1', title: 'Entrevistar', description: 'd', priority: WorkItemPriority.HIGH, estimatedDuration: 8, order: 1 },
          { id: 'a2', title: 'Inventariar', description: 'd', priority: WorkItemPriority.MEDIUM, estimatedDuration: 4, order: 2 },
        ],
      },
      {
        id: 'f2', name: 'Ejecución', order: 2,
        activities: [
          { id: 'a3', title: 'Migrar', description: 'd', priority: WorkItemPriority.CRITICAL, estimatedDuration: 16, order: 1 },
        ],
      },
    ],
  }

  /** Lo que se le pidió crear a Prisma, en el orden en que se pidió. */
  let creadas: any[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    creadas = []
    vi.mocked(templateService.getTemplateById).mockResolvedValue(PLANTILLA as never)
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ id: 'p1' } as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u1' } as never)
    vi.mocked(prisma.kanbanColumn.findFirst).mockResolvedValue({ id: 'col-backlog' } as never)
    const tx = {
      workItem: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const fila = { ...data, id: `w${creadas.length + 1}` }
          creadas.push(fila)
          return fila
        }),
      },
    }
    vi.mocked(prisma.$transaction).mockImplementation((async (fn: any) => fn(tx)) as never)
  })

  const aplicar = () =>
    templateApplicationService.applyTemplate({
      projectId: 'p1', templateId: 'tpl-1',
      selectedActivityIds: ['a1', 'a2', 'a3'],
      startDate: new Date('2026-06-01T09:00:00.000Z'),
      userId: 'u1', organizationId: 'org-1',
    })

  it('crea una etapa con el nombre de la plantilla, y las fases debajo', async () => {
    // El Esquema llama «Etapa» al nivel 0 y «Fase» al nivel 1, y el Tablero agrupa por ese nivel 1.
    // Unas fases colgadas de la nada quedarían al nivel de las etapas y no encabezarían nada.
    await aplicar()
    const raices = creadas.filter((c) => c.parentId == null)
    expect(raices.map((r) => r.title)).toEqual(['Migración a la nube'])
    const fases = creadas.filter((c) => c.parentId === raices[0].id)
    expect(fases.map((f) => f.title)).toEqual(['Descubrimiento', 'Ejecución'])
    expect(fases.every((f) => f.kind === 'RESUMEN')).toBe(true)
  })

  it('y cuelga cada actividad de la suya', async () => {
    await aplicar()
    const porTitulo = new Map(creadas.map((c) => [c.title, c]))
    const madreDe = (titulo: string) =>
      creadas.find((c) => c.id === porTitulo.get(titulo)!.parentId)?.title
    expect(madreDe('Entrevistar')).toBe('Descubrimiento')
    expect(madreDe('Inventariar')).toBe('Descubrimiento')
    expect(madreDe('Migrar')).toBe('Ejecución')
  })

  it('con cada madre delante de sus hijas en el orden del plan', async () => {
    // `templateOrder` es el orden en que se cuenta el plan. Una fase detrás de sus propias
    // actividades desordena el EDT y las bandas de todas las vistas.
    await aplicar()
    const orden = [...creadas].sort((a, b) => a.templateOrder - b.templateOrder).map((c) => c.title)
    expect(orden).toEqual([
      'Migración a la nube',
      'Descubrimiento', 'Entrevistar', 'Inventariar',
      'Ejecución', 'Migrar',
    ])
  })

  it('y la madre abarca de la primera de sus hijas a la última', async () => {
    await aplicar()
    const madre = creadas.find((c) => c.title === 'Descubrimiento')!
    const hijas = creadas.filter((c) => c.parentId === madre.id)
    expect(madre.startDate.getTime()).toBe(Math.min(...hijas.map((h) => h.startDate.getTime())))
    expect(madre.estimatedEndDate.getTime()).toBe(Math.max(...hijas.map((h) => h.estimatedEndDate.getTime())))
    expect(madre.estimatedHours).toBe(12)
  })
})
