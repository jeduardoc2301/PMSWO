/**
 * Cuán viejo es lo que hay en pantalla, y cuándo decirlo (§10.5).
 *
 * ## Por qué esto en vez de tiempo real
 *
 * El §10.5 pide «realtime con reconciliación de conflictos». Se decidió no construirlo y poner en su
 * lugar un **refresco a demanda**, y esa decisión sólo se sostiene si la pantalla es honesta sobre
 * su propia edad: sin tiempo real, el daño no es que los datos sean viejos —lo son de todos modos
 * entre dos recargas— sino que **nadie sepa que lo son**. Un botón de actualizar sin una edad al
 * lado es el mismo problema con un botón más.
 *
 * ## Los tres tramos, y por qué son tres y no una cuenta continua
 *
 * Un contador al segundo obliga a leer un número que cambia mientras lo lees, y sugiere una
 * precisión que no significa nada: que los datos tengan 41 o 47 segundos no cambia ninguna decisión.
 * Lo que cambia decisiones es de qué **orden** son:
 *
 * - **recién**, por debajo del minuto: lo que ves es lo que hay.
 * - **minutos**: puede haber algo nuevo, y si te importa, actualiza.
 * - **más de una hora**: casi seguro que hay algo nuevo; esto es una pestaña olvidada.
 *
 * Por eso el texto no lleva segundos y el aviso empieza a los cinco minutos, que es cuando la
 * diferencia deja de ser teórica en un plan que varias personas tocan a lo largo del día.
 */

/** A partir de aquí la pantalla se declara vieja, en milisegundos. */
export const VIEJO_MS = 5 * 60 * 1000

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

export interface Frescura {
  /** Lo que se escribe al lado del botón. */
  readonly texto: string
  /**
   * Verdadero cuando conviene destacarlo.
   *
   * Se separa del texto porque quien pinta decide **cómo** destacar; lo que aquí se sabe es
   * **cuándo**, y esa regla tiene que ser la misma en las seis vistas o cada pestaña diría que está
   * vieja en un momento distinto.
   */
  readonly vieja: boolean
  /** Milisegundos transcurridos, por si quien llama quiere otra cosa. */
  readonly edadMs: number
}

/**
 * La edad de lo que hay en pantalla, en palabras.
 *
 * `cargadoEn` y `ahora` son milisegundos desde la época. Se pasan los dos —en vez de leer el reloj
 * aquí dentro— para que esto sea una función pura y se pueda probar sin congelar el tiempo.
 *
 * Una edad **negativa** —el reloj del navegador atrasado respecto de cuando se marcó la carga— se
 * trata como recién cargado y no como «hace −3 minutos», que no significa nada.
 */
export function frescuraDe(cargadoEn: number | null, ahora: number): Frescura {
  if (cargadoEn === null) return { texto: 'sin cargar', vieja: false, edadMs: 0 }

  const edadMs = Math.max(0, ahora - cargadoEn)
  if (edadMs < MINUTO) return { texto: 'actualizado hace un momento', vieja: false, edadMs }

  if (edadMs < HORA) {
    const minutos = Math.floor(edadMs / MINUTO)
    return {
      texto: `actualizado hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`,
      vieja: edadMs >= VIEJO_MS,
      edadMs,
    }
  }

  if (edadMs < DIA) {
    const horas = Math.floor(edadMs / HORA)
    return { texto: `actualizado hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`, vieja: true, edadMs }
  }

  const dias = Math.floor(edadMs / DIA)
  return { texto: `actualizado hace ${dias} ${dias === 1 ? 'día' : 'días'}`, vieja: true, edadMs }
}

/**
 * Cada cuánto conviene volver a pintar el texto, en milisegundos.
 *
 * No es un sondeo al servidor: es sólo repintar la **edad**, que no cuesta nada y no pide datos. El
 * intervalo crece con la edad porque un texto que dice «hace 3 horas» no necesita despertarse cada
 * minuto para seguir diciendo lo mismo — y un temporizador al minuto en una pestaña olvidada toda la
 * tarde son seiscientos despertares para no cambiar ni una letra.
 */
export function cadaCuantoRepintar(edadMs: number): number {
  if (edadMs < HORA) return MINUTO
  if (edadMs < DIA) return HORA
  return DIA
}
