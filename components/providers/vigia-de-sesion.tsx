'use client'

/**
 * El vigía de sesión: le dice a quien usa la herramienta qué pasó cuando algo deja de funcionar.
 *
 * Se monta una vez, en el layout, y no toca ninguna pantalla. Las razones y las decisiones están en
 * `lib/cliente/vigia.ts`; aquí sólo se conectan con el navegador.
 *
 * ## Cómo se entera
 *
 * - **Envolviendo `window.fetch`.** Hay más de cincuenta pantallas que llaman a la API con `fetch`
 *   directo, cada una con su manejo de errores —o sin él—. Cambiarlas todas para enterarse de un
 *   401 sería enorme y se olvidaría en la siguiente. El envoltorio no cambia nada de la respuesta:
 *   la mira, avisa, y la devuelve tal cual. Sólo **emite un evento**; quien reacciona es el
 *   componente, así que el envoltorio se instala una sola vez y no se queda con un estado viejo.
 * - **Con la propia sesión** (`useSession`): al volver a la pestaña NextAuth la revisa, y si ya no
 *   existe se sabe antes del primer clic.
 * - **Con los eventos del navegador**: `offline`/`online`, y los errores de código que ya no existe
 *   tras un despliegue.
 * - **Preguntando a `/api/v1/salud`** al recuperar el foco y cada quince minutos, para saber si
 *   hubo un despliegue.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { AlertTriangle, LogIn, RefreshCw, WifiOff, X } from 'lucide-react'
import {
  RUTA_DE_SALUD,
  esErrorDeCodigoViejo,
  esLlamadaVigilada,
  hayVersionNueva,
  leerRespuesta,
  masImportante,
  puedeRecargarSolo,
  type Aviso,
} from '@/lib/cliente/vigia'

const VERSION_LOCAL = process.env.NEXT_PUBLIC_VERSION_DE_LA_APP ?? ''
const EVENTO = 'pmswo:vigia'
const CLAVE_RECARGA = 'pmswo:ultima-recarga-por-codigo'
const REVISAR_VERSION_CADA_MS = 15 * 60_000

type Senal = 'sesion' | 'revisar' | 'red'

declare global {
  interface Window {
    __pmswoVigiaInstalado?: boolean
  }
}

/** Envuelve `fetch` una sola vez por pestaña. Sólo observa: la respuesta sale intacta. */
function instalarEnvoltorio() {
  if (typeof window === 'undefined' || window.__pmswoVigiaInstalado) return
  window.__pmswoVigiaInstalado = true
  const original = window.fetch.bind(window)
  const senal = (s: Senal) => window.dispatchEvent(new CustomEvent<Senal>(EVENTO, { detail: s }))

  window.fetch = async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    const vigilada = esLlamadaVigilada(url, window.location.origin)
    try {
      const respuesta = await original(entrada, opciones)
      if (vigilada) {
        const lectura = leerRespuesta(respuesta.status)
        if (lectura) senal(lectura)
      }
      return respuesta
    } catch (error) {
      // Una llamada cancelada a propósito no es un problema de red.
      const cancelada = error instanceof DOMException && error.name === 'AbortError'
      if (vigilada && !cancelada) senal('red')
      throw error
    }
  }
}

function leerUltimaRecarga(): number | null {
  try {
    const v = sessionStorage.getItem(CLAVE_RECARGA)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function recargarPorCodigoViejo(): boolean {
  const ahora = Date.now()
  if (!puedeRecargarSolo(leerUltimaRecarga(), ahora)) return false
  try {
    sessionStorage.setItem(CLAVE_RECARGA, String(ahora))
  } catch {
    // Sin almacenamiento no hay forma de evitar el bucle: mejor no recargar solo.
    return false
  }
  window.location.reload()
  return true
}

export function VigiaDeSesion() {
  const t = useTranslations('vigia')
  const pathname = usePathname() ?? ''
  const { status } = useSession()
  const [aviso, setAviso] = useState<Aviso>(null)
  const revisando = useRef(false)

  // En la pantalla de entrada no hay sesión que vigilar: ahí el formulario dice lo suyo.
  const enEntrada = pathname.includes('/auth/')
  const enEntradaRef = useRef(enEntrada)
  enEntradaRef.current = enEntrada

  const subir = useCallback((nuevo: Aviso) => setAviso((previo) => masImportante(previo, nuevo)), [])

  const consultarSalud = useCallback(async (): Promise<{ base: string; version: string } | null> => {
    try {
      const r = await fetch(RUTA_DE_SALUD, { cache: 'no-store' })
      return (await r.json()) as { base: string; version: string }
    } catch {
      return null
    }
  }, [])

  /** Un 5xx no se atribuye a la base sin preguntarle. */
  const revisarBase = useCallback(async () => {
    if (revisando.current) return
    revisando.current = true
    try {
      const salud = await consultarSalud()
      if (salud?.base === 'no-disponible') subir('base')
      else if (!salud && !navigator.onLine) subir('sinRed')
    } finally {
      revisando.current = false
    }
  }, [consultarSalud, subir])

  const revisarVersion = useCallback(async () => {
    const salud = await consultarSalud()
    if (salud && hayVersionNueva(VERSION_LOCAL, salud.version)) subir('version')
  }, [consultarSalud, subir])

  // ── El envoltorio y sus señales ───────────────────────────────────────────────────────────
  useEffect(() => {
    instalarEnvoltorio()
    const alRecibir = (e: Event) => {
      const s = (e as CustomEvent<Senal>).detail
      if (s === 'sesion') {
        if (!enEntradaRef.current) subir('sesion')
      } else if (s === 'revisar') {
        void revisarBase()
      } else if (s === 'red') {
        if (!navigator.onLine) subir('sinRed')
        else void revisarBase()
      }
    }
    window.addEventListener(EVENTO, alRecibir)
    return () => window.removeEventListener(EVENTO, alRecibir)
  }, [revisarBase, subir])

  // ── La sesión que NextAuth revisa al volver a la pestaña ──────────────────────────────────
  useEffect(() => {
    if (status === 'unauthenticated' && !enEntrada && /^\/(es|pt)\/.+/.test(pathname)) subir('sesion')
  }, [status, enEntrada, pathname, subir])

  // ── Red ───────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sinRed = () => subir('sinRed')
    const conRed = () => setAviso((a) => (a === 'sinRed' ? null : a))
    window.addEventListener('offline', sinRed)
    window.addEventListener('online', conRed)
    return () => {
      window.removeEventListener('offline', sinRed)
      window.removeEventListener('online', conRed)
    }
  }, [subir])

  // ── Código que ya no existe tras un despliegue ────────────────────────────────────────────
  useEffect(() => {
    const atender = (mensaje?: string, nombre?: string) => {
      if (!esErrorDeCodigoViejo(mensaje, nombre)) return
      // La primera vez se recarga sola; si vuelve a pasar antes de un minuto, se avisa en vez de
      // recargar en bucle.
      if (!recargarPorCodigoViejo()) subir('version')
    }
    const alError = (e: ErrorEvent) => atender(e.message, (e.error as Error | undefined)?.name)
    const alRechazo = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; name?: string } | undefined
      atender(r?.message, r?.name)
    }
    window.addEventListener('error', alError)
    window.addEventListener('unhandledrejection', alRechazo)
    return () => {
      window.removeEventListener('error', alError)
      window.removeEventListener('unhandledrejection', alRechazo)
    }
  }, [subir])

  // ── ¿Hubo un despliegue? ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible') void revisarVersion()
    }
    document.addEventListener('visibilitychange', alVolver)
    const intervalo = window.setInterval(() => void revisarVersion(), REVISAR_VERSION_CADA_MS)
    return () => {
      document.removeEventListener('visibilitychange', alVolver)
      window.clearInterval(intervalo)
    }
  }, [revisarVersion])

  // Al llegar a la pantalla de entrada, el aviso de sesión ya cumplió.
  useEffect(() => {
    if (enEntrada) setAviso((a) => (a === 'sesion' ? null : a))
  }, [enEntrada])

  const reintentar = useCallback(async () => {
    if (aviso === 'sinRed' && !navigator.onLine) return
    const salud = await consultarSalud()
    // Con la base de vuelta, las pantallas que fallaron tienen datos viejos o vacíos: recargar es
    // lo único que las deja bien.
    if (salud?.base === 'ok') window.location.reload()
  }, [aviso, consultarSalud])

  if (!aviso) return null

  const volverAEntrar = () => {
    const aqui = `${window.location.pathname}${window.location.search}`
    const idioma = window.location.pathname.split('/')[1] || 'es'
    window.location.href = `/${idioma}/auth/signin?callbackUrl=${encodeURIComponent(aqui)}`
  }

  const config = {
    sesion: { Icono: LogIn, color: 'var(--acento, #006786)', accion: volverAEntrar },
    base: { Icono: AlertTriangle, color: '#B45309', accion: reintentar },
    sinRed: { Icono: WifiOff, color: '#B45309', accion: reintentar },
    version: { Icono: RefreshCw, color: 'var(--acento, #006786)', accion: () => window.location.reload() },
  }[aviso]
  const { Icono } = config

  return (
    <div
      role={aviso === 'version' ? 'status' : 'alert'}
      aria-live={aviso === 'version' ? 'polite' : 'assertive'}
      data-aviso={aviso}
      className="fixed inset-x-0 top-3 z-[200] mx-auto flex w-[min(560px,calc(100%-24px))] items-start gap-3 rounded-lg px-4 py-3 shadow-lg"
      style={{ background: 'var(--superficie, #fff)', border: '1px solid var(--borde, #d6d3d1)', borderLeft: `4px solid ${config.color}` }}
    >
      <Icono size={18} className="mt-0.5 shrink-0" style={{ color: config.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-tinta">{t(`${aviso}.titulo`)}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-tinta-2">{t(`${aviso}.descripcion`)}</div>
        <button
          type="button"
          onClick={() => void config.accion()}
          className="mt-2 rounded-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ background: config.color }}
        >
          {t(`${aviso}.boton`)}
        </button>
      </div>
      <button
        type="button"
        aria-label={t('cerrar')}
        onClick={() => setAviso(null)}
        className="shrink-0 rounded p-1 text-tinta-3 hover:text-tinta"
      >
        <X size={14} />
      </button>
    </div>
  )
}
