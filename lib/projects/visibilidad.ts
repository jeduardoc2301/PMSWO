/**
 * Qué proyectos aparecen en la lista de cada quien.
 *
 * ## La pregunta que responde, y la que no
 *
 * Ésta es «¿cuáles **veo**?». La de `permisos.ts` es «¿qué puedo hacer en éste?». Se parecen lo
 * suficiente como para que confundirlas cueste caro: durante un tiempo la lista repartía por cargo
 * de organización mientras la puerta del proyecto repartía por papel, y el resultado fue que se
 * podía sentar a alguien en un proyecto, verlo en la pantalla de papeles con su papel puesto, y que
 * esa persona entrara y no viera el proyecto por ningún lado. La lista y la puerta decían cosas
 * distintas sobre la misma persona.
 *
 * Ahora dicen lo mismo: **la pertenencia decide qué ves, el cargo decide qué puedes hacer dentro**.
 *
 * ## Aritmética, no base de datos
 *
 * Aquí no se consulta nada: entran un identificador y unos cargos, y sale la cláusula que la
 * consulta le pasará a Prisma. Igual que en `permisos.ts`, separarlo permite probar la regla entera
 * sin levantar una base — que es donde de verdad se ve si una condición quedó cruzada.
 */

import { UserRole } from '@/types'

/**
 * Los cargos que ven la cartera entera de su organización sin que nadie les invite.
 *
 * Son dos y por el mismo motivo: su trabajo **es** la cartera. El ejecutivo la mira y el
 * administrador la administra. Cualquier otro cargo, incluido el gerente de proyectos, ve lo suyo.
 */
export const CARGOS_QUE_VEN_LA_CARTERA: ReadonlySet<string> = new Set<string>([
  UserRole.ADMIN,
  UserRole.EXECUTIVE,
])

/** La forma de la cláusula: las cuatro maneras de pertenecer a un proyecto. */
export interface FiltroDePertenencia {
  readonly OR: readonly [
    { readonly ownerId: string },
    { readonly projectManagerId: string },
    { readonly collaborators: { readonly some: { readonly userId: string } } },
    { readonly workItems: { readonly some: { readonly ownerId: string } } },
  ]
}

export function veLaCarteraEntera(cargos: readonly string[]): boolean {
  return cargos.some((cargo) => CARGOS_QUE_VEN_LA_CARTERA.has(cargo))
}

/**
 * La cláusula que recorta la lista de proyectos, o `null` si no hay que recortar.
 *
 * Las cuatro formas de pertenecer:
 *
 * 1. **Ser el dueño** — el proyecto es suyo.
 * 2. **Llevarlo** — figura como `projectManagerId`. Faltaba, y dejaba fuera a quien lleva el plan
 *    sin fila de colaborador: ningún cargo llegaba a mirar esa columna.
 * 3. **Tener fila de colaborador** — alguien lo sentó ahí a propósito, con un papel. Es la vía por
 *    la que se le dan proyectos a una cuenta de solo lectura.
 * 4. **Tener alguna línea del plan a su nombre** — se conserva de la regla anterior. Sin ella, un
 *    consultor con tareas asignadas y sin fila de colaborador perdería mañana proyectos que ve hoy,
 *    y una migración que quita accesos no se puede desplegar un martes por la tarde.
 *
 * `null` y no una cláusula vacía: `{ OR: [] }` en Prisma no devuelve todo, devuelve **nada**. Es la
 * clase de detalle que convierte «ve la cartera entera» en «no ve nada» sin que falle ninguna
 * prueba de tipos.
 */
export function filtroDeProyectosVisibles(
  userId: string,
  cargos: readonly string[],
): FiltroDePertenencia | null {
  if (veLaCarteraEntera(cargos)) return null

  return {
    OR: [
      { ownerId: userId },
      { projectManagerId: userId },
      { collaborators: { some: { userId } } },
      { workItems: { some: { ownerId: userId } } },
    ],
  }
}
