/**
 * Impide que el servidor de desarrollo hable con la base de producción.
 *
 * ## Por qué existe
 *
 * `.env.local` de este repositorio apunta a la instancia de RDS de producción. El servidor de
 * desarrollo funciona contra la base local únicamente porque quien lo levanta exporta
 * `DATABASE_URL` por fuera, y la precedencia de Next hace que `process.env` gane al archivo. Es
 * decir: la configuración por omisión de este repositorio es producción, y lo que la salva es
 * acordarse de una variable.
 *
 * Eso falla de dos maneras, y las dos se vieron:
 *
 * 1. **Silenciosa y lenta.** RDS no es alcanzable desde la máquina de desarrollo, así que cada
 *    consulta espera a un servidor que no responde hasta agotar el plazo. No hay error: hay una
 *    pantalla que tarda minutos en aparecer. Es el síntoma que se reportó.
 * 2. **Silenciosa y grave.** Desde una máquina que *sí* alcance RDS, un `npm run dev` sin la
 *    variable escribe en producción creyendo que escribe en local. Un alta de prueba, un arrastre
 *    de una barra, un borrado — todo va a la base de verdad y nadie se entera hasta después.
 *
 * Un fallo inmediato y explicado es mejor que las dos cosas.
 *
 * ## La puerta de salida
 *
 * Leer producción para reproducir datos en local es legítimo y se hace. Por eso hay una salida
 * explícita, `PERMITIR_BASE_DE_PRODUCCION=1`, que hay que escribir a propósito: lo que se persigue
 * no es prohibir, es que nadie llegue ahí sin querer.
 */

/** Anfitriones que no son de nadie en su portátil. */
const SENALES_DE_PRODUCCION = ['rds.amazonaws.com', 'rds.aws.amazon.com']

/**
 * El anfitrión de una URL de conexión, o cadena vacía si no se puede leer.
 *
 * Sin `new URL`: una contraseña con caracteres raros —las hay— la hace lanzar, y esta función se
 * ejecuta al arrancar. Que la guardia tumbe el arranque por no saber leer la URL sería peor que no
 * tenerla.
 */
export function anfitrionDe(url: string): string {
  const sinEsquema = url.replace(/^[a-z]+:\/\//i, '')
  const trasCredenciales = sinEsquema.slice(sinEsquema.lastIndexOf('@') + 1)
  const finDelAnfitrion = trasCredenciales.search(/[:/?]/)
  const anfitrion = finDelAnfitrion === -1 ? trasCredenciales : trasCredenciales.slice(0, finDelAnfitrion)
  return anfitrion.toLowerCase()
}

/** ¿Esta URL apunta a una base que no es local? */
export function esDeProduccion(url: string | undefined): boolean {
  if (!url) return false
  const anfitrion = anfitrionDe(url)
  return SENALES_DE_PRODUCCION.some((senal) => anfitrion.endsWith(senal))
}

export const MENSAJE = [
  '',
  '  DATABASE_URL apunta a la base de PRODUCCION.',
  '',
  '  Este proceso no esta en produccion, asi que se detiene antes de tocarla.',
  '',
  '  Lo que suele haber pasado: se levanto el servidor sin exportar la URL local,',
  '  y entonces manda la de `.env.local`, que es la de produccion.',
  '',
  '  Para trabajar en local:',
  '',
  '    DATABASE_URL="mysql://root@localhost:3307/pm" npm run dev',
  '',
  '  Si de verdad quieres leer produccion desde aqui, dilo a proposito:',
  '',
  '    PERMITIR_BASE_DE_PRODUCCION=1',
  '',
].join('\n')

/**
 * Se ejecuta al cargar el cliente de base de datos.
 *
 * En producción no hace nada: allí la base de producción es la que toca.
 */
export function comprobarLaBase(
  entorno: string | undefined = process.env.NODE_ENV,
  url: string | undefined = process.env.DATABASE_URL,
  permitido: string | undefined = process.env.PERMITIR_BASE_DE_PRODUCCION,
): void {
  if (entorno === 'production') return
  if (permitido === '1') return
  if (!esDeProduccion(url)) return
  throw new Error(MENSAJE)
}
