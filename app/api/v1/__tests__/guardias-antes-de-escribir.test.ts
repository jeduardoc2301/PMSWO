/**
 * Ninguna puerta que escribe puede preguntar por el permiso **después** de escribir.
 *
 * Esta prueba existe por un defecto concreto: en la ruta de la línea, la pregunta por
 * `edit_schedule` estaba debajo del `prisma.workItem.update`. Devolvía 403 con la fecha ya guardada,
 * y la medición que dio la guardia por buena comprobó el código de respuesta y no el dato.
 *
 * Una guardia que responde después de escribir no es una guardia, es un cartel — y es un defecto que
 * **ninguna prueba de comportamiento encuentra sin buscarlo**, porque el código de respuesta es el
 * correcto. Lo único que lo delata es dónde está la llamada.
 *
 * Se lee el archivo, no se ejecuta. Es una prueba sobre la forma del código, y eso es deliberado:
 * el defecto es de orden, no de lógica, y el orden se ve leyendo. Probar cada ruta por su
 * comportamiento pediría un banco de pruebas por ruta y aun así habría que acordarse de mirar si
 * escribió, que es justo lo que se olvidó la primera vez.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Las rutas que escriben algo del plan o del proyecto y por tanto llevan guardia del §10.1. */
const PUERTAS = [
  'app/api/v1/work-items/[id]/route.ts',
  'app/api/v1/work-items/[id]/status/route.ts',
  'app/api/v1/work-items/[id]/assignments/route.ts',
  'app/api/v1/projects/[id]/reschedule/route.ts',
  'app/api/v1/projects/[id]/dependencies/route.ts',
  'app/api/v1/projects/[id]/work-items/route.ts',
  'app/api/v1/projects/[id]/work-items/reorder/route.ts',
  'app/api/v1/projects/[id]/work-items/restore/route.ts',
  'app/api/v1/projects/[id]/columns/route.ts',
  'app/api/v1/projects/[id]/calendar/route.ts',
  'app/api/v1/projects/[id]/collaborators/route.ts',
]

/** Pregunta por un permiso: las dos formas que se usan en el proyecto. */
const PREGUNTA = /\bawait (authorize|exigirPermiso)\(/
/**
 * Escribe.
 *
 * Se buscan las mutaciones de Prisma y las transacciones. Las rutas que delegan en un servicio no
 * casan aquí, y eso está bien: lo que se comprueba es que **en este archivo** no haya una escritura
 * por delante de la pregunta. Que el servicio escriba después es lo normal y lo correcto.
 */
const ESCRIBE = /prisma\.\w+\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\b|\$transaction\b/

/**
 * Parte el archivo en manejadores.
 *
 * Un archivo de ruta lleva varias puertas —`POST`, `PATCH`, `DELETE`— y cada una tiene su guardia y
 * sus escrituras. Compararlas todas juntas mezcla puertas distintas y saca falsos positivos: un
 * `POST` que escribe arriba y un `DELETE` que pregunta doscientas líneas más abajo están los dos
 * bien.
 *
 * Se corta por las declaraciones de función de primer nivel —las que empiezan en la columna cero—,
 * que es como están escritos todos los archivos de este proyecto: el manejador exportado delega en
 * una función `xxxHandler` declarada arriba, y esa función es el trozo que interesa.
 */
function porManejador(texto: string): { nombre: string; cuerpo: string; desde: number }[] {
  const filas = texto.split('\n')
  const cortes: { nombre: string; linea: number }[] = []
  for (let i = 0; i < filas.length; i += 1) {
    const m = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(filas[i])
    if (m) cortes.push({ nombre: m[1], linea: i })
  }
  if (cortes.length === 0) return [{ nombre: '(archivo entero)', cuerpo: texto, desde: 0 }]

  return cortes.map((c, i) => {
    const fin = i + 1 < cortes.length ? cortes[i + 1].linea : filas.length
    return { nombre: c.nombre, cuerpo: filas.slice(c.linea, fin).join('\n'), desde: c.linea }
  })
}

function lineas(texto: string, patron: RegExp): number[] {
  const salida: number[] = []
  const filas = texto.split('\n')
  for (let i = 0; i < filas.length; i += 1) {
    const l = filas[i].trimStart()
    if (l.startsWith('import ')) continue
    if (l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue
    if (patron.test(filas[i])) salida.push(i + 1)
  }
  return salida
}

function primeraLinea(texto: string, patron: RegExp): number | null {
  const lineas = texto.split('\n')
  for (let i = 0; i < lineas.length; i += 1) {
    const l = lineas[i].trimStart()
    // Los imports no cuentan: `import { authorize } from …` no es una pregunta, y contarlo haría que
    // la prueba pasara siempre.
    if (l.startsWith('import ')) continue
    // Los comentarios tampoco, y esto no es cosmética: el comentario que explica este mismo defecto
    // en la ruta corregida dice «estaba debajo del prisma.workItem.update», y sin este filtro esa
    // frase contaría como una escritura por delante de la guardia. La prueba fallaría por citar el
    // defecto que arregló, que es la peor clase de falso positivo — el que enseña a no comentar.
    if (l.startsWith('//') || l.startsWith('*') || l.startsWith('/*')) continue
    if (patron.test(lineas[i])) return i + 1
  }
  return null
}

describe('§10.1 · el permiso se pregunta antes de escribir, en todas las puertas', () => {
  it.each(PUERTAS)('%s', (ruta) => {
    const completa = resolve(process.cwd(), ruta)
    // Si una ruta se renombra, esto lo dice en vez de pasar en silencio con la lista desactualizada.
    expect(existsSync(completa), `no existe ${ruta}; ¿se renombró?`).toBe(true)

    const texto = readFileSync(completa, 'utf8')
    const manejadores = porManejador(texto)
    expect(manejadores.length, `${ruta} no exporta ningún manejador`).toBeGreaterThan(0)

    let alMenosUnaPregunta = false
    for (const m of manejadores) {
      const preguntas = lineas(m.cuerpo, PREGUNTA).map((n) => n + m.desde)
      const escritura = primeraLinea(m.cuerpo, ESCRIBE)
      if (preguntas.length > 0) alMenosUnaPregunta = true
      if (escritura === null) continue // delega en un servicio: no hay nada que ordenar aquí

      /**
       * Se comparan **todas** las preguntas de ESTE manejador contra su primera escritura.
       *
       * Dos versiones anteriores de esta prueba estuvieron mal, y las dos se descubrieron metiendo
       * el defecto a propósito en vez de creerle al verde:
       *
       * 1. Primera pregunta contra primera escritura. **No encontraba el defecto que la motivó**: la
       *    ruta de la línea pregunta dos veces —`edit_tracking` arriba y `edit_schedule` para las
       *    fechas—, y con la segunda mal colocada la primera seguía estando antes del `update`.
       * 2. Todas las preguntas del **archivo** contra la primera escritura del archivo. Encontraba
       *    el defecto, y también cuatro rutas sanas: un `POST` que escribe y un `DELETE` que
       *    pregunta doscientas líneas más abajo son dos puertas distintas, no una guardia tardía.
       *
       * Dicho por manejador, dice lo que de verdad se quiere: **cuando este manejador escribe, ya no
       * le queda nada por preguntar**.
       */
      const tardias = preguntas.filter((p) => p > escritura + m.desde)
      expect(
        tardias,
        `${ruta} · ${m.nombre}: escribe en la línea ${escritura + m.desde} y todavía pregunta ` +
          `permisos en ${tardias.join(', ')}. Una guardia que responde después de escribir ` +
          'devuelve 403 con el dato ya guardado.',
      ).toEqual([])
    }

    expect(alMenosUnaPregunta, `${ruta} no pregunta por ningún permiso`).toBe(true)
  })

  it('la lista no se quedó corta: toda ruta con authorize/exigirPermiso está en ella', () => {
    // El otro fallo posible es que se añada una puerta nueva y nadie la meta aquí. No se puede
    // recorrer el disco desde una prueba de vitest sin traer un buscador entero, así que al menos se
    // fija la cuenta: si crece, alguien tiene que venir a mirar esta lista.
    expect(PUERTAS.length).toBe(11)
  })
})
