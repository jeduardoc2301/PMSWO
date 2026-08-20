/**
 * La pila de deshacer y rehacer (§10.6).
 *
 * Cincuenta operaciones, cada una con su acción inversa, y una operación que tocó doce líneas se
 * deshace como una sola.
 *
 * ## Es datos, no funciones
 *
 * Cada operación guarda **qué campos tenían antes** y **qué campos tienen ahora**, no un par de
 * cierres que sepan aplicarlo. Un cierre captura el estado del momento en que se creó, y en una
 * pantalla que se vuelve a dibujar cada pocos segundos eso significa que deshacer aplicaría un
 * estado viejo. Con datos, quien deshace lee lo que hay que escribir y lo escribe contra lo que
 * haya ahora.
 *
 * De paso, así una operación se puede enseñar («Mover 12 líneas»), registrar y depurar. Un cierre
 * no se puede mirar.
 *
 * ## La pila no aplica nada
 *
 * Esta pila decide **qué** hay que deshacer; escribirlo es de quien la usa. Es lo que permite
 * probarla con aritmética en vez de con una base de datos, y lo que hace que el fallo de una
 * escritura no la deje mintiendo: si aplicar falla, la pila no avanza.
 */

/** Lo que cambia en una línea: los campos y sus valores. */
export interface Cambio {
  readonly workItemId: string
  readonly campos: Readonly<Record<string, unknown>>
}

/**
 * Poner o quitar un vínculo entre dos líneas (§10.6).
 *
 * Va aparte de `Cambio` y no como un campo suyo porque un vínculo **no es un campo de una línea**:
 * vive entre dos, y su inversa no es «escribir el valor de antes» sino la operación contraria. El
 * tipo y el desfase viajan también en el quitar, no sólo en el poner, porque para deshacer una
 * eliminación hay que volver a crear el vínculo **igual** que estaba, y ese dato ya no está en la
 * base cuando toca reponerlo.
 */
export interface CambioDeVinculo {
  readonly predecessorId: string
  readonly successorId: string
  readonly type: string
  readonly lag: number
  /** `true` lo pone, `false` lo quita. */
  readonly poner: boolean
}

/**
 * Dar de alta o de baja una línea entera (§10.6).
 *
 * Tampoco cabe en `Cambio`: un alta no es un parche sobre algo que ya existe, y una baja no deja
 * nada que parchear. La inversa de un alta es una baja y viceversa, así que las dos comparten forma.
 *
 * La **foto** es lo que hace posible deshacer una baja. Se toma antes de borrar —después ya no está—
 * y lleva el identificador, porque los vínculos de esa línea apuntan a él: reponerla con otro
 * identificador dejaría los vínculos colgando de una línea que nadie conoce.
 */
export interface CambioDeLinea {
  /** `true` la crea, `false` la borra. */
  readonly poner: boolean
  /** El identificador. Se conserva al reponer para que sus vínculos vuelvan a encajar. */
  readonly workItemId: string
  /**
   * Todo lo que hay que saber para reponerla. Sólo hace falta cuando `poner` es `true`; al borrar,
   * el identificador basta. Va igualmente en las dos direcciones para que la operación se pueda
   * rehacer sin volver a leer la base.
   */
  readonly foto?: Readonly<Record<string, unknown>>
}

/** Todo lo que hay que escribir para ir en una dirección: campos, vínculos y altas o bajas. */
export interface LadoDeOperacion {
  readonly cambios: readonly Cambio[]
  readonly vinculos: readonly CambioDeVinculo[]
  readonly lineas: readonly CambioDeLinea[]
}

export interface Operacion {
  /** Cómo se llama en pantalla: «Mover 12 líneas a Terminado». */
  readonly etiqueta: string
  /** Lo que se aplicó. Sirve para rehacer. */
  readonly hacer: readonly Cambio[]
  /** Lo que había antes. Sirve para deshacer. */
  readonly deshacer: readonly Cambio[]
  /**
   * Los vínculos que pone o quita esta operación, si toca alguno.
   *
   * Opcional a propósito: las operaciones que ya existían —mover de columna, renombrar, capturar
   * avance, sangrar— no tocan vínculos, y obligarlas a declarar dos listas vacías sería ruido en
   * cada sitio que apunta una. Quien no lo trae, no toca ninguno.
   */
  readonly vinculos?: {
    readonly hacer: readonly CambioDeVinculo[]
    readonly deshacer: readonly CambioDeVinculo[]
  }
  /**
   * Las líneas que esta operación da de alta o de baja, si toca alguna.
   *
   * Opcional por lo mismo que los vínculos: casi ninguna operación crea ni borra líneas, y
   * obligarlas a declarar dos listas vacías sería ruido en cada sitio que apunta una.
   */
  readonly lineas?: {
    readonly hacer: readonly CambioDeLinea[]
    readonly deshacer: readonly CambioDeLinea[]
  }
}

/** El inverso de un cambio de vínculo: poner lo que se quitó, quitar lo que se puso. */
export function alReves(vinculo: CambioDeVinculo): CambioDeVinculo {
  return { ...vinculo, poner: !vinculo.poner }
}

export interface PilaDeDeshacer {
  /** Lo hecho, de lo más viejo a lo más reciente. */
  readonly hechas: readonly Operacion[]
  /** Lo deshecho y todavía rehacible, de lo más reciente a lo más viejo. */
  readonly deshechas: readonly Operacion[]
}

/** El tope que pide el §10.6. */
export const TOPE = 50

export const PILA_VACIA: PilaDeDeshacer = { hechas: [], deshechas: [] }

/**
 * Apunta una operación recién aplicada.
 *
 * Al apuntar se tira la rama de rehacer. Si alguien deshace tres cosas y luego hace una cuarta,
 * las tres deshechas ya no encajan con el estado actual, y ofrecerlas para rehacer sería ofrecer
 * escribir encima de lo que acaba de hacer.
 */
export function apuntar(pila: PilaDeDeshacer, operacion: Operacion): PilaDeDeshacer {
  const hechas = [...pila.hechas, operacion]
  // Se tira por el principio: lo que se pierde es lo más viejo, que es lo que nadie va a deshacer.
  return { hechas: hechas.length > TOPE ? hechas.slice(hechas.length - TOPE) : hechas, deshechas: [] }
}

export interface PasoAtras {
  readonly pila: PilaDeDeshacer
  /** Los cambios que hay que escribir, o `null` si no había nada que deshacer. */
  readonly cambios: readonly Cambio[] | null
  /** Los vínculos que hay que poner o quitar. Vacío en las operaciones que no tocan ninguno. */
  readonly vinculos: readonly CambioDeVinculo[]
  /** Las líneas que hay que reponer o borrar. Vacío en las que no tocan ninguna. */
  readonly lineas: readonly CambioDeLinea[]
  readonly etiqueta: string | null
}

/** Nada. Se comparten para no crear arreglos por paso. */
const SIN_VINCULOS: readonly CambioDeVinculo[] = Object.freeze([])
const SIN_LINEAS: readonly CambioDeLinea[] = Object.freeze([])

/**
 * Qué hay que escribir para deshacer lo último, y cómo queda la pila.
 *
 * Devuelve la pila **ya avanzada**. Quien la usa sólo debe quedársela si la escritura salió bien;
 * si falló, se queda con la de antes y la pila sigue coincidiendo con la realidad.
 */
export function deshacer(pila: PilaDeDeshacer): PasoAtras {
  const ultima = pila.hechas[pila.hechas.length - 1]
  if (!ultima) {
    return { pila, cambios: null, vinculos: SIN_VINCULOS, lineas: SIN_LINEAS, etiqueta: null }
  }

  return {
    pila: {
      hechas: pila.hechas.slice(0, -1),
      deshechas: [ultima, ...pila.deshechas],
    },
    cambios: ultima.deshacer,
    vinculos: ultima.vinculos?.deshacer ?? SIN_VINCULOS,
    lineas: ultima.lineas?.deshacer ?? SIN_LINEAS,
    etiqueta: ultima.etiqueta,
  }
}

/** Lo simétrico: qué hay que escribir para rehacer lo último que se deshizo. */
export function rehacer(pila: PilaDeDeshacer): PasoAtras {
  const [siguiente, ...resto] = pila.deshechas
  if (!siguiente) {
    return { pila, cambios: null, vinculos: SIN_VINCULOS, lineas: SIN_LINEAS, etiqueta: null }
  }

  return {
    pila: { hechas: [...pila.hechas, siguiente], deshechas: resto },
    cambios: siguiente.hacer,
    vinculos: siguiente.vinculos?.hacer ?? SIN_VINCULOS,
    lineas: siguiente.lineas?.hacer ?? SIN_LINEAS,
    etiqueta: siguiente.etiqueta,
  }
}

export function sePuedeDeshacer(pila: PilaDeDeshacer): boolean {
  return pila.hechas.length > 0
}

export function sePuedeRehacer(pila: PilaDeDeshacer): boolean {
  return pila.deshechas.length > 0
}

/** Cómo se llama lo próximo que se desharía, para el rótulo del botón o del atajo. */
export function etiquetaDeDeshacer(pila: PilaDeDeshacer): string | null {
  return pila.hechas[pila.hechas.length - 1]?.etiqueta ?? null
}

export function etiquetaDeRehacer(pila: PilaDeDeshacer): string | null {
  return pila.deshechas[0]?.etiqueta ?? null
}

/**
 * Arma una operación a partir del antes y el después de un puñado de líneas.
 *
 * Sólo apunta los campos que **de verdad cambiaron**. Guardar los que no cambiaron haría que
 * deshacer escribiera encima de ediciones que otra persona hizo entretanto en campos que esta
 * operación ni tocó.
 *
 * @returns `null` si no cambió nada. Una operación vacía en la pila obligaría a pulsar Ctrl+Z dos
 *   veces para deshacer algo, sin que nadie entienda por qué la primera no hizo nada.
 */
export function operacionDesde(
  etiqueta: string,
  antes: readonly { id: string; [campo: string]: unknown }[],
  despues: readonly { id: string; [campo: string]: unknown }[],
): Operacion | null {
  const despuesPorId = new Map(despues.map((d) => [d.id, d]))

  const hacer: Cambio[] = []
  const atras: Cambio[] = []

  for (const original of antes) {
    const nuevo = despuesPorId.get(original.id)
    if (!nuevo) continue

    const camposNuevos: Record<string, unknown> = {}
    const camposViejos: Record<string, unknown> = {}
    for (const clave of Object.keys(nuevo)) {
      if (clave === 'id') continue
      if (!Object.is(original[clave], nuevo[clave])) {
        camposNuevos[clave] = nuevo[clave]
        camposViejos[clave] = original[clave]
      }
    }

    if (Object.keys(camposNuevos).length === 0) continue
    hacer.push({ workItemId: original.id, campos: camposNuevos })
    atras.push({ workItemId: original.id, campos: camposViejos })
  }

  if (hacer.length === 0) return null
  return { etiqueta, hacer, deshacer: atras }
}
