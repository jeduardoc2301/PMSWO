import { describe, expect, it } from 'vitest'

import { PANEL_POR_OMISION, WIDGETS_DEL_PANEL } from '../dashboard-widgets'

/**
 * El catálogo de widgets del panel (§9.1).
 *
 * Lo que se prueba es el orden, que hasta ahora no lo probaba nadie: la vista y el diálogo lo tenían
 * escrito por su cuenta y ya se habían separado de esta lista sin que se notara, porque nadie
 * recorre el catálogo para dibujar. La prueba de la vista comprueba el otro lado del mismo hilo.
 */

describe('El orden del catálogo es el que se ve', () => {
  it('son seis, sin repetir', () => {
    expect(new Set(WIDGETS_DEL_PANEL).size).toBe(6)
  })

  it('los dos que no tienen datos van al final', () => {
    // Intercalados entre widgets con datos, sus avisos se leen como huecos en medio del panel.
    expect([...WIDGETS_DEL_PANEL].slice(-2).sort()).toEqual(['presupuesto', 'tiempo'])
  })

  it('lo de por omisión son exactamente los otros cuatro', () => {
    const conDatos = WIDGETS_DEL_PANEL.filter((w) => w !== 'tiempo' && w !== 'presupuesto')
    expect([...PANEL_POR_OMISION.widgets].sort()).toEqual([...conDatos].sort())
  })

  it('nada de lo de por omisión está fuera del catálogo', () => {
    for (const w of PANEL_POR_OMISION.widgets) expect(WIDGETS_DEL_PANEL).toContain(w)
  })
})
