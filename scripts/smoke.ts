/**
 * Comprobación de humo: abre la aplicación como la abriría una persona.
 *
 * ## Por qué existe
 *
 * Las pruebas unitarias montan un componente con datos inventados y comprueban que dibuja lo que
 * debe. Eso está bien y atrapa mucho, pero **no atrapa que la pantalla no exista**, que la ruta
 * truene al compilar, que la sesión no se pueda abrir, o que un dato de prueba tenga la forma
 * correcta y el contenido equivocado.
 *
 * Esta comprobación existe porque cada una de esas cuatro cosas pasó:
 *
 * - Dos componentes quedaron probados y sin ninguna ruta que los montara.
 * - Una pantalla a medio conectar tumbó la aplicación entera en desarrollo.
 * - La semilla guardaba `$2b$10$YourHashedPasswordHere`, que **parece** un hash de bcrypt y no lo
 *   es: las cuatro cuentas de prueba nunca pudieron entrar, y la semilla terminaba diciendo «listo».
 * - La semilla solo corría una vez; la segunda moría con clave duplicada.
 *
 * Ninguna prueba unitaria iba a encontrar eso, porque ninguna abre la aplicación.
 *
 * ## Cómo se usa
 *
 *     npx next dev -p 3100                 # en una terminal
 *     npx tsx scripts/smoke.ts             # en otra
 *     npx tsx scripts/smoke.ts http://localhost:3000
 *
 * Sale con código distinto de cero si algo falla, para que sirva en integración continua.
 */

const BASE = process.argv[2] ?? 'http://localhost:3100'
const CUENTA = { email: 'admin@test.com', password: 'password123' }

/**
 * Marcas de que Next devolvió un error aunque el código HTTP sea 200.
 *
 * En desarrollo, una pantalla rota responde 200 con la superposición de error dentro. Mirar solo el
 * código de estado deja pasar exactamente el caso que se quiere atrapar.
 */
const SENALES_DE_ERROR = [
  'Build Error',
  'Unhandled Runtime Error',
  'Module not found',
  "Can't resolve",
  'This page could not be found',
]

interface Caso {
  readonly ruta: string
  /** Texto que tiene que aparecer. Si falta, la pantalla cargó pero no dibujó lo suyo. */
  readonly esperado?: readonly string[]
  /** Si necesita sesión abierta. */
  readonly conSesion?: boolean
}

const CASOS: readonly Caso[] = [
  { ruta: '/es/auth/signin', esperado: ['Iniciar Sesión', 'Correo Electrónico'] },
  {
    ruta: '/es/plan',
    esperado: ['Cierra el', '2026-11-30', 'Nivel de detalle', 'Ruta súper crítica', 'El plan, línea por línea'],
  },
  { ruta: '/es/projects', conSesion: true },
  { ruta: '/es/dashboard', conSesion: true },
  { ruta: '/es/templates', conSesion: true },
  { ruta: '/es/settings', conSesion: true },
  { ruta: '/es/projects/new', conSesion: true },
  { ruta: '/pt/auth/signin', esperado: ['Entrar'] },
  { ruta: '/pt/plan', esperado: ['2026-11-30'] },
]

/** Galletas de sesión, guardadas a mano porque `fetch` no trae frasco propio. */
const galletas = new Map<string, string>()

function encabezadoDeGalletas(): Record<string, string> {
  if (galletas.size === 0) return {}
  return { cookie: [...galletas].map(([k, v]) => `${k}=${v}`).join('; ') }
}

function guardarGalletas(respuesta: Response): void {
  const puestas = respuesta.headers.getSetCookie?.() ?? []
  for (const linea of puestas) {
    const [par] = linea.split(';')
    const i = par.indexOf('=')
    if (i > 0) galletas.set(par.slice(0, i).trim(), par.slice(i + 1).trim())
  }
}

async function pedir(ruta: string, init?: RequestInit): Promise<Response> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...init,
    redirect: 'manual',
    headers: { ...encabezadoDeGalletas(), ...(init?.headers ?? {}) },
  })
  guardarGalletas(respuesta)
  return respuesta
}

/**
 * Abre sesión por el mismo camino que el formulario.
 *
 * No se simula ni se inserta una galleta a mano: se pide el testigo contra falsificación, se manda
 * el formulario y se comprueba que la sesión existe preguntando por ella. Si algo de esa cadena
 * está roto —el hash guardado, la comparación, el proveedor de credenciales— aquí se ve.
 */
async function abrirSesion(): Promise<{ ok: boolean; detalle: string }> {
  const csrf = await pedir('/api/auth/csrf')
  if (!csrf.ok) return { ok: false, detalle: `no se pudo pedir el testigo (HTTP ${csrf.status})` }
  const { csrfToken } = (await csrf.json()) as { csrfToken: string }

  const cuerpo = new URLSearchParams({
    csrfToken,
    email: CUENTA.email,
    password: CUENTA.password,
    redirect: 'false',
    callbackUrl: `${BASE}/es/projects`,
  })

  const entrada = await pedir('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString(),
  })

  const destino = entrada.headers.get('location') ?? ''
  if (destino.includes('error')) {
    return { ok: false, detalle: `credenciales rechazadas · ${destino}` }
  }

  const sesion = await pedir('/api/auth/session')
  const datos = (await sesion.json()) as { user?: { email?: string; roles?: string[] } }
  if (!datos.user?.email) return { ok: false, detalle: 'el formulario pasó pero no quedó sesión' }

  return { ok: true, detalle: `${datos.user.email} · ${(datos.user.roles ?? []).join(', ')}` }
}

async function revisar(caso: Caso): Promise<{ ok: boolean; detalle: string }> {
  let respuesta: Response
  try {
    respuesta = await pedir(caso.ruta)
  } catch (error) {
    return { ok: false, detalle: `no respondió · ${error instanceof Error ? error.message : error}` }
  }

  if (respuesta.status >= 300 && respuesta.status < 400) {
    return { ok: false, detalle: `redirigió a ${respuesta.headers.get('location')}` }
  }
  if (!respuesta.ok) return { ok: false, detalle: `HTTP ${respuesta.status}` }

  const html = await respuesta.text()

  // Las señales de error se buscan **solo en lo visible**, no en el documento entero. Next empaqueta
  // su pantalla de «no encontrado» en el mismo trozo de JavaScript que sirve a todas las rutas, así
  // que buscar en el documento completo marca como rota hasta la página que funciona. Fue el primer
  // resultado de esta comprobación: nueve fallas, las nueve falsas.
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<template[\s\S]*?<\/template>/g, ' ')

  const rota = SENALES_DE_ERROR.find((senal) => visible.includes(senal))
  if (rota) return { ok: false, detalle: `respondió 200 con «${rota}» adentro` }

  const faltantes = (caso.esperado ?? []).filter((texto) => !visible.includes(texto))
  if (faltantes.length > 0) {
    return { ok: false, detalle: `cargó pero no dibujó: ${faltantes.map((t) => `«${t}»`).join(', ')}` }
  }

  return { ok: true, detalle: `${(html.length / 1024).toFixed(0)} KB` }
}

async function main(): Promise<void> {
  console.log(`\nComprobación de humo contra ${BASE}\n${'─'.repeat(72)}`)

  try {
    await fetch(BASE, { redirect: 'manual' })
  } catch {
    console.error(`\nNo hay nada escuchando en ${BASE}.`)
    console.error('Levanta el servidor primero:  npx next dev -p 3100\n')
    process.exitCode = 1
    return
  }

  let fallas = 0

  // Primero lo que se ve sin sesión.
  for (const caso of CASOS.filter((c) => !c.conSesion)) {
    const { ok, detalle } = await revisar(caso)
    if (!ok) fallas += 1
    console.log(`  ${ok ? '✓' : '✗'} ${caso.ruta.padEnd(24)} ${detalle}`)
  }

  console.log(`${'─'.repeat(72)}`)
  const sesion = await abrirSesion()
  console.log(`  ${sesion.ok ? '✓' : '✗'} ${'abrir sesión'.padEnd(24)} ${sesion.detalle}`)
  if (!sesion.ok) fallas += 1

  if (sesion.ok) {
    for (const caso of CASOS.filter((c) => c.conSesion)) {
      const { ok, detalle } = await revisar(caso)
      if (!ok) fallas += 1
      console.log(`  ${ok ? '✓' : '✗'} ${caso.ruta.padEnd(24)} ${detalle}`)
    }
  } else {
    console.log('  · Las pantallas con sesión no se revisaron: no se pudo entrar.')
    fallas += CASOS.filter((c) => c.conSesion).length
  }

  console.log(`${'─'.repeat(72)}`)
  if (fallas === 0) {
    console.log('  Todo respondió y dibujó lo suyo.\n')
  } else {
    console.log(`  ${fallas} ${fallas === 1 ? 'falla' : 'fallas'}.\n`)
    process.exitCode = 1
  }
}

main()
