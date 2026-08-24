/**
 * Quién es quién: el nombre que el plan escribe, y la cuenta que ya existe en el directorio.
 *
 * ## Por qué hace falta una tabla y no basta con comparar nombres
 *
 * El Excel del plan trae el nombre como lo escribió quien lo redactó, y el directorio trae el nombre
 * como lo escribió quien dio de alta la cuenta. No coinciden, y no coinciden de tres maneras
 * distintas a la vez:
 *
 *   plan «Rafael Oliva»     ·  cuenta «Rafael Oliva»    → igual
 *   plan «Salomón Suárez»   ·  cuenta «Salomon Suarez»  → sin tildes
 *   plan «José Cruz»        ·  cuenta «Jose Cruz»       → sin tilde
 *   plan «Bryan Hernández»  ·  cuenta «Bryan H»         → **abreviado**
 *
 * Quitar tildes y comparar resolvería tres de los cuatro y fallaría con Bryan. Y un fallo aquí no
 * avisa: crea un recurso nuevo con el nombre del plan al lado de la cuenta que ya existía, y a
 * partir de ahí la misma persona aparece dos veces en la carga, cada una con la mitad de su
 * trabajo. Un parecido no es una identidad; esto es una **decisión**, y las decisiones se escriben.
 *
 * ## Cómo se mantiene
 *
 * Cuando entre un plan con un responsable nuevo, la siembra lo dirá por su nombre y habrá que
 * añadirlo aquí con su correo. Es a propósito que haya que tocar este archivo: dar de alta a alguien
 * en la carga de un proyecto es una decisión de quien lleva el proyecto, no algo que deba ocurrir
 * solo porque un Excel traiga un nombre nuevo.
 */

/** El nombre tal como lo escribe el plan → el correo de la cuenta que ya existe. */
export const CUENTA_DEL_RESPONSABLE: Readonly<Record<string, string>> = Object.freeze({
  'Rafael Oliva': 'Rafael.Oliva@softwareone.com',
  'Salomón Suárez': 'salomon.suarez@softwareone.com',
  'José Cruz': 'Jose.Cruz3@softwareone.com',
  'Bryan Hernández': 'bryan.hernandez@softwareone.com',
})

/**
 * Los nombres del plan que **no son personas** y por eso no llevan cuenta.
 *
 * «Gestión del Cambio · por designar» es un papel sin nombrar todavía: aparece en cuatro líneas y
 * dice que ese trabajo existe y aún no tiene dueño. Merece salir en la carga —es trabajo real, y
 * verlo sin dueño es justo lo que hace que alguien lo asigne— pero no merece una cuenta.
 */
export const PAPELES_SIN_PERSONA: readonly string[] = Object.freeze([
  'Gestión del Cambio · por designar',
])

/**
 * El mismo nombre escrito de cualquier manera razonable.
 *
 * Sirve para que un espacio de más o una tilde perdida en el Excel no cuenten como otra persona. NO
 * sirve para adivinar identidades: sólo empareja contra las claves que ya están arriba, que son
 * decisiones tomadas.
 */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    // Se quitan los signos diacríticos combinables: es el rango de Unicode que deja «á» en «a».
    .split('')
    .filter((c) => {
      const p = c.codePointAt(0) ?? 0
      return !(p >= 0x0300 && p <= 0x036f)
    })
    .join('')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

const POR_NOMBRE_NORMALIZADO = new Map(
  Object.entries(CUENTA_DEL_RESPONSABLE).map(([nombre, correo]) => [normalizarNombre(nombre), correo]),
)

/** El correo de la cuenta de un responsable del plan, o `null` si no es una persona conocida. */
export function correoDelResponsable(nombre: string): string | null {
  return POR_NOMBRE_NORMALIZADO.get(normalizarNombre(nombre)) ?? null
}

const PAPELES_NORMALIZADOS = new Set(PAPELES_SIN_PERSONA.map(normalizarNombre))

/** Si ese nombre es un papel sin nombrar y por tanto no debe buscar cuenta. */
export function esPapelSinPersona(nombre: string): boolean {
  return PAPELES_NORMALIZADOS.has(normalizarNombre(nombre))
}
