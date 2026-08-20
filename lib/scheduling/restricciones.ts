/**
 * Las ocho restricciones del §3.4, con el nombre y la explicación que ve quien las elige.
 *
 * El motor ya sabía las ocho; lo que faltaba era poder ponerlas sin abrir un cliente de MySQL. Este
 * catálogo existe para que el nombre visible, la explicación y la regla de «¿lleva fecha?» vivan en
 * **un** sitio: el diálogo, la validación de la ruta y cualquier pantalla futura leen de aquí.
 *
 * ## Por qué la explicación importa más que el nombre
 *
 * `SNET` y `MSO` suenan igual y hacen cosas distintas: la primera es un piso —«no antes de»— y la
 * segunda un clavo —«exactamente el»—. Quien planifica elige mal si sólo ve las siglas, y elegir mal
 * aquí no da un error: da un cronograma que miente. Por eso cada una lleva una frase que dice qué le
 * pasa a la línea, no qué significa la sigla.
 *
 * ## Las tres familias
 *
 * - **Flexibles** (`ASAP`, `ALAP`): no llevan fecha. El motor decide dónde va la línea.
 * - **Semiflexibles** (`SNET`, `SNLT`, `FNET`, `FNLT`): llevan fecha y dejan margen a un lado.
 * - **Inflexibles** (`MSO`, `MFO`): llevan fecha y no dejan ninguno.
 *
 * Y dentro de las que llevan fecha, la distinción que de verdad cambia el plan no es esa: es si
 * **empuja** o si sólo **compromete**. Tres empujan y mueven la línea; tres comprometen y la dejan
 * donde la cadena la puso, sacando holgura negativa cuando ya no se cumplen. Está en el campo
 * `mueve` porque es lo que hay que poder decirle a quien elige.
 */

/** El valor que se guarda en `WorkItem.constraintType`. `null` es «ninguna». */
export type CodigoDeRestriccion =
  | 'ASAP'
  | 'ALAP'
  | 'NO_ANTES_DE'
  | 'NO_EMPIEZA_DESPUES_DE'
  | 'NO_TERMINA_ANTES_DE'
  | 'NO_TERMINA_DESPUES_DE'
  | 'DEBE_EMPEZAR_EL'
  | 'DEBE_TERMINAR_EL'

export interface Restriccion {
  readonly codigo: CodigoDeRestriccion
  /** La sigla de MS Project. Se muestra en pequeño: quien viene de ahí la busca. */
  readonly sigla: string
  readonly nombre: string
  /** Qué le pasa a la línea. En una frase, sin siglas. */
  readonly explicacion: string
  /** Si pide fecha. Las dos flexibles no. */
  readonly pideFecha: boolean
  /** Si mueve la línea (empuja) o sólo la compromete. */
  readonly mueve: boolean
  readonly flexibilidad: 'FLEXIBLE' | 'SEMIFLEXIBLE' | 'INFLEXIBLE'
}

export const RESTRICCIONES: readonly Restriccion[] = Object.freeze([
  {
    codigo: 'ASAP',
    sigla: 'ASAP',
    nombre: 'Lo antes posible',
    explicacion:
      'Empieza en cuanto sus predecesoras la dejan. Es lo que hace una línea sin restricción.',
    pideFecha: false,
    mueve: false,
    flexibilidad: 'FLEXIBLE',
  },
  {
    codigo: 'ALAP',
    sigla: 'ALAP',
    nombre: 'Lo más tarde posible',
    explicacion:
      'Se corre hasta el último día en que cabe sin atrasar el cierre del plan. Sirve para lo que se compra o se contrata justo a tiempo; a cambio, la línea se queda sin holgura.',
    pideFecha: false,
    mueve: true,
    flexibilidad: 'FLEXIBLE',
  },
  {
    codigo: 'NO_ANTES_DE',
    sigla: 'SNET',
    nombre: 'No empieza antes de',
    explicacion: 'Puede empezar ese día o después, nunca antes. Es la restricción normal de un plan.',
    pideFecha: true,
    mueve: true,
    flexibilidad: 'SEMIFLEXIBLE',
  },
  {
    codigo: 'NO_TERMINA_ANTES_DE',
    sigla: 'FNET',
    nombre: 'No termina antes de',
    explicacion:
      'Lo que no sirve antes de tiempo: una entrega que el cliente no puede recibir hasta que abra su ventana de cambios.',
    pideFecha: true,
    mueve: true,
    flexibilidad: 'SEMIFLEXIBLE',
  },
  {
    codigo: 'NO_EMPIEZA_DESPUES_DE',
    sigla: 'SNLT',
    nombre: 'No empieza después de',
    explicacion:
      'Un compromiso, no un empujón: si la cadena la lleva más allá, la línea se queda donde está y sale con holgura negativa — que es el aviso.',
    pideFecha: true,
    mueve: false,
    flexibilidad: 'SEMIFLEXIBLE',
  },
  {
    codigo: 'NO_TERMINA_DESPUES_DE',
    sigla: 'FNLT',
    nombre: 'No termina después de',
    explicacion:
      'Igual que la anterior, pero amarrando el fin. Tampoco mueve la línea: avisa con holgura negativa.',
    pideFecha: true,
    mueve: false,
    flexibilidad: 'SEMIFLEXIBLE',
  },
  {
    codigo: 'DEBE_EMPEZAR_EL',
    sigla: 'MSO',
    nombre: 'Debe empezar el',
    explicacion:
      'Clava el arranque en ese día, la empujen o no sus predecesoras. Úsala poco: una línea clavada deja de responder al plan.',
    pideFecha: true,
    mueve: true,
    flexibilidad: 'INFLEXIBLE',
  },
  {
    codigo: 'DEBE_TERMINAR_EL',
    sigla: 'MFO',
    nombre: 'Debe terminar el',
    explicacion:
      'La fecha prometida. No mueve la línea: si la cadena la pasa, la holgura sale negativa en vez de fingir que se cumple.',
    pideFecha: true,
    mueve: false,
    flexibilidad: 'INFLEXIBLE',
  },
])

const PORCODIGO = new Map(RESTRICCIONES.map((r) => [r.codigo, r]))

/**
 * El ancla con la que llega cada línea del plan (§3.0).
 *
 * No es una decisión de nadie: es lo que fija la fecha guardada para que el motor no recoloque el
 * plan entero cada vez que se lee.
 */
export const ANCLA: CodigoDeRestriccion = 'NO_ANTES_DE'

/**
 * ¿Arrastrar la barra de esta línea **pierde** algo que alguien decidió?
 *
 * El arrastre clava la línea con `DEBE_EMPEZAR_EL` en su fecha nueva, y `WorkItem` tiene **una
 * sola** pareja de columnas de restricción: lo que hubiera se sobrescribe.
 *
 * Reemplazar el ancla por otra ancla no es perder nada. Reemplazar un **compromiso** —«no termina
 * después del 18», «debe terminar el 18»— sí lo es: es lo único que distingue una fecha negociada
 * de una calculada, y es lo más caro de capturar del §3.4.
 *
 * Devuelve `true` también para un código que no reconoce: si hay algo guardado que no sabemos leer,
 * avisar de más es mejor que borrarlo callando.
 */
export function sePierdeAlArrastrar(codigo: string | null | undefined): boolean {
  if (codigo == null || codigo === '') return false
  return codigo !== ANCLA
}

export function restriccion(codigo: string | null | undefined): Restriccion | null {
  if (!codigo) return null
  return PORCODIGO.get(codigo as CodigoDeRestriccion) ?? null
}

/**
 * Por qué no se admite esta combinación, o `null` si se admite.
 *
 * Devuelve el motivo en vez de un booleano para que el mismo texto sirva en la pantalla y en la
 * respuesta de la ruta: dos redacciones del mismo rechazo acaban divergiendo, y la que se queda
 * atrás es siempre la del servidor, que es la que nadie lee hasta que falla.
 */
export function porQueNoSeAdmiteLaRestriccion(
  codigo: string | null | undefined,
  fecha: string | null | undefined,
): string | null {
  if (codigo == null || codigo === '') {
    // Sin restricción es válido: es la línea normal, que se coloca por sus predecesoras.
    return fecha ? 'Hay una fecha de restricción sin restricción que la use.' : null
  }

  const r = restriccion(codigo)
  if (!r) return `«${codigo}» no es una de las ocho restricciones.`

  if (r.pideFecha && !fecha) return `«${r.nombre}» necesita una fecha.`
  if (!r.pideFecha && fecha) {
    return `«${r.nombre}» no lleva fecha: la calcula el motor a partir del plan.`
  }
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return `«${fecha}» no es una fecha con forma AAAA-MM-DD.`
  }
  if (fecha) {
    // Se comprueba yendo y volviendo porque `new Date('2026-02-30')` no truena: da el 2 de marzo, y
    // una fecha que se corrige sola es peor que una que se rechaza.
    const d = new Date(`${fecha}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
      return `«${fecha}» no es un día que exista.`
    }
  }
  return null
}
