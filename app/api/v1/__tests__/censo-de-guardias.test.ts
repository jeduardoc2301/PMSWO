import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * El censo de guardias: **enumera** las rutas en vez de llevar una lista escrita a mano.
 *
 * ## Por qué esto y no la lista de al lado
 *
 * `guardias-antes-de-escribir.test.ts` comprueba algo distinto y sigue haciendo falta: que en las
 * rutas que ya sabemos que llevan guardia, la pregunta vaya **antes** de la escritura. Nació de un
 * defecto en el que la guardia respondía 403 después de haber escrito.
 *
 * Pero es una lista fija, y una lista fija no sabe lo que no está en ella. La auditoría del §10 midió
 * contra el servidor real y encontró manejadores que escriben sin preguntar nada — y ninguno estaba
 * en esa lista, así que la suite entera pasaba en verde con un gestor sin papel archivando proyectos
 * ajenos.
 *
 * Este censo recorre el árbol de rutas y obliga a que **cada manejador que muta** o pregunte por un
 * permiso de proyecto, o esté escrito abajo con su razón. Lo que no se puede es faltar en silencio.
 *
 * ## Por qué hay excepciones y no un cero
 *
 * Porque algunas son correctas: crear un proyecto no puede pedir permiso sobre un proyecto que
 * todavía no existe. Y porque las demás son deuda real que hay que ver, no esconder: escribirlas
 * aquí las pone delante de quien lea la suite, con una frase que dice qué pasa si nadie las arregla.
 */

const RAIZ = join(process.cwd(), 'app', 'api', 'v1')

/** Las que tocan un proyecto o sus líneas. Las de organización y sesión van por otro camino. */
const DE_PROYECTO = ['/projects/', '/work-items/', '/risks/', '/blockers/']

/**
 * Manejadores que hoy NO preguntan, con la razón. Cada línea es una decisión, no un olvido.
 *
 * Bajar esta lista es trabajo pendiente; subirla sin escribir el porqué, un descuido.
 */
const SIN_GUARDIA_A_PROPOSITO: Record<string, string> = {
  'projects/route.ts POST':
    'Crea el proyecto: no hay todavía proyecto sobre el que preguntar. El cargo de organización es aquí la respuesta correcta.',
  'projects/[id]/preferences/route.ts PUT':
    'Guarda las preferencias de vista de QUIEN pide, no del proyecto. Sólo se escribe a sí mismo.',
  'projects/[id]/filters/route.ts POST':
    'DEUDA: un filtro guardado es del proyecto y debería pedir asiento en él.',
  'projects/[id]/filters/route.ts DELETE':
    'DEUDA: lo mismo que el POST de al lado.',
  'projects/[id]/agreements/route.ts POST':
    'DEUDA: crea un acuerdo del proyecto sin mirar el asiento.',
  'projects/[id]/blockers/route.ts POST':
    'DEUDA: medido contra el servidor, devuelve 200 a quien no tiene papel en el proyecto.',
  'projects/[id]/risks/route.ts POST':
    'DEUDA: igual que los bloqueadores.',
  'projects/[id]/workload/route.ts POST':
    'DEUDA: escribe asignaciones de carga sin mirar el asiento.',
  'risks/[id]/route.ts PATCH':
    'DEUDA: edita un riesgo del proyecto sin mirar el asiento.',
  'risks/[id]/close/route.ts POST':
    'DEUDA: cerrar un riesgo es una decisión del proyecto.',
  'risks/[id]/convert-to-blocker/route.ts POST':
    'DEUDA: convierte contenido del proyecto sin mirar el asiento.',
  'risks/[id]/convert-to-work-item/route.ts POST':
    'DEUDA GRAVE: crea una LÍNEA DEL PLAN. Es la más urgente de esta lista.',
  'blockers/[id]/resolve/route.ts POST':
    'DEUDA: resolver un bloqueador es una decisión del proyecto.',
}

function rutas(dir: string, encontradas: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const camino = join(dir, nombre)
    if (statSync(camino).isDirectory()) rutas(camino, encontradas)
    else if (nombre === 'route.ts') encontradas.push(camino)
  }
  return encontradas
}

/** El cuerpo de un manejador exportado, hasta el siguiente `export` de nivel superior. */
function cuerpoDe(fuente: string, metodo: string): string | null {
  /*
    Sin expresiones regulares con `` dentro de una plantilla.

    En JavaScript, `` en una plantilla es el escape de RETROCESO, no el límite de palabra: la
    marca se construía con un carácter de control dentro y no casaba con nada. El censo daba cero
    manejadores y **pasaba en verde**, que es la peor forma de fallar para una prueba que existe
    para contar. Buscar la cadena y mirar a mano el carácter siguiente no depende de ningún escape.
  */
  const agujas = [
    'export async function ' + metodo,
    'export function ' + metodo,
    'export const ' + metodo,
  ]
  let inicio = -1
  for (const aguja of agujas) {
    const k = fuente.indexOf(aguja)
    if (k < 0) continue
    const siguiente = fuente.charAt(k + aguja.length)
    if (siguiente !== '' && 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_'.includes(siguiente)) continue
    if (inicio < 0 || k < inicio) inicio = k
  }
  if (inicio < 0) return null
  const resto = fuente.slice(inicio)
  const corte = resto.indexOf(String.fromCharCode(10) + 'export ', 10)
  return corte < 0 ? resto : resto.slice(0, corte)
}

/** Pregunta por un permiso de proyecto, aquí o en el manejador al que delega dentro del archivo. */
function pregunta(fuente: string, cuerpo: string): boolean {
  if (cuerpo.includes('await authorize(') || cuerpo.includes('await exigirPermiso(')) return true
  for (const nombre of cuerpo.match(/\w+Handler\b/g) ?? []) {
    const k = fuente.indexOf('function ' + nombre)
    if (k < 0) continue
    const trozo = fuente.slice(k, k + 5000)
    if (trozo.includes('await authorize(') || trozo.includes('await exigirPermiso(')) return true
  }
  return false
}

describe('Censo de guardias · ningún manejador que mute puede faltar en silencio', () => {
  const sinGuardia: string[] = []
  let conGuardia = 0

  for (const archivo of rutas(RAIZ)) {
    // Con `sep` y no escapando la barra invertida: al escribir este archivo el escape se degradó
    // y dejó una cadena sin cerrar. Es el mismo problema de los escapes que ya muerde por CDP.
    const relativo = archivo.slice(archivo.indexOf(join('app', 'api', 'v1'))).split(sep).join('/')
    const corto = relativo.replace('app/api/v1/', '')
    if (!DE_PROYECTO.some((x) => `/${corto}`.includes(x))) continue

    const fuente = readFileSync(archivo, 'utf8')
    for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const cuerpo = cuerpoDe(fuente, metodo)
      if (!cuerpo) continue
      if (pregunta(fuente, cuerpo)) conGuardia++
      else sinGuardia.push(`${corto} ${metodo}`)
    }
  }

  it('encuentra rutas que revisar', () => {
    // eslint-disable-next-line no-console
    // Si un refactor mueve el árbol, este censo se quedaría mirando el vacío y pasaría en verde.
    expect(conGuardia).toBeGreaterThan(20)
  })

  it('cada manejador sin guardia está escrito, con su razón', () => {
    const nuevos = sinGuardia.filter((x) => !(x in SIN_GUARDIA_A_PROPOSITO))
    expect(nuevos).toEqual([])
  })

  it('y no sobra ninguna excepción: lo que ya se arregló, se borra de la lista', () => {
    // Sin esto la lista sólo crece, y una lista que sólo crece deja de leerse.
    const sobrantes = Object.keys(SIN_GUARDIA_A_PROPOSITO).filter((x) => !sinGuardia.includes(x))
    expect(sobrantes).toEqual([])
  })
})
