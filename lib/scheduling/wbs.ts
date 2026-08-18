/**
 * La numeración EDT del plan: 1, 1.1, 1.1.2, 2… (§2.3, §4.2, §6.2).
 *
 * ## Se calcula, no se guarda
 *
 * El §2.1 pide que los campos derivados los escriba solo el motor, y este es el ejemplo de manual:
 * el EDT de una línea es enteramente función de quién es su padre y en qué puesto está entre sus
 * hermanas. Guardarlo en una columna crearía dos verdades que se pueden contradecir, y el día que
 * se contradigan la que está mal es la de la base, que es justo la que se enseña.
 *
 * Hay además una razón práctica: mover una sola línea renumera todo lo que va detrás. Con la
 * numeración guardada, arrastrar una fase en un plan de mil líneas sería reescribir cientos de
 * registros; calculada, es recorrer un arreglo. En el plan real —1 368 líneas y siete niveles—
 * cuesta menos de un milisegundo.
 *
 * ## El orden es el del plan, no el de la consulta
 *
 * Las hermanas se numeran en el orden en que vienen. Quien llama es responsable de traerlas
 * ordenadas de forma estable; si no lo hace, el EDT bailaría entre recargas y dejaría de servir
 * para lo único que sirve: nombrar una línea en una reunión y que todos miren la misma.
 */

/** Lo mínimo que hace falta de una línea para numerarla. */
export interface LineaJerarquica {
  readonly id: string
  readonly parentId?: string | null
}

export interface NumeroDeLinea {
  readonly id: string
  /** `1.2.3`. Cadena y no número: `1.10` va después de `1.9`, y como número serían iguales. */
  readonly wbs: string
  /** Cuántos ancestros tiene. La raíz es cero. */
  readonly level: number
}

/**
 * Numera el plan entero.
 *
 * @param tasks Las líneas, ya en el orden en que se van a enseñar.
 * @returns Un número por línea, en el mismo orden que entraron.
 */
export function numerarPlan(tasks: readonly LineaJerarquica[]): NumeroDeLinea[] {
  const conocidas = new Set(tasks.map((t) => t.id))

  // Las hijas de cada padre, en el orden de entrada. Una línea cuyo padre no viene en el corte se
  // trata como raíz: es lo que se ve, y esconderla sería peor que numerarla de más.
  const hijasDe = new Map<string, LineaJerarquica[]>()
  const raices: LineaJerarquica[] = []
  for (const task of tasks) {
    const padre = task.parentId
    if (padre === undefined || padre === null || !conocidas.has(padre)) {
      raices.push(task)
      continue
    }
    const hermanas = hijasDe.get(padre)
    if (hermanas) hermanas.push(task)
    else hijasDe.set(padre, [task])
  }

  const numeros = new Map<string, NumeroDeLinea>()

  // Recorrido en profundidad con pila explícita: un plan de siete niveles no desborda la pila de
  // llamadas, pero uno mal formado con mil de profundidad sí, y colgar la vista por un dato torcido
  // no es una opción.
  const pila: { task: LineaJerarquica; prefijo: string; level: number }[] = []
  for (let i = raices.length - 1; i >= 0; i -= 1) {
    pila.push({ task: raices[i], prefijo: String(i + 1), level: 0 })
  }

  // Un ciclo entre padres —que la API puede entregar— haría infinito el recorrido.
  const visitadas = new Set<string>()

  while (pila.length > 0) {
    const { task, prefijo, level } = pila.pop()!
    if (visitadas.has(task.id)) continue
    visitadas.add(task.id)

    numeros.set(task.id, { id: task.id, wbs: prefijo, level })

    const hijas = hijasDe.get(task.id)
    if (!hijas) continue
    for (let i = hijas.length - 1; i >= 0; i -= 1) {
      pila.push({ task: hijas[i], prefijo: `${prefijo}.${i + 1}`, level: level + 1 })
    }
  }

  // Se devuelve en el orden de entrada, no en el del recorrido: quien llama tiene sus propias
  // filas y espera poder emparejarlas por posición.
  return tasks.map(
    (task) => numeros.get(task.id) ?? { id: task.id, wbs: '', level: 0 },
  )
}

/**
 * Compara dos EDT como los ordena un plan: 1.9 antes que 1.10, y 2 después de 1.10.
 *
 * Comparar las cadenas a secas pondría «1.10» antes que «1.9», porque el carácter `1` va antes que
 * el `9`. Es el mismo error que ordena las versiones de un programa al revés.
 */
export function compararWbs(a: string, b: string): number {
  const partesA = a === '' ? [] : a.split('.').map(Number)
  const partesB = b === '' ? [] : b.split('.').map(Number)

  for (let i = 0; i < Math.max(partesA.length, partesB.length); i += 1) {
    // La que se acaba antes es la ancestra, y una ancestra va delante de su descendencia.
    const na = partesA[i] ?? -1
    const nb = partesB[i] ?? -1
    if (na !== nb) return na - nb
  }
  return 0
}
