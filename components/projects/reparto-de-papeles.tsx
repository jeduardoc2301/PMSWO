'use client'

/**
 * Quién está en el proyecto y con qué papel (§10.1).
 *
 * Hasta ahora repartir papeles se hacía con un guion contra la base. Esta es la pantalla.
 *
 * ## Por qué cada fila dice qué significa su papel
 *
 * «Colaborador» no le dice a nadie que puede capturar avance y no mover fechas. Quien reparte
 * permisos tiene que entender la distinción antes de repartirlos, y el sitio donde la entiende es
 * aquí, no la documentación.
 *
 * ## Por qué se puede añadir a alguien que no está
 *
 * Cambiarle el papel a quien ya está no sirve de nada si a quien falta no hay forma de meterlo: eso
 * dejaba el reparto a medias y obligaba a tocar la base a mano cada vez que entraba alguien nuevo.
 *
 * ## Por qué el propietario sale y no se puede tocar
 *
 * Lo es por ser dueño del proyecto, no por una fila. Esconderlo diría que el proyecto no tiene
 * propietario; ofrecer cambiarlo sería ofrecer algo que el servidor rechaza. Sale, con su papel, y
 * dice por qué no se cambia desde aquí.
 */

import React, { useCallback, useEffect, useState } from 'react'

import {
  PAPELES_EN_PANTALLA,
  PAPEL_AL_ENTRAR,
  type PersonaDeLaOrganizacion,
  type PersonaDelProyecto,
  ordenarParaLaPantalla,
  queCambia,
  quienesFaltan,
  sePuedeCambiar,
  sePuedeSacar,
} from '@/lib/projects/reparto-de-papeles'
import type { RolDeProyecto } from '@/lib/projects/permisos'

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'error'; readonly mensaje: string }
  | {
      readonly fase: 'listo'
      readonly gente: readonly PersonaDelProyecto[]
      readonly organizacion: readonly PersonaDeLaOrganizacion[]
    }

export interface RepartoDePapelesProps {
  readonly projectId: string
  /** Si quien mira puede repartir. Sin esto la lista se ve, pero no se toca. */
  readonly puedeRepartir?: boolean
}

export function RepartoDePapeles({ projectId, puedeRepartir = false }: RepartoDePapelesProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [guardando, setGuardando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/collaborators`)
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${r.status}`)
      }
      const { gente } = await r.json()

      // La organización se lee sólo para poder ofrecer a quien falta. Si falla, la pantalla sigue
      // sirviendo para lo demás: no poder añadir es peor que no poder ver, pero mucho menos malo
      // que quedarse sin la lista entera por un error en una consulta accesoria.
      let organizacion: readonly PersonaDeLaOrganizacion[] = []
      try {
        const ru = await fetch('/api/v1/users')
        if (ru.ok) {
          const { users } = await ru.json()
          organizacion = (users ?? []).map(
            (u: { id: string; name: string; email: string }) => ({
              id: u.id,
              nombre: u.name,
              correo: u.email,
            }),
          )
        }
      } catch {
        organizacion = []
      }

      setEstado({ fase: 'listo', gente: ordenarParaLaPantalla(gente), organizacion })
    } catch (e) {
      setEstado({
        fase: 'error',
        mensaje: e instanceof Error ? e.message : 'No se pudo leer quién está en el proyecto.',
      })
    }
  }, [projectId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cambiar = async (persona: PersonaDelProyecto, papel: RolDeProyecto) => {
    setGuardando(persona.id)
    setAviso(null)
    try {
      const r = await fetch(`/api/v1/projects/${projectId}/collaborators`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: persona.id, role: papel }),
      })
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${r.status}`)
      }
      // Se relee en vez de parchear en local: el papel efectivo depende también del cargo de
      // organización, y un eco local diría lo que se pidió en vez de lo que quedó.
      await cargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo cambiar el papel.')
    } finally {
      setGuardando(null)
    }
  }

  const agregar = async (userId: string) => {
    setGuardando(userId)
    setAviso(null)
    try {
      // Se reutiliza el PUT: el servidor ya hace upsert, así que entrar al proyecto y cambiar de
      // papel son la misma operación. Una ruta aparte para «añadir» sería una segunda forma de
      // escribir la misma fila, con sus propias reglas que se desincronizan.
      const r = await fetch(`/api/v1/projects/${projectId}/collaborators`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: PAPEL_AL_ENTRAR }),
      })
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${r.status}`)
      }
      await cargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo añadir a esa persona.')
    } finally {
      setGuardando(null)
    }
  }

  const sacar = async (persona: PersonaDelProyecto) => {
    setGuardando(persona.id)
    setAviso(null)
    try {
      const r = await fetch(
        `/api/v1/projects/${projectId}/collaborators?userId=${encodeURIComponent(persona.id)}`,
        { method: 'DELETE' },
      )
      if (!r.ok) {
        const cuerpo = await r.json().catch(() => ({}))
        throw new Error(cuerpo.message ?? `HTTP ${r.status}`)
      }
      await cargar()
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo sacar a esa persona.')
    } finally {
      setGuardando(null)
    }
  }

  if (estado.fase === 'cargando') {
    return (
      <p aria-busy="true" aria-live="polite" className="text-sm text-tinta-3">
        Leyendo quién está en el proyecto…
      </p>
    )
  }
  if (estado.fase === 'error') {
    return (
      <p role="alert" className="text-sm text-amber-200">
        {estado.mensaje}
      </p>
    )
  }

  return (
    <section data-testid="reparto-de-papeles" className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-tinta">Quién está en este proyecto</h3>
        <p className="mt-0.5 text-xs text-tinta-3">
          El papel decide qué vistas ve y qué puede tocar. Lo que la organización no permite, esto no
          lo concede: el permiso efectivo es lo que dejan las dos cosas a la vez.
        </p>
      </div>

      {aviso ? (
        <p role="alert" className="rounded border border-aviso-borde bg-aviso-fondo px-3 py-2 text-xs text-aviso-tinta">
          {aviso}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {estado.gente.map((persona) => {
          const editable = puedeRepartir && sePuedeCambiar(persona)
          return (
            <li
              key={persona.id}
              data-persona={persona.id}
              data-papel={persona.papel}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borde bg-superficie px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-tinta">{persona.nombre}</p>
                <p className="truncate text-xs text-tinta-3">{persona.correo}</p>
              </div>

              <div className="flex items-center gap-3">
                <p className="max-w-[26rem] text-right text-[11px] leading-snug text-tinta-3">
                  {PAPELES_EN_PANTALLA.find((p) => p.clave === persona.papel)?.explica}
                </p>
                {editable ? (
                  <select
                    aria-label={`Papel de ${persona.nombre}`}
                    value={persona.papel}
                    disabled={guardando === persona.id}
                    onChange={(e) => void cambiar(persona, e.target.value as RolDeProyecto)}
                    className="rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
                  >
                    {PAPELES_EN_PANTALLA.map((p) => {
                      const cambio = queCambia(persona.papel, p.clave)
                      return (
                        <option key={p.clave} value={p.clave}>
                          {p.nombre}
                          {cambio ? ` · ${cambio}` : ''}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <span
                    data-fijo="sí"
                    title={
                      persona.implicito
                        ? 'Lo es por serlo del proyecto. Para cambiarlo, cambia el propietario del proyecto.'
                        : 'No tienes permiso para repartir papeles en este proyecto.'
                    }
                    className="rounded border border-borde bg-superficie px-2 py-1 text-xs text-tinta-2"
                  >
                    {PAPELES_EN_PANTALLA.find((p) => p.clave === persona.papel)?.nombre}
                  </span>
                )}

                {puedeRepartir && sePuedeSacar(persona) ? (
                  <button
                    type="button"
                    data-accion="sacar"
                    aria-label={`Sacar a ${persona.nombre} del proyecto`}
                    disabled={guardando === persona.id}
                    onClick={() => void sacar(persona)}
                    title="Deja de ver el proyecto. Su trabajo y su historial no se borran."
                    className="rounded border border-borde px-2 py-1 text-xs text-tinta-3 hover:border-borde-fuerte hover:text-tinta disabled:opacity-50"
                  >
                    Sacar
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {puedeRepartir ? <Agregar faltan={quienesFaltan(estado.gente, estado.organizacion)} ocupado={guardando !== null} onAgregar={agregar} /> : null}
    </section>
  )
}

/**
 * Meter a alguien al proyecto.
 *
 * Entra siempre con el papel de menor alcance y se sube después desde su propia fila, en vez de
 * pedir papel aquí: quien reparte todavía no ha visto qué significa cada papel cuando abre este
 * desplegable, y elegir a ciegas es cómo se conceden permisos de más.
 */
function Agregar({
  faltan,
  ocupado,
  onAgregar,
}: {
  readonly faltan: readonly { readonly id: string; readonly nombre: string; readonly correo: string }[]
  readonly ocupado: boolean
  readonly onAgregar: (userId: string) => void | Promise<void>
}) {
  const [elegido, setElegido] = useState('')

  if (faltan.length === 0) {
    return (
      <p className="text-xs text-tinta-3">
        Toda la organización está ya en este proyecto.
      </p>
    )
  }

  return (
    <div
      data-testid="agregar-al-proyecto"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-borde px-4 py-3"
    >
      <label htmlFor="agregar-persona" className="text-xs text-tinta-3">
        Añadir a alguien
      </label>
      <select
        id="agregar-persona"
        value={elegido}
        disabled={ocupado}
        onChange={(e) => setElegido(e.target.value)}
        className="min-w-[16rem] rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta"
      >
        <option value="">Elige a quién…</option>
        {faltan.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} · {p.correo}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!elegido || ocupado}
        onClick={() => {
          const id = elegido
          setElegido('')
          void onAgregar(id)
        }}
        className="rounded border border-borde-fuerte px-3 py-1 text-xs text-tinta hover:bg-superficie-2 disabled:opacity-50"
      >
        Añadir
      </button>
      <p className="basis-full text-[11px] text-tinta-3">
        Entra como «{PAPELES_EN_PANTALLA.find((p) => p.clave === PAPEL_AL_ENTRAR)?.nombre}»:{' '}
        {PAPELES_EN_PANTALLA.find((p) => p.clave === PAPEL_AL_ENTRAR)?.explica} Se le puede cambiar
        el papel en su fila.
      </p>
    </div>
  )
}
