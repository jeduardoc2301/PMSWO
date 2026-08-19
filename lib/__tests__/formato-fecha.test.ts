import { describe, expect, it } from 'vitest'

import { fechaCorta, fechaIso } from '../formato-fecha'

/**
 * El corrimiento de un día que se vio comparando dos vistas del mismo proyecto.
 *
 * El caso que abrió esto: el panel del Gantt decía «Del 2026-06-12 al 2026-06-18» y la Lista, de la
 * misma línea, «11/06/2026 — 17/06/2026». La diferencia era `new Date(iso)` seguido de un
 * formateador local: la medianoche UTC es la tarde anterior en Bolivia.
 */

describe('fechaCorta', () => {
  it('no retrocede un día por el huso: es el caso que se vio en pantalla', () => {
    expect(fechaCorta('2026-06-12T00:00:00.000Z')).toBe('12/06/2026')
    expect(fechaCorta('2026-07-02T00:00:00.000Z')).toBe('02/07/2026')
  })

  it('da lo mismo con la fecha civil pelada', () => {
    expect(fechaCorta('2026-06-12')).toBe('12/06/2026')
  })

  it('no depende del huso de quien mira', () => {
    // La prueba de que no hay `Date` por medio: la misma entrada con otro desplazamiento horario
    // escrito dentro de la cadena da el mismo día, porque solo se leen los diez primeros caracteres.
    expect(fechaCorta('2026-06-12T23:59:59-04:00')).toBe('12/06/2026')
    expect(fechaCorta('2026-06-12T00:00:00+09:00')).toBe('12/06/2026')
  })

  it('sin fecha no inventa una', () => {
    expect(fechaCorta(null)).toBeNull()
    expect(fechaCorta(undefined)).toBeNull()
    expect(fechaCorta('')).toBeNull()
  })

  it('una cadena que no es fecha se rechaza en lugar de dar «NaN/NaN/NaN»', () => {
    expect(fechaCorta('mañana')).toBeNull()
    expect(fechaCorta('2026/06/12')).toBeNull()
    expect(fechaCorta('20260612')).toBeNull()
  })
})

describe('fechaIso', () => {
  it('devuelve la fecha civil en el idioma del motor', () => {
    expect(fechaIso('2026-06-12T00:00:00.000Z')).toBe('2026-06-12')
  })

  it('permite comparar la base con el plan sin pasar por el reloj', () => {
    expect(fechaIso('2026-06-12T00:00:00.000Z')).toBe(fechaIso('2026-06-12'))
  })

  it('sin fecha, nada', () => {
    expect(fechaIso(null)).toBeNull()
  })
})
