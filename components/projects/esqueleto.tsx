'use client'

/**
 * Los esqueletos del primer dibujado (§10.7).
 *
 * ## Por qué no una rueda
 *
 * Una rueda centrada dice «espera» y nada más. Un esqueleto dice **qué** va a aparecer y **dónde**,
 * así que el ojo ya está en el sitio correcto cuando llega el contenido y la página no da el salto
 * que obliga a volver a buscar. Es la diferencia entre esperar mirando una puerta y esperar mirando
 * al techo.
 *
 * De ahí la regla que hace que un esqueleto sirva: **tiene que parecerse a lo que viene**. Un
 * esqueleto genérico de tres rectángulos delante de una tabla de nueve columnas es una rueda más
 * cara. Por eso aquí hay uno por forma —tabla, diagrama, rejilla de tarjetas— y no uno solo.
 *
 * ## Lo que casi siempre se olvida
 *
 * Un esqueleto es **puramente visual**: quien usa un lector de pantalla no ve rectángulos grises,
 * ve nada. Sin `aria-busy` y sin un texto que se anuncie, un esqueleto es peor que la rueda que
 * sustituye, porque la rueda al menos solía llevar la palabra «Cargando» al lado.
 *
 * Y el brillo se apaga con `prefers-reduced-motion`: una animación perpetua en media pantalla es
 * exactamente lo que esa preferencia existe para evitar.
 */

import React from 'react'

/** Una barra gris. El brillo va en CSS para que respete `prefers-reduced-motion`. */
function Barra({ ancho, alto = 12 }: { readonly ancho: string; readonly alto?: number }) {
  return (
    <span
      aria-hidden
      className="block rounded bg-superficie-3 motion-safe:animate-pulse"
      style={{ width: ancho, height: alto }}
    />
  )
}

/**
 * El envoltorio común: marca la región como ocupada y dice en voz alta qué se está cargando.
 *
 * `aria-live="polite"` y no `assertive`: interrumpir lo que alguien está leyendo para decirle que
 * algo se está cargando es peor que esperar a que termine la frase.
 */
function Cargando({ que, children }: { readonly que: string; readonly children: React.ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite" data-testid="esqueleto">
      <span className="sr-only">{que}</span>
      {children}
    </div>
  )
}

/** Anchos que no son todos iguales: una tabla real no tiene todas las celdas del mismo tamaño. */
const ANCHOS = ['92%', '68%', '84%', '55%', '76%', '61%', '88%', '70%']

/** Esqueleto de una tabla: la Lista y el esquema. */
export function EsqueletoDeTabla({ filas = 8, columnas = 5 }: { readonly filas?: number; readonly columnas?: number }) {
  return (
    <Cargando que="Cargando las líneas del plan">
      <div className="overflow-hidden rounded-lg border border-borde">
        <div className="flex gap-4 border-b border-borde bg-superficie/40 px-6 py-3">
          {Array.from({ length: columnas }, (_, i) => (
            <div key={i} className="flex-1">
              <Barra ancho="60%" alto={10} />
            </div>
          ))}
        </div>
        {Array.from({ length: filas }, (_, f) => (
          <div key={f} className="flex gap-4 border-b border-borde/60 px-6 py-3.5 last:border-b-0">
            {Array.from({ length: columnas }, (_, c) => (
              <div key={c} className="flex-1">
                <Barra ancho={ANCHOS[(f * columnas + c) % ANCHOS.length]!} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Cargando>
  )
}

/**
 * Esqueleto del diagrama: la columna de nombres a la izquierda y las barras a la derecha.
 *
 * Las barras van a distintas alturas horizontales y con distintos anchos porque un Gantt es
 * exactamente eso: si salieran todas alineadas parecería una tabla, y el ojo se recolocaría al
 * llegar el contenido.
 */
export function EsqueletoDeGantt({ filas = 10 }: { readonly filas?: number }) {
  return (
    <Cargando que="Calculando el plan del proyecto">
      <div className="overflow-hidden rounded-lg border border-borde">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-borde/60 px-4 py-3 last:border-b-0">
            <div className="w-64 shrink-0" style={{ paddingLeft: (i % 3) * 14 }}>
              <Barra ancho={ANCHOS[i % ANCHOS.length]!} />
            </div>
            <div className="relative h-4 flex-1">
              <span
                aria-hidden
                className="absolute block rounded-sm bg-superficie-3 motion-safe:animate-pulse"
                style={{ left: `${(i * 7) % 45}%`, width: `${18 + ((i * 11) % 30)}%`, height: 10, top: 3 }}
              />
            </div>
          </div>
        ))}
      </div>
    </Cargando>
  )
}

/** Esqueleto de una rejilla de tarjetas: el Panel de control. */
export function EsqueletoDeWidgets({ cuantos = 4 }: { readonly cuantos?: number }) {
  return (
    <Cargando que="Armando el panel de control">
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: cuantos }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-borde bg-superficie p-5">
            <Barra ancho="42%" alto={10} />
            <Barra ancho="70%" alto={26} />
            <Barra ancho="88%" />
            <Barra ancho="64%" />
          </div>
        ))}
      </div>
    </Cargando>
  )
}

/**
 * Esqueleto de una rejilla de mes: el Calendario.
 *
 * Siete columnas y cinco filas, que es lo que va a aparecer. Las casillas no llevan todas el mismo
 * número de barritas a propósito: un mes real tiene días vacíos y días con cuatro cosas, y un
 * esqueleto perfectamente regular delante de una rejilla irregular vuelve a dar el salto que el
 * esqueleto existe para evitar.
 */
export function EsqueletoDeMes({ semanas = 5 }: { readonly semanas?: number }) {
  // Cuántas barritas lleva cada casilla, en el orden en que se dibujan. Se repite al dar la vuelta.
  const CARGA = [0, 2, 1, 3, 0, 1, 2, 1, 0, 2, 3, 1, 2, 0]
  return (
    <Cargando que="Armando el calendario del proyecto">
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={`c${i}`} className="px-1 py-1">
            <Barra ancho="60%" alto={8} />
          </div>
        ))}
        {Array.from({ length: semanas * 7 }, (_, i) => (
          <div
            key={i}
            data-casilla
            className="flex min-h-[104px] flex-col gap-1 rounded border border-borde bg-superficie p-1.5"
          >
            <Barra ancho="24%" alto={8} />
            {Array.from({ length: CARGA[i % CARGA.length]! }, (_, j) => (
              <Barra key={j} ancho={j % 2 === 0 ? '86%' : '64%'} alto={10} />
            ))}
          </div>
        ))}
      </div>
    </Cargando>
  )
}

/**
 * Esqueleto de la matriz de carga: una columna de gente y una fila de días.
 *
 * La primera columna va más ancha porque lleva nombres, y las demás son cuadraditos: es lo que
 * distingue esta forma de la de una tabla cualquiera, y por tanto lo único que la hace útil como
 * esqueleto en lugar de como rueda cara.
 */
export function EsqueletoDeCarga({ personas = 6, dias = 14 }: { readonly personas?: number; readonly dias?: number }) {
  return (
    <Cargando que="Armando la carga del equipo">
      <div className="flex flex-col gap-2">
        {Array.from({ length: personas }, (_, i) => (
          <div key={i} data-fila-carga className="flex items-center gap-1.5">
            <div className="w-40 shrink-0">
              <Barra ancho={ANCHOS[i % ANCHOS.length]!} alto={12} />
            </div>
            {Array.from({ length: dias }, (_, j) => (
              <Barra key={j} ancho="18px" alto={18} />
            ))}
          </div>
        ))}
      </div>
    </Cargando>
  )
}
