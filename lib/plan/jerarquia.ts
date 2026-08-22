/**
 * Sangrar y anular sangría: mover una línea dentro del árbol del plan (§4.5, §13).
 *
 * Son las dos operaciones con las que se arma un plan a mano, y las dos son la misma idea vista al
 * derecho y al revés: **sangrar** hace que una línea cuelgue de la que tiene justo encima entre sus
 * hermanas; **anular sangría** la saca un nivel, dejándola colgada de su abuela.
 *
 * ## Por qué esto vive aparte del menú
 *
 * Porque lo difícil no es dibujar el menú, es contestar «¿de quién debe colgar ahora?» sin
 * equivocarse, y esa pregunta se contesta con el árbol delante y sin navegador. Un menú que ofrece
 * «sangrar» en una línea que no puede sangrarse enseña a desconfiar del menú entero.
 *
 * ## El orden importa
 *
 * «La hermana de arriba» solo significa algo si las hermanas tienen un orden. Aquí el orden es el de
 * entrada del arreglo, que es el mismo que usan la numeración EDT y el esquema. Si algún día ese
 * orden dejara de ser estable, esto empezaría a mover líneas bajo la hermana equivocada — y sería
 * exactamente igual de silencioso que el resto de los defectos de este módulo.
 */

/** Lo mínimo que hace falta saber de una línea para moverla en el árbol. */
export interface LineaDelArbol {
  readonly id: string
  readonly parentId?: string | null
}

/** Las hermanas de una línea, en orden, incluida ella. */
function hermanasDe(lineas: readonly LineaDelArbol[], padre: string | null): LineaDelArbol[] {
  return lineas.filter((l) => (l.parentId ?? null) === padre)
}

/** El padre de una línea, normalizado: `null` cuando cuelga de la raíz. */
function padreDe(lineas: readonly LineaDelArbol[], id: string): string | null | undefined {
  const linea = lineas.find((l) => l.id === id)
  return linea === undefined ? undefined : (linea.parentId ?? null)
}

/**
 * De quién pasaría a colgar esta línea al sangrarla, o `null` si no se puede.
 *
 * Se cuelga de la hermana inmediatamente anterior. La primera de un grupo de hermanas no puede
 * sangrarse: no hay nadie encima de quien colgar, y colgarla de la línea de arriba en pantalla
 * —que puede ser de otra rama— la sacaría de su sitio sin que nadie lo hubiera pedido.
 */
export function nuevoPadreAlSangrar(lineas: readonly LineaDelArbol[], id: string): string | null {
  const padre = padreDe(lineas, id)
  if (padre === undefined) return null
  const hermanas = hermanasDe(lineas, padre)
  const posicion = hermanas.findIndex((l) => l.id === id)
  if (posicion <= 0) return null
  return hermanas[posicion - 1]!.id
}

/**
 * Qué hacer con un atajo de sangría, sin que quepa confundir «no se puede» con «a la raíz».
 *
 * Existe porque esas dos cosas se confundieron, y de las dos formas posibles:
 *
 * - Al **sangrar**, `nuevoPadreAlSangrar` devuelve `null` para «no se puede» —la primera hermana no
 *   tiene de quién colgar—. Quien la llamaba comprobaba `=== undefined`, que esa función nunca
 *   devuelve, así que pasaba el `null` a mover: y `null` allí significa **raíz**. Pulsar Tab sobre la
 *   primera hermana la sacaba a primer nivel en silencio.
 * - Al **anular**, `nuevoPadreAlAnular` distingue `null` («no se puede») de `{ padre: null }` («su
 *   nueva casa es la raíz»). Quien la llamaba hacía `?.padre ?? undefined`, y `??` trata `null` y
 *   `undefined` igual: sacar una línea a primer nivel se descartaba, también en silencio.
 *
 * Los dos fallos son el mismo malentendido en direcciones opuestas, y los dos eran invisibles porque
 * una tecla que no hace nada no deja rastro. Aquí la respuesta es explícita —`mover` sí o no— y no
 * hay ningún `null` que interpretar.
 */
export type DestinoDelAtajo =
  | { readonly mover: false }
  | { readonly mover: true; readonly padre: string | null }

export function destinoDelAtajo(
  lineas: readonly LineaDelArbol[],
  id: string,
  accion: 'SANGRAR' | 'ANULAR_SANGRIA',
): DestinoDelAtajo {
  if (accion === 'SANGRAR') {
    const padre = nuevoPadreAlSangrar(lineas, id)
    return padre === null ? { mover: false } : { mover: true, padre }
  }
  const anular = nuevoPadreAlAnular(lineas, id)
  return anular === null ? { mover: false } : { mover: true, padre: anular.padre }
}

/** ¿Se puede sangrar esta línea? */
export function puedeSangrar(lineas: readonly LineaDelArbol[], id: string): boolean {
  return nuevoPadreAlSangrar(lineas, id) !== null
}

/**
 * De quién pasaría a colgar esta línea al anular su sangría.
 *
 * Pasa a colgar de su abuela. Devuelve `null` cuando ya está en la raíz —no hay adónde sacarla— y
 * `{ padre: null }` cuando su nueva casa es la raíz misma. Los dos casos son distintos y confundirlos
 * dejaría el menú ofreciendo una acción que no hace nada.
 */
export function nuevoPadreAlAnular(
  lineas: readonly LineaDelArbol[],
  id: string,
): { readonly padre: string | null } | null {
  const padre = padreDe(lineas, id)
  if (padre === undefined || padre === null) return null
  const abuela = padreDe(lineas, padre)
  // Un padre que no está en el corte: la línea se trata como raíz, igual que hace la numeración EDT.
  if (abuela === undefined) return { padre: null }
  return { padre: abuela }
}

/** ¿Se puede anular la sangría de esta línea? */
export function puedeAnularSangria(lineas: readonly LineaDelArbol[], id: string): boolean {
  return nuevoPadreAlAnular(lineas, id) !== null
}

/**
 * Los identificadores de la rama que cuelga de una línea, ella incluida.
 *
 * Hace falta para no ofrecer mover una línea dentro de su propia rama, que es como se fabrica un
 * ciclo. El servidor también lo comprueba —y debe seguir haciéndolo, porque es el que responde de
 * la integridad— pero ofrecer una acción imposible y que el servidor la rechace es una manera peor
 * de decir que no.
 */
export function ramaDe(lineas: readonly LineaDelArbol[], id: string): ReadonlySet<string> {
  const hijasDe = new Map<string, string[]>()
  for (const l of lineas) {
    const p = l.parentId ?? null
    if (p === null) continue
    const lista = hijasDe.get(p)
    if (lista) lista.push(l.id)
    else hijasDe.set(p, [l.id])
  }

  const rama = new Set<string>([id])
  const pila = [id]
  while (pila.length > 0) {
    const actual = pila.pop()!
    for (const hija of hijasDe.get(actual) ?? []) {
      // El corte protege de un árbol con ciclo, que no debería existir pero se dibuja igual.
      if (rama.has(hija)) continue
      rama.add(hija)
      pila.push(hija)
    }
  }
  return rama
}
