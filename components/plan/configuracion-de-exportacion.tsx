'use client'

import React from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Cómo se ve el plan exportado.
 *
 * Esta pantalla existe porque sin ella la parte configurable del exportador era **inalcanzable**.
 * El mapa de papeles se podía poner sólo con SQL directo contra la base: sin rastro de quién lo
 * cambió, sin poder revisarlo antes de guardar, y sólo para quien tuviera la contraseña.
 *
 * Lo que se configura aquí es tema —color y peso visual de cada clase, y el texto que encabeza el
 * archivo— y nunca contenido. Ni qué líneas salen ni qué columnas hay se deciden desde aquí.
 *
 * Dos cosas que la pantalla hace a propósito:
 *
 * - **Sólo ofrece los tipos que ese plan usa**, con su carga. Enseñar el catálogo entero del
 *   sistema haría configurar clases que el proyecto no tiene, y escondería el dato que de verdad
 *   ayuda a decidir: que «Entrega cliente» son 130 líneas y «Compuerta» son 4.
 * - **Enseña el color de cada papel**, no su nombre a secas. «dependencia_externa» no le dice nada
 *   a nadie hasta que se ve el naranja al lado.
 */

interface Aspecto {
  readonly fondo: string | null
  readonly texto: string
  readonly negrita: boolean
}

interface Cargado {
  readonly puedeEditar: boolean
  readonly tipos: readonly { readonly clave: string; readonly cuantas: number }[]
  readonly papelesPosibles: readonly { readonly papel: string; readonly aspecto: Aspecto }[]
  readonly config: {
    readonly papeles: Record<string, string>
    readonly descripcion: string | null
    readonly advertencias: readonly string[]
  }
}

/** Cómo se lee cada papel. El identificador es para la máquina; esto es para quien configura. */
const NOMBRE_DEL_PAPEL: Readonly<Record<string, string>> = Object.freeze({
  contenedor_raiz: 'Contenedor · raíz',
  contenedor_mayor: 'Contenedor · mayor',
  contenedor_medio: 'Contenedor · medio',
  trabajo: 'Trabajo',
  hito: 'Hito',
  aprobacion: 'Aprobación',
  dependencia_externa: 'Dependencia externa',
  control: 'Punto de control',
})

export function ConfiguracionDeExportacion({ idDelProyecto }: { idDelProyecto: string }) {
  const [abierto, setAbierto] = React.useState(false)
  const [datos, setDatos] = React.useState<Cargado | null>(null)
  const [cargando, setCargando] = React.useState(false)
  const [guardando, setGuardando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [guardado, setGuardado] = React.useState(false)

  // El borrador, separado de lo cargado: se edita sobre una copia para que «Cancelar» sea de
  // verdad cancelar y no una segunda petición que deshaga lo escrito.
  const [papeles, setPapeles] = React.useState<Record<string, string>>({})
  const [descripcion, setDescripcion] = React.useState('')
  const [advertencias, setAdvertencias] = React.useState('')

  const cargar = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const respuesta = await fetch(`/api/v1/projects/${idDelProyecto}/export/config`)
      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => null)
        throw new Error(detalle?.message ?? 'No se pudo leer la configuración.')
      }
      const d: Cargado = await respuesta.json()
      setDatos(d)
      setPapeles({ ...d.config.papeles })
      setDescripcion(d.config.descripcion ?? '')
      // Una por renglón: es como se leen y como se escriben.
      setAdvertencias(d.config.advertencias.join('\n'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la configuración.')
    } finally {
      setCargando(false)
    }
  }, [idDelProyecto])

  const alAbrir = (nuevo: boolean) => {
    setAbierto(nuevo)
    setGuardado(false)
    if (nuevo) void cargar()
  }

  const guardar = async () => {
    setGuardando(true)
    setError(null)
    try {
      const respuesta = await fetch(`/api/v1/projects/${idDelProyecto}/export/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          papeles,
          descripcion: descripcion.trim() === '' ? null : descripcion,
          advertencias: advertencias
            .split('\n')
            .map((a) => a.trim())
            .filter(Boolean),
        }),
      })
      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => null)
        throw new Error(detalle?.message ?? 'No se pudo guardar.')
      }
      setGuardado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const puedeEditar = datos?.puedeEditar ?? false

  return (
    <Dialog open={abierto} onOpenChange={alAbrir}>
      <button
        type="button"
        data-testid="abrir-ajustes-export"
        onClick={() => alAbrir(true)}
        title="Cómo se ve el plan exportado: color de cada tipo y texto de cabecera"
        className="rounded-md border border-borde bg-superficie px-2 py-1.5 text-sm text-tinta-2 transition-colors hover:border-acento hover:text-tinta"
      >
        Ajustes
      </button>

      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-borde bg-superficie">
        <DialogHeader>
          <DialogTitle className="text-tinta">Cómo se ve el plan exportado</DialogTitle>
          <DialogDescription className="text-tinta-3">
            Esto cambia la presentación del archivo, nunca su contenido: las líneas que salen las
            decide el filtro de la barra.
          </DialogDescription>
        </DialogHeader>

        {cargando ? <p className="py-8 text-center text-sm text-tinta-2">Cargando…</p> : null}

        {error ? (
          <p data-testid="error-ajustes" className="rounded border border-[#B3141C] bg-[#FFF1F1] p-2 text-sm text-[#B3141C]">
            {error}
          </p>
        ) : null}

        {datos && !cargando ? (
          <div className="space-y-6">
            {!puedeEditar ? (
              // Se enseña, pero sin poder tocarlo. Esconder la pantalla dejaría a quien lee el
              // archivo sin saber por qué está pintado así.
              <p className="rounded border border-borde bg-superficie-2 p-2 text-xs text-tinta-3">
                Puedes ver esta configuración, pero no cambiarla: hace falta permiso para gestionar
                los ajustes del proyecto.
              </p>
            ) : null}

            <section>
              <h3 className="mb-1 text-sm font-medium text-tinta">Color de cada tipo</h3>
              <p className="mb-3 text-xs text-tinta-3">
                Sólo los tipos que este plan usa. Lo que se deje en «Automático» se pinta por su
                forma: lo que tiene hijas es contenedor, lo que dura cero es hito, y el resto,
                trabajo.
              </p>

              <div className="space-y-1.5">
                {datos.tipos.map((tipo) => (
                  <div key={tipo.clave} className="flex items-center gap-3">
                    <span className="w-52 shrink-0 truncate text-sm text-tinta-2">{tipo.clave}</span>
                    <span className="w-14 shrink-0 text-right text-xs text-tinta-3">
                      {tipo.cuantas}
                    </span>
                    <select
                      aria-label={`Papel de ${tipo.clave}`}
                      data-testid={`papel-${tipo.clave}`}
                      disabled={!puedeEditar}
                      value={papeles[tipo.clave] ?? ''}
                      onChange={(e) =>
                        setPapeles((previos) => {
                          const siguiente = { ...previos }
                          if (e.target.value === '') delete siguiente[tipo.clave]
                          else siguiente[tipo.clave] = e.target.value
                          return siguiente
                        })
                      }
                      className="flex-1 rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta disabled:opacity-60"
                    >
                      <option value="">Automático</option>
                      {datos.papelesPosibles.map(({ papel }) => (
                        <option key={papel} value={papel}>
                          {NOMBRE_DEL_PAPEL[papel] ?? papel}
                        </option>
                      ))}
                    </select>
                    {/* La muestra del color: «dependencia_externa» no le dice nada a nadie hasta
                        que se ve el naranja al lado. */}
                    <MuestraDeColor
                      aspecto={
                        datos.papelesPosibles.find((p) => p.papel === papeles[tipo.clave])?.aspecto
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-sm font-medium text-tinta">Texto de la cabecera</h3>
              <p className="mb-2 text-xs text-tinta-3">
                Va bajo el nombre del plan, en todas las exportaciones de este proyecto.
              </p>
              <input
                aria-label="Descripción del plan"
                data-testid="descripcion-export"
                disabled={!puedeEditar}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Plan integrado de la etapa Mobilize."
                className="w-full rounded border border-borde-fuerte bg-superficie px-2 py-1.5 text-sm text-tinta disabled:opacity-60"
              />
              <label className="mt-3 block text-xs text-tinta-3">
                Advertencias de lectura, una por renglón
                <textarea
                  aria-label="Advertencias de lectura"
                  data-testid="advertencias-export"
                  disabled={!puedeEditar}
                  rows={3}
                  value={advertencias}
                  onChange={(e) => setAdvertencias(e.target.value)}
                  placeholder={'El avance sólo se captura en las hojas.\nLos contenedores se calculan solos.'}
                  className="mt-1 w-full rounded border border-borde-fuerte bg-superficie px-2 py-1.5 text-sm text-tinta disabled:opacity-60"
                />
              </label>
            </section>

            <div className="flex items-center justify-end gap-2 border-t border-borde pt-4">
              {guardado ? (
                <span data-testid="ajustes-guardados" className="mr-auto text-xs text-[#065F46]">
                  Guardado. La próxima exportación ya sale así.
                </span>
              ) : null}
              <Button variant="outline" onClick={() => alAbrir(false)}>
                {puedeEditar ? 'Cancelar' : 'Cerrar'}
              </Button>
              {puedeEditar ? (
                <Button data-testid="guardar-ajustes" onClick={() => void guardar()} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/** El color del papel elegido. Vacío cuando está en «Automático», que no tiene un color fijo. */
function MuestraDeColor({ aspecto }: { aspecto?: Aspecto }) {
  if (!aspecto) {
    return <span className="w-10 shrink-0 text-center text-[11px] text-tinta-3">auto</span>
  }
  return (
    <span
      aria-hidden="true"
      className="w-10 shrink-0 rounded border border-borde px-1 text-center text-[11px] leading-5"
      style={{
        background: aspecto.fondo ? `#${aspecto.fondo}` : 'transparent',
        color: `#${aspecto.texto}`,
        fontWeight: aspecto.negrita ? 700 : 400,
      }}
    >
      Abc
    </span>
  )
}
