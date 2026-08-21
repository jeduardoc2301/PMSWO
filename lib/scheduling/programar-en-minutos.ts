/**
 * El pase adelante en minutos laborables (§2 y §3.3).
 *
 * Es el mismo cálculo que hace `schedulePlan`, contado en la otra unidad: dónde puede empezar cada
 * línea lo antes posible, respetando lo que la amarra. La diferencia es que aquí una tarea puede
 * empezar a las dos de la tarde.
 *
 * ## Por qué vive al lado del de días y no en su lugar
 *
 * Cambiar de unidad el motor que calcula las fechas de 1 368 líneas no es una refactorización: es
 * volver a escribir la pieza de la que cuelgan la ruta crítica, las holguras, el roll-up y las seis
 * vistas. Hacerlo de golpe y comprobarlo después es cómo se rompe un plan sin que nadie se entere
 * hasta la reunión de seguimiento.
 *
 * Así que se escribe al lado, se **demuestra que dice lo mismo** sobre el plan real —1 368 líneas,
 * 1 665 vínculos, 394 de ellos con desfase— y sólo entonces tiene sentido plantearse el cambio. Es
 * el mismo camino que siguieron las columnas de minutos: primero al lado, luego encima.
 *
 * ## Las cuatro reglas, y el `+1` que aquí no está
 *
 * El motor de días dice que un `FS` empieza en `finDeLaPredecesora + 1`, porque su fin es el
 * **último día** que se trabaja y el sucesor arranca al siguiente. En minutos ese `+1` no existe y
 * ponerlo sería un día entero de más: el fin es el instante en que se deja de trabajar, y el
 * sucesor empieza en el primer minuto laborable a partir de ahí —que es el lunes a las nueve cuando
 * la predecesora cierra el viernes a las seis, y las dos de la tarde cuando cierra a la una—.
 *
 * ## Las restricciones que empujan
 *
 * Las tres del §3.4 que mueven una fecha —`NO_ANTES_DE`, `DEBE_EMPEZAR_EL` y `NO_TERMINA_ANTES_DE`—
 * se aplican igual que en el motor de días y por la misma razón: sin ellas, este módulo no puede
 * compararse con el otro sobre el plan real, donde las 1 368 líneas van ancladas a la fecha que
 * declara el archivo. Las tres que sólo **comprometen** no aparecen, tampoco allí: son promesas, no
 * empujones, y quien las cobra es el pase atrás con holgura negativa.
 *
 * ## Lo que todavía no hace
 *
 * No hay pase atrás, así que no calcula holguras ni ruta crítica, y no tiene en cuenta las
 * ausencias de quien lleva cada línea. Las dos cosas están en el motor de días y ahí siguen. Se
 * dice aquí porque un módulo a medio camino que no anuncia dónde está es una trampa para el
 * siguiente que lo lea.
 */

import { type DependencyGraph, buildDependencyGraph } from './dependencies'
import { type IsoDate } from './date'
import { MINUTOS_POR_DIA, type Instante, type Reloj, fechaDe, instanteDe } from './reloj'
import { type Dependency, type PlanTask } from './types'

export interface EntradaEnMinutos {
  readonly tasks: readonly PlanTask[]
  readonly dependencies: readonly Dependency[]
  /** El reloj laborable del proyecto: su calendario y su jornada. */
  readonly reloj: Reloj
  /** Primer día del plan. */
  readonly comienzo: IsoDate
}

export interface LineaEnMinutos {
  readonly comienzo: Instante
  readonly fin: Instante
  /** Minutos laborables que dura. Cero en un hito. */
  readonly duracion: number
}

export interface ProgramaEnMinutos {
  readonly porId: ReadonlyMap<string, LineaEnMinutos>
  /** El primer instante laborable del plan. */
  readonly comienzo: Instante
  /** El último instante en que se trabaja: el fin más tardío de todas las líneas. */
  readonly fin: Instante
}

/**
 * Minutos que dura una línea.
 *
 * Los suyos cuando los tiene, y la duración en días llevada a minutos cuando no. Es lo que permite
 * programar un plan a medio migrar sin que las líneas sin minutos se queden en cero.
 */
export function duracionEnMinutos(task: PlanTask, minutosPorJornada: number): number {
  if (task.duracionMin !== undefined) return Math.max(task.duracionMin, 0)
  return Math.max(task.duration, 0) * minutosPorJornada
}

export function programarEnMinutos(entrada: EntradaEnMinutos): ProgramaEnMinutos {
  const { reloj, tasks, dependencies } = entrada
  const jornada = reloj.jornada.minutos
  const graph: DependencyGraph = buildDependencyGraph(tasks, dependencies)

  const arranque = reloj.abrir(instanteDe(entrada.comienzo))
  const porId = new Map<string, LineaEnMinutos>()

  for (const id of graph.order) {
    const task = graph.taskById.get(id)!
    const duracion = duracionEnMinutos(task, jornada)

    let comienzo = arranque
    for (const vinculo of graph.incoming.get(id)!) {
      const pedido = comienzoQuePide(vinculo, porId, duracion, jornada, reloj)
      if (pedido > comienzo) comienzo = pedido
    }

    // La restricción se aplica al final, sobre lo que pidieron las predecesoras, igual que en el
    // motor de días.
    if (task.constraint) {
      const fijada = reloj.abrir(instanteDe(task.constraint.date))
      if (task.constraint.type === 'DEBE_EMPEZAR_EL') {
        // La única que pisa hacia atrás: quien la pone dice «este día y no otro». Lo que no puede
        // pisar es el arranque del plan, o el plan empezaría antes que él mismo.
        comienzo = Math.max(arranque, fijada)
      } else if (task.constraint.type === 'NO_TERMINA_ANTES_DE') {
        // Amarra el fin: se retrocede la duración desde el cierre de ese día para saber cuándo
        // habría que empezar. Una tarea de cinco jornadas que no puede cerrar antes del viernes
        // abre el lunes.
        const desdeElFin = reloj.restar(reloj.sumar(fijada, jornada), duracion)
        if (desdeElFin > comienzo) comienzo = desdeElFin
      } else if (task.constraint.type === 'NO_ANTES_DE' && fijada > comienzo) {
        comienzo = fijada
      }
    }

    /**
     * Normalizar el comienzo convierte «el instante en que la predecesora dejó de trabajar» en «el
     * primer minuto en que se puede empezar»: el lunes a las nueve, o las dos de la tarde si la
     * predecesora cerró a la una.
     *
     * Salvo en un hito, que no es trabajo sino una marca. Si cae justo donde el trabajo se detiene
     * —un `FF+0` contra una tarea que cierra el miércoles a las seis— se queda ahí, porque lo que
     * marca es ese fin. Abrirlo lo mandaría al jueves por la mañana: el mismo instante de trabajo
     * acumulado y otro día en el calendario, que es el que la gente lee. Son 47 hitos del plan de
     * referencia, y cada uno un día de más.
     */
    const enUnCierre = reloj.cerrar(comienzo) === comienzo
    comienzo = duracion === 0 && enUnCierre ? comienzo : reloj.abrir(comienzo)
    // El fin de un hito es su comienzo, sin volver a normalizar: el comienzo ya se normalizó arriba
    // con la regla del hito, y `sumar(t, 0)` abriría otra vez lo que se acaba de decidir cerrar.
    porId.set(id, { comienzo, fin: duracion === 0 ? comienzo : reloj.sumar(comienzo, duracion), duracion })
  }

  let fin = arranque
  for (const linea of porId.values()) if (linea.fin > fin) fin = linea.fin

  return { porId, comienzo: arranque, fin }
}

/**
 * Qué comienzo pide un vínculo, en minutos.
 *
 * `FF` y `SF` amarran el fin, así que se retrocede la duración desde el fin exigido. Se retrocede
 * con el reloj y no restando un número de días: entre el fin y el comienzo puede haber fines de
 * semana, festivos y horas de comida, y ninguno de los tres se cuenta.
 */
function comienzoQuePide(
  vinculo: Dependency,
  porId: ReadonlyMap<string, LineaEnMinutos>,
  duracion: number,
  jornada: number,
  reloj: Reloj,
): Instante {
  const predecesora = porId.get(vinculo.predecessorId)
  // Una predecesora que no está en el plan no puede empujar a nadie. El grafo ya rechaza los
  // vínculos colgando de nada, así que esto es un cinturón, no una regla.
  if (!predecesora) return Number.NEGATIVE_INFINITY

  // El desfase viaja en días mientras el modelo lo guarde así (§2.2 lo quiere en minutos con
  // signo). Se convierte aquí, en un solo sitio, para que el día que la columna cambie de unidad
  // haya que tocar una línea.
  const desfase = vinculo.lag * jornada

  /**
   * El comienzo de la predecesora, visto por quien se ata a él.
   *
   * Un hito no consume tiempo, así que su instante cae donde lo dejó lo que lo empuja —a menudo el
   * cierre de una jornada, si lo ata un `FF`—. Para quien se ata a su **comienzo** eso sería el
   * final del día, y una tarea que arranca «cuando se cierra la fase» arrancaría a la mañana
   * siguiente. No es lo que dice el archivo de MS Project del que sale el plan de referencia, ni lo
   * que hace MS Project: un hito marca un punto del día, y quien arranca con él arranca ese día.
   *
   * Así que para un hito se toma la apertura de su propio día. Para todo lo demás, su comienzo tal
   * cual: una tarea que empieza a las dos de la tarde arrastra a su `SS` a las dos de la tarde, que
   * es justo la precisión que este motor viene a dar.
   */
  const comienzoDeLaPredecesora =
    predecesora.duracion === 0
      ? reloj.abrir(instanteDe(fechaDe(predecesora.comienzo)))
      : predecesora.comienzo

  /**
   * Sumar o restar **cero** no es moverse, y en este reloj no es inocuo: `sumar(x, 0)` abre y
   * `restar(x, 0)` cierra, porque los dos normalizan a un borde. Encadenados sobre un desfase nulo
   * o una duración nula —un hito— eso corre la fecha un día en el calendario sin corregir ni un
   * minuto de trabajo. Así que el cero no llama al reloj.
   */
  const conDesfase = (x: Instante): Instante => (desfase === 0 ? x : reloj.sumar(x, desfase))
  const menosDuracion = (x: Instante): Instante => (duracion === 0 ? x : reloj.restar(x, duracion))

  switch (vinculo.type) {
    // `FS` es el único que pide el instante **siguiente**: la sucesora empieza cuando la
    // predecesora ya terminó. Se abre aquí y no en la normalización de la línea, porque un hito se
    // queda donde lo dejen y con un `FS` el sitio correcto es el día de después.
    case 'FS':
      return reloj.abrir(conDesfase(predecesora.fin))
    case 'SS':
      return conDesfase(comienzoDeLaPredecesora)
    case 'FF':
      return menosDuracion(conDesfase(predecesora.fin))
    case 'SF':
      return menosDuracion(conDesfase(comienzoDeLaPredecesora))
  }
}

/**
 * El pase atrás en minutos (§3.3): hasta cuándo puede terminar cada línea sin mover el cierre.
 *
 * Es el espejo del de adelante y comparte su sitio en el mundo: va **al lado** del de días, se
 * compara con él sobre el plan real, y no lo usa ninguna pantalla todavía.
 *
 * ## La holgura total y la libre no son la misma pregunta
 *
 * La **total** dice cuánto se puede atrasar la línea sin mover la fecha de cierre del plan. La
 * **libre**, cuánto sin mover a ninguna sucesora de donde está hoy. Una tarea con tres jornadas de
 * total y cero de libre se puede atrasar tres días sin tocar la entrega, pero al primer minuto ya
 * empujó a quien venía detrás. Las dos se calculan con la misma fórmula por tipo de vínculo,
 * cambiando las fechas tardías de las sucesoras por las tempranas.
 *
 * ## Los cuatro techos del fin tardío
 *
 * Además de lo que piden las sucesoras, el fin tardío tiene cuatro topes, y los cuatro dicen «no
 * más tarde de aquí»:
 *
 * 1. **El cierre del plan**, o el `deadline` si se pasa uno. Sin este techo, una línea cuyo único
 *    vínculo saliente es laxo saldría con holgura aunque sea ella la que fija la fecha de cierre.
 * 2. **El compromiso propio** de la línea: su `dueDate`, o un `DEBE_TERMINAR_EL` /
 *    `NO_TERMINA_DESPUES_DE`. Son los casos 9 y 10 del §12: sin esto, una línea con fecha límite el
 *    1 de marzo que la cadena empuja al 5 sale en verde porque el plan entero cierra en noviembre.
 * 3. **`NO_EMPIEZA_DESPUES_DE`**, que amarra el arranque: su techo del fin es esa fecha más lo que
 *    dura la línea.
 * 4. **La política de las terminales**: con `FIN_PROPIO`, una línea sin sucesoras no llega hasta el
 *    cierre del plan sino hasta su propio fin, y su holgura es cero.
 */
export interface OpcionesDeHolgura {
  /**
   * Fecha comprometida del plan. El techo de todos los fines tardíos es el día **anterior**, igual
   * que en el motor de días: una entrega comprometida para el 30 significa terminar el 29.
   */
  readonly deadline?: IsoDate
  /**
   * Qué hacer con una línea sin sucesoras. `CIERRE_DEL_PLAN` le da hasta el final —es lo que hace
   * un CPM de manual— y `FIN_PROPIO` la deja en su propio fin, con holgura cero.
   */
  readonly terminales?: 'CIERRE_DEL_PLAN' | 'FIN_PROPIO'
}

export interface HolgurasEnMinutos {
  readonly finTardio: ReadonlyMap<string, Instante>
  readonly comienzoTardio: ReadonlyMap<string, Instante>
  /** Holgura total, en minutos laborables. Negativa cuando la línea ya no llega. */
  readonly total: ReadonlyMap<string, number>
  /** Holgura libre, en minutos laborables. */
  readonly libre: ReadonlyMap<string, number>
}

export function holgurasEnMinutos(
  entrada: EntradaEnMinutos,
  programa: ProgramaEnMinutos,
  opciones: OpcionesDeHolgura = {},
): HolgurasEnMinutos {
  const { reloj, tasks, dependencies } = entrada
  const graph = buildDependencyGraph(tasks, dependencies)
  const jornada = reloj.jornada.minutos

  /**
   * Hasta cuándo se puede trabajar en este plan.
   *
   * Con `deadline`, hasta el **cierre de ese mismo día**: comprometerse para el 8 es terminar el 8.
   * Lo escribí al revés la primera vez —«terminar el 7»— y lo desmintió la comparación con el motor
   * de días, que sólo retrocede la fecha cuando cae en día no laborable. Es la diferencia entre
   * regalar una jornada de holgura a todo el plan y no regalarla.
   */
  const cierre =
    opciones.deadline === undefined
      ? programa.fin
      : reloj.cerrar(instanteDe(opciones.deadline, MINUTOS_POR_DIA))

  const finTardio = new Map<string, Instante>()
  const comienzoTardio = new Map<string, Instante>()
  const total = new Map<string, number>()
  const libre = new Map<string, number>()

  // Las tempranas, en el mismo formato que las tardías, para que la holgura libre use exactamente
  // la misma fórmula cambiando sólo de qué mapa lee.
  const comienzoTemprano = new Map<string, Instante>()
  const finTemprano = new Map<string, Instante>()
  for (const [id, linea] of programa.porId) {
    comienzoTemprano.set(id, linea.comienzo)
    finTemprano.set(id, linea.fin)
  }

  for (let i = graph.order.length - 1; i >= 0; i -= 1) {
    const id = graph.order[i]
    const linea = programa.porId.get(id)!
    const salientes = graph.outgoing.get(id)!

    // El techo de todas es el cierre del plan —o el compromiso, si lo hay—. Sin él, una línea cuyo
    // único vínculo saliente es laxo saldría con holgura aunque sea ella la que fija la fecha.
    let tardio = cierre
    if (salientes.length === 0) {
      if (opciones.terminales === 'FIN_PROPIO') tardio = linea.fin
    } else {
      for (const vinculo of salientes) {
        const permitido = finQuePermite(vinculo, comienzoTardio, finTardio, linea.duracion, jornada, reloj)
        if (permitido < tardio) tardio = permitido
      }
    }

    // El compromiso propio de la línea es techo igual que el cierre del plan.
    const task = graph.taskById.get(id)!
    const comprometido = topeComprometidoEnMinutos(task, reloj)
    if (comprometido !== undefined && comprometido < tardio) tardio = comprometido

    // `NO_EMPIEZA_DESPUES_DE` amarra el arranque: su techo del fin es esa fecha más lo que dura.
    const snlt =
      task.constraint?.type === 'NO_EMPIEZA_DESPUES_DE'
        ? task.constraint
        : task.compromiso?.type === 'NO_EMPIEZA_DESPUES_DE'
          ? task.compromiso
          : null
    if (snlt) {
      const arranqueMaximo = reloj.cerrar(instanteDe(snlt.date))
      const finMaximo = linea.duracion === 0 ? arranqueMaximo : reloj.sumar(arranqueMaximo, linea.duracion)
      if (finMaximo < tardio) tardio = finMaximo
    }

    finTardio.set(id, tardio)
    // El comienzo tardío de un hito es la apertura de su propio día, no el retroceso desde su fin
    // —que no se movería, porque no dura—. Es la misma regla que en el pase adelante y por lo
    // mismo: un hito marca un punto del día, así que quien se ata a su comienzo se ata a ese día.
    // Sin esto, la predecesora de un hito por `FS` no tenía de dónde retroceder y salía con una
    // jornada de holgura de más.
    comienzoTardio.set(
      id,
      linea.duracion === 0 ? reloj.abrir(instanteDe(fechaDe(tardio))) : reloj.restar(tardio, linea.duracion),
    )
    /**
     * Desde dónde se mide la holgura de un hito.
     *
     * Un hito no dura, así que su instante cae donde lo dejó su vínculo: la apertura de su día si
     * lo empuja un `FS`, el cierre si lo ata un `FF`. Medir la holgura desde la apertura le regala
     * la jornada entera de ese día —el hito no la trabaja, pero tampoco la tiene libre: el día ya
     * pasó—. Se mide desde el cierre de su propio día, que es lo que cuenta el motor de días al
     * restar ordinales.
     */
    const desdeDonde =
      linea.duracion === 0
        ? reloj.sumar(reloj.abrir(instanteDe(fechaDe(linea.fin))), jornada)
        : linea.fin
    const holguraTotal = reloj.entre(desdeDonde, tardio)
    total.set(id, holguraTotal)

    if (salientes.length === 0) {
      libre.set(id, holguraTotal)
    } else {
      let permitidoLibre = Number.POSITIVE_INFINITY
      for (const vinculo of salientes) {
        const permitido = finQuePermite(vinculo, comienzoTemprano, finTemprano, linea.duracion, jornada, reloj)
        if (permitido < permitidoLibre) permitidoLibre = permitido
      }
      // La libre nunca supera a la total: si una sucesora tiene sitio de sobra, quien manda sigue
      // siendo el cierre del plan. Y nunca es negativa: eso lo dice la total.
      libre.set(id, Math.max(0, Math.min(reloj.entre(desdeDonde, permitidoLibre), holguraTotal)))
    }
  }

  return { finTardio, comienzoTardio, total, libre }
}

/**
 * Hasta cuándo puede terminar la predecesora sin empujar a esta sucesora.
 *
 * Los dos mapas que recibe deciden qué holgura se está calculando: con las fechas **tardías** de
 * las sucesoras sale la total, con las **tempranas** sale la libre. Es la misma tabla del pase
 * adelante leída al revés, y el `−1` del `FS` tampoco está aquí, por la misma razón que allí no
 * estaba el `+1`.
 */
function finQuePermite(
  vinculo: Dependency,
  comienzoDe: ReadonlyMap<string, Instante>,
  finDe: ReadonlyMap<string, Instante>,
  duracion: number,
  jornada: number,
  reloj: Reloj,
): Instante {
  const comienzoSucesora = comienzoDe.get(vinculo.successorId)
  const finSucesora = finDe.get(vinculo.successorId)
  if (comienzoSucesora === undefined || finSucesora === undefined) return Number.POSITIVE_INFINITY

  const desfase = vinculo.lag * jornada

  /**
   * Todo lo que sale de aquí es un **fin**, así que se dice en forma de cierre.
   *
   * `restar` devuelve comienzos —es su contrato— y un comienzo y un cierre pueden ser el mismo
   * instante de trabajo acumulado en dos días distintos del calendario: «el viernes a las nueve» y
   * «el jueves a las seis». Como fin, el bueno es el segundo. Sin esto, 1 023 de las 1 368 líneas
   * del plan real salían con una jornada de holgura de más, que es la forma cara de equivocarse:
   * una holgura inventada dice «esto puede esperar».
   */
  const comoFin = (instante: Instante): Instante => reloj.cerrar(instante)
  // El cero no llama al reloj, por lo mismo que en el pase adelante.
  const menosDesfase = (x: Instante): Instante => (desfase === 0 ? x : reloj.restar(x, desfase))
  const masDuracion = (x: Instante): Instante => (duracion === 0 ? x : reloj.sumar(x, duracion))

  switch (vinculo.type) {
    // `FS` y `FF` retroceden, y retroceder devuelve comienzos: hay que decirlo como fin. `SS` y
    // `SF` avanzan la duración, y avanzar ya devuelve un cierre — salvo en un hito, que no avanza
    // nada y se queda tal como vino.
    case 'FS':
      return comoFin(menosDesfase(comienzoSucesora))
    case 'SS':
      return masDuracion(menosDesfase(comienzoSucesora))
    case 'FF':
      return comoFin(menosDesfase(finSucesora))
    case 'SF':
      return masDuracion(menosDesfase(finSucesora))
  }
}

/**
 * El techo del fin que impone el compromiso propio de la línea, si tiene alguno.
 *
 * La promesa puede llegar por tres sitios: `dueDate`, o un `DEBE_TERMINAR_EL` /
 * `NO_TERMINA_DESPUES_DE` puesto en `constraint` o en `compromiso` —el segundo existe porque
 * `constraint` puede estar ocupado por el ancla que pone el servidor—. Manda la más apretada.
 *
 * El techo es el cierre de **ese mismo día**: prometer para el 4 es terminar el 4. Si la fecha cae
 * en día no laborable, el cierre del último día hábil anterior, que es lo que hace `cerrar`.
 */
function topeComprometidoEnMinutos(
  task: {
    readonly dueDate?: IsoDate
    readonly constraint?: { readonly type: string; readonly date: IsoDate }
    readonly compromiso?: { readonly type: string; readonly date: IsoDate }
  },
  reloj: Reloj,
): Instante | undefined {
  const fechas: IsoDate[] = []
  if (task.dueDate) fechas.push(task.dueDate)
  for (const c of [task.constraint, task.compromiso]) {
    if (!c) continue
    if (c.type === 'DEBE_TERMINAR_EL' || c.type === 'NO_TERMINA_DESPUES_DE') fechas.push(c.date)
  }
  if (fechas.length === 0) return undefined

  let tope: Instante | undefined
  for (const fecha of fechas) {
    const instante = reloj.cerrar(instanteDe(fecha, MINUTOS_POR_DIA))
    if (tope === undefined || instante < tope) tope = instante
  }
  return tope
}
