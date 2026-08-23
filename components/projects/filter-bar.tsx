'use client'

/**
 * La barra de filtros, compartida por las vistas (§10.2).
 *
 * El filtro es un dato que vive fuera de este componente: quien lo monta lo guarda una vez para
 * todo el proyecto y se lo pasa a cada vista. Por eso cambiar del Gantt al Tablero no lo pierde —
 * no hay dos filtros, hay uno.
 *
 * ## Hasta dónde llega el constructor
 *
 * Las condiciones se editan en una lista plana con un conector AND/OR común, más **un** grupo
 * anidado con su propio conector. Eso cubre el ejemplo del propio spec —«estado en (…) Y (prioridad
 * alta O atrasada)»— que es la forma que la gente construye de verdad.
 *
 * El formato serializado admite anidamiento sin límite y el motor lo evalúa sin límite; lo que
 * tiene tope es este editor. Un constructor de árboles arbitrarios es una pantalla entera y casi
 * nadie pasa de dos niveles. Un filtro más profundo, guardado desde otro sitio, **se aplica bien** —
 * sólo que aquí se enseña en modo lectura en vez de dejar editarlo a medias y romperlo.
 */

import React, { useMemo, useState } from 'react'

import {
  CAMPOS_BASE,
  type Condicion,
  FILTRO_VACIO,
  type Filtro,
  type Grupo,
  OPERADORES_POR_TIPO,
  type Operador,
  contarCondiciones,
  describirFiltro,
  esGrupo,
  tieneCondiciones,
} from '@/lib/projects/filter'

export interface FiltroGuardadoResumen {
  readonly id: string
  readonly name: string
  readonly isShared: boolean
  readonly expression: Filtro | null
  readonly invalido?: string
}

export interface FilterBarProps {
  readonly filtro: Filtro
  readonly onCambiar: (filtro: Filtro) => void
  readonly guardados: readonly FiltroGuardadoResumen[]
  readonly onGuardar?: (nombre: string, compartido: boolean) => void
  readonly onBorrar?: (id: string) => void
  /** Cuántas líneas quedan y cuántas había. Se enseña siempre que haya filtro puesto. */
  readonly conteo?: { readonly visibles: number; readonly total: number }
  /**
   * Los campos personalizados que este proyecto declara (§2, §10.2).
   *
   * Sólo los **vivos**: ofrecer uno archivado para un filtro nuevo sería invitar a seguir usando
   * algo que alguien decidió retirar. Los archivados siguen valiendo para **evaluar** un filtro
   * guardado, y eso ocurre en otro sitio.
   */
  readonly camposPropios?: Readonly<Record<string, { readonly tipo: string; readonly etiqueta: string }>>
}

const NOMBRES_DE_OPERADOR: Record<Operador, string> = {
  eq: 'es',
  neq: 'no es',
  in: 'es alguno de',
  not_in: 'no es ninguno de',
  contains: 'contiene',
  between: 'entre',
  gt: 'después de',
  gte: 'desde',
  lt: 'antes de',
  lte: 'hasta',
  is_empty: 'está vacío',
  is_not_empty: 'tiene valor',
}

/** Los operadores que no llevan valor: enseñar un campo de texto al lado sería una trampa. */
const SIN_VALOR: readonly Operador[] = ['is_empty', 'is_not_empty']

type Catalogo = Readonly<Record<string, { readonly tipo: string; readonly etiqueta: string }>>

function tipoDe(field: string, catalogo: Catalogo): keyof typeof OPERADORES_POR_TIPO {
  return (catalogo[field]?.tipo ?? 'texto') as keyof typeof OPERADORES_POR_TIPO
}

function condicionNueva(catalogo: Catalogo, field = 'status'): Condicion {
  const operadores = OPERADORES_POR_TIPO[tipoDe(field, catalogo)]
  return { field, operator: operadores[0], value: '' }
}

/** ¿Este filtro cabe en el editor, o hay que enseñarlo en modo lectura? */
function esEditable(filtro: Filtro): boolean {
  return filtro.conditions.every(
    (hija) => !esGrupo(hija) || hija.conditions.every((nieta) => !esGrupo(nieta)),
  )
}

export function FilterBar({
  filtro,
  onCambiar,
  guardados,
  onGuardar,
  onBorrar,
  conteo,
  camposPropios,
}: FilterBarProps) {
  /**
   * Los campos que se ofrecen: los de siempre más los que declare el proyecto (§2, §10.2).
   *
   * Los propios van **primero** en el objeto para que el orden de mezcla no pueda taparlos, pero
   * las claves de los personalizados llevan prefijo `cf:` y no pueden chocar de todas formas.
   */
  const catalogo = React.useMemo(
    () => ({ ...(camposPropios ?? {}), ...CAMPOS_BASE }) as Catalogo,
    [camposPropios],
  )
  const [abierto, setAbierto] = useState(false)
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [compartir, setCompartir] = useState(false)

  const puesto = tieneCondiciones(filtro)
  const cuantas = contarCondiciones(filtro)
  const resumen = useMemo(() => (puesto ? describirFiltro(filtro) : ''), [filtro, puesto])
  const editable = esEditable(filtro)

  const sueltas = filtro.conditions.filter((c) => !esGrupo(c)) as Condicion[]
  const grupo = filtro.conditions.find((c) => esGrupo(c)) as Grupo | undefined

  const rehacer = (nuevasSueltas: Condicion[], nuevoGrupo: Grupo | undefined, op = filtro.op) => {
    const conditions: (Condicion | Grupo)[] = [...nuevasSueltas]
    if (nuevoGrupo && nuevoGrupo.conditions.length > 0) conditions.push(nuevoGrupo)
    onCambiar({ op, conditions })
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className={`rounded border px-2 py-1 text-xs ${
            puesto
              ? 'border-acento/60 bg-acento/10 text-indigo-300'
              : 'border-borde-fuerte text-tinta-2 hover:bg-superficie-3'
          }`}
        >
          {puesto ? `Filtro (${cuantas})` : 'Filtro'} ▾
        </button>

        {/* El resumen en palabras, no sólo el número: quien llega a una pantalla ya filtrada tiene
            que poder saber por qué faltan líneas sin abrir el panel. */}
        {puesto ? (
          <>
            <span
              data-testid="resumen-filtro"
              title={resumen}
              className="max-w-md truncate text-xs text-tinta-3"
            >
              {resumen}
            </span>
            <button
              type="button"
              onClick={() => onCambiar(FILTRO_VACIO)}
              className="rounded px-1.5 py-0.5 text-xs text-tinta-3 underline-offset-2 hover:text-tinta hover:underline"
            >
              Quitar
            </button>
          </>
        ) : null}

        {puesto && conteo ? (
          <span data-testid="conteo-filtro" className="text-xs tabular-nums text-tinta-3">
            {conteo.visibles} de {conteo.total}
          </span>
        ) : null}
      </div>

      {abierto ? (
        <div
          role="dialog"
          aria-label="Filtros"
          className="absolute left-0 top-full z-40 mt-1 w-[540px] max-w-[90vw] rounded-lg border border-borde bg-superficie p-3 shadow-xl"
        >
          {guardados.length > 0 ? (
            <div className="mb-3 border-b border-borde pb-3">
              <p className="mb-1.5 text-xs text-tinta-3">Filtros guardados</p>
              <ul className="flex flex-wrap gap-1.5">
                {guardados.map((g) => (
                  <li key={g.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={g.expression === null}
                      title={g.invalido ?? (g.isShared ? 'Compartido con el proyecto' : 'Sólo tuyo')}
                      onClick={() => {
                        if (g.expression) {
                          onCambiar(g.expression)
                          setAbierto(false)
                        }
                      }}
                      className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {g.isShared ? '👥 ' : ''}
                      {g.name}
                      {/* Un filtro guardado que ya no vale se enseña roto y no se aplica: aplicarlo
                          a medias escondería líneas sin que nadie supiera por qué. */}
                      {g.expression === null ? ' ⚠' : ''}
                    </button>
                    {onBorrar ? (
                      <button
                        type="button"
                        aria-label={`Borrar el filtro ${g.name}`}
                        onClick={() => onBorrar(g.id)}
                        className="rounded px-1 text-xs text-tinta-3 hover:bg-superficie-3 hover:text-tinta-2"
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!editable ? (
            <div className="rounded border border-aviso-borde bg-aviso-fondo p-2.5">
              <p className="text-xs leading-relaxed text-aviso-tinta">
                Este filtro anida más de lo que el editor sabe dibujar, así que se enseña sin editar
                para no romperlo. Se está aplicando correctamente: <em>{resumen}</em>
              </p>
            </div>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xs text-tinta-3">Cumplir</span>
                {(['AND', 'OR'] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    aria-pressed={filtro.op === op}
                    onClick={() => onCambiar({ ...filtro, op })}
                    className={`rounded px-2 py-0.5 text-xs ${
                      filtro.op === op ? 'bg-acento-relleno text-sobre-acento' : 'text-tinta-2 hover:bg-superficie-3'
                    }`}
                  >
                    {op === 'AND' ? 'todas' : 'alguna'}
                  </button>
                ))}
              </div>

              <ul className="flex flex-col gap-1.5">
                {sueltas.map((condicion, i) => (
                  <li key={i}>
                    <FilaDeCondicion
                      catalogo={catalogo}
                      condicion={condicion}
                      onCambiar={(nueva) => {
                        const copia = [...sueltas]
                        copia[i] = nueva
                        rehacer(copia, grupo)
                      }}
                      onQuitar={() => rehacer(sueltas.filter((_, j) => j !== i), grupo)}
                    />
                  </li>
                ))}
              </ul>

              {grupo ? (
                <div className="mt-2 rounded border border-borde p-2">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs text-tinta-3">Y además, cumplir</span>
                    {(['AND', 'OR'] as const).map((op) => (
                      <button
                        key={op}
                        type="button"
                        aria-pressed={grupo.op === op}
                        onClick={() => rehacer(sueltas, { ...grupo, op })}
                        className={`rounded px-2 py-0.5 text-xs ${
                          grupo.op === op ? 'bg-acento-relleno text-sobre-acento' : 'text-tinta-2 hover:bg-superficie-3'
                        }`}
                      >
                        {op === 'AND' ? 'todas' : 'alguna'}
                      </button>
                    ))}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {(grupo.conditions as Condicion[]).map((condicion, i) => (
                      <li key={i}>
                        <FilaDeCondicion
                          catalogo={catalogo}
                          condicion={condicion}
                          onCambiar={(nueva) => {
                            const copia = [...(grupo.conditions as Condicion[])]
                            copia[i] = nueva
                            rehacer(sueltas, { ...grupo, conditions: copia })
                          }}
                          onQuitar={() =>
                            rehacer(sueltas, {
                              ...grupo,
                              conditions: (grupo.conditions as Condicion[]).filter((_, j) => j !== i),
                            })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() =>
                      rehacer(sueltas, { ...grupo, conditions: [...grupo.conditions, condicionNueva(catalogo)] })
                    }
                    className="mt-1.5 rounded px-1.5 py-0.5 text-xs text-tinta-2 hover:bg-superficie-3"
                  >
                    + condición al grupo
                  </button>
                </div>
              ) : null}

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => rehacer([...sueltas, condicionNueva(catalogo)], grupo)}
                  className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
                >
                  + condición
                </button>
                {!grupo ? (
                  <button
                    type="button"
                    onClick={() => rehacer(sueltas, { op: 'OR', conditions: [condicionNueva(catalogo, 'priority')] })}
                    className="rounded border border-borde-fuerte px-2 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
                  >
                    + grupo
                  </button>
                ) : null}
              </div>
            </>
          )}

          {onGuardar && puesto ? (
            <div className="mt-3 border-t border-borde pt-3">
              <label htmlFor="nombre-filtro" className="mb-1.5 block text-xs text-tinta-3">
                Guardar este filtro
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  id="nombre-filtro"
                  type="text"
                  value={nombreNuevo}
                  placeholder="Críticas del cliente"
                  onChange={(e) => setNombreNuevo(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-borde-fuerte bg-superficie px-2 py-1 text-xs text-tinta placeholder:text-tinta-3"
                />
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-tinta-2">
                  <input
                    type="checkbox"
                    checked={compartir}
                    onChange={(e) => setCompartir(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#6366f1]"
                  />
                  Compartir
                </label>
                <button
                  type="button"
                  disabled={nombreNuevo.trim() === ''}
                  onClick={() => {
                    onGuardar(nombreNuevo.trim(), compartir)
                    setNombreNuevo('')
                    setCompartir(false)
                  }}
                  className="shrink-0 rounded bg-acento-relleno px-2.5 py-1 text-xs font-medium text-sobre-acento hover:bg-[#5457e5] disabled:opacity-40"
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded px-2.5 py-1 text-xs text-tinta-2 hover:bg-superficie-3"
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FilaDeCondicion({
  condicion,
  onCambiar,
  onQuitar,
  catalogo,
}: {
  readonly condicion: Condicion
  readonly onCambiar: (condicion: Condicion) => void
  readonly onQuitar: () => void
  readonly catalogo: Catalogo
}) {
  const tipo = tipoDe(condicion.field, catalogo)
  const operadores = OPERADORES_POR_TIPO[tipo]
  const llevaValor = !SIN_VALOR.includes(condicion.operator)
  const esLista = condicion.operator === 'in' || condicion.operator === 'not_in'
  const esRango = condicion.operator === 'between'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        aria-label="Campo"
        value={condicion.field}
        onChange={(e) => onCambiar(condicionNueva(catalogo, e.target.value))}
        className="rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-xs text-tinta"
      >
        {Object.entries(catalogo).map(([clave, campo]) => (
          <option key={clave} value={clave}>
            {campo.etiqueta}
          </option>
        ))}
      </select>

      <select
        aria-label="Operador"
        value={condicion.operator}
        onChange={(e) => {
          const operador = e.target.value as Operador
          // El valor se reinicia al cambiar de operador: pasar de «es» a «entre» dejaría una cadena
          // donde hacen falta dos fechas, y el filtro se rechazaría al guardarlo sin decir por qué.
          const valor = operador === 'between' ? ['', ''] : operador === 'in' || operador === 'not_in' ? [] : ''
          onCambiar({ ...condicion, operator: operador, value: valor })
        }}
        className="rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-xs text-tinta"
      >
        {operadores.map((op) => (
          <option key={op} value={op}>
            {NOMBRES_DE_OPERADOR[op]}
          </option>
        ))}
      </select>

      {llevaValor ? (
        tipo === 'booleano' ? (
          // Un cuadro de texto donde hubiera que escribir «true» es una trampa: sólo hay dos
          // respuestas posibles y las dos caben en un selector.
          <select
            aria-label="Valor"
            value={condicion.value === true ? 'si' : 'no'}
            onChange={(e) => onCambiar({ ...condicion, value: e.target.value === 'si' })}
            className="rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-xs text-tinta"
          >
            <option value="si">sí</option>
            <option value="no">no</option>
          </select>
        ) : esRango ? (
          <>
            <input
              aria-label="Desde"
              type={tipo === 'fecha' ? 'date' : 'text'}
              value={String((condicion.value as unknown[])?.[0] ?? '')}
              onChange={(e) =>
                onCambiar({ ...condicion, value: [e.target.value, (condicion.value as unknown[])?.[1] ?? ''] })
              }
              className="w-32 rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-xs text-tinta"
            />
            <input
              aria-label="Hasta"
              type={tipo === 'fecha' ? 'date' : 'text'}
              value={String((condicion.value as unknown[])?.[1] ?? '')}
              onChange={(e) =>
                onCambiar({ ...condicion, value: [(condicion.value as unknown[])?.[0] ?? '', e.target.value] })
              }
              className="w-32 rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-xs text-tinta"
            />
          </>
        ) : (
          <input
            aria-label="Valor"
            type={tipo === 'fecha' ? 'date' : 'text'}
            value={esLista ? ((condicion.value as unknown[]) ?? []).join(', ') : String(condicion.value ?? '')}
            placeholder={esLista ? 'separados por comas' : ''}
            onChange={(e) =>
              onCambiar({
                ...condicion,
                value: esLista
                  ? e.target.value.split(',').map((v) => v.trim()).filter((v) => v !== '')
                  : e.target.value,
              })
            }
            className="min-w-0 flex-1 rounded border border-borde-fuerte bg-superficie px-1.5 py-1 text-xs text-tinta placeholder:text-tinta-3"
          />
        )
      ) : null}

      <button
        type="button"
        aria-label="Quitar la condición"
        onClick={onQuitar}
        className="shrink-0 rounded px-1.5 py-0.5 text-xs text-tinta-3 hover:bg-superficie-3 hover:text-tinta"
      >
        ✕
      </button>
    </div>
  )
}
