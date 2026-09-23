'use client'

/**
 * Elegir una línea del plan escribiendo, no desplazándose.
 *
 * Sustituye al `<Select>` que listaba las 1 368 líneas en orden alfabético y sólo con el título.
 * Ver `lib/projects/buscar-linea.ts` para por qué aquello no servía y cómo se busca aquí.
 *
 * ## Lo que decide la forma
 *
 * **La lista vive dentro del diálogo, no en un desplegable flotante.** Un menú que se abre encima
 * de un diálogo de Radix pelea por el foco con él, y el de antes además se salía por los lados de
 * la ventana. Dentro del diálogo, la lista hereda su ancho y su desplazamiento.
 *
 * **Cada resultado enseña su ruta.** Es lo único que distingue las once «Solicitar reglas en el
 * firewall perimetral» de un plan por olas. Se enseñan los DOS últimos ancestros —que son los que
 * dicen dónde está— y la ruta completa va en el `title`.
 *
 * **Al elegir, queda una tarjeta con la ruta entera.** Es la confirmación de que se eligió la
 * correcta de las once, antes de crear el bloqueo y no después.
 *
 * **Enter elige, no envía.** El selector vive dentro de un `<form>`: sin `preventDefault`, pulsar
 * Enter para elegir una línea mandaba el formulario a medio llenar.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Search, X } from 'lucide-react'
import { buscarLineas, resaltar, type OpcionDeLinea } from '@/lib/projects/buscar-linea'

interface SelectorDeLineaProps {
  readonly opciones: readonly OpcionDeLinea[]
  /** Identificador elegido, o cadena vacía. */
  readonly valor: string
  readonly onCambio: (id: string) => void
  /** Verdadero mientras las líneas todavía no llegan del servidor. */
  readonly cargando?: boolean
  readonly autoFocus?: boolean
}

function Resaltado({ texto, consulta }: { texto: string; consulta: string }) {
  return (
    <>
      {resaltar(texto, consulta).map((trozo, i) =>
        trozo.coincide ? (
          <mark key={i} className="bg-transparent font-semibold text-acento-tinta">
            {trozo.texto}
          </mark>
        ) : (
          <span key={i}>{trozo.texto}</span>
        )
      )}
    </>
  )
}

export function SelectorDeLinea({ opciones, valor, onCambio, cargando, autoFocus }: SelectorDeLineaProps) {
  // En `workItems` y no en `common`: `messages/{locale}.json`, el archivo heredado, trae su propia
  // clave `common` y se mezcla al final en `i18n/request.ts`, así que REEMPLAZA la de `common.json`.
  // Cualquier texto nuevo puesto en `common.json` no existe en la app.
  const t = useTranslations('workItems.selectorDeLinea')
  const locale = useLocale()
  const idLista = useId()
  const entrada = useRef<HTMLInputElement>(null)

  const [consulta, setConsulta] = useState('')
  const [activo, setActivo] = useState(0)
  const [editando, setEditando] = useState(false)

  const elegida = useMemo(() => opciones.find((o) => o.id === valor), [opciones, valor])
  const mostrarBuscador = !elegida || editando

  const { opciones: visibles, total, sonSugerencias } = useMemo(
    () => buscarLineas(opciones, consulta),
    [opciones, consulta]
  )

  // Cada consulta nueva empieza por el primer resultado: quedarse en el renglón 12 de una lista que
  // ahora tiene tres sería seleccionar algo invisible.
  useEffect(() => setActivo(0), [consulta])

  useEffect(() => {
    if (mostrarBuscador && autoFocus) entrada.current?.focus()
  }, [mostrarBuscador, autoFocus])

  // Que la opción activa se vea: con flechas se puede bajar más allá del borde de la lista.
  useEffect(() => {
    if (!mostrarBuscador) return
    document.getElementById(`${idLista}-${activo}`)?.scrollIntoView({ block: 'nearest' })
  }, [activo, idLista, mostrarBuscador])

  const formatoFecha = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
    [locale]
  )
  const fecha = (iso: string) => formatoFecha.format(new Date(`${iso}T00:00:00Z`))

  const elegir = (o: OpcionDeLinea) => {
    onCambio(o.id)
    setEditando(false)
    setConsulta('')
  }

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActivo((i) => Math.min(i + 1, Math.max(visibles.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // Dentro de un <form>: sin esto, elegir con Enter enviaba el formulario a medio llenar.
      e.preventDefault()
      const o = visibles[activo]
      if (o) elegir(o)
    } else if (e.key === 'Escape') {
      // El primer Escape limpia la búsqueda o cancela el cambio; sólo el siguiente cierra el
      // diálogo. Perder todo lo escrito en el formulario por querer borrar una búsqueda es un mal
      // trato.
      if (consulta) {
        e.preventDefault()
        e.stopPropagation()
        setConsulta('')
      } else if (editando && elegida) {
        e.preventDefault()
        e.stopPropagation()
        setEditando(false)
      }
    }
  }

  /** La ruta completa para el `title`, y los dos últimos tramos para la vista. */
  const rutaCorta = (o: OpcionDeLinea) => (o.ruta.length > 2 ? ['…', ...o.ruta.slice(-2)] : o.ruta)

  const Estado = ({ o }: { o: OpcionDeLinea }) =>
    o.esGrupo ? (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-tinta-3" style={{ background: 'var(--superficie-3)' }}>
        {t('grupo', { hijas: o.hijas })}
      </span>
    ) : o.terminada ? (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-tinta-3" style={{ background: 'var(--superficie-3)' }}>
        {t('terminada')}
      </span>
    ) : o.atrasada ? (
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-grave-tinta" style={{ background: 'rgba(239,68,68,0.12)' }}>
        {t('atrasada')}
      </span>
    ) : null

  const Detalle = ({ o }: { o: OpcionDeLinea }) => {
    // La fecha sólo en lo que sigue abierto y se ejecuta: «Vence 31 ago» en una línea terminada, o
    // en un grupo cuya fecha es el envoltorio de las de abajo, se lee como un aviso que no lo es.
    const conFecha = o.fin && !o.terminada && !o.esGrupo
    const partes = [
      conFecha ? (o.atrasada ? t('vencio', { fecha: fecha(o.fin!) }) : t('vence', { fecha: fecha(o.fin!) })) : null,
      !o.esGrupo && o.avancePct > 0 && !o.terminada ? `${o.avancePct} %` : null,
      o.responsable,
    ].filter(Boolean)
    return partes.length ? <span className="shrink-0 text-tinta-3">{partes.join(' · ')}</span> : null
  }

  // ── Elegida: la tarjeta de confirmación ──────────────────────────────────────────────────────
  if (!mostrarBuscador && elegida) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg px-3 py-2.5"
        style={{ background: 'var(--superficie-2)', border: '1px solid var(--borde)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-tinta">{elegida.titulo}</span>
            <Estado o={elegida} />
          </div>
          <div className="mt-0.5 text-xs leading-relaxed text-tinta-3">
            {elegida.ruta.length ? elegida.ruta.join(' › ') : t('raiz')}
          </div>
          <div className="mt-0.5 text-xs">
            <Detalle o={elegida} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="shrink-0 rounded-md px-2.5 py-1 text-xs text-tinta-2 transition-colors hover:bg-superficie-3 hover:text-tinta"
          style={{ border: '1px solid var(--borde)' }}
        >
          {t('cambiar')}
        </button>
      </div>
    )
  }

  // ── Buscando ──────────────────────────────────────────────────────────────────────────────────
  const activa = visibles[activo]
  return (
    <div className="rounded-lg" style={{ border: '1px solid var(--borde)', background: 'var(--superficie)' }}>
      <div className="flex items-center gap-2 px-3" style={{ borderBottom: '1px solid var(--borde)' }}>
        <Search size={14} className="shrink-0 text-tinta-3" aria-hidden />
        <input
          ref={entrada}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={activa ? `${idLista}-${activo}` : undefined}
          aria-label={t('etiqueta')}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={alTeclear}
          placeholder={t('buscar')}
          className="h-10 w-full bg-transparent text-sm text-tinta placeholder:text-tinta-3 focus:outline-none"
        />
        {consulta ? (
          <button
            type="button"
            aria-label="Limpiar"
            onClick={() => {
              setConsulta('')
              entrada.current?.focus()
            }}
            className="shrink-0 rounded p-1 text-tinta-3 hover:text-tinta"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      <div className="px-3 pt-2 text-[11px] text-tinta-3">
        {cargando
          ? '…'
          : sonSugerencias
            ? total > 0
              ? t('atrasadasTotal', { total })
              : t('sinSugerencias', { total: opciones.length })
            : total > 0
              ? t('coincidencias', { total })
              : t('sinResultados', { consulta })}
      </div>

      <ul id={idLista} role="listbox" aria-label={t('etiqueta')} className="max-h-72 overflow-y-auto p-1.5">
        {visibles.map((o, i) => (
          <li
            key={o.id}
            id={`${idLista}-${i}`}
            role="option"
            aria-selected={i === activo}
            title={[...o.ruta, o.titulo].join(' › ')}
            onMouseEnter={() => setActivo(i)}
            // `mousedown` y no `click`: con `click` el campo pierde el foco antes de elegir, y la
            // lista parpadea.
            onMouseDown={(e) => {
              e.preventDefault()
              elegir(o)
            }}
            className="cursor-pointer rounded-md px-2.5 py-2"
            style={i === activo ? { background: 'var(--superficie-3)' } : undefined}
          >
            <div className="flex items-center gap-2">
              <span className={`min-w-0 flex-1 truncate text-sm ${o.terminada ? 'text-tinta-3' : 'text-tinta'}`}>
                <Resaltado texto={o.titulo} consulta={consulta} />
              </span>
              <Estado o={o} />
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-tinta-3">
                {o.ruta.length ? <Resaltado texto={rutaCorta(o).join(' › ')} consulta={consulta} /> : t('raiz')}
              </span>
              <Detalle o={o} />
            </div>
          </li>
        ))}
      </ul>

      <div
        className="flex items-center justify-between gap-3 px-3 py-1.5 text-[10px] text-tinta-3"
        style={{ borderTop: '1px solid var(--borde)' }}
      >
        <span>{t('teclado')}</span>
        {!sonSugerencias && total > visibles.length ? (
          <span>{t('mostrando', { mostradas: visibles.length, total })}</span>
        ) : null}
      </div>
    </div>
  )
}
