/**
 * Qué se puede hacer en la pantalla de papeles del proyecto (§10.1).
 *
 * Aparte del componente porque son reglas, no dibujo, y porque equivocarse aquí no se ve: una
 * pantalla que ofrece cambiar el papel del propietario parece que funciona hasta que alguien lo
 * intenta y el servidor dice que no. Lo que la pantalla ofrece y lo que el servidor acepta tienen
 * que decir lo mismo, y esta es la mitad que se puede probar sin base de datos.
 */

import { PERMISOS_POR_ROL_DE_PROYECTO, type RolDeProyecto } from './permisos'

export interface PersonaDelProyecto {
  readonly id: string
  readonly nombre: string
  readonly correo: string
  readonly papel: RolDeProyecto
  /** Es propietario o gestor **del proyecto**, no por una fila de colaborador. */
  readonly implicito: boolean
}

/**
 * Cómo se llama cada papel en pantalla, y qué significa en una frase.
 *
 * La frase importa tanto como el nombre: «colaborador» no le dice a nadie que puede capturar avance
 * y no mover fechas, y esa es justo la distinción que hay que entender para repartir bien.
 */
export const PAPELES_EN_PANTALLA: readonly {
  readonly clave: RolDeProyecto
  readonly nombre: string
  readonly explica: string
}[] = Object.freeze([
  {
    clave: 'OWNER',
    nombre: 'Propietario',
    explica: 'Todo, incluido repartir estos papeles.',
  },
  {
    clave: 'MANAGER',
    nombre: 'Quien lleva el plan',
    explica: 'Mueve fechas y vínculos, ve el presupuesto. No reparte papeles.',
  },
  {
    clave: 'COLLABORATOR',
    nombre: 'Quien ejecuta',
    explica: 'Actualiza estado y avance de sus líneas. No mueve el plan de nadie.',
  },
  {
    clave: 'CLIENT',
    nombre: 'Cliente',
    explica: 'Ve la Lista, el Tablero y el Panel. Ni el Gantt, ni la carga, ni el presupuesto.',
  },
])

/**
 * ¿Se le puede cambiar el papel a esta persona desde aquí?
 *
 * Al propietario no: lo es por ser dueño del proyecto, y una fila de colaborador que dijera otra
 * cosa sería una segunda verdad que la guardia ignora — la pantalla enseñaría un papel y el
 * servidor aplicaría otro. Se cambia cambiando el propietario del proyecto.
 */
export function sePuedeCambiar(persona: PersonaDelProyecto): boolean {
  return !persona.implicito
}

/** Cuántos permisos da cada papel. Sirve para ordenar de más a menos en la pantalla. */
function cuantoDa(papel: RolDeProyecto): number {
  return PERMISOS_POR_ROL_DE_PROYECTO[papel]?.length ?? 0
}

/**
 * La lista como se lee: primero quien más puede, y dentro de cada papel por nombre.
 *
 * Ordenar por permisos y no alfabéticamente es lo que hace que la pregunta «¿quién manda aquí?» se
 * conteste mirando la primera fila, que es para lo que se abre esta pantalla.
 */
export function ordenarParaLaPantalla(
  gente: readonly PersonaDelProyecto[],
): readonly PersonaDelProyecto[] {
  return [...gente].sort((a, b) => {
    const d = cuantoDa(b.papel) - cuantoDa(a.papel)
    return d !== 0 ? d : a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  })
}

/**
 * Qué pasaría si esta persona pasara a este papel, dicho en una frase.
 *
 * Se calcula comparando los dos conjuntos de permisos en vez de escribir avisos a mano por cada
 * pareja: escribirlos a mano da dieciséis frases que envejecen por separado, y la primera que se
 * quede vieja miente sobre permisos.
 */
export function queCambia(desde: RolDeProyecto, hacia: RolDeProyecto): string | null {
  if (desde === hacia) return null
  const antes = new Set(PERMISOS_POR_ROL_DE_PROYECTO[desde] ?? [])
  const despues = new Set(PERMISOS_POR_ROL_DE_PROYECTO[hacia] ?? [])

  const gana = [...despues].filter((p) => !antes.has(p))
  const pierde = [...antes].filter((p) => !despues.has(p))

  const trozos: string[] = []
  if (gana.length > 0) trozos.push(`gana ${gana.length} ${gana.length === 1 ? 'permiso' : 'permisos'}`)
  if (pierde.length > 0) {
    trozos.push(`pierde ${pierde.length} ${pierde.length === 1 ? 'permiso' : 'permisos'}`)
  }
  return trozos.length > 0 ? trozos.join(' y ') : null
}
