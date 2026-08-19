/**
 * Ordenar la Lista por columna (§10.4, `sortBy`).
 *
 * ## Por qué no en todos los formatos
 *
 * En el **esquema** el orden ya significa algo: es la jerarquía, y el EDT se lee de ella. Ordenar
 * por fecha allí no reordenaría una tabla, desarmaría un árbol — una hija aparecería antes que su
 * madre y la sangría diría una cosa y el orden otra. Por eso ordenar es cosa de los formatos planos.
 *
 * ## Tres estados y no dos
 *
 * Pulsar una cabecera va ascendente → descendente → **sin orden**. El tercero no es un capricho: el
 * orden natural de un plan —el del archivo, el del EDT— es información, y sin forma de volver a él
 * habría que recargar la página para recuperarlo.
 *
 * ## Los vacíos van al final siempre
 *
 * Una línea sin responsable no es «el responsable más pequeño»: es una línea de la que no se sabe
 * eso. Ponerla arriba al ordenar ascendente llenaría la primera pantalla de huecos justo cuando
 * alguien busca quién lleva qué. Van al final en los dos sentidos.
 */

import { COLUMNAS_DE_LA_LISTA_POR_ID } from './list-columns'

export type SentidoDeOrden = 'asc' | 'desc'

export interface OrdenDeLaLista {
  readonly campo: string
  readonly sentido: SentidoDeOrden
}

/** Qué se ordena y cómo. Lo que no esté aquí no se puede ordenar. */
const COMPARABLES: Readonly<Record<string, 'texto' | 'numero' | 'fecha'>> = Object.freeze({
  title: 'texto',
  status: 'texto',
  priority: 'texto',
  ownerName: 'texto',
  phase: 'texto',
  progressPct: 'numero',
  startDate: 'fecha',
  estimatedEndDate: 'fecha',
  estimatedHours: 'numero',
})

/** ¿Se puede ordenar por esta columna? */
export function sePuedeOrdenarPor(campo: string): boolean {
  return campo in COMPARABLES && COLUMNAS_DE_LA_LISTA_POR_ID.has(campo)
}

/**
 * El siguiente estado al pulsar una cabecera: ascendente → descendente → sin orden.
 *
 * Pulsar **otra** columna empieza de nuevo en ascendente, y no hereda el sentido de la anterior:
 * heredarlo daría una tabla ordenada al revés sin que nadie lo hubiera pedido.
 */
export function alPulsarCabecera(
  orden: OrdenDeLaLista | null,
  campo: string,
): OrdenDeLaLista | null {
  if (!sePuedeOrdenarPor(campo)) return orden
  if (orden === null || orden.campo !== campo) return { campo, sentido: 'asc' }
  if (orden.sentido === 'asc') return { campo, sentido: 'desc' }
  return null
}

/** Vacío es `null`, `undefined` y la cadena en blanco. Un cero no lo es. */
function estaVacio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function comparar(a: unknown, b: unknown, tipo: 'texto' | 'numero' | 'fecha'): number {
  if (tipo === 'numero') return Number(a) - Number(b)
  // Las fechas civiles se comparan como texto a propósito: «AAAA-MM-DD» ordena igual alfabética que
  // cronológicamente, y no hay que construir un `Date` por celda para saberlo.
  if (tipo === 'fecha') return String(a).slice(0, 10).localeCompare(String(b).slice(0, 10))
  // `localeCompare` y no `<`: con acentos y eñes, comparar cadenas por código pone «Ñ» después de
  // «Z» y a nadie le parece una lista ordenada.
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' })
}

/**
 * Ordena una lista plana.
 *
 * Devuelve una copia: la lista de origen es la del plan y reordenarla en el sitio cambiaría lo que
 * ven las otras vistas.
 *
 * El orden es **estable** cuando dos líneas empatan —se conserva el orden en que venían, que es el
 * del plan— porque una tabla que baraja los empates parece que cambia sola cada vez que se dibuja.
 */
export function ordenarLineas<T extends Record<string, unknown>>(
  lineas: readonly T[],
  orden: OrdenDeLaLista | null,
): readonly T[] {
  if (orden === null || !sePuedeOrdenarPor(orden.campo)) return lineas

  const tipo = COMPARABLES[orden.campo]!
  const signo = orden.sentido === 'asc' ? 1 : -1

  return [...lineas]
    .map((linea, posicion) => ({ linea, posicion }))
    .sort((x, y) => {
      const a = x.linea[orden.campo]
      const b = y.linea[orden.campo]

      // Los vacíos al final en los dos sentidos: una línea sin responsable no es «el responsable
      // más pequeño», es una de la que no se sabe eso.
      const va = estaVacio(a)
      const vb = estaVacio(b)
      if (va && vb) return x.posicion - y.posicion
      if (va) return 1
      if (vb) return -1

      const c = comparar(a, b, tipo)
      // Empate: manda el orden en que venían, que es el del plan.
      return c !== 0 ? c * signo : x.posicion - y.posicion
    })
    .map(({ linea }) => linea)
}
