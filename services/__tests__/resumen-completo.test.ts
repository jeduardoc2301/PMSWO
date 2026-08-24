import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * El resumen de líneas manda todo lo que su tipo declara.
 *
 * ## Por qué esto se prueba, y por qué así
 *
 * `WorkItemSummary` es lo que las seis vistas reciben. El tipo lo declara todo con `?`, así que
 * **omitir un campo no es un error de tipos**: el componente lo lee, sale `undefined`, y la pantalla
 * enseña un cero o un hueco sin que nada se rompa.
 *
 * Ha mordido cuatro veces, siempre igual y siempre con las pruebas de los dos lados en verde,
 * porque cada una da por buena la mitad que no le toca:
 *
 * - `createdAt` — el filtro unificado ofrecía «fecha de creación» y no señalaba nada.
 * - `completedAt` — la tarjeta de terminadas decía «500 esta semana» para siempre.
 * - `clientOwner` — se podía filtrar por responsable del cliente y no encontrar nunca nada, sobre
 *   178 líneas que sí lo tienen.
 * - `estimatedHours` — la fila de TOTAL decía «sin horas estimadas capturadas» con 15 552 horas
 *   guardadas en 1 243 líneas, y la vista de Carga de trabajo no tenía con qué repartir.
 *
 * La cuarta es la que hizo escribir esto. Se lee el texto de los dos archivos en vez de montar el
 * servicio: lo que hay que vigilar es que las dos listas no se separen, y eso se ve en el texto.
 */

const TIPOS = readFileSync(join(process.cwd(), 'types', 'index.ts'), 'utf8')
const SERVICIO = readFileSync(join(process.cwd(), 'services', 'project.service.ts'), 'utf8')

/** Los campos que declara `interface WorkItemSummary`. */
function camposDelTipo(): string[] {
  const i = TIPOS.indexOf('export interface WorkItemSummary')
  if (i < 0) throw new Error('no encuentro WorkItemSummary')
  const abre = TIPOS.indexOf('{', i)
  const cierra = TIPOS.indexOf('\n}', abre)
  const cuerpo = TIPOS.slice(abre + 1, cierra)

  const campos: string[] = []
  let enComentario = false
  for (const cruda of cuerpo.split('\n')) {
    const l = cruda.trim()
    // Los comentarios de bloque llevan dentro cosas como «`ownerId`:» que no son campos.
    if (l.startsWith('/*')) enComentario = true
    if (enComentario) {
      if (l.includes('*/')) enComentario = false
      continue
    }
    if (l.startsWith('//') || l.startsWith('*') || l === '') continue
    const dosPuntos = l.indexOf(':')
    if (dosPuntos < 0) continue
    const nombre = l.slice(0, dosPuntos).replace('?', '').trim()
    if (nombre === '' || nombre.includes(' ')) continue
    campos.push(nombre)
  }
  return campos
}

/** Las claves que el servicio pone en el objeto del resumen. */
function camposDelServicio(): string[] {
  const ancla = SERVICIO.indexOf('const workItemSummaries: WorkItemSummary[]')
  if (ancla < 0) throw new Error('no encuentro dónde se arma el resumen')
  const fin = SERVICIO.indexOf('\n    // Build columns', ancla)
  const cuerpo = SERVICIO.slice(ancla, fin > 0 ? fin : ancla + 6000)

  const campos: string[] = []
  for (const cruda of cuerpo.split('\n')) {
    const l = cruda.trim()
    if (l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue
    const dosPuntos = l.indexOf(':')
    if (dosPuntos < 0) continue
    const nombre = l.slice(0, dosPuntos).trim()
    if (nombre === '' || nombre.includes(' ') || nombre.includes('(')) continue
    campos.push(nombre)
  }
  return campos
}

/**
 * Lo que a propósito no viaja, con su motivo.
 *
 * Que algo esté aquí es una decisión escrita, no un olvido. Si mañana alguien necesita uno de
 * éstos, que lo quite de la lista y lo mande — pero que sea a sabiendas.
 */
const FUERA_A_PROPOSITO: Record<string, string> = {
  // Hoy no sobra ninguno: el resumen manda todo lo que el tipo declara. La lista existe para el día
  // que alguien decida dejar uno fuera —una descripción de párrafos enteros sobre 1 368 líneas, por
  // ejemplo— y tenga que escribir por qué en vez de simplemente omitirlo.
}

describe('El resumen de líneas manda todo lo que su tipo declara', () => {
  const delTipo = camposDelTipo()
  const delServicio = new Set(camposDelServicio())

  it('el lector encuentra los campos de los dos lados', () => {
    // Si un refactor cambia la forma de escribirlos, esta prueba se quedaría sin nada que comparar y
    // pasaría vacía para siempre. Mejor que avise.
    expect(delTipo.length).toBeGreaterThan(15)
    expect(delServicio.size).toBeGreaterThan(15)
  })

  it('no falta ninguno', () => {
    const faltan = delTipo.filter((c) => !delServicio.has(c) && !(c in FUERA_A_PROPOSITO))
    expect(faltan).toEqual([])
  })

  it('y lo que se deja fuera está razonado y existe', () => {
    for (const [campo, motivo] of Object.entries(FUERA_A_PROPOSITO)) {
      // Un motivo de tres palabras no es un motivo, y excluir un campo que ya no existe deja la
      // lista mintiendo sobre una decisión que nadie tomó.
      expect({ campo, largoDelMotivo: motivo.length > 30 }).toEqual({ campo, largoDelMotivo: true })
      expect(delTipo).toContain(campo)
    }
  })
})
