# Auditoría del módulo de Proyectos — 17 de agosto de 2026

Levantada contra `referencia/SpecModuloProyectos6Vistas.md` siguiendo su §0.1. **Todo lo que aparece
aquí se comprobó abriendo el código o consultando el esquema; nada se infirió por el nombre de un
archivo.** Las cifras de comportamiento salen de correr el sistema, no de leerlo.

---

## 1. Mapa del código actual

**Motor de programación.** `lib/scheduling/` — 21 módulos, ~5 500 líneas, sin una sola dependencia de
Prisma, React o red. Es aritmética pura sobre estructuras propias (`PlanTask`, `Dependency`), y por
eso se prueba entero sin base de datos. Piezas: `date.ts` (fechas civiles como número de día),
`calendar.ts` (calendario laboral con festivos), `schedule.ts` (pase adelante), `cpm.ts` (pase atrás
y holgura), `critical-path.ts` (ruta súper crítica), `dependencies.ts` (grafo y ciclos), `gantt.ts`
(trazado), `schedule-variance.ts` (estado y atraso al corte), `progress.ts` (acumulado ponderado),
`audit.ts` (17 controles), `holidays.ts`, `simulation.ts`, `import-plan.ts`, `xlsx.ts`.

**Puente con la base.** `services/schedule.service.ts` lee un proyecto y lo devuelve en el
vocabulario del motor; `services/plan-import.service.ts` escribe un archivo de plan como proyecto (y
`refreshProjectFromPlan` lo refresca sin pisar lo capturado); `services/dependency.service.ts`
captura y quita vínculos validando ciclos con el motor; `services/hierarchy.ts` valida la forma del
árbol. Es el único lugar donde los dos mundos se tocan.

**Vistas.** `app/[locale]/projects/[id]/project-detail-client.tsx` monta siete pestañas: Resumen,
Tablero Kanban, Elementos de Trabajo, Bloqueadores, Riesgos, Acuerdos y Timeline. Elementos de
Trabajo tiene dos modos (`components/projects/work-items-view.tsx`): **Esquema**
(`work-items-outline.tsx`, árbol multinivel con avance, corte y atraso) y **Lista**
(`work-items-list.tsx`, agrupada por fase con arrastre). El Timeline monta
`components/projects/plan-tab.tsx` → `components/plan/plan-workspace.tsx`, la misma pieza que la
pantalla `/[locale]/plan`.

**Gantt.** Propio, sin librería de terceros: `components/plan/gantt-chart.tsx` dibuja a partir de
`lib/scheduling/gantt.ts`, que devuelve geometría en días hábiles. Quien pinta multiplica por el
ancho de un día y no calcula nada más.

**API.** `app/api/v1/projects/[id]/schedule` (plan completo), `.../dependencies` (alta y baja de
vínculos), `.../work-items`, `app/api/v1/work-items/[id]` (PATCH con avance y jerarquía),
`.../kanban`.

**Modelo.** 26 modelos en `prisma/schema.prisma`. Los relevantes: `Project`, `WorkItem`,
`TaskDependency`, `ProjectCalendar`, `ProjectHoliday`, `KanbanColumn`, `Gate`, `GateCondition`,
`GateUnlock`.

---

## 2. Qué hace hoy el sistema

**Sólido y verificado.** El motor calcula pase adelante y atrás, holgura total, ruta crítica y ruta
súper crítica —la que distingue lo que no se recupera con más gente—. Reproduce el plan de
referencia de 1 368 líneas y 1 665 vínculos con **cierre 2026-11-30 exacto** y **312 líneas súper
críticas** repartidas 165 cliente / 147 proveedor. Los cuatro tipos de vínculo (FS/SS/FF/SF) están
implementados con desfase con signo, y los ciclos se detectan antes de escribir, nombrando las
líneas del ciclo. El calendario laboral existe con festivos calculados por regla (Colombia y México)
y simulación de su impacto. El avance de un resumen se acumula ponderado por trabajo. Hay 1 950
pruebas en verde, de las cuales unas 700 son del motor.

**Existe pero incompleto.** La jerarquía funciona (`parentId`, seis niveles en el plan real) pero no
hay `sortOrder` explícito: el orden entre hermanos sale de `templateOrder`, que es el número de fila
del archivo de origen. Las dependencias viven en la base pero **el motor no persiste lo que
calcula**: `earlyStart`, `totalFloat` e `isCritical` se recalculan en cada carga.

**No existe.** Calendario, Carga de trabajo y Panel de widgets: cero archivos, comprobado por
búsqueda. Tampoco: restricciones de tarea (`constraintType`/`deadline`), líneas base, numeración
EDT, asignación múltiple, estados configurables, campos personalizados, preferencias de vista,
tiempo real y deshacer.

---

## 3. Matriz de brechas

| # | Funcionalidad (§ del spec) | Estado | Dónde vive hoy | Qué falta exactamente | Esfuerzo | Riesgo |
|---|---|---|---|---|---|---|
| 1 | Duración en minutos laborables (§2.1) | **EXISTE PERO MAL** | `WorkItem.startDate`/`estimatedEndDate` `@db.Date` | No hay campo de duración: se deriva de fechas sin hora. Jornadas partidas imposibles | L | **Alto** |
| 2 | Progreso en basis points (§2.1) | **EXISTE PERO MAL** | `WorkItem.progressPct Float` | Es `Float` 0–1; el spec pide `Int` 0–10000 | S | Bajo |
| 3 | Fechas con hora en UTC (§2.1) | **EXISTE PERO MAL** | `@db.Date` en 5 campos | Fechas sin hora; una tarea no puede empezar a las 14:00 | L | **Alto** |
| 4 | Dinero en céntimos (§2.1) | **NO APLICA** | — | No hay presupuesto en el modelo todavía | — | — |
| 5 | Campos derivados escritos solo por el motor (§2.1) | **PARCIAL** | `lib/scheduling/cpm.ts` | El motor los calcula pero no los persiste; se recalculan en cada carga | M | Bajo |
| 6 | Dependencias FS/SS/FF/SF con lag (§3.2) | **EXISTE** | `TaskDependency.linkType`+`lagDays`, `services/dependency.service.ts` | Nada. Los 4 tipos, desfase con signo y ciclos detectados | — | — |
| 7 | Calendarios laborables (§3.1) | **PARCIAL** | `ProjectCalendar`, `ProjectHoliday`, `lib/scheduling/calendar.ts` | Existe día laborable y festivos; falta jornada horaria y calendarios por recurso | M | Medio |
| 8 | CPM: ruta crítica y holgura (§3.3) | **EXISTE** | `lib/scheduling/cpm.ts`, `critical-path.ts` | Nada. Holgura total, crítica y súper crítica, con 22 pruebas | — | — |
| 9 | Restricciones de tarea (§3.4) | **PARCIAL** | `WorkItem.constraintType/constraintDate`, `lib/scheduling/reschedule.ts` | Persistidos los dos tipos que el motor aplica; las otras seis del §3.4 no, a propósito | M | Bajo |
| 10 | Roll-up a resúmenes (§3.6) | **EXISTE** | `lib/scheduling/progress.ts` | Nada. Ponderado por trabajo, con hitos en peso cero | — | — |
| 11 | Carga y sobrecarga de recursos (§3.7) | **PARCIAL** | `Resource`, `Assignment`, `ResourceAbsence`, `services/resource.service.ts` | Falta `Assignment.work`; no hay alta/baja de asignación; la fórmula del §3.7 usa una constante en vez de minutos laborables | L | Medio |
| 12 | Jerarquía con `sortOrder` y EDT (§2.3) | **PARCIAL** | `lib/scheduling/wbs.ts` | El EDT no es estable: `templateOrder` nace nulo y añadir una línea renumera el plan. Falta `sortOrder`, el tope de 16 niveles y el EDT en el Gantt | M | Medio |
| 13 | Vista Gantt (§4) | **CERRADA** | `components/plan/gantt-chart.tsx`, `plan-workspace.tsx`, `fields-panel.tsx`, `lib/plan/gantt-columns.ts` | **8 de 8 criterios del §4.8, cada uno demostrado en pantalla** (ver la bitácora). Del §4.2 queda fuera el catálogo completo de columnas —presupuesto, tiempo registrado, campos personalizados— porque necesita modelos que no existen; del §4.3, las escalas de hora, día, trimestre y año. Son ampliaciones, no criterios | L | Medio |
| 14 | Vista Tablero (§5) | **PARCIAL** | `components/projects/kanban-board.tsx` | Kanban con arrastre, urgencias, avance y atraso. Falta: agrupar por algo distinto de la fase, columnas configurables | M | Bajo |
| 15 | Vista Lista (§6) | **CERRADA** | `work-items-outline.tsx`, `work-items-list.tsx`, `lib/projects/list-totals.ts` | **5 de 5 criterios del §6.3, cada uno demostrado en pantalla** (ver la bitácora). Del §6.2 queda fuera el panel de Campos propio y la exportación de la vista; de los totales, presupuesto y costo real, que no existen como campos | S | Bajo |
| 16 | Vista Calendario (§7) | **CERRADA** | `lib/scheduling/calendar-layout.ts`, `components/projects/calendar-view.tsx`, `calendar-tab.tsx`, `services/reschedule.service.ts` | **6 de 6 criterios del §7.5, cada uno demostrado en pantalla** (ver la bitácora). Del §7.2 quedan fuera la vista semanal, la de agenda y crear tarea arrastrando un rango: son mejoras propuestas, no criterios. Y el calendario del proyecto sólo se puede **leer**: no hay pantalla ni ruta para crearlo — brecha 27 | L | Bajo |
| 17 | Vista Carga de trabajo (§8) | **CERRADA** | `lib/scheduling/workload.ts`, `components/projects/workload-*.tsx` | **6 de 6 criterios del §8.5, cada uno demostrado en pantalla** (ver la bitácora). Es la única vista que no necesitó tocar código: estaba bien y lo que faltaba era recorrerla. Del §8.2 queda fuera el calendario por recurso —hay jornada diaria y ausencias, no semana laboral propia— | L | Medio |
| 18 | Vista Panel de control (§9) | **PARCIAL** | `lib/projects/dashboard-metrics.ts`, `components/projects/dashboard-*.tsx`, `services/project-dashboard.service.ts` | 4 widgets de 6; el botón Exportar del §9 está escrito y nunca se dibuja | L | Bajo |
| 27 | Calendario del proyecto: sólo lectura | **NO EXISTE** | `services/project-calendar.service.ts` (sólo `load*`) | El sombreado de festivos propios funciona —medido—, pero `ProjectCalendar` y `ProjectHoliday` sólo se pueden crear escribiendo en la base. No hay ruta `/calendar` ni pantalla. Descubierto al demostrar el criterio 2 del §7.5 | M | Medio |
| 19 | Estados configurables (§5) | **PARCIAL** | `KanbanColumn.isInitial/isDone`, `lib/projects/status-progress.ts` | El acoplamiento funciona; falta el alta/baja de columnas desde la pantalla | M | Medio |
| 20 | Líneas base (§3) | **PARCIAL** | `Baseline`, `BaselineItem`, `lib/scheduling/baseline.ts` | El motor y la rejilla, sí. Falta la barra bajo la barra del Gantt (§4.6) y el selector no está en el Gantt | M | Bajo |
| 21 | Preferencias de vista (§10.4) | **PARCIAL** | `ViewPreference`, `services/view-preference.service.ts` | Sólo el panel guarda preferencia; las otras cinco vistas del §10.4 no | M | Bajo |
| 22 | Filtros unificados (§10.2) | **PARCIAL** | `lib/projects/filter.ts`, `SavedFilter`, `components/projects/filter-bar.tsx` | Llega a 5 vistas de 6; el Panel queda fuera a propósito. Faltan los campos creador y color, y aplicarlo a la exportación | M | Bajo |
| 23 | Tiempo real (§10.5) | **NO EXISTE** | — | Ni Realtime ni sondeo | M | Bajo |
| 24 | Deshacer / rehacer (§10.6) | **PARCIAL** | `lib/projects/undo-stack.ts`, `components/projects/use-undo.ts` | Tablero, avance y edición. Falta el resto de operaciones | L | Bajo |
| 25 | Campos personalizados (§2) | **NO EXISTE** | — | Todo | L | Bajo |

**Recuento:** 15 PARCIAL · 4 EXISTE · 3 EXISTE PERO MAL · 2 NO EXISTE · 1 NO APLICA. Total 25 filas.

> **Nota de método (18/08/2026).** Este recuento estuvo mal escrito durante toda una
> sesión: sumaba 26 sobre 25 filas y nadie lo tocó al declarar diez cierres. Ahora se
> calcula de las filas, no se escribe a mano.
>
> Y las diez filas que llegaron a decir **CERRADA** volvieron **todas** sobreafirmadas
> en una auditoría con agentes que contrastó los criterios literales del spec en vez de
> la bitácora. Están de vuelta en PARCIAL con lo que de verdad les falta. Un cierre sólo
> cuenta si se recorren los criterios de aceptación uno a uno y se demuestra cada uno en
> pantalla, no en el módulo.

---

## 4. Deuda y conflictos detectados

**1. Las fechas no llevan hora, y eso es de fondo.** Cinco campos son `@db.Date`. El spec exige
`timestamptz` porque una tarea puede empezar a las 14:00. Hoy la granularidad mínima es el día
entero, así que jornadas partidas, tareas de media jornada y solapamientos por horas son imposibles.
Migrar esto **toca el motor completo**, que razona en ordinales de día hábil.

**2. No hay campo de duración; se deriva de las fechas.** `services/schedule.service.ts` la calcula
como días hábiles entre inicio y fin. Es coherente y está probado, pero impide expresar «esta tarea
son 4 horas» y hace que corregir una fecha cambie en silencio la duración.

**3. El motor no persiste lo que calcula.** `totalFloat`, `isCritical` y las fechas tempranas se
recalculan en cada carga —17 ms sobre 1 368 líneas, así que no duele— pero eso impide filtrar u
ordenar por holgura en la base y obliga a que cada consumidor corra el motor.

**4. Un solo responsable por tarea.** `WorkItem.ownerId` es único y apunta a `User`. Sin modelo de
asignación con `units` y `work`, **la vista de Carga de trabajo no puede ser correcta**: es la
brecha 11 y bloquea la 17.

**5. Los estados son texto libre.** `status` es `String` validado solo en TypeScript. El Tablero no
puede tener columnas configurables mientras eso siga así.

**6. `progressPct` es `Float`.** El spec pide enteros en basis points. Es la migración más barata de
las tres.

**7. Deuda ajena al spec, encontrada de paso y ya corregida esta sesión:** `AppError` aplanaba todas
sus subclases y `instanceof` era siempre falso; el aislamiento multiinquilino de Prisma
(`setupMultiTenantMiddleware`) está definido y **no se registra en ningún lado**; y no hay
`<Toaster>` montado, así que ocho diálogos reportan errores a un canal que nadie ve.

---

## 5. Decisiones que requieren aprobación del dueño del producto

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| A | **Fechas con hora (deuda 1)** | (a) Migrar a `timestamptz` y reescribir el motor en minutos laborables; (b) quedarse en granularidad de día | **(b) por ahora.** El plan real es de días hábiles y el motor lo reproduce exacto. Migrar cuesta semanas y no compra nada que el plan de referencia necesite |
| B | **Persistir los campos derivados (deuda 3)** | (a) Escribirlos tras cada recálculo; (b) seguir en memoria | **(a)** en cuanto se quiera filtrar por holgura. Barato y de bajo riesgo |
| C | **Asignación múltiple (deuda 4)** | (a) Modelo `Assignment` conservando `ownerId`; (b) no hacer Carga de trabajo | **(a)**. Es la única forma de que la vista 5 diga la verdad |
| D | **Estados configurables (deuda 5)** | (a) Tabla `TaskStatusOption` por proyecto; (b) dejar el enum | **(a)** si el Tablero configurable importa; si no, aplazar |
| E | **Orden de construcción** | El spec propone A→H | Ver plan abajo: prioriza lo que no existe y no arrastra migración |

---

## 6. Plan propuesto

Ordenado por **impacto sobre coste**, dejando fuera lo que exige migración destructiva hasta que se
decidan A y C.

**Ola 1 — lo que no existe y no arrastra migración.**

1. **Vista Calendario (§7)** — brecha 16. Consume lo que ya hay: fechas, hitos, responsable.
2. **Vista Panel de control (§9)** — brecha 18. Cinco de los seis widgets se alimentan de datos que
   ya existen; el de presupuesto queda fuera hasta que haya modelo de dinero.
3. **Preferencias de vista (§10.4)** — brecha 21. Barata y se nota en cada recarga.

**Ola 2 — lo que necesita una migración pequeña.**

4. `sortOrder` + `wbs` (brecha 12).
5. `constraintType` + `deadline` (brecha 9) — el motor ya los entiende; falta persistirlos.
6. `progressPct` a basis points (brecha 2).

**Ola 3 — lo que depende de una decisión de producto.**

7. `Assignment` (brecha 11) → habilita **Carga de trabajo** (brecha 17).
8. `TaskStatusOption` (brecha 19) → habilita el Tablero configurable.
9. Líneas base (brecha 20).

**Fuera de alcance hasta nuevo aviso:** fechas con hora (decisión A), campos personalizados, tiempo
real, deshacer.

---

## Bitácora de trabajo

> **Aviso.** Hasta el 18/08/2026 esta bitácora se llamaba «de cierre de brechas» y cada entrada
> declaraba una cerrada. Una auditoría con agentes contrastó las diez contra los criterios
> literales del spec y **las diez volvieron sobreafirmadas**. Las entradas se conservan tal cual
> —son el registro de lo que se hizo— pero **ninguna de ellas demuestra un cierre**. Lo que
> demuestran es que la pieza existe y está probada; lo que faltaba en todos los casos era el
> cable, la vista que no la recibía, o el criterio que nadie recorrió.
>
> Once piezas estaban escritas, exportadas y con pruebas en verde **sin que las llamara nadie**.
> Las pruebas verdes no son evidencia de funcionalidad: `columnaAlCambiarProgreso` tuvo 22
> pruebas durante un commit entero sin un solo llamador.


Cada brecha cerrada actualiza aquí su fila con la fecha y el commit, como pide §0.3.

| Brecha | Cerrada el | Commit | Nota |
|---|---|---|---|
| **17 · Vista Carga de trabajo (§8) — los 6 criterios del §8.5, uno a uno en pantalla** | 2026-08-18 | (sin cambios de código) | La única sección que no necesitó tocar nada: estaba construida y lo que faltaba era demostrarla. **C1** 142 celdas sobrecargadas, todas con fondo de alarma **y** texto en rojo, e idénticas en los tres modos; el color se mide por `data-sobrecargado`, que es lo que el componente declara —buscarlo por clases de CSS daba cero y parecía que no se pintaba—. **C2** Horas → Tareas → Porcentajes recalcula sin recargar: la misma celda pasa de 24 a 3 a 60. **C3** con una ausencia el 17-jun, esa celda dice «24 h comprometidas en un día sin capacidad» y queda marcada; el 16-jun dice «24 h de 8 h». **C4** 460 filas de desglose y las sumas cuadran exactas con la celda del recurso en los 10 días comprobados, incluidos los de 104 h. **C5** la fila «Sin asignar» sale vacía porque el plan tiene las 1368 líneas asignadas; al quitar la asignación de una **dentro de la ventana visible** aparece con «1 línea» en los tres modos. La primera prueba falló porque desasigné una del 21-sep y la ventana llega al 12: era el dato, no la vista. **C6** con 50 recursos y 900 líneas repartidas —52 filas, 4836 celdas, ventana de tres meses— cambiar de modo pinta en 135–157 ms, y eso en desarrollo. Datos de prueba retirados: los 45 recursos, la ausencia y las asignaciones devueltas |
| **15 · Vista Lista (§6) — los 5 criterios del §6.3, uno a uno en pantalla** | 2026-08-18 | 1992fc1, 2df1ffe, dd6806e, 56b79aa | **C1** los tres formatos del §6.1 existían a medias: había dos, y el que se llamaba «Lista» agrupaba por fase en tarjetas, que no es ninguno de los tres —el spec la define plana—. Esa agrupación pasa a ser una de las cuatro opciones de «Agrupada». Medido: Esquema 127 filas jerárquicas, Lista 1248 (1247 + el total), Agrupada 1273 (1247 + 25 cabeceras + el total), y tras recargar con la caché limpia vuelve en «Agrupada por Fase». **C2** la fila de totales no existía; suma lo filtrado y baja de 1247 a 4 al filtrar. **C3** los subtotales cuadran con el total en los cuatro campos, 1247 = 1247; al medirlo salió que los grupos dibujaban 1368 filas mientras sus cabeceras decían 1247 —los 121 resúmenes, que no se suman pero sí se dibujaban—. **C4** editar una fecha **no** reprogramaba: el Gantt empujaba las sucesoras y la Lista escribía la fecha y nada más, dejando vínculos incumplidos en silencio. Arreglado en la ruta, no en la vista, para que lo herede cualquiera que mueva una fecha. Medido desde el diálogo de la Lista: `empujadas: 1` y 3 filas movidas, ninguna adelantada. **C5** medido sobre un **build de producción**, que es lo que se despliega: 5000 líneas → 21 filas en el DOM, 134 ms hasta el pintado y **60,6 fps**. En desarrollo daba 23 fps y estuve a punto de refactorizar el componente por esa cifra; el perfil de CPU decía que lo que quedaba arriba era `jsxDEV`. De camino: `formatDate` construía un `Intl.DateTimeFormat` en cada llamada (623 ms de 2788 en el perfil) y una etiqueta desconocida hacía que next-intl lanzara y escribiera en consola por cada fila y renderizado |
| **13 · Vista Gantt (§4) — los 8 criterios del §4.8, uno a uno en pantalla** | 2026-08-18 | 73fd495, 9e42da3, 7e0ad0c, 41e1951, e965e83, 9fc6f53, 5e50839 | **C1** el rombo siguió al ratón en 10 de 10 muestras con 35 ms de peor ida y vuelta —incluido el viaje por el protocolo— y la base quedó con exactamente 4 filas movidas: la arrastrada y sus tres sucesoras, nombradas, ninguna adelantada. **C2** capturar como predecesora a una de las que la esperan da un aviso que nombra la cadena entera —«Crear la cuenta de servicios compartidos → Crear las cuentas de laboratorio → Crear la cuenta de servicios compartidos»— y **1665 vínculos antes y después**; se eligió un par con los dos títulos únicos en el plan, porque once líneas comparten nombre y elegir la equivocada habría creado un vínculo legítimo en vez del ciclo. **C3** las 27 filas del nivel de apertura son resúmenes y ninguna se arrastra; en detalle, 947 movibles de 1051. **C4** con las 1368 dibujadas, 312 rojas contra 312 del motor: 0 de sobra, 0 de menos. **C5** 28 franjas de línea base para 28 barras, y el desfase cuadra al píxel — 10 días hábiles dan 140 px con el día a 14. **C6** de 2578 ms y **2,3 fps** a 130 ms y **56,5 fps** con 5000 líneas, poniendo 28 nodos en el DOM en vez de 5000. **C7** deshacer deshabilitado → aplicar → habilitado con el nombre de lo que va a tirar → Ctrl+Z por teclado → la línea vuelve a su fecha **y pierde el ancla**, plan con 0 diferencias. **C8** columnas de 4 a 6, ancho del nombre de 320 a 200 px, divisor de 604 a 656 px y eje de 6 marcas mensuales a 25 semanales: las cuatro vuelven igual tras recargar con la caché limpia. Cuatro defectos que sólo se veían midiendo: «Todo» enseñaba 1051 de 1368 líneas y escondía la que el informe ejecutivo nombra como la que más arrastra —detiene 797—; el diagrama no virtualizaba; la columna de nombres se iba con el desplazamiento horizontal; y el Gantt programaba contra una semana genérica ignorando el calendario del proyecto |
| **16 · Vista Calendario (§7) — los 6 criterios del §7.5, uno a uno en pantalla** | 2026-08-18 | 9d589dc, d843b3d, 2cef649 | Primera sección que se recorre criterio a criterio demostrando cada uno en la pantalla, no en el módulo. **C1** una línea del 31-jul al 3-ago sale en dos trozos —447 px (vie-sáb-dom) con ▶ y 144 px (lun) con ◀—, cortada en la semana y en el mes. **C2** con un calendario de proyecto creado a mano: 8 de 8 fines de semana y 3 de 3 festivos propios sombreados, 0 de 19 laborables sombreados de más; borrado después. **C3** la casilla del 3-sep promete 61, el desglose trae 61, ninguna de las 4 visibles reaparece, 0 duplicados. **C4** filtro `Nombre contiene «cadenas automáticas»`: de 1368 a 1. **C5** arrastre nativo de Chrome —el gesto de ratón hizo que Chrome iniciara el arrastre y el `dragstart` de la aplicación puso el id correcto—; el aviso prometió 394 líneas y cierre del 2026-11-30 al 2026-12-03, y la base quedó con 394 filas movidas, **0 adelantadas**, 1 sola restricción nueva y ese cierre; restaurado a las fechas del archivo. **C6** 16-20 ms por mes; septiembre con **614 líneas** —más de las 400 que pide el spec— en **17 ms**. Tres defectos que sólo se veían mirando: la fila medía `min(laneCount, visibles)` y los hitos exentos del recorte colgaban 13 y 17 px sobre lo de abajo; la cabecera decía «37 de 1368 caen en este mes» mientras las casillas decían «63 líneas más» cada una; y el Calendario de un proyecto sin líneas enseñaba «Ha ocurrido un error inesperado» porque el motor se niega a programar un plan vacío — el aviso amable llevaba escrito desde el principio y era inalcanzable |
| §3.0 · `rescheduleFrom` y las restricciones persistidas | 2026-08-18 | (este commit) | **Sólo el motor; el arrastre en pantalla queda pendiente, así que ningún criterio del §7.5 se declara cerrado.** Antes de escribirlo medí si podía quitar el ancla que fija cada línea a su fecha: sin ella el motor adelantaría **540 de 1 368 líneas**, alguna 117 días hábiles, aunque el cierre siguiera en 2026-11-30. Las fechas del archivo codifican decisiones que la red no conoce, así que el ancla se queda y «reprogramar» es una cascada de **escritura**, no un recálculo. Regla clave: sólo empuja, nunca tira — una sucesora con holgura no se adelanta. 23 pruebas |
| §5.1 y §5.4 · «Agrupar por» en el Tablero | 2026-08-18 | (este commit) | Estado, Prioridad y Responsable, con las columnas derivadas de los datos y no de `kanban_columns` — agrupar por prioridad no puede depender de que alguien haya creado una columna «CRITICAL». Y el arrastre enruta por criterio (§5.2): estado cambia la columna, prioridad la prioridad, responsable reasigna, y **ninguno toca fechas**. Demostrado en pantalla: 130 columnas por estado → 104 por prioridad → 26 por responsable → 130 de vuelta, sin recargar, con los totales conservados |
| §5.1 · «Ordenar por» en el Tablero | 2026-08-18 | (este commit) | EDT por omisión, seis criterios, ascendente y descendente. Le da destino a `compararWbs`, que llevaba escrita y probada sin llamador. El EDT se numera sobre el plan entero, no sobre lo visible: si cambiara al filtrar dejaría de servir para nombrar una línea en voz alta. Demostrado en pantalla: EDT asc `1.1 · 1.1.1 · 1.1.2`, desc lo invierte, y por nombre da otro orden distinto. **Cuatro cables fallaron en silencio antes de que funcionara**, todos por sustituciones con script que no encajaron y que no comprobé |
| 22 · El filtro, de 2 vistas a 5 | 2026-08-18 | (este commit) | Tablero, Elementos de Trabajo (los dos modos), Calendario, Carga y Gantt. El Panel de control queda fuera **a propósito**: sus métricas son del proyecto, no de una selección — «cuántas líneas hay atrasadas» filtrado por «las que contienen Oracle» no es una cifra que signifique nada. Demostrado en pantalla con el escenario que el spec nombra: filtro puesto en el Gantt (27 filas → 5), cambio al Tablero, filtro intacto. Era imposible de ejecutar porque en el Gantt no se podía filtrar. Al medirlo salió que el gráfico recibía `layout` en vez de `layoutFiltrado`: la barra aparecía y no recortaba nada |
| 24c · Deshacer la edición de una línea | 2026-08-18 | (este commit) | El diálogo devuelve cómo estaba y con qué se guardó: es el único que tiene los dos lados, porque el «antes» es lo que cargó al abrirse. La prueba del contrato destapó que `phase` salía como cambiada en **toda** edición —el formulario usa cadena vacía donde la base usa nulo— y deshacer habría escrito `''` donde había `null`. Comprobado contra la base: editar fechas y prioridad y deshacerlo devuelve los tres campos exactos |
| 24b · Deshacer el avance + §4.7 bidireccional | 2026-08-18 | (este commit) | Capturar avance ya apunta operación. Y al enchufarlo salió que el acoplamiento del §4.7 estaba a medias en el sentido inverso: capturar 100 % escribía `status: DONE` pero no movía `kanbanColumnId`, así que la línea decía «terminada» y la tarjeta seguía en «Backlog». `columnaAlCambiarProgreso` llevaba escrito y probado desde el commit anterior sin que lo llamara nadie. Comprobado contra la base: 100 % → columna «Done» / DONE, y deshacerlo → «Backlog» / BACKLOG |
| 24 · Deshacer / rehacer (§10.6) | 2026-08-18 | (este commit) | Pila de 50 con la inversa de cada operación, `Ctrl+Z` / `Ctrl+Shift+Z`, y una operación de doce líneas se deshace de un golpe. Es **datos y no cierres**: un cierre captura el estado del momento y desharía un estado viejo. Si escribir falla, la pila no avanza — si avanzara, diría «ya lo deshice» sobre un cambio que sigue puesto y el siguiente Ctrl+Z daría dos pasos atrás por uno. Enganchado al movimiento del tablero; capturar avance y editar fechas todavía no apuntan operación |
| 22 · Filtros unificados (§10.2) | 2026-08-18 | (este commit) | El filtro es un dato que vive en el proyecto, no un estado por pantalla: por eso es *el mismo* al cambiar de vista. Árbol AND/OR anidado sin límite, evaluado en memoria (1 368 líneas en menos de un milisegundo) y con los campos en un registro — uno que no exista rompe al validar, que es cuando alguien puede arreglarlo. Un filtro roto **no coincide con nada** en vez de coincidir con todo: el segundo caso escondería líneas sin que nadie lo notara. Comprobado en navegador: filtro puesto en el Tablero (822 de 1368), cambio a Elementos de Trabajo, mismo filtro y mismo conteo |
| 19 · Estados configurables (§5) | 2026-08-18 | (este commit) | No una tabla nueva: las columnas del tablero **ya son** una tabla por proyecto, y dos tablas para «qué estados tiene este proyecto» serían dos verdades. Lo que faltaba era su semántica —`isInitial`, `isDone`— y que la persistencia fuera de la columna al estado y no al revés: mientras iba al revés, una columna añadida no tenía ningún estado que la señalara y el tablero rechazaba soltar tarjetas en ella **en silencio**. Con eso llega el acoplamiento estado↔avance del §5.2, que no existía: comprobado de extremo a extremo, `TODO → DONE` puso el avance a 1 y volver a la inicial lo devolvió a 0 y borró la fecha de término |
| 20 · Líneas base (§3, §4.6) | 2026-08-18 | (este commit) | Foto directa, como pide el §1: el estado de aquel día, sin sistema de eventos. Las fechas salen del motor y no de las columnas, para que la foto retrate lo que se enseñó en pantalla. La duración se guarda además de las fechas porque el calendario laborable puede cambiar. Comprobado de extremo a extremo: foto de 1368 líneas, tres líneas movidas una semana, la cascada arrastra 18 y cada una marca +5 días hábiles en rojo bajo su fecha — y el cierre **sin mover**, porque iban dentro de su holgura |
| 12 · Numeración EDT (§2.3) | 2026-08-17 | (este commit) | Se calcula, no se guarda: el EDT es función de la jerarquía y el orden, y una columna con la copia acabaría contradiciendo al árbol. Mover una fase renumeraría cientos de registros; calculada, el plan real de 1 368 líneas cuesta menos de un milisegundo. Recorrido con pila explícita —mil niveles no desbordan— y comparador que pone 1.9 antes de 1.10. Queda pendiente `sortOrder` explícito: hoy el orden lo da `templateOrder` |
| 11 · Modelo de asignación | 2026-08-17 | (este commit) | `Resource` + `Assignment` + `ResourceAbsence`, aditivo: `WorkItem.ownerId` sigue significando lo mismo y ninguna pantalla existente cambia. Recursos sin cuenta de usuario para el lado del cliente. Siembra idempotente desde lo que ya había, repartiendo la estimación de cada línea entre sus días hábiles (`work/duración = units`, §3.7) |
| 17 · Vista Carga de trabajo (§8) | 2026-08-17 | (este commit) | La sexta y última vista del spec. Motor de matriz recurso × día con 32 pruebas y vista con 21. Tres modos sobre una sola comparación en minutos, ausencias que ponen la capacidad a cero, fila de trabajo huérfano, fila del equipo y sugerencia de quién tiene hueco (§8.4). Medido sobre el plan real: 5 recursos, 651 celdas, 142 en sobrecarga, 0 px de desborde de página |
| 18 · Panel de control (§9) | 2026-08-17 | (este commit) | Cuatro widgets con datos —información, tareas, avance temporal e hitos— y dos con estado vacío que dice qué falta del modelo, como autoriza el §9.4. Un solo cálculo en el servidor (28 pruebas contra un plan calculado a mano) y una sola consulta. Barras apiladas en vez de donas, y rampa ordinal de un tono validada con el validador del oficio contra la superficie real. Medido sobre el plan real: 1243 hojas, 127 atrasadas, 109 hitos, 38.4 % de retraso, 0 px de desborde |
| 21 · Preferencias de vista (§10.4) | 2026-08-17 | (este commit) | Tabla `view_preferences` por usuario × proyecto × vista, con validación de forma en zod al entrar y al salir. Comprobado de extremo a extremo en navegador: apagar un widget, recargar la página entera y encontrarlo apagado |
| 16 · Vista Calendario (§7) | 2026-08-17 | (este commit) | Motor de empaquetado en carriles con 25 pruebas, rejilla del mes con 19 pruebas. Barras que cruzan semanas con puntas ◀/▶, hitos ◆ exentos del recorte, banderas ⚑ de vencimiento y «N líneas más» desplegable. Medido en navegador sobre el plan real (1368 líneas): 0 px de desborde, 0 encimamientos, empaquetado en 19 ms |
