/**
 * Las decisiones del vigía de sesión, sin navegador.
 *
 * El vigía (`components/providers/vigia-de-sesion.tsx`) observa cada llamada a `/api/` y le dice a
 * quien usa la herramienta QUÉ pasó cuando algo falla. Existe porque cuatro fallas distintas se
 * veían igual —«la herramienta no sirve»— y ninguna decía qué hacer:
 *
 *   1. **La base apagada fuera de horario.** Todo daba error, y al volver a entrar el formulario
 *      decía «credenciales inválidas» con la contraseña correcta.
 *   2. **Una pestaña vieja tras un despliegue.** Pedía código que ya no existe y los botones
 *      dejaban de responder sin avisar.
 *   3. **La sesión terminada.** El servidor contestaba 401 y ninguna pantalla lo atendía.
 *   4. **Errores tragados en silencio.** Un guardado que falló se veía igual que uno que funcionó.
 *
 * Aquí viven las decisiones —qué llamada se vigila, qué significa cada respuesta, cuándo recargar—
 * para probarlas sin montar nada.
 */

/** Lo que el vigía le enseña a la persona. `null` es que todo va bien. */
export type Aviso = 'sesion' | 'base' | 'sinRed' | 'version' | null

/**
 * Qué avisos pesan más, para enseñar uno solo.
 *
 * Sin red no se puede ni preguntar por la base; con la base apagada, entrar de nuevo no sirve de
 * nada; y una versión nueva es lo único que puede esperar.
 */
const PRIORIDAD: Record<Exclude<Aviso, null>, number> = { sinRed: 0, base: 1, sesion: 2, version: 3 }

export function masImportante(a: Aviso, b: Aviso): Aviso {
  if (a === null) return b
  if (b === null) return a
  return PRIORIDAD[a] <= PRIORIDAD[b] ? a : b
}

/** La ruta de salud: el vigía la llama él mismo, así que no puede vigilarse o se perseguiría la cola. */
export const RUTA_DE_SALUD = '/api/v1/salud'

/**
 * ¿Esta llamada la vigila?
 *
 * Sólo las de la propia aplicación bajo `/api/`, y no las de NextAuth: un 401 de
 * `/api/auth/callback` al teclear mal la contraseña es el formulario haciendo su trabajo, no una
 * sesión terminada.
 */
export function esLlamadaVigilada(url: string, origen: string): boolean {
  let u: URL
  try {
    u = new URL(url, origen)
  } catch {
    return false
  }
  if (u.origin !== origen) return false
  if (!u.pathname.startsWith('/api/')) return false
  if (u.pathname.startsWith('/api/auth/')) return false
  if (u.pathname.startsWith(RUTA_DE_SALUD)) return false
  return true
}

/**
 * Qué significa una respuesta.
 *
 * - **401** es la sesión: ya no hay quién firme las llamadas.
 * - **5xx** no se sabe todavía: puede ser la base apagada o un fallo de verdad. Se contesta
 *   `'revisar'` y el vigía pregunta a la ruta de salud antes de decir nada; afirmar «la base está
 *   apagada» sin comprobarlo sería cambiar un mensaje confuso por uno falso.
 * - Lo demás (403, 404, 409, 422…) es la pantalla contestando algo concreto: se lo queda ella.
 */
export function leerRespuesta(status: number): 'sesion' | 'revisar' | null {
  if (status === 401) return 'sesion'
  if (status >= 500) return 'revisar'
  return null
}

/**
 * ¿Este error es de una pestaña que pide código que ya no existe?
 *
 * Tras un despliegue los archivos de JavaScript cambian de nombre. Una pestaña abierta desde antes
 * pide los viejos, y el navegador lo cuenta de maneras distintas según quién lo cuente: webpack
 * dice `ChunkLoadError`, Chrome «Failed to fetch dynamically imported module», Safari «Importing a
 * module script failed».
 */
export function esErrorDeCodigoViejo(mensaje: string | undefined | null, nombre?: string | null): boolean {
  if (nombre === 'ChunkLoadError') return true
  if (!mensaje) return false
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    mensaje
  )
}

/**
 * ¿Le toca a la pantalla avisar de una lectura que falló?
 *
 * Un 401 o un 5xx ya los avisa el vigía con su franja; que la pantalla además saque su propio aviso
 * serían dos mensajes para una sola falla. Lo demás —un 403, un 404— sólo lo sabe la pantalla.
 */
export function leTocaAvisarALaPantalla(status: number): boolean {
  return status !== 401 && status < 500
}

/** Cuánto tiene que pasar entre dos recargas automáticas. */
export const ESPERA_ENTRE_RECARGAS_MS = 60_000

/**
 * ¿Se puede recargar solo?
 *
 * Una vez, y no otra vez antes de un minuto. Si el código sigue sin cargar después de recargar, el
 * problema no es la pestaña vieja, y recargar en bucle dejaría a la persona mirando una página que
 * parpadea sin poder leer nada.
 */
export function puedeRecargarSolo(ultimaRecarga: number | null, ahora: number): boolean {
  if (ultimaRecarga === null || !Number.isFinite(ultimaRecarga)) return true
  if (ultimaRecarga > ahora) return true
  return ahora - ultimaRecarga >= ESPERA_ENTRE_RECARGAS_MS
}

/**
 * ¿La versión del servidor es otra?
 *
 * Una versión vacía en cualquiera de los dos lados no cuenta: sin saber cuál es la del servidor,
 * decir «hay una versión nueva» sería inventarlo.
 */
export function hayVersionNueva(local: string | undefined, servidor: string | undefined | null): boolean {
  if (!local || !servidor) return false
  return local !== servidor
}

/**
 * A dónde volver después de entrar.
 *
 * Sólo rutas propias: una `callbackUrl` que apunte a otro sitio —o que empiece con `//`, que el
 * navegador lee como otro dominio— convertiría el inicio de sesión en un redirector abierto.
 */
export function destinoSeguro(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl) return null
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//') || callbackUrl.startsWith('/\\')) return null
  if (callbackUrl.includes('/auth/')) return null
  return callbackUrl
}
