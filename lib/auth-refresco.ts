/**
 * Cuándo hay que volver a leer los roles de quien ya tiene sesión (brecha 30).
 *
 * Vive aparte de `lib/auth.ts` por una razón práctica: la decisión es aritmética con un reloj, y
 * probarla dentro del callback de NextAuth pediría levantar media autenticación o esperar cinco
 * minutos de reloj real. Aquí entra un instante y sale un sí o un no.
 *
 * ## Por qué hay un plazo y no se relee siempre
 *
 * La sesión es JWT: los roles viajan dentro del token, así que quitarle un permiso a alguien no se
 * lo quita hasta que el token se renueva. Releer en **cada** petición lo arreglaría a costa de una
 * consulta por llamada de la aplicación. Lo que se hace es **acotar** cuánto puede tardar, y decir
 * el número: cinco minutos.
 *
 * Un plazo es una decisión de producto disfrazada de constante. Se deja aquí, con nombre, para que
 * cambiarla sea una línea y no una arqueología.
 */

/** El techo de cuánto tarda en aplicarse quitarle un permiso a alguien. */
export const RELEER_ROLES_CADA_MS = 5 * 60 * 1000

/**
 * ¿Toca releer?
 *
 * Sí también cuando no hay marca de tiempo: un token emitido antes de que esto existiera no tiene
 * el campo, y tratarlo como recién leído lo dejaría con los roles viejos otros treinta días.
 */
export function tocaReleerRoles(leidosEn: unknown, ahora: number): boolean {
  if (typeof leidosEn !== 'number' || !Number.isFinite(leidosEn)) return true
  // Una marca en el futuro sólo puede venir de un reloj que se movió. Se relee: es lo barato.
  if (leidosEn > ahora) return true
  return ahora - leidosEn >= RELEER_ROLES_CADA_MS
}

/**
 * Los roles que se quedan tras releer.
 *
 * `null` en la persona significa que ya no existe o está dada de baja: se queda **sin** roles, no
 * con los de antes. Una cuenta borrada que sigue pudiendo lo que podía es la misma revocación que
 * no revoca.
 *
 * La columna es JSON y en esta base aparece de las dos formas —arreglo y texto—, igual que al
 * entrar. Y lo que no sea una cadena se descarta: un valor inventado en la base no abre puertas.
 */
export function rolesTrasReleer(
  persona: { readonly roles: unknown; readonly active: boolean } | null,
  conocidos: readonly string[],
): string[] {
  if (!persona || !persona.active) return []

  const crudos: unknown = Array.isArray(persona.roles)
    ? persona.roles
    : typeof persona.roles === 'string'
      ? seguroJson(persona.roles)
      : []
  if (!Array.isArray(crudos)) return []

  const validos = new Set(conocidos)
  return crudos.filter((r): r is string => typeof r === 'string' && validos.has(r))
}

/** Un JSON roto en la base no puede tumbar la sesión de nadie. */
function seguroJson(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    return []
  }
}
