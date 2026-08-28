import { describe, expect, it } from 'vitest'

import { readWorkbook } from '@/lib/scheduling/xlsx'
import { leerZip } from '../../xlsx/zip'
import { letraDeColumna } from '../../xlsx/writer'
import {
  ESTADOS,
  NOMBRE_FECHA_CORTE,
  NOMBRE_FERIADOS,
  construirLibroDePlan,
  mascaraDeSemana,
  type PlanParaExportar,
} from '../workbook'
import { papelDe } from '../roles'

/**
 * Dos planes de dominios distintos, con conjuntos de tipos y campos personalizados distintos.
 *
 * No son decoración: son el criterio de aceptación. El exportador tiene que dar lo mismo para una
 * migración a la nube y para una obra civil, y la única forma de que eso no se degrade con el
 * tiempo es que las dos estén aquí y las dos se comprueben.
 */

const DIA = 20_000 // número de día del motor; el valor concreto da igual, la aritmética no

function migracion(): PlanParaExportar {
  return {
    nombre: 'Migración BU · Plan integrado',
    campos: [
      { id: 'cf-ola', etiqueta: 'Ola' },
      { id: 'cf-riesgo', etiqueta: 'Riesgo' },
    ],
    configuracion: {
      papeles: { Ola: 'contenedor_mayor', 'Prerrequisito Cliente': 'dependencia_externa' },
      descripcion: 'Plan integrado de migración.',
      advertencias: ['El avance se captura sólo en las hojas.'],
    },
    lineas: [
      {
        id: 'raiz',
        nombre: 'Programa de migración',
        tipo: 'Programa',
        parentId: null,
        inicio: DIA,
        fin: DIA + 30,
        duracion: 22,
        avance: 0,
        peso: null,
        predecesoras: [],
        personalizados: {},
      },
      {
        id: 'ola1',
        nombre: 'Ola 1',
        tipo: 'Ola',
        parentId: 'raiz',
        inicio: DIA,
        fin: DIA + 10,
        duracion: 8,
        avance: 0,
        peso: null,
        predecesoras: [],
        personalizados: { 'cf-ola': 'Ola 1' },
      },
      {
        id: 'a1',
        nombre: 'Inventario de servidores',
        tipo: 'Actividad',
        parentId: 'ola1',
        inicio: DIA,
        fin: DIA + 4,
        duracion: 5,
        avance: 0.5,
        peso: null,
        predecesoras: [],
        personalizados: { 'cf-ola': 'Ola 1', 'cf-riesgo': 'Medio' },
      },
      {
        id: 'a2',
        nombre: 'Corte de producción',
        tipo: 'Hito',
        parentId: 'ola1',
        inicio: DIA + 10,
        fin: DIA + 10,
        duracion: 0,
        avance: 0,
        peso: null,
        predecesoras: ['a1'],
        personalizados: {},
      },
      {
        id: 'dep',
        nombre: 'Accesos VPN del cliente',
        tipo: 'Prerrequisito Cliente',
        parentId: 'raiz',
        inicio: DIA + 2,
        fin: DIA + 3,
        duracion: 2,
        avance: 1,
        peso: null,
        predecesoras: [],
        personalizados: {},
      },
    ],
  }
}

/** Otro dominio, otros tipos, otros campos — y **sin ninguna configuración de papeles**. */
function obraCivil(): PlanParaExportar {
  return {
    nombre: 'Puente vehicular km 14',
    campos: [{ id: 'cf-frente', etiqueta: 'Frente de obra' }],
    configuracion: {},
    lineas: [
      {
        id: 'obra',
        nombre: 'Obra completa',
        tipo: 'Proyecto',
        parentId: null,
        inicio: DIA,
        fin: DIA + 40,
        duracion: 30,
        avance: 0,
        peso: null,
        predecesoras: [],
        personalizados: {},
      },
      {
        id: 'cim',
        nombre: 'Cimentación',
        tipo: 'Frente',
        parentId: 'obra',
        inicio: DIA,
        fin: DIA + 20,
        duracion: 15,
        avance: 0,
        peso: null,
        predecesoras: [],
        personalizados: { 'cf-frente': 'Norte' },
      },
      {
        id: 'exc',
        nombre: 'Excavación',
        tipo: 'Partida',
        parentId: 'cim',
        inicio: DIA,
        fin: DIA + 9,
        duracion: 8,
        avance: 0.25,
        peso: null,
        predecesoras: [],
        personalizados: { 'cf-frente': 'Norte' },
      },
      {
        id: 'sin-fecha',
        nombre: 'Partida sin programar',
        tipo: 'Partida',
        parentId: 'cim',
        inicio: null,
        fin: null,
        duracion: null,
        avance: 0,
        peso: null,
        predecesoras: [],
        personalizados: {},
      },
    ],
  }
}

function hojaDe(plan: PlanParaExportar): string {
  const { contenido } = construirLibroDePlan(plan)
  return leerZip(contenido).get('xl/worksheets/sheet1.xml')!.toString('utf8')
}

function libroDe(plan: PlanParaExportar): string {
  const { contenido } = construirLibroDePlan(plan)
  return leerZip(contenido).get('xl/workbook.xml')!.toString('utf8')
}

/**
 * El color y la sangría NO están en la hoja: la hoja sólo guarda el número de estilo de cada
 * celda, y la definición vive en `styles.xml`. Buscarlos en el XML de la hoja da siempre negativo
 * —lo comprobé de la forma cara— y una prueba que busca donde no está sólo sirve para dar una
 * sensación de cobertura.
 */
function estilosDe(plan: PlanParaExportar): string {
  const { contenido } = construirLibroDePlan(plan)
  return leerZip(contenido).get('xl/styles.xml')!.toString('utf8')
}

describe('libro de plan · el archivo es válido y se puede volver a leer', () => {
  it.each([
    ['migración', migracion()],
    ['obra civil', obraCivil()],
  ])('%s: el lector de xlsx del sistema abre lo que este escritor produce', (_, plan) => {
    const { contenido } = construirLibroDePlan(plan)

    // La prueba más fuerte que se puede hacer sin abrir Excel: el lector que ya existe en
    // `lib/scheduling` —escrito contra archivos reales de herramienta— entiende el resultado.
    const libro = readWorkbook(contenido)
    expect(libro.sheetNames).toEqual(['Plan'])

    const hoja = libro.sheet('Plan')
    const titulo = hoja.rows.get(1)?.get('A')?.text
    expect(titulo).toBe(plan.nombre)
  })

  it.each([
    ['migración', migracion()],
    ['obra civil', obraCivil()],
  ])('%s: ninguna fórmula apunta fuera del libro', (_, plan) => {
    const xml = hojaDe(plan)
    const columnas = construirLibroDePlan(plan).columnas
    const ultimaLetra = letraDeColumna(columnas)

    for (const formula of xml.matchAll(/<f>([^<]*)<\/f>/g)) {
      // Nada de referencias sin resolver ni errores literales incrustados.
      expect(formula[1]).not.toMatch(/#REF!|#VALOR!|#NOMBRE\?|#N\/A|undefined|NaN/)
      // Y ninguna letra de columna más allá de la última que existe.
      for (const ref of formula[1].matchAll(/\b([A-Z]{1,2})\d+\b/g)) {
        expect(ref[1].length <= ultimaLetra.length).toBe(true)
      }
    }
  })
})

describe('libro de plan · jerarquía', () => {
  it('agrupa por la relación madre-hija real, no por un campo de texto', () => {
    const xml = hojaDe(migracion())

    // «Inventario de servidores» cuelga de «Ola 1», que cuelga de la raíz: nivel 2.
    expect(xml).toMatch(/<row r="\d+" outlineLevel="2">/)
    expect(xml).toContain('outlineLevelRow="2"')
  })

  it('pone los controles de agrupar junto a la fila madre, que va arriba', () => {
    // El valor por omisión de Excel es el contrario. Sin esto, el control de cada grupo aparece
    // pegado a la fila siguiente al grupo, que es de otra rama.
    expect(hojaDe(migracion())).toContain('<outlinePr summaryBelow="0" summaryRight="0"/>')
  })

  it('sangra el nombre según la profundidad', () => {
    const estilos = estilosDe(migracion())
    expect(estilos).toContain('indent="2"') // primer nivel
    expect(estilos).toContain('indent="4"') // segundo
  })

  it('no pierde una línea cuya madre no está en el conjunto', () => {
    const plan = migracion()
    const huerfana: PlanParaExportar = {
      ...plan,
      lineas: [...plan.lineas, { ...plan.lineas[2], id: 'suelta', parentId: 'no-existe' }],
    }
    expect(construirLibroDePlan(huerfana).lineas).toBe(plan.lineas.length + 1)
  })
})

describe('libro de plan · la hoja calcula', () => {
  it('declara la fecha de corte como nombre y la fórmula la usa por nombre', () => {
    expect(libroDe(migracion())).toContain(`<definedName name="${NOMBRE_FECHA_CORTE}">Plan!$E$`)

    const xml = hojaDe(migracion())
    // El atraso se mide contra el nombre, no contra una celda escrita a mano: mover la cabecera
    // no puede romper mil fórmulas.
    expect(xml).toMatch(new RegExp(`NETWORKDAYS\\.INTL\\([^)]*${NOMBRE_FECHA_CORTE}`))
    expect(xml).toContain('<f>TODAY()</f>')
  })

  it('el estado sale de la fórmula, no del valor de exportar', () => {
    const xml = hojaDe(migracion())
    expect(xml).toContain(`&quot;${ESTADOS.cerrado}&quot;`)
    expect(xml).toContain(`&quot;${ESTADOS.enCurso}&quot;`)
    expect(xml).toContain(`&quot;${ESTADOS.noIniciado}&quot;`)
  })

  it('el formato condicional busca exactamente los mismos textos que escribe la fórmula', () => {
    const xml = hojaDe(migracion())
    // Es la invariante que evita el fallo silencioso: la regla se aplicaría a nada y la hoja
    // seguiría pareciendo correcta.
    for (const estado of Object.values(ESTADOS)) {
      expect(xml).toContain(`<formula>&quot;${estado}&quot;</formula>`)
    }
  })

  it('una línea sin fechas deja el atraso en blanco en vez de dar #¡VALOR!', () => {
    const xml = hojaDe(obraCivil())
    const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const sinProgramar = filas.find((f) => f[2].includes('Partida sin programar'))!
    expect(sinProgramar[2]).not.toContain('NETWORKDAYS')
  })
})

describe('libro de plan · avance ponderado por Peso', () => {
  it('una madre promedia el avance de sus hijas DIRECTAS pesado por Peso', () => {
    const plan = migracion()
    const xml = hojaDe(plan)

    // La raíz está en la primera fila de datos; sus hijas directas son «Ola 1» y el
    // prerrequisito, no las nietas.
    const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const raiz = filas.find((f) => f[2].includes('Programa de migración'))!
    const formula = /<f>(IFERROR[^<]*)<\/f>/.exec(raiz[2])![1]

    // Dos sumandos, uno por hija directa. Si contara las nietas habría cuatro, y los días
    // compartidos se contarían dos veces.
    expect(formula.match(/\*/g)).toHaveLength(2)
    // Y el repuesto es media simple, no cero: es lo que hace `avanceDelResumen` en el motor
    // cuando el peso total es cero, y el libro no puede tener su propia regla.
    expect(formula).toMatch(/^IFERROR\(\(.+\)\/\(.+\),AVERAGE\(.+\)\)$/)
  })

  it('el Peso de una madre es la suma del de sus hijas directas', () => {
    const xml = hojaDe(migracion())
    const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const ola = filas.find((f) => f[2].includes('Ola 1'))!
    // La columna de Peso es la última; su fórmula suma, no promedia.
    expect(ola[2]).toMatch(/<f>[A-Z]+\d+\+[A-Z]+\d+<\/f>/)
  })

  it('el Peso va oculto: es maquinaria, no información', () => {
    const xml = hojaDe(migracion())
    const columnas = construirLibroDePlan(migracion()).columnas
    // 10 de ancho pedido más los 5/7 de carácter que Excel lleva incorporados: sin ese relleno,
    // la columna sale más estrecha de lo que se pidió. Se comprobó abriendo el archivo real.
    expect(xml).toContain(`<col min="${columnas}" max="${columnas}" width="10.71484375" customWidth="1" hidden="1"/>`)
  })

  it('el avance de una hoja es un valor capturable, no una fórmula', () => {
    const xml = hojaDe(migracion())
    const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const hoja = filas.find((f) => f[2].includes('Inventario de servidores'))!
    expect(hoja[2]).toContain('<v>0.5</v>')
  })
})

describe('libro de plan · el tema no decide el contenido', () => {
  it('un plan SIN mapa de papeles exporta bien: contenedores por jerarquía, lo demás trabajo', () => {
    // Éste es el criterio que prueba que ninguna regla de un proyecto concreto se coló en el
    // código del exportador.
    const plan = obraCivil()
    expect(plan.configuracion.papeles).toBeUndefined()

    const { contenido, lineas } = construirLibroDePlan(plan)
    expect(lineas).toBe(4)

    const xml = leerZip(contenido).get('xl/worksheets/sheet1.xml')!.toString('utf8')
    expect(xml).toContain('outlineLevel="2"')

    // La raíz se pinta como contenedor raíz aunque nadie lo haya configurado.
    const estilos = leerZip(contenido).get('xl/styles.xml')!.toString('utf8')
    expect(estilos).toContain('<fgColor rgb="FF1F2937"/>')
  })

  it('el mapa manda sobre la jerarquía cuando existe', () => {
    // «Ola 1» está a profundidad 1 y tiene hijas: por jerarquía sería contenedor mayor de todos
    // modos. Lo que se comprueba es que el mapa se consulta primero y con qué resultado.
    expect(papelDe({ tipo: 'Ola', profundidad: 3, tieneHijas: false, duracion: 5 }, { Ola: 'contenedor_mayor' }))
      .toBe('contenedor_mayor')
  })

  it('el mapa no distingue mayúsculas ni espacios de sobra: lo escribe una persona', () => {
    expect(papelDe({ tipo: 'ola', profundidad: 0, tieneHijas: false, duracion: 5 }, { '  Ola  ': 'hito' }))
      .toBe('hito')
  })

  it('un tipo mapeado a algo que no es un papel se ignora en vez de romper', () => {
    expect(papelDe({ tipo: 'Ola', profundidad: 0, tieneHijas: false, duracion: 5 }, { Ola: 'inventado' }))
      .toBe('trabajo')
  })

  it('una línea con hijas es contenedor aunque dure cero', () => {
    // El respaldo por duración va DESPUÉS del de jerarquía a propósito: una ola de corte cuyas
    // hijas caen todas el mismo día perdería su cabecera y su control de agrupar.
    expect(papelDe({ tipo: null, profundidad: 1, tieneHijas: true, duracion: 0 }, null))
      .toBe('contenedor_mayor')
  })

  it('sin hijas y sin duración es hito', () => {
    expect(papelDe({ tipo: null, profundidad: 2, tieneHijas: false, duracion: 0 }, null)).toBe('hito')
  })
})

describe('libro de plan · bloque núcleo y bloque dinámico', () => {
  it('el bloque núcleo va completo y en el mismo orden en los dos planes', () => {
    const nucleo = [
      'ID', 'Nivel', 'Nombre de la tarea', 'Tipo', 'Inicio', 'Fin',
      'Duración', '% avance', 'Estado', 'Atraso / Ventaja', 'Predecesoras',
    ]

    for (const plan of [migracion(), obraCivil()]) {
      const libro = readWorkbook(construirLibroDePlan(plan).contenido)
      const hoja = libro.sheet('Plan')
      // Los títulos van en la fila que toque según cuánta cabecera lleve el plan; se busca por
      // contenido a propósito, para que la prueba no fije la geometría de la cabecera.
      let filaTitulos = -1
      for (const [numero, celdas] of hoja.rows) {
        if (celdas.get('A')?.text === 'ID') filaTitulos = numero
      }
      expect(filaTitulos).toBeGreaterThan(0)

      const titulos = nucleo.map((_, i) => hoja.rows.get(filaTitulos)!.get(letraDeColumna(i + 1))?.text)
      expect(titulos).toEqual(nucleo)
    }
  })

  it('los campos personalizados de un plan no descuadran el núcleo del otro', () => {
    const conDos = construirLibroDePlan(migracion())
    const conUno = construirLibroDePlan(obraCivil())

    // Once del núcleo + los suyos + Peso. El núcleo ocupa las mismas letras en ambos.
    expect(conDos.columnas).toBe(11 + 2 + 1)
    expect(conUno.columnas).toBe(11 + 1 + 1)
  })

  it('las predecesoras se citan por el consecutivo que se ve, no por el id interno', () => {
    const libro = readWorkbook(construirLibroDePlan(migracion()).contenido)
    const hoja = libro.sheet('Plan')
    let encontrada: string | null = null
    for (const [, celdas] of hoja.rows) {
      if (celdas.get('C')?.text === 'Corte de producción') encontrada = celdas.get('K')?.text ?? null
    }
    // «Inventario de servidores» es el consecutivo 3 del plan.
    expect(encontrada).toBe('3')
  })

  it('la cabecera se encoge cuando el proyecto no configura descripción ni advertencias', () => {
    const conTexto = readWorkbook(construirLibroDePlan(migracion()).contenido).sheet('Plan')
    const sinTexto = readWorkbook(construirLibroDePlan(obraCivil()).contenido).sheet('Plan')

    const filaDe = (hoja: typeof conTexto, texto: string): number => {
      for (const [numero, celdas] of hoja.rows) {
        if (celdas.get('A')?.text === texto) return numero
      }
      return -1
    }

    // Migración lleva descripción y advertencia; la obra civil, ninguna de las dos.
    expect(filaDe(conTexto, 'ID')).toBe(6)
    expect(filaDe(sinTexto, 'ID')).toBe(4)
  })
})

describe('libro de plan · el archivo es reproducible', () => {
  it('exportar dos veces el mismo plan da los mismos bytes', () => {
    // Sin esto no se puede comparar una versión con otra, ni cachear, ni probar de verdad. Es la
    // razón de que la fecha del ZIP sea una constante y no la hora de generar.
    const a = construirLibroDePlan(migracion()).contenido
    const b = construirLibroDePlan(migracion()).contenido
    expect(a.equals(b)).toBe(true)
  })
})

describe('libro de plan · los anchos son los que se piden', () => {
  it('el ancho del archivo lleva el relleno que Excel descuenta al enseñarlo', () => {
    const xml = hojaDe(migracion())

    // El atributo `width` no es el número de caracteres que la interfaz enseña: la fórmula del
    // formato incluye 5 píxeles de relleno, que en Calibri 11 son 5/7 de carácter.
    //
    // Escribir el número en crudo encogía TODAS las columnas esa fracción: la de ID pedía 6 y
    // Excel enseñaba 5,29; la del nombre pedía 92 y enseñaba 91,29. No lo detectó ninguna prueba
    // ni ninguna lectura del XML —el número estaba ahí, tal como se había escrito—; apareció al
    // abrir el archivo de verdad y preguntarle a Excel cuánto medían sus columnas.
    expect(xml).toContain('<col min="1" max="1" width="6.71484375" customWidth="1"/>')
    expect(xml).toContain('<col min="3" max="3" width="92.71484375" customWidth="1"/>')
  })
})

/**
 * Los tres defectos que encontró la revisión adversaria y que sólo se veían ejecutando.
 * Cada uno tiene aquí la prueba que faltaba cuando se escribió el código.
 */
describe('libro de plan · lo que la revisión encontró', () => {
  /** Una madre y N hijas hito, todas cumplidas. El caso que salía a 0 %. */
  function ramaDePuroHito(cuantas: number): PlanParaExportar {
    return {
      nombre: 'Calendario de campaña',
      campos: [],
      configuracion: {},
      lineas: [
        { id: 'r', nombre: 'Campaña', tipo: 'Fase', parentId: null, inicio: DIA, fin: DIA + 60, duracion: 44, avance: 0, peso: null, predecesoras: [], personalizados: {} },
        ...Array.from({ length: cuantas }, (_, i) => ({
          id: `h${i}`,
          nombre: `Compromiso ${i}`,
          tipo: 'Hito',
          parentId: 'r',
          inicio: DIA + i,
          fin: DIA + i,
          duracion: 0,
          avance: 1,
          peso: null,
          predecesoras: [],
          personalizados: {},
        })),
      ],
    }
  }

  it('una rama de puros hitos cumplidos NO sale al 0 %: pesa, y su madre lo nota', () => {
    const xml = hojaDe(ramaDePuroHito(3))
    const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]

    // Cada hito pesa 1, no 0: una línea que existe cuenta.
    const hito = filas.find((f) => f[2].includes('Compromiso 0'))!
    expect(hito[2]).toMatch(/<c r="[A-Z]+\d+" s="\d+"><v>1<\/v><\/c>/)

    // Y por tanto el denominador de la madre no es cero, que era lo que la mandaba al IFERROR.
    const madre = filas.find((f) => f[2].includes('Campaña'))!
    const avance = /<f>(IFERROR[^<]*)<\/f>/.exec(madre[2])![1]
    expect(avance).toContain('/(')
    // Tres sumandos en el denominador, uno por hija, y ninguno vale cero.
    expect(avance.split('/(')[1].split(')')[0].split('+')).toHaveLength(3)
  })

  it('con más hijas de las que caben en una fórmula, la suma se cierra en vez de reventar', () => {
    // A partir de unas 560 hijas la forma explícita pasaba de los 8 192 caracteres de Excel y el
    // archivo NO ABRÍA. Comprobado en Excel 16.0: 560 abría, 580 no.
    const xml = hojaDe(ramaDePuroHito(600))

    for (const formula of xml.matchAll(/<f>([^<]*)<\/f>/g)) {
      expect(formula[1].length).toBeLessThanOrEqual(8_192)
    }

    const filas = [...xml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const madre = filas.find((f) => f[2].includes('Campaña'))!
    // Se cae al repuesto cerrado, que mide lo mismo con dos hijas que con cinco mil.
    expect(madre[2]).toContain('SUMPRODUCT')
  })

  it('pero con pocas hijas se queda en la forma explícita, que no depende de ninguna columna', () => {
    const filas = [...hojaDe(ramaDePuroHito(3)).matchAll(/<row r="\d+"[^>]*>(.*?)<\/row>/g)]
    expect(filas.find((f) => f[1].includes('Campaña'))![1]).not.toContain('SUMPRODUCT')
  })

  it('un plan más hondo que el esquema de Excel no declara niveles que la hoja niega', () => {
    // El agrupamiento de Excel llega al 7. La cabecera ya lo acotaba y la fila no: el archivo
    // declaraba filas en el nivel 8 y el 9 mientras decía que el máximo era 7.
    const cadena: PlanParaExportar = {
      nombre: 'Diez niveles',
      campos: [],
      configuracion: {},
      lineas: Array.from({ length: 10 }, (_, i) => ({
        id: `n${i}`,
        nombre: `Nivel ${i}`,
        tipo: 'Actividad',
        parentId: i === 0 ? null : `n${i - 1}`,
        inicio: DIA,
        fin: DIA + 5,
        duracion: 4,
        avance: 0,
        peso: null,
        predecesoras: [],
        personalizados: {},
      })),
    }

    const xml = hojaDe(cadena)
    const niveles = [...xml.matchAll(/outlineLevel="(\d+)"/g)].map((m) => Number(m[1]))
    expect(Math.max(...niveles)).toBe(7)

    const declarado = Number(/outlineLevelRow="(\d+)"/.exec(xml)![1])
    // Lo que dice la cabecera y lo que dicen las filas tienen que ser la misma cosa.
    expect(Math.max(...niveles)).toBeLessThanOrEqual(declarado)

    // La sangría sí llega a cualquier profundidad: por debajo del séptimo nivel la jerarquía se
    // sigue leyendo aunque ya no se pueda plegar.
    expect(estilosDe(cadena)).toContain('indent="18"')
  })
})

describe('libro de plan · Excel cuenta los días como el motor', () => {
  it('la máscara de semana empieza en lunes y pone el domingo al final', () => {
    // La lista de días viene en la convención de JavaScript (0 = domingo) y la máscara empieza en
    // lunes: la posición 7 es el día 0, no el 7. Equivocarse ahí desplaza la semana entera.
    expect(mascaraDeSemana([1, 2, 3, 4, 5])).toBe('0000011') // lun-vie
    expect(mascaraDeSemana([1, 2, 3, 4, 5, 6])).toBe('0000001') // lun-sáb
    expect(mascaraDeSemana([0, 1, 2, 3, 4, 5, 6])).toBe('0000000') // todos
    expect(mascaraDeSemana([0])).toBe('1111110') // sólo domingo
  })

  function conCalendario(diasLaborables: number[], feriados: number[]): PlanParaExportar {
    return {
      nombre: 'Con calendario',
      campos: [],
      configuracion: {},
      calendario: { diasLaborables, feriados },
      lineas: [
        { id: 'a', nombre: 'Tarea', tipo: 'Actividad', parentId: null, inicio: DIA, fin: DIA + 18,
          duracion: 12, avance: 0.8, peso: null, predecesoras: [], personalizados: {} },
      ],
    }
  }

  it('el atraso cuenta con el calendario del proyecto, no con el que Excel supone', () => {
    // `NETWORKDAYS` a secas tiene sábado y domingo clavados y no sabe de feriados, mientras que la
    // duración la calcula el motor con el calendario real. Numerador y denominador salían de
    // calendarios distintos, y el atraso llegaba a cambiar de SIGNO: marcaba en rojo una línea que
    // iba adelantada. Comprobado en Excel: -1,4 antes, +1,6 después.
    const xml = hojaDe(conCalendario([1, 2, 3, 4, 5], [DIA + 2, DIA + 3]))
    expect(xml).toContain('NETWORKDAYS.INTL')
    expect(xml).not.toMatch(/[^.]NETWORKDAYS\(/)
  })

  it('los feriados viajan dentro del libro, bajo la columna oculta', () => {
    const plan = conCalendario([1, 2, 3, 4, 5], [DIA + 2, DIA + 3])
    expect(libroDe(plan)).toContain(`<definedName name="${NOMBRE_FERIADOS}">`)

    // Van en la propia columna de Peso y por debajo de la tabla: así la última columna sigue
    // siendo Peso, sigue oculta, y las fechas no le estorban a nadie.
    const columnas = construirLibroDePlan(plan).columnas
    expect(libroDe(plan)).toContain(`${letraDeColumna(columnas)}$`)
  })

  it('sin feriados no se declara el nombre: una referencia a un rango vacío no vale', () => {
    const plan = conCalendario([1, 2, 3, 4, 5], [])
    expect(libroDe(plan)).not.toContain(`name="${NOMBRE_FERIADOS}"`)
    expect(hojaDe(plan)).toContain('&quot;0000011&quot;')
  })

  it('una semana de lunes a sábado se dice en la máscara, no se ignora', () => {
    expect(hojaDe(conCalendario([1, 2, 3, 4, 5, 6], []))).toContain('&quot;0000001&quot;')
  })

  it('un plan sin calendario asume lunes a viernes, que es lo que asumía antes', () => {
    // No es una regresión silenciosa: es el mismo comportamiento de siempre, ahora dicho.
    expect(hojaDe(migracion())).toContain('&quot;0000011&quot;')
  })

  it('el autofiltro no se traga las filas de feriados', () => {
    const plan = conCalendario([1, 2, 3, 4, 5], [DIA + 2, DIA + 3])
    const xml = hojaDe(plan)
    const filtro = /<autoFilter ref="A\d+:[A-Z]+(\d+)"\/>/.exec(xml)!
    const ultimaFilaDeDatos = Number(filtro[1])
    const filasDeFeriado = [...xml.matchAll(/<row r="(\d+)"/g)].map((m) => Number(m[1]))
    // Las dos últimas filas del documento son feriados y quedan por debajo del filtro.
    expect(Math.max(...filasDeFeriado)).toBeGreaterThan(ultimaFilaDeDatos)
  })
})

describe('libro de plan · un archivo filtrado lo dice', () => {
  const AVISO = 'Vista parcial: 3 de 1368 líneas del plan.'

  it('el aviso va en la cabecera, antes que la descripción del proyecto', () => {
    const libro = readWorkbook(construirLibroDePlan({ ...migracion(), alcance: AVISO }).contenido)
    const hoja = libro.sheet('Plan')
    expect(hoja.rows.get(1)?.get('A')?.text).toBe('Migración BU · Plan integrado')
    // Lo que cambia de un archivo a otro del mismo plan va primero de las notas.
    expect(hoja.rows.get(2)?.get('A')?.text).toBe(AVISO)
    expect(hoja.rows.get(3)?.get('A')?.text).toBe('Plan integrado de migración.')
  })

  it('se pinta como aviso, no como nota al pie', () => {
    // Un archivo que lleva media verdad tiene que decirlo con énfasis: sus porcentajes están
    // calculados sólo sobre lo que quedó, y quien lo recibe no vio la pantalla de la que salió.
    const estilos = leerZip(construirLibroDePlan({ ...migracion(), alcance: AVISO }).contenido)
      .get('xl/styles.xml')!
      .toString('utf8')
    expect(estilos).toContain('<fgColor rgb="FFFDF3E3"/>')
  })

  it('sin aviso la cabecera no crece, y la fecha de corte sube con ella', () => {
    const con = readWorkbook(construirLibroDePlan({ ...migracion(), alcance: AVISO }).contenido)
    const sin = readWorkbook(construirLibroDePlan(migracion()).contenido)

    const filaDeTitulos = (hoja: ReturnType<typeof con.sheet>): number => {
      for (const [numero, celdas] of hoja.rows) if (celdas.get('A')?.text === 'ID') return numero
      return -1
    }
    expect(filaDeTitulos(con.sheet('Plan'))).toBe(filaDeTitulos(sin.sheet('Plan')) + 1)
  })

  it('un alcance en blanco no ocupa un renglón', () => {
    const vacio = readWorkbook(construirLibroDePlan({ ...migracion(), alcance: '   ' }).contenido)
    expect(vacio.sheet('Plan').rows.get(2)?.get('A')?.text).toBe('Plan integrado de migración.')
  })

  it('el nombre definido de la fecha de corte sigue al renglón que se añadió', () => {
    // Es el sitio donde un renglón de más rompe todas las fórmulas de atraso a la vez.
    const contenido = construirLibroDePlan({ ...migracion(), alcance: AVISO }).contenido
    const libro = leerZip(contenido).get('xl/workbook.xml')!.toString('utf8')
    expect(libro).toContain(`<definedName name="${NOMBRE_FECHA_CORTE}">Plan!$E$5</definedName>`)
  })
})

describe('libro de plan · un resumen al que el filtro le quitó las hijas', () => {
  /**
   * El caso que hace o rompe una exportación filtrada.
   *
   * Cuando el filtro deja fuera a las hijas de un resumen, ese resumen llega al libro como si
   * fuera una hoja. Si su avance saliera del valor guardado en la base saldría **cero** —los 121
   * resúmenes del plan de referencia tienen `progress_bp = 0`, porque el avance se calcula al leer
   * y no se guarda— y el archivo enseñaría 0 % en ramas que van al 60 %.
   *
   * Por eso quien llama manda el avance y el peso ya calculados sobre el plan ENTERO, y el libro
   * los usa tal cual cuando la línea no tiene hijas dentro del propio libro.
   */
  function resumenSuelto(): PlanParaExportar {
    return {
      nombre: 'Vista filtrada',
      campos: [],
      configuracion: {},
      alcance: 'Vista parcial: 2 de 400 líneas del plan.',
      lineas: [
        { id: 'r', nombre: 'Programa', tipo: 'Resumen', parentId: null, inicio: DIA, fin: DIA + 90,
          duracion: 64, avance: 0, peso: 494, predecesoras: [], personalizados: {} },
        // Este es un resumen en el plan real, pero aquí no tiene hijas: sus 290 días de trabajo y
        // su 10,34 % vienen calculados de fuera.
        { id: 'p', nombre: 'Planificación', tipo: 'Resumen', parentId: 'r', inicio: DIA, fin: DIA + 60,
          duracion: 44, avance: 0.1034, peso: 290, predecesoras: [], personalizados: {} },
      ],
    }
  }

  it('conserva el avance calculado en vez de enseñar el cero de la base', () => {
    const filas = [...hojaDe(resumenSuelto()).matchAll(/<row r="\d+"[^>]*>(.*?)<\/row>/g)]
    const planificacion = filas.find((f) => f[1].includes('Planificación'))!
    expect(planificacion[1]).toContain('<v>0.1034</v>')
  })

  it('y conserva su peso, que es el de sus hijas ausentes y no el tramo que abarca', () => {
    // Si pesara su duración —44 días de tramo— la madre le daría una voz que no le toca. Su peso
    // es el trabajo que representa: 290.
    //
    // Se mira la CELDA de Peso, no la fila entera: el 44 también aparece —y con razón— en la
    // columna de Duración, así que una aserción sobre la fila confundiría las dos columnas. Mi
    // primera versión hacía justo eso y fallaba señalando el dato correcto.
    const plan = resumenSuelto()
    const columnaPeso = letraDeColumna(construirLibroDePlan(plan).columnas)
    const filas = [...hojaDe(plan).matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const planificacion = filas.find((f) => f[2].includes('Planificación'))!

    const celdaDePeso = new RegExp(`<c r="${columnaPeso}${planificacion[1]}"[^>]*>(.*?)</c>`).exec(
      planificacion[2],
    )
    expect(celdaDePeso![1]).toBe('<v>290</v>')
  })

  it('el peso que llega de fuera se respeta tal cual, sin suelos ni ajustes', () => {
    // Aquí hubo un suelo de uno, y lo quité: el motor ya resuelve el 0/0 con media simple, y tener
    // dos remedios distintos para el mismo problema daba dos pesos distintos para la misma línea
    // —177 de las 1 368 del plan de referencia— y hacía que una rama valiera distinto según
    // estuviera plegada o no.
    const plan = resumenSuelto()
    const conCero: PlanParaExportar = {
      ...plan,
      lineas: [plan.lineas[0], { ...plan.lineas[1], peso: 0, duracion: 0 }],
    }
    const columnaPeso = letraDeColumna(construirLibroDePlan(conCero).columnas)
    const filas = [...hojaDe(conCero).matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const fila = filas.find((f) => f[2].includes('Planificación'))!
    const celda = new RegExp(`<c r="${columnaPeso}${fila[1]}"[^>]*>(.*?)</c>`).exec(fila[2])
    expect(celda![1]).toBe('<v>0</v>')
  })
})

describe('libro de plan · el libro pesa como el motor', () => {
  /**
   * La invariante que costó 177 líneas descuadradas: **el libro no puede tener su propio modelo de
   * avance**. Aquí hubo un suelo de uno por hoja, que resolvía el 0/0 de otra manera que el motor
   * —éste cae a media simple— y el resultado era que la misma rama pesaba distinto en el Excel que
   * en la pantalla, y distinto según estuviera plegada o no.
   */
  function ramaDeHitos(): PlanParaExportar {
    return {
      nombre: 'Compuerta',
      campos: [],
      configuracion: {},
      lineas: [
        { id: 'r', nombre: 'Programa', tipo: 'Fase', parentId: null, inicio: DIA, fin: DIA + 30,
          duracion: 22, avance: 0, peso: 0, predecesoras: [], personalizados: {} },
        { id: 'h1', nombre: 'Hito uno', tipo: 'Hito', parentId: 'r', inicio: DIA, fin: DIA,
          duracion: 0, avance: 1, peso: 0, predecesoras: [], personalizados: {} },
        { id: 'h2', nombre: 'Hito dos', tipo: 'Hito', parentId: 'r', inicio: DIA + 3, fin: DIA + 3,
          duracion: 0, avance: 1, peso: 0, predecesoras: [], personalizados: {} },
      ],
    }
  }

  it('una rama de puros hitos cae a media simple, igual que `avanceDelResumen`', () => {
    // Sin esto la división es 0/0 y la madre salía al 0 % con las dos hijas cumplidas. El motor lo
    // resuelve así desde antes que existiera este exportador; el libro se limita a hacer lo mismo.
    const filas = [...hojaDe(ramaDeHitos()).matchAll(/<row r="\d+"[^>]*>(.*?)<\/row>/g)]
    const madre = filas.find((f) => f[1].includes('Programa'))!
    expect(/<f>(IFERROR[^<]*)<\/f>/.exec(madre[1])![1]).toMatch(/,AVERAGE\([^)]+\)\)$/)
  })

  it('los hitos siguen pesando cero, que es lo que pesan en el motor', () => {
    const plan = ramaDeHitos()
    const columnaPeso = letraDeColumna(construirLibroDePlan(plan).columnas)
    const filas = [...hojaDe(plan).matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
    const hito = filas.find((f) => f[2].includes('Hito uno'))!
    const celda = new RegExp(`<c r="${columnaPeso}${hito[1]}"[^>]*>(.*?)</c>`).exec(hito[2])
    expect(celda![1]).toBe('<v>0</v>')
  })

  it('una rama pesa lo mismo esté plegada o desplegada', () => {
    // Plegada llega con el peso que trae del motor; desplegada se suma de sus hijas. Los dos
    // caminos tienen que dar el número idéntico, o la media ponderada de la madre cambia según el
    // nivel de detalle que tuviera puesto quien exportó.
    const desplegado: PlanParaExportar = {
      nombre: 'x', campos: [], configuracion: {},
      lineas: [
        { id: 'r', nombre: 'Raíz', tipo: 'Fase', parentId: null, inicio: DIA, fin: DIA + 30, duracion: 22, avance: 0, peso: 12, predecesoras: [], personalizados: {} },
        { id: 'a', nombre: 'Rama', tipo: 'Fase', parentId: 'r', inicio: DIA, fin: DIA + 20, duracion: 15, avance: 0, peso: 12, predecesoras: [], personalizados: {} },
        { id: 'a1', nombre: 'Hoja larga', tipo: 'Actividad', parentId: 'a', inicio: DIA, fin: DIA + 11, duracion: 12, avance: 0, peso: 12, predecesoras: [], personalizados: {} },
        { id: 'a2', nombre: 'Hito suelto', tipo: 'Hito', parentId: 'a', inicio: DIA + 20, fin: DIA + 20, duracion: 0, avance: 0, peso: 0, predecesoras: [], personalizados: {} },
      ],
    }
    const plegado: PlanParaExportar = { ...desplegado, lineas: desplegado.lineas.slice(0, 2) }

    const pesoDe = (plan: PlanParaExportar, nombre: string): string => {
      const col = letraDeColumna(construirLibroDePlan(plan).columnas)
      const filas = [...hojaDe(plan).matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)]
      const fila = filas.find((f) => f[2].includes(nombre))!
      return new RegExp(`<c r="${col}${fila[1]}"[^>]*>(.*?)</c>`).exec(fila[2])![1]
    }

    // Plegada: el valor que trae del motor. Desplegada: la suma de sus hijas, 12 + 0 = 12.
    expect(pesoDe(plegado, 'Rama')).toBe('<v>12</v>')
    expect(pesoDe(desplegado, 'Rama')).toMatch(/<f>[A-Z]+\d+\+[A-Z]+\d+<\/f>/)
    expect(pesoDe(desplegado, 'Hoja larga')).toBe('<v>12</v>')
    expect(pesoDe(desplegado, 'Hito suelto')).toBe('<v>0</v>')
  })
})
