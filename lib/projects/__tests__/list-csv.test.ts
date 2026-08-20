import { describe, expect, it } from 'vitest'

import { csvDeLaLista, nombreDelArchivo } from '../list-csv'

/**
 * Exportar la vista Lista (§6.2).
 *
 * Lo que se prueba aquí no es que salga un CSV, sino las cosas que solo se descubren mandándole el
 * archivo a alguien: que los acentos lleguen, que una fila no se parta por un punto y coma en el
 * nombre, y que lo exportado sea **lo que había en pantalla** y no todo lo que hay en la base.
 */

const COLUMNAS = [
  { id: 'name', etiqueta: 'Línea del plan' },
  { id: 'start', etiqueta: 'Inicio' },
]

const valorDe = (fila: Record<string, unknown>, id: string) => {
  const v = fila[id]
  return v === undefined || v === null ? null : String(v)
}

const armar = (filas: Record<string, unknown>[], columnas = COLUMNAS, contexto?: string) =>
  csvDeLaLista({ columnas, filas, valorDe, ...(contexto ? { contexto } : {}) })

describe('Que Excel lo abra bien', () => {
  it('empieza con la marca de orden de bytes', () => {
    // Sin ella Excel lee el archivo con la página de códigos del sistema y «Migración» sale
    // «MigraciÃ³n». Un informe con los acentos rotos no se manda a un cliente.
    expect(armar([]).charCodeAt(0)).toBe(0xfeff)
  })

  it('declara el separador que Excel en español espera', () => {
    // Con comas, Excel mete la fila entera en la primera celda.
    expect(armar([]).slice(1).startsWith('sep=;')).toBe(true)
  })

  it('los acentos viajan intactos', () => {
    const csv = armar([{ name: 'Migración de las bases Oracle' }])
    expect(csv).toContain('Migración de las bases Oracle')
  })
})

describe('Que una fila no se parta', () => {
  it('un punto y coma en el nombre no crea una columna nueva', () => {
    // El plan de referencia está lleno de nombres con separadores dentro.
    const csv = armar([{ name: 'Diseño; 12 documentos', start: '2026-06-01' }])
    const fila = csv.trim().split('\r\n').pop()!
    expect(fila).toBe('"Diseño; 12 documentos";"2026-06-01"')
  })

  it('unas comillas se doblan', () => {
    const csv = armar([{ name: 'La llamada «de "urgencia"»' }])
    expect(csv).toContain('""urgencia""')
  })

  it('un salto de línea se convierte en espacio', () => {
    // Es legal dejarlo dentro de comillas, pero deja la hoja con filas de alto variable. Una
    // descripción de tres párrafos en una celda no se lee de todos modos.
    const csv = armar([{ name: 'Primera\nSegunda' }])
    expect(csv).toContain('"Primera Segunda"')
    expect(csv.trim().split('\r\n')).toHaveLength(3)
  })

  it('una celda vacía sigue siendo una celda', () => {
    // Si se omitiera, las columnas siguientes se correrían una posición.
    const csv = armar([{ name: 'Sin fecha' }])
    expect(csv.trim().split('\r\n').pop()).toBe('"Sin fecha";""')
  })
})

describe('Se exporta lo que se ve', () => {
  it('solo las columnas que se pasan, en su orden', () => {
    const csv = armar([{ name: 'A', start: '2026-06-01', oculta: 'no debería salir' }])
    expect(csv).not.toContain('no debería salir')
    expect(csv.split('\r\n')[1]).toBe('"Línea del plan";"Inicio"')
  })

  it('solo las filas que se pasan', () => {
    // El filtro se aplica antes: esta función exporta lo que le den, que es toda la garantía.
    const csv = armar([{ name: 'A' }, { name: 'B' }])
    expect(csv.trim().split('\r\n')).toHaveLength(4)
  })

  it('sin filas queda la cabecera sola, no un archivo vacío', () => {
    // Un archivo de cero bytes parece un fallo de la descarga; una cabecera sola dice «no había
    // nada que exportar».
    const lineas = armar([]).trim().split('\r\n')
    expect(lineas).toHaveLength(2)
    expect(lineas[1]).toBe('"Línea del plan";"Inicio"')
  })

  it('la línea de contexto va antes de la cabecera', () => {
    // Un CSV suelto en una carpeta de descargas no dice de qué proyecto es ni de cuándo.
    const lineas = armar([{ name: 'A' }], COLUMNAS, 'Banco Unión · 822 de 1368 · 2026-08-19').split('\r\n')
    expect(lineas[1]).toContain('822 de 1368')
    expect(lineas[2]).toBe('"Línea del plan";"Inicio"')
  })
})

describe('El nombre del archivo', () => {
  it('lleva el proyecto y el día', () => {
    expect(nombreDelArchivo('Banco Unión', '2026-08-19')).toBe('Banco-Union-2026-08-19.csv')
  })

  it('quita los acentos del nombre del archivo, no del contenido', () => {
    // Hay sistemas de archivos y correos que todavía los estropean. El contenido sí los conserva.
    expect(nombreDelArchivo('Migración', '2026-01-01')).toBe('Migracion-2026-01-01.csv')
  })

  it('un nombre imposible no produce un archivo sin nombre', () => {
    expect(nombreDelArchivo('···', '2026-01-01')).toBe('plan-2026-01-01.csv')
  })

  it('recorta los nombres desmesurados', () => {
    const largo = nombreDelArchivo('x'.repeat(200), '2026-01-01')
    expect(largo.length).toBeLessThan(80)
  })
})

describe('Las cabeceras de grupo (§6.2, la vista Agrupada)', () => {
  const conGrupos = (filas: Record<string, unknown>[]) =>
    csvDeLaLista({
      columnas: COLUMNAS,
      filas,
      valorDe,
      cabeceraDe: (fila) => (typeof fila.grupo === 'string' ? [fila.grupo] : null),
    })

  it('la fila de grupo se escribe entera aunque solo traiga una celda', () => {
    // En un CSV no hay celdas combinadas: una fila corta deja la hoja con los bordes torcidos.
    const texto = conGrupos([{ grupo: 'Por hacer' }, { name: 'Migración', start: '2026-01-01' }])
    const filas = texto.split('\r\n').filter((f) => f.startsWith('"'))
    expect(filas.map((f) => f.split(';').length)).toEqual([2, 2, 2])
    expect(filas[1]).toBe('"Por hacer";""')
  })

  it('sin `cabeceraDe` todas las filas son líneas: la Lista se exporta como siempre', () => {
    expect(armar([{ name: 'Migración' }])).toContain('"Migración";""')
  })
})
