'use client'

/**
 * Las piezas de dibujo del panel de control, y la paleta que comparten.
 *
 * Los seis widgets tienen que leerse como **un solo sistema visual**, no como seis gráficos que
 * casualmente están en la misma pantalla. Por eso la paleta, la altura de las barras, el trato de
 * los vacíos y la forma de etiquetar viven aquí y no en cada widget.
 *
 * ## Por qué barras apiladas y no donas
 *
 * El spec de referencia dibuja donas. Una dona obliga a comparar ángulos, que es la comparación que
 * peor hace el ojo, y se vuelve ilegible en cuanto una rebanada baja del 5 % — que en un plan de mil
 * líneas es la mitad de los estados. Una barra apilada horizontal responde la misma pregunta
 * —«¿cuánto de cada cosa?»— comparando longitudes, admite nombres largos a la izquierda y sigue
 * siendo legible con una rebanada del 0.4 %. El spec es una implementación de referencia, no un
 * objetivo de clonación.
 *
 * ## La paleta, y por qué es una rampa y no colores sueltos
 *
 * Los estados de una línea son un **embudo**, no un conjunto de etiquetas: pendiente → por hacer →
 * en curso → terminada. Eso es una escala ordinal, así que se dibuja con un solo tono azul que va
 * de claro a oscuro. Colores distintos por estado dirían «son cosas diferentes» cuando lo que son
 * es *el mismo trabajo más adelante*.
 *
 * `BLOQUEADA` se sale de la rampa a propósito: no es una etapa del embudo, es un problema. Lleva el
 * rojo reservado a estados y **siempre** con su icono y su nombre al lado, nunca sólo el color.
 *
 * La rampa está comprobada con el validador del oficio contra la superficie real de la tarjeta
 * (`#18181b`): monotonía de luminosidad, separación entre pasos y contraste del paso más oscuro.
 * El paso más oscuro queda en 2.19:1, por debajo de 3:1 — de ahí que cada rebanada lleve su
 * etiqueta visible y que el widget ofrezca la tabla: el color no es el único canal.
 */

import React from 'react'

/**
 * La rampa azul del producto, del paso más claro al más oscuro.
 *
 * Es **una sola** y la comparten todas las escalas ordinales de las vistas: el embudo de estados del
 * panel y la ocupación de la matriz de carga. Que dos pantallas usen dos rampas parecidas pero
 * distintas es lo que hace que un producto se vea cosido a retazos.
 *
 * Comprobada con el validador contra la superficie real de la tarjeta (`#18181b`): luminosidad
 * monótona, hueco de al menos 0.06 entre pasos y el extremo oscuro despegado del fondo (2.19:1).
 */
export const RAMPA_AZUL = [
  'var(--rampa-1)',
  'var(--rampa-2)',
  'var(--rampa-3)',
  'var(--rampa-4)',
] as const

/**
 * El embudo de estados, del más lejos de terminar al más cerca.
 *
 * Va de claro a oscuro porque el trabajo terminado «pesa» más y se ancla mejor: en la matriz de
 * carga la orientación es la contraria —más carga, más claro sobre fondo oscuro— y ahí está bien
 * al revés, porque lo que se busca de un vistazo es lo lleno, no lo vacío.
 */
export const RAMPA_DEL_EMBUDO: Record<string, string> = {
  BACKLOG: RAMPA_AZUL[0],
  TODO: RAMPA_AZUL[1],
  IN_PROGRESS: RAMPA_AZUL[2],
  DONE: RAMPA_AZUL[3],
}

/** Colores de estado, reservados: nunca se reutilizan como «una serie más». */
export const COLORES_DE_ESTADO = {
  bien: 'var(--estado-bien)',
  aviso: 'var(--estado-aviso)',
  grave: 'var(--estado-serio)',
  critico: 'var(--estado-critico)',
} as const

/**
 * El crítico cuando es **texto** y no relleno.
 *
 * `#d03b3b` sobre la superficie oscura da 3.69:1 y un texto pequeño necesita 4.5:1. Es la misma
 * partición que ya tiene el acento, y por el mismo motivo.
 */
export const CRITICO_COMO_TINTA = 'var(--estado-critico-tinta)'

/**
 * El velo de la celda sobrecargada, **ya compuesto** por tema.
 *
 * Se armaba concatenando alfa —`${critico}44`— y con un token eso no vale: `var(--x)44` no es un
 * color. Componerlo por tema es además lo correcto: el mismo rojo al 27 % da `#492124` sobre el
 * fondo oscuro y `#f2cbcb` sobre el blanco.
 */
export const VELO_CRITICO = 'var(--velo-critico)'
/** La tinta que se lee **encima** del velo, que ahora es un relleno macizo. */
export const VELO_CRITICO_TINTA = 'var(--velo-critico-tinta)'
export const VELO_CRITICO_SUAVE = 'var(--velo-critico-suave)'

/** Un estado que no está en el embudo se dibuja en gris apagado, no en un color inventado. */
const GRIS = 'var(--tinta-3)'

export function colorDeEstado(estado: string): string {
  if (estado === 'BLOCKED') return COLORES_DE_ESTADO.critico
  return RAMPA_DEL_EMBUDO[estado] ?? GRIS
}

const NOMBRES: Record<string, string> = {
  BACKLOG: 'Pendiente',
  TODO: 'Por hacer',
  IN_PROGRESS: 'En curso',
  BLOCKED: 'Bloqueada',
  DONE: 'Terminada',
}

export function nombreDeEstado(estado: string): string {
  return NOMBRES[estado] ?? estado
}

/** El icono acompaña siempre a «bloqueada»: el color no puede ser el único canal. */
export function iconoDeEstado(estado: string): string {
  return estado === 'BLOCKED' ? '⚠ ' : ''
}

export function porcentaje(fraccion: number, decimales = 0): string {
  return `${(fraccion * 100).toFixed(decimales)} %`
}

export interface Rebanada {
  readonly estado: string
  readonly cantidad: number
  readonly fraccion: number
}

/**
 * Una barra apilada horizontal: parte-y-todo comparando longitudes.
 *
 * Entre rebanada y rebanada va un hueco de 2 px del color de la superficie, no un borde: un borde
 * añade una línea que el ojo cuenta como dato, y el hueco separa sin añadir nada.
 */
export function BarraApilada({
  id,
  rebanadas,
  etiqueta,
}: {
  /** Distingue esta barra de las demás del panel: hay más de una y los estados se repiten. */
  readonly id: string
  readonly rebanadas: readonly Rebanada[]
  readonly etiqueta: string
}) {
  const total = rebanadas.reduce((suma, r) => suma + r.cantidad, 0)

  if (total === 0) {
    return (
      <div
        role="img"
        aria-label={`${etiqueta}: sin líneas`}
        className="flex h-6 items-center justify-center rounded bg-superficie-3/60 text-[11px] text-tinta-3"
      >
        sin líneas
      </div>
    )
  }

  return (
    <>
      <div role="img" aria-label={`${etiqueta}: ${rebanadas.map((r) => `${nombreDeEstado(r.estado)} ${r.cantidad}`).join(', ')}`} className="flex h-6 w-full gap-[2px] overflow-hidden rounded">
        {rebanadas.map((rebanada) => (
          <div
            key={rebanada.estado}
            data-testid={`rebanada-${id}-${rebanada.estado}`}
            title={`${nombreDeEstado(rebanada.estado)}: ${rebanada.cantidad} (${porcentaje(rebanada.fraccion, 1)})`}
            style={{
              width: `${rebanada.fraccion * 100}%`,
              backgroundColor: colorDeEstado(rebanada.estado),
            }}
            className="h-full first:rounded-l last:rounded-r"
          />
        ))}
      </div>

      {/* La leyenda va siempre, y con el número al lado: la identidad nunca depende sólo del color. */}
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {rebanadas.map((rebanada) => (
          <li key={rebanada.estado} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: colorDeEstado(rebanada.estado) }}
            />
            <span className="text-tinta-2">
              {iconoDeEstado(rebanada.estado)}
              {nombreDeEstado(rebanada.estado)}
            </span>
            <span className="tabular-nums text-tinta-3">
              {rebanada.cantidad} · {porcentaje(rebanada.fraccion)}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Un medidor con marca de objetivo: cuánto se lleva hecho y dónde debería ir.
 *
 * Una sola pista y un solo eje de 0 a 100 %. Dos barras separadas —una de «real» y otra de
 * «planificado»— obligarían a comparar dos longitudes que arrancan en sitios distintos; con la
 * marca encima de la propia pista, la distancia entre el relleno y la marca *es* la desviación.
 */
export function Medidor({
  valor,
  objetivo,
  etiqueta,
  etiquetaObjetivo,
}: {
  readonly valor: number
  readonly objetivo?: number
  readonly etiqueta: string
  readonly etiquetaObjetivo?: string
}) {
  const relleno = Math.min(1, Math.max(0, valor))
  const marca = objetivo === undefined ? null : Math.min(1, Math.max(0, objetivo))

  return (
    <div
      role="img"
      aria-label={`${etiqueta}: ${porcentaje(relleno, 1)}${marca === null ? '' : `, ${etiquetaObjetivo ?? 'objetivo'} ${porcentaje(marca, 1)}`}`}
      className="relative h-3 w-full rounded-full bg-superficie-3"
    >
      <div
        data-testid="medidor-relleno"
        className="h-full rounded-full"
        style={{ width: `${relleno * 100}%`, backgroundColor: RAMPA_DEL_EMBUDO.IN_PROGRESS }}
      />
      {marca === null ? null : (
        <span
          data-testid="medidor-marca"
          title={`${etiquetaObjetivo ?? 'Objetivo'}: ${porcentaje(marca, 1)}`}
          // El anillo de 2 px del color de la superficie despega la marca del relleno cuando caen
          // encima una de otra, que es justo cuando el proyecto va exactamente en tiempo.
          className="absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-tinta ring-2 ring-superficie"
          style={{ left: `calc(${marca * 100}% - 1.5px)` }}
        />
      )}
    </div>
  )
}

/** El número que encabeza un widget. Grande, con cifras tabulares para que no baile. */
export function Cifra({
  valor,
  pie,
  tono = 'normal',
}: {
  readonly valor: string
  readonly pie: string
  readonly tono?: 'normal' | 'bien' | 'critico'
}) {
  const color =
    tono === 'bien' ? COLORES_DE_ESTADO.bien : tono === 'critico' ? COLORES_DE_ESTADO.critico : undefined

  return (
    // El pie marca la cifra para poder leerla desde fuera. Sin esto, comprobar en pantalla que
    // «atrasadas» del Panel coincide con el conmutador del Gantt (§9.3 C3) obliga a adivinar por
    // posición en el texto, que es como se cuelan los errores de medición.
    <div data-cifra={pie}>
      <p className="text-3xl font-semibold tabular-nums text-tinta" style={color ? { color } : undefined}>
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-tinta-3">{pie}</p>
    </div>
  )
}

/**
 * Lo que se enseña cuando no hay dato.
 *
 * No es un gráfico en cero. Un cero dice «medimos y salió cero»; esto dice qué falta para poder
 * medir, que es lo que de verdad pasa (§9.2).
 */
export function SinDatos({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="flex min-h-[92px] items-center justify-center rounded-lg border border-dashed border-borde px-4 py-6 text-center">
      <p className="max-w-sm text-xs leading-relaxed text-tinta-3">{children}</p>
    </div>
  )
}

/**
 * La caja de un widget. Todos iguales: el sistema visual es uno.
 *
 * Desde que el panel vive dentro del Resumen, ese sistema visual es **el del Resumen**: caja de
 * `rounded-xl p-5` sobre `--superficie`, borde de `--borde`, una **barra de acento de 3 px a la
 * izquierda** y el título en `text-sm font-semibold text-tinta-2`. Antes el título iba en
 * versalitas grises y sin barra, y puestas una debajo de otra las dos familias de tarjeta se veían
 * de dos aplicaciones distintas.
 *
 * El acento es opcional y cae en `--borde`, que es el color que ya tenía el borde izquierdo: una
 * caja sin acento se ve exactamente como antes.
 */
export function Widget({
  titulo,
  acento,
  extra,
  children,
}: {
  readonly titulo: string
  readonly acento?: string
  readonly extra?: React.ReactNode
  readonly children: React.ReactNode
}) {
  return (
    <section
      className="min-w-0 rounded-xl border border-borde bg-superficie p-5"
      style={{ borderLeft: `3px solid ${acento ?? 'var(--borde)'}` }}
    >
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-tinta-2">{titulo}</h3>
        {extra}
      </header>
      {children}
    </section>
  )
}
