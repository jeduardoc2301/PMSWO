/**
 * Pasa el color escrito a mano a tokens del tema (brecha 28).
 *
 * ## Por qué un guion y no a mano
 *
 * Son 1 867 ocurrencias y diecinueve valores distintos. A mano, la mitad del trabajo es teclear el
 * mismo cambio y la otra mitad es equivocarse en uno sin enterarse — y equivocarse aquí no da un
 * error, da un texto invisible sobre su propio fondo en un tema y no en el otro.
 *
 * ## Por qué las reglas van por PREFIJO y no por valor
 *
 * `zinc-400` no significa nada por sí solo: en `text-zinc-400` es texto secundario y en
 * `border-zinc-400` es un borde. El mismo número, dos papeles, y un token distinto para cada uno.
 * Por eso cada regla lleva su prefijo, y por eso no hay ninguna regla que sustituya un número suelto.
 *
 * ## Lo que NO toca
 *
 * Ni pruebas ni guiones: ahí el color literal suele ser lo que se está comprobando.
 *
 * Tampoco los colores de **dato** —la rampa del embudo, la de ocupación, los estados reservados—,
 * pero ya no por una lista de archivos: porque esos dejaron de ser literales y son `var(--rampa-1)`,
 * `var(--carga-3)`, `var(--estado-critico)`… y ninguna regla de aquí busca eso. Ver `DELICADOS`.
 *
 *   node scripts/a-tokens.mjs            dice qué haría, sin tocar nada
 *   node scripts/a-tokens.mjs --escribe  lo hace
 *   node scripts/a-tokens.mjs --escribe components/projects/dashboard-view.tsx
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * Donde el color significa un dato: se mira, no se sustituye.
 *
 * **Está vacía, y eso es el final del camino, no un descuido.** Los colores de dato —la rampa del
 * embudo, la de ocupación, los cuatro estados reservados, el velo de sobrecarga— ya no son
 * literales: son `var(--rampa-1)`, `var(--carga-3)`, `var(--estado-critico)`… y ninguna regla de
 * aquí los toca, porque todas buscan hexadecimales y clases `zinc-*`.
 *
 * Mientras la lista tuvo entradas, protegió de más: saltar un archivo entero por un color deja sin
 * convertir todas sus superficies y todas sus tintas. Así se quedaron dos vistas en oscuro, y un
 * `text-zinc-300` en la leyenda del panel que sobre blanco es prácticamente invisible.
 */
const DELICADOS = []

const REGLAS = [
  // ── superficies ───────────────────────────────────────────────────────────────────────────────
  [/\bbg-\[#18181b\]/g, 'bg-superficie'],
  [/\bbg-\[#1c1c1f\]/g, 'bg-superficie-2'],
  [/\bbg-\[#09090b\]/g, 'bg-fondo'],
  [/\bbg-\[#111113\]/g, 'bg-superficie'],
  [/\bbg-zinc-950\b/g, 'bg-fondo'],
  [/\bbg-zinc-900\b/g, 'bg-superficie'],
  [/\bbg-zinc-800\b/g, 'bg-superficie-3'],
  // El tirador de un deslizador y cosas por el estilo: relleno claro sobre fondo oscuro. Es
  // «lo que resalta», o sea la tinta, no una superficie.
  [/\bbg-zinc-100\b/g, 'bg-tinta'],
  [/\bbg-zinc-200\b/g, 'bg-tinta'],
  [/\bring-\[#18181b\]/g, 'ring-superficie'],
  [/\bring-\[#27272a\]/g, 'ring-borde'],
  // ── bordes ────────────────────────────────────────────────────────────────────────────────────
  [/\bborder-\[#27272a\]/g, 'border-borde'],
  [/\bborder-zinc-800\b/g, 'border-borde'],
  [/\bborder-zinc-700\b/g, 'border-borde-fuerte'],
  [/\bborder-zinc-600\b/g, 'border-borde-fuerte'],
  [/\bborder-zinc-500\b/g, 'border-borde-fuerte'],
  [/\bborder-zinc-900\b/g, 'border-borde'],
  [/\btext-zinc-700\b/g, 'text-tinta-3'],
  [/\bplaceholder-zinc-500\b/g, 'placeholder-tinta-3'],
  [/\bdivide-zinc-800\b/g, 'divide-borde'],
  [/\bring-zinc-700\b/g, 'ring-borde-fuerte'],
  [/\bring-zinc-600\b/g, 'ring-borde-fuerte'],
  // ── tinta ─────────────────────────────────────────────────────────────────────────────────────
  [/\btext-zinc-50\b/g, 'text-tinta'],
  [/\btext-zinc-100\b/g, 'text-tinta'],
  [/\btext-zinc-200\b/g, 'text-tinta'],
  [/\btext-zinc-300\b/g, 'text-tinta-2'],
  [/\btext-zinc-400\b/g, 'text-tinta-2'],
  [/\btext-zinc-500\b/g, 'text-tinta-3'],
  [/\btext-zinc-600\b/g, 'text-tinta-3'],
  [/\btext-\[#a1a1aa\]/g, 'text-tinta-2'],
  [/\btext-\[#71717a\]/g, 'text-tinta-3'],
  [/\btext-\[#fafafa\]/g, 'text-tinta'],
  // ── acento ────────────────────────────────────────────────────────────────────────────────────
  [/\btext-\[#a5b4fc\]/g, 'text-acento-tinta'],
  [/\bbg-\[#6366f1\]/g, 'bg-acento'],
  [/\bborder-\[#6366f1\]/g, 'border-acento'],
  // ── estilos en línea ──────────────────────────────────────────────────────────────────────────
  [/(['"])#18181b\1/g, "$1var(--superficie)$1"],
  [/(['"])#1c1c1f\1/g, "$1var(--superficie-2)$1"],
  [/(['"])#09090b\1/g, "$1var(--fondo)$1"],
  [/(['"])#111113\1/g, "$1var(--superficie)$1"],
  // Las «hundidas»: nueve grises casi iguales que el inventario encontró haciendo el mismo papel
  // —cabecera de tabla, campo, celda de día no laborable—. Se unifican en un token.
  [/(['"])#141416\1/g, "$1var(--superficie-3)$1"],
  [/(['"])#1c1c20\1/g, "$1var(--superficie-2)$1"],
  [/(['"])#0e0e12\1/g, "$1var(--superficie-3)$1"],
  [/(['"])#0f0f11\1/g, "$1var(--superficie-3)$1"],
  [/(['"])#131316\1/g, "$1var(--superficie-3)$1"],
  [/(['"])#0d0d11\1/g, "$1var(--superficie-3)$1"],
  [/(['"])#0c0c0f\1/g, "$1var(--superficie-3)$1"],
  [/(['"])#0a0a0c\1/g, "$1var(--fondo)$1"],
  [/(['"])#232327\1/g, "$1var(--borde)$1"],
  [/(['"])#2a2a30\1/g, "$1var(--borde)$1"],
  [/(['"])#1f1f23\1/g, "$1var(--borde)$1"],
  [/(['"])#3a3a45\1/g, "$1var(--borde-fuerte)$1"],
  [/(['"])#e4e4e7\1/g, "$1var(--tinta)$1"],
  [/(['"])#27272a\1/g, "$1var(--borde)$1"],
  [/(['"])#3f3f46\1/g, "$1var(--borde-fuerte)$1"],
  [/(['"])#a1a1aa\1/g, "$1var(--tinta-2)$1"],
  [/(['"])#71717a\1/g, "$1var(--tinta-3)$1"],
  [/(['"])#fafafa\1/g, "$1var(--tinta)$1"],
  [/(['"])#6366f1\1/g, "$1var(--acento)$1"],
  [/(['"])#a5b4fc\1/g, "$1var(--acento-tinta)$1"],
  [/(['"])#fbbf24\1/g, "$1var(--aviso)$1"],
  // Los bordes escritos enteros dentro de un estilo en línea.
  [/1px solid #27272a/g, '1px solid var(--borde)'],
  [/1px solid #3f3f46/g, '1px solid var(--borde-fuerte)'],
  [/2px solid #6366f1/g, '2px solid var(--acento)'],
]

function archivos(dir, salida = []) {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.next' || nombre === '__tests__') continue
    const ruta = join(dir, nombre)
    if (statSync(ruta).isDirectory()) archivos(ruta, salida)
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) salida.push(ruta)
  }
  return salida
}

const escribe = process.argv.includes('--escribe')
const pedidos = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const lista = pedidos.length > 0 ? pedidos : ['components', 'app', 'lib'].flatMap((d) => archivos(d))

let tocados = 0
let cambios = 0
const saltados = []

for (const ruta of lista) {
  const normal = ruta.split(sep).join('/')
  if (DELICADOS.some((d) => normal.endsWith(d))) { saltados.push(normal); continue }
  const antes = readFileSync(ruta, 'utf8')
  let despues = antes
  let aqui = 0
  for (const [patron, con] of REGLAS) {
    // Se deja que `String.replace` resuelva `$1` él mismo. Resolverlo a mano —con `con.replace('$1',
    // …)`— sustituye **sólo el primero**, y las reglas de estilo en línea llevan dos: la comilla de
    // apertura y la de cierre. La segunda se quedaba escrita como `$1` literal en 106 archivos.
    despues = despues.replace(patron, (...args) => {
      aqui += 1
      return con.replace(/\$(\d)/g, (_, n) => args[Number(n)] ?? '')
    })
  }
  if (aqui === 0) continue
  tocados += 1
  cambios += aqui
  if (escribe) writeFileSync(ruta, despues)
  else console.log(`${String(aqui).padStart(4)}  ${normal}`)
}

console.log(`\n${cambios} sustituciones en ${tocados} archivos${escribe ? ' (escritas)' : ' (sin escribir; usa --escribe)'}`)
console.log(`saltados por delicados: ${saltados.length}`)
