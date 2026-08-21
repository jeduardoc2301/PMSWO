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
| 1 | Duración en minutos laborables (§2.1) | **EXISTE PERO MAL, SIN DAÑO** | `estimatedHours Int`, `lagDays Int`, `durationDays Int` | Las duraciones son enteras en días y horas, no en minutos laborables. **Pero el daño que la regla previene —«los días decimales (2,5) provocan deriva acumulada»— no ocurre: aquí no hay decimales.** El motor trabaja en ordinales de día hábil, aritmética entera de principio a fin. Pasar a minutos sería habilitar jornada partida e intradía, que es una funcionalidad, no una corrección | L | Bajo |
| 2 | Progreso en basis points (§2.1) | **EXISTE PERO MAL, SIN DAÑO DEMOSTRABLE** | `WorkItem.progressPct Float` 0–1 | Es `Float` y el spec pide `Int` 0–10000. Se buscó el caso que la regla previene y no aparece: `1/3 × 3 === 1` es **verdadero** en doble precisión; mil valores de 0,3333 derivan 4·10⁻¹², doce órdenes por debajo de un basis point; y el roll-up de un resumen con todos sus hijos al 100 % da **exactamente** 1 en las cinco formas probadas —incluidas mil hijas de duración desigual—, porque es `Σw/Σw` y un número dividido por sí mismo es exacto. Un doble lleva 15-16 dígitos y el avance necesita 4. **Migrar toca el esquema, cada lectura y escritura, el motor, las seis vistas y 2474 pruebas, por un defecto que no se puede exhibir.** Lo que cambiaría la decisión: que aparezca dinero, o duraciones sub-día | S | Bajo |
| 3 | Fechas con hora en UTC (§2.1) | **EXISTE PERO MAL, POR DISEÑO** | `@db.Date` en 5 campos | Fechas sin hora. El motor entero está construido sobre **ordinales de día hábil** —fechas a número de día desde 1970, aritmética entera, y de vuelta una sola vez— precisamente para no tocar husos ni horario de verano. Poner hora no es arreglar una convención: es planificación intradía, que el producto no ofrece en ninguna de las seis vistas | L | Bajo |
| 4 | Dinero en céntimos (§2.1) | **NO APLICA** | — | No hay presupuesto en el modelo todavía | — | — |
| 5 | Campos derivados escritos solo por el motor (§2.1) | **CERRADA** | `lib/scheduling/cpm.ts`, `gantt.ts`, `wbs.ts` | Se cumple **más fuerte de lo que el spec pide**: `totalFloat`, `isCritical`, `earlyStart` y `wbs` no son columnas del esquema —cero apariciones—, así que no es que nadie las escriba, es que no hay dónde. Y el esquema de la ruta de edición sólo admite campos reales. Comprobado campo a campo | M | Bajo |
| 6 | Dependencias FS/SS/FF/SF con lag (§3.2) | **EXISTE · corregido SF** | `TaskDependency.linkType`+`lagDays`, `lib/scheduling/schedule.ts` | Los cuatro tipos y el desfase con signo. **SF llevaba un día de más**: hacía que la sucesora terminara el día *anterior* al arranque de la predecesora, y el §12 caso 6 dice justo lo contrario. Lo encontró la batería del §12 al escribirla. El plan de referencia no usa ningún SF, así que corregirlo no movió fechas | — | — |
| 7 | Calendarios laborables (§3.1) | **PARCIAL** | `ProjectCalendar`, `ProjectHoliday`, `lib/scheduling/calendar.ts` | Existe día laborable y festivos; falta jornada horaria y calendarios por recurso | M | Medio |
| 8 | CPM: ruta crítica y holgura (§3.3) | **EXISTE** | `lib/scheduling/cpm.ts`, `critical-path.ts` | Nada. Holgura total, crítica y súper crítica, con 22 pruebas | — | — |
| 9 | Restricciones de tarea (§3.4) | **CERRADA · las ocho** | `WorkItem.constraintType`, `lib/scheduling/schedule.ts`, `cpm.ts`, `alap.ts` | Las ocho del §3.4. `ASAP` es el comportamiento por omisión; las tres que **empujan** (`SNET`, `MSO`, `FNET`) mueven la tarea en el pase adelante; las tres que solo **comprometen** (`MFO`, `SNLT`, `FNLT`) bajan el techo de la fecha tardía y sacan la holgura negativa, sin mover nada. La octava, `ALAP`, no cabía donde caben las otras siete porque **no lleva fecha**: dónde va se sabe después del pase atrás, así que programar con ella es programar dos veces. Demostrado en pantalla sobre las 1368: la línea marcada se corre de 2026-07-24 a su fecha tardía 2026-11-17, su sucesora respeta el `SS+1`, se mueven 8 líneas y el cierre sigue en 2026-11-30. Y se ponen **desde el diálogo de edición**: selector con las ocho, campo de fecha sólo para las seis que la piden, y la explicación de la elegida — recorrido en pantalla. Cambiarla pide `edit_schedule`, como cambiar una fecha | M | Bajo |
| 10 | Roll-up a resúmenes (§3.6) | **EXISTE** | `lib/scheduling/progress.ts` | Nada. Ponderado por trabajo, con hitos en peso cero | — | — |
| 11 | Carga y sobrecarga de recursos (§3.7) | **PARCIAL · lo que falta es modelo** | `Resource`, `Assignment`, `services/resource.service.ts`, `app/api/v1/work-items/[id]/assignments/` | Ya hay alta y baja de asignación por ruta, con la misma regla de dedicación en servidor y pantalla. La fórmula **no** usa una constante: usa `dailyMinutes` del recurso, que es lo que el modelo permite. Falta `Assignment.work` y franjas horarias por día para que `minutosLaborables(cal, d)` pueda variar — las dos son del §2, que espera decisión | M | Medio |
| 12 | Jerarquía con `sortOrder` y EDT (§2.3) | **PARCIAL** | `lib/scheduling/wbs.ts` | **El EDT ya es estable**: la línea nueva nace con puesto al final, así que añadir una no renumera nada. Falta `sortOrder` como columna propia con su índice (hoy es `templateOrder`, nulable y global al proyecto) y el tope de 16 niveles. El EDT sí está en el Gantt, como columna del catálogo | M | Medio |
| 13 | Vista Gantt (§4) | **CERRADA** | `components/plan/gantt-chart.tsx`, `plan-workspace.tsx`, `fields-panel.tsx`, `lib/plan/gantt-columns.ts` | **8 de 8 criterios del §4.8, cada uno demostrado en pantalla** (ver la bitácora). Del §4.2 queda fuera el catálogo completo de columnas —presupuesto, tiempo registrado, campos personalizados— porque necesita modelos que no existen. Del §4.3 están ya las **cinco** escalas que este motor puede dibujar —día, semana, mes, trimestre y año, con cabecera de dos filas y el ancho de día atado al zoom—; la sexta, la hora, no cabe contra un motor de ordinales de día hábil y eso es del §2.1 | L | Medio |
| 14 | Vista Tablero (§5) | **CERRADA** | `components/projects/kanban-board.tsx`, `lib/projects/kanban-group.ts`, `columnas-del-tablero.tsx` | Arrastre, urgencias, avance, atraso, y las dos que faltaban: agrupar por estado, prioridad o responsable —comprobado en pantalla, la barra se reconstruye sin recargar: 5 columnas por estado, 4 por prioridad, 5 por responsable— y columnas configurables desde el propio tablero | M | Bajo |
| 15 | Vista Lista (§6) | **CERRADA** | `work-items-outline.tsx`, `work-items-list.tsx`, `lib/projects/list-totals.ts` | **5 de 5 criterios del §6.3, cada uno demostrado en pantalla** (ver la bitácora). Del §6.2 están el panel de Campos propio y la exportación **de la vista** —que llevaba las nueve columnas escritas a mano bajo un comentario que prometía «las que esta tabla dibuja»—. Quedan presupuesto, costo real y tiempo registrado, que no existen como campos | S | Bajo |
| 16 | Vista Calendario (§7) | **CERRADA (con una corrección)** | `lib/scheduling/calendar-layout.ts`, `components/projects/calendar-view.tsx`, `calendar-tab.tsx`, `services/reschedule.service.ts` | **6 de 6 criterios del §7.5 demostrados en pantalla — pero el 5 se dio por bueno de más y hubo que volver.** Mi demostración soltaba la barra sobre casillas vacías; un auditor cuyo encargo era refutarme encontró que soltar sobre **otra barra** no hacía nada, y eso es el 21 % de la rejilla y más de la mitad del alto útil de un día cargado. Corregido y vuelto a medir: de 0 % a 100 % de aceptación en los puntos que caen sobre una barra. La lección no es del Calendario: una demostración en pantalla que no busca el caso denso no es una demostración. Del §7.2 están ya la **vista semanal** y la de **agenda** —`calendarLayout` recibía `from` y `to` desde el principio, así que la semanal es el mismo cálculo con otro rango; la agenda no pasa por la rejilla porque una lista no tiene carriles—. Y **crear una tarea arrastrando un rango**, con las fechas recortadas a días hábiles. Y el calendario del proyecto sólo se puede **leer**: no hay pantalla ni ruta para crearlo — brecha 27 | L | Bajo |
| 17 | Vista Carga de trabajo (§8) | **CERRADA** | `lib/scheduling/workload.ts`, `components/projects/workload-*.tsx` | **6 de 6 criterios del §8.5, cada uno demostrado en pantalla** (ver la bitácora). Es la única vista que no necesitó tocar código: estaba bien y lo que faltaba era recorrerla. Del §8.2 queda fuera el calendario por recurso —hay jornada diaria y ausencias, no semana laboral propia— | L | Medio |
| 18 | Vista Panel de control (§9) | **PARCIAL** | `lib/projects/dashboard-metrics.ts`, `components/projects/dashboard-*.tsx`, `services/project-dashboard.service.ts` | **5 de 6 criterios del §9.3 demostrados en pantalla, y el sexto a medias** (ver la bitácora). Lo que falta no es del panel: la aplicación **no tiene modo claro** —ni `prefers-color-scheme`, ni clases `dark:`, ni conmutador— en ninguna de las seis vistas, así que «legibles en claro y oscuro» no se puede cumplir aquí. La otra mitad —accesibles sin depender sólo del color— sí | L | Bajo |
| 27 | Calendario del proyecto | **CERRADA** | `app/api/v1/projects/[id]/calendar/`, `lib/scheduling/calendario-editable.ts` | Semana laborable, país de festivos y festivos propios, con ruta y reglas. Pide `edit_schedule` porque cambiarlo mueve las fechas de todo el plan. Comprobado: añadir el sábado hace que el motor pase a `[1,2,3,4,5,6]`, y borrar la fila devuelve al calendario de por omisión | M | Medio |
| 19 | Estados configurables (§5) | **CERRADA** | `KanbanColumn.isInitial/isDone`, `lib/projects/columnas-del-tablero.ts`, `app/api/v1/projects/[id]/columns/` | Alta y baja de columnas desde el propio tablero, con las dos protegidas —la inicial y la de terminado— y con destino obligatorio para las tarjetas de la que se quita. Y **reordenar**, que estaba puesta como imposible: el corrimiento se hace en dos vueltas dentro de la transacción —a puestos negativos y de ahí a los definitivos— porque el índice único no admite ni un instante con dos columnas en el mismo sitio. Con flechas, no arrastrando, y exigiendo la lista completa. Comprobado en pantalla: el tablero se reordena él | M | Medio |
| 20 | Líneas base (§3) | **CERRADA** | `Baseline`, `BaselineItem`, `lib/scheduling/baseline.ts`, `gantt.ts` | Las dos mitades del §4.6 conmutador 4: la barra fina bajo cada barra —28 dibujadas, comprobado— y el valor original en la rejilla junto al de hoy, en rojo lo que se fue tarde y en verde lo que se adelantó. El selector sí estaba en el Gantt; la matriz decía que no | M | Bajo |
| 21 | Preferencias de vista (§10.4) | **CERRADA · completa** | `ViewPreference`, `services/view-preference.service.ts` | Las cinco vistas configurables guardan y restauran. Comprobado en pantalla una por una: Gantt (Fases/Todas), Lista (Esquema), Tablero (agrupar por prioridad), Carga (Tareas) y Panel (widgets) sobreviven a recargar la página entera. `/es/plan` no persiste **a propósito**: monta el Gantt sin `projectId` porque es el plan del archivo de referencia, no un proyecto | M | Bajo |
| 22 | Filtros unificados (§10.2) | **PARCIAL · bloqueada por el modelo** | `lib/projects/filter.ts`, `SavedFilter`, `components/projects/filter-bar.tsx` | Llega a 5 vistas de 6; el Panel queda fuera a propósito. La exportación **sí** respeta el filtro: con 255 líneas filtradas el botón dice «Exportar (255)» y el CSV escribe «255 de 1368 líneas» en su propia cabecera. Lo único que falta son los campos **creador** y **color**: ninguno de los dos existe en `WorkItem` —sólo hay `createdAt`—, así que son migración y entran en la lista del §2 que espera decisión. Los campos personalizados, igual | M | Bajo |
| 28 | Modo claro (§9.3) | **NO EXISTE** | (ninguno) | La aplicación es oscura en las seis vistas: sin `prefers-color-scheme`, sin clases `dark:`, sin conmutador. Es lo único que impide cerrar el sexto criterio del §9.3, y es transversal, no del panel. Descubierto forzando el esquema claro del navegador | L | Bajo |
| 29 | Permisos por vista y `edit_schedule`/`edit_tracking` (§10.1) | **CERRADA** | `lib/projects/permisos.ts`, `services/project-authorize.service.ts`, `app/api/v1/projects/[id]/permissions/` | Los diez permisos del §10.1 existen con su nombre, con cuatro papeles de proyecto (OWNER, MANAGER, COLLABORATOR, CLIENT) y `authorize(userId, projectId, permission)` que lanza 403 nombrando el permiso que faltó. El permiso efectivo es la **intersección** del techo del cargo y el papel en el proyecto. La barra de vistas se recorta: comprobado en pantalla, un cliente ve 7 pestañas y no ve Timeline, Calendario ni Carga. `authorize()` guarda ya las tres puertas que mueven datos: fechas por la ruta de la línea, `/reschedule`, y cualquier escritura sobre una línea. **La de las fechas preguntaba después de escribir**: devolvía 403 con la fecha ya guardada, y la medición de entonces no lo vio porque comprobó el código de respuesta y no el dato — corregido y vuelto a medir contra el servidor. La pantalla de reparto ya existe (`components/projects/reparto-de-papeles.tsx`, en el Resumen). Barridas **todas** las rutas de `app/api` que escriben: las cinco que quedaban sin asiento de proyecto —aplicar plantilla, editar el proyecto, líneas base y ausencias— la tienen ya, medidas con los dos papeles. Quince puertas, y una prueba que comprueba que la guardia va **antes** de escribir | M | Alto |
| 30 | Revocar un rol tarda en surtir efecto | **CERRADA · acotada a 5 minutos** | `lib/auth.ts`, `lib/auth-refresco.ts` | Los roles se releen de la base cuando el token lleva más de cinco minutos sin refrescarse. Antes valían los treinta días del token, así que quitarle un permiso a alguien no se lo quitaba. Medido con el reloj: a t=240 s la sesión seguía con los roles viejos y a **t=300 s** ya tenía los nuevos. Una cuenta dada de baja se queda sin ninguno | M | Alto |
| 31 | Panel de detalle compartido (§10.3) | **CERRADA** | `components/plan/plan-detail-panel.tsx`, `lib/plan/detail-links.ts`, `lib/plan/usar-plan.ts` | **Un solo componente en las SEIS vistas.** Las cinco primeras se comprobaron abriendo la misma línea desde cada una: panel idéntico carácter a carácter (426). La sexta —el Panel de control— entra por el widget de hitos, que es el único sitio donde hay líneas y no cifras agregadas; inventarle una lista de tareas al Panel para que la cuenta diera seis habría sido construir otra vista, no cerrar esta. Comprobada la firma del componente en las cuatro que abren líneas distintas: mismo encabezado, mismo cierre, mismos rótulos. La auditoría anterior decía «dos implementaciones»: no era cierto — había una sola y cuatro vistas que no abrían ninguna. Y ya **edita**: el nombre y el avance se cambian desde el panel con la misma celda que usan la rejilla y la Lista — las dos primeras cosas que el §4.7 pide. Un resumen no ofrece capturar avance porque lo acumula de sus hijas. Falta lo que necesita modelo: tiempo registrado, adjuntos, comentarios, campos personalizados y el creador | M | Medio |
| 23 | Tiempo real (§10.5) | **NO EXISTE** | — | Ni Realtime ni sondeo | M | Bajo |
| 24 | Deshacer / rehacer (§10.6) | **CERRADA** | `lib/projects/undo-stack.ts`, `components/projects/use-undo.ts` | Las tres vistas que pide el spec lo tienen. El Gantt apunta cinco clases de operación (sangrar en lote, renombrar, avance, duración, mover en el árbol), el Tablero apunta el movimiento —comprobado en pantalla: mover, deshacer, la tarjeta vuelve a su columna en la base—. Los **vínculos** ya se deshacen: el tipo creció con un canal propio, porque un vínculo no es un campo de una línea —vive entre dos— y su inversa no es «el valor de antes» sino la operación contraria. Comprobado en pantalla: 1665 → 1666 → 1665. Las altas y las bajas también: crear una línea la deja en 4 y deshacer la devuelve a 3; borrar una con vínculo baja a 2 líneas y 0 vínculos, y deshacer devuelve las dos cosas. Lo único fuera es arrastrar fechas, excluido a propósito porque pasa por la previsualización | L | Bajo |
| 25 | Campos personalizados (§2) | **NO EXISTE** | — | Todo | L | Bajo |

**Recuento (19/08/2026, contado de las filas):** 15 CERRADA · 5 PARCIAL · 3 EXISTE · 3 EXISTE PERO MAL · 3 NO EXISTE · 1 NO APLICA. Total 30 filas.

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
| **§6 · Lista — exportación, edición en celda y el recálculo que faltaba** | 2026-08-19 | (varios) | **Exportar** respetando columnas visibles y filtro, comprobado interceptando el archivo en vez de descargarlo: 1368 filas sin filtro y 6 filtrando «Fortinet», con el contexto dentro del propio CSV. Las dos trampas de Excel resueltas —marca UTF-8, verificada en los BYTES porque `blob.text()` se la come al decodificar, y separador de punto y coma—. **Edición en celda** con el mismo componente del Gantt; el envoltorio que tenía obligaba a **dos** dobles clics, y el Gantt arrastraba el mismo fallo sin que se viera porque allí demostré la celda de avance. **§6.3 C4**: editar una fecha en la Lista no recalculaba el plan, y el desfase se veía dentro de la misma pantalla —el diálogo decía «26 de jun» y el panel «2026-06-22»— |
| **§3.4 · seis de las ocho restricciones, y una que el motor nunca veía** | 2026-08-19 | (este commit) | Entran `FNET`, `SNLT` y `FNLT`. La división que importa no es la del spec —por flexibilidad— sino cuáles **mueven** la tarea y cuáles solo **comprometen**: las segundas no tocan la programación, y hay una prueba que fija que dan exactamente la misma que sin restricción. Al probarlo en pantalla salió que el servidor **sobreescribía** la restricción de toda línea con el ancla que reproduce las fechas del archivo: las columnas existían, la pantalla las escribía, y el motor no las veía nunca. Ahora son dos campos, que además es lo correcto: dónde puede ocurrir algo y qué se prometió son cosas distintas |
| **§10.7 · los tres puntos de carga y error** | 2026-08-19 | (varios) | **Esqueleto** en el primer dibujado, uno por forma —tabla, diagrama, rejilla— porque un esqueleto genérico delante de una tabla de nueve columnas es una rueda más cara. Con `aria-busy` y texto anunciado: un esqueleto es puramente visual, y sin eso es **peor** que la rueda que sustituye, que al menos llevaba «Cargando» al lado. El brillo respeta `prefers-reduced-motion`. **Motivo concreto**: cerrar un ciclo largo con el gesto del conector devuelve la cadena entera con nombres —«Definir IAM Identity Center → Recopilar la arquitectura → Entrega del banco → Definir IAM Identity Center»— y qué hacer, en un 400 y no un 500. **Reversión visible**: el tablero ya era optimista y revertía, pero avisaba con un `alert()` genérico, que falla las dos mitades de la frase — un cuadro modal no es «visible», es «en medio», y un texto fijo no dice qué tarjeta volvió ni por qué. Ahora el motivo sale del servidor y el aviso nombra la línea |
| **Rendimiento · el módulo no es lento; el servidor de desarrollo sí** | 2026-08-19 | (sin cambios de código) | Se reportó que abrir el Panel de control tardaba **minutos**. Medido sobre una compilación de producción con la base local, el mismo recorrido: barra de pestañas usable en **0,25 s**, Panel de control **0,17 s**, Timeline **0,17 s**, Calendario **0,16 s**, Tablero Kanban **0,42 s** con 1243 tarjetas. En desarrollo eso mismo iba de 2 a 5 segundos, y hasta 31,8 s la primera vez que se compila una ruta. Las tres causas, por orden de tamaño: **compilación de Turbopack** —326 s repartidos en 91 eventos sobre 31 rutas en una sesión; una ruta sonda vacía tarda 5,6 s—, el **doble efecto de StrictMode**, que duplica cada petición y solo existe en desarrollo, y la posibilidad de haber levantado el servidor **contra RDS** por la variable de `.env.local`, en cuyo caso cada consulta espera a un servidor inalcanzable sin dar error. Compilar exige exportar `DATABASE_URL`: `next build` guarda las variables del momento en `required-server-files.json` y `next start` las reaplica, así que la URL que se exporte al arrancar **no manda** |
| **§5.4 · los cinco criterios del Tablero, uno a uno en pantalla** | 2026-08-19 | (varios) | **C1** las columnas se reconstruyen sin recargar en las tres agrupaciones —el testigo puesto en `window` sobrevive—, pero agrupar por responsable daba **una sola columna** con las 1243 tarjetas: el plan se importó con una cuenta de sistema y los cinco responsables reales viven en otro campo. Arreglado. **C2** mover una tarjeta a Terminado pone el avance en 1. **C5** y **no toca las fechas**: 2026-06-12 → 2026-10-02 antes y después; el §5.5 llama a lo contrario «un bug conceptual». **C4** el filtro puesto en el Gantt llega al Tablero con el mismo conteo y el mismo resumen. **C3** —scroll fluido con 1000 tarjetas— **cerrado midiendo sobre una compilación de producción**: 17,6 ms de mediana por fotograma con las 1243 tarjetas, unos 57 fps, contra los 20,6 ms de desarrollo. No hace falta virtualizar, y el número de desarrollo era engañoso — es la razón por la que esta medición se repitió en producción antes de decidir |
| **§4 · Vista Gantt — los cinco gestos del §4.4, el menú del §4.5 y dos conmutadores del §4.6** | 2026-08-19 | (varios) | Once auditores independientes puntuaron esta sección al **45 %**, la más baja de las once. En una noche entraron: el **menú contextual** (§4.5) con siete de las doce entradas —las otras cinco faltan con motivo escrito, no por descuido—; **sangrar y anular sangría** por menú, por teclado y en lote; la **selección múltiple** con rango sobre lo visible; el conmutador de **atrasadas**; la **edición en celda** con doble clic; **crear dependencias arrastrando** entre conectores; y **cambiar la duración** arrastrando el borde. Cada uno demostrado en pantalla y devuelto a su sitio. Corregido además el **EDT del Gantt**, que numeraba por posición dentro de lo visible: la misma línea tenía un número aquí y otro en el esquema, y el de aquí cambiaba al plegar una rama |
| **§12 · Batería del motor — cinco de los seis casos graves** | 2026-08-19 | (varios) | **Holgura libre** (20, 21): el motor tenía una sola holgura y contestaba con ella a dos preguntas distintas. En el plan real, 14 de 20 líneas visibles dan cifras distintas, y una tiene 57 días de total con **cero** de libre. **Resumen abarca a sus hijas** (11): las fechas salían de la base, así que al mover un hijo el resumen mentía —«Inicio: presentar y aprobar» se dibujaba nueve días hábiles corto—. **El compromiso muerde** (9, 10): `dueDate` estaba en el modelo y no lo miraba nadie; la única línea del plan que incumple salía en verde con 57 días de holgura. **Ausencias** (17): estaban capturadas y el cronograma las ignoraba. **El triángulo** (14, 15, 16): las tres fórmulas del §3.5, y con ellas la pregunta que nadie podía contestar —si las tres cifras de una línea se sostienen entre sí—. Queda solo el caso 2, jornada partida con horas dentro del día, que no es un caso sino cambiarle los cimientos al motor |
| **31 · Panel de detalle compartido (§10.3) — 5 vistas de 6, idénticas carácter a carácter** | 2026-08-18 | (este commit) | La auditoría decía «dos implementaciones». No lo eran: había **una sola** y cuatro vistas que no abrían ninguna. El Calendario ya emitía `onSelectTask` desde el primer día y nadie lo había conectado. Ahora lo montan el Gantt, el Calendario, la Lista, el Tablero y la Carga; **demostrado abriendo la misma línea desde las cinco y comparando el texto: 426 caracteres idénticos en las cinco**. Lo que alimenta al panel salió del Gantt a `lib/plan/detail-links.ts`, porque un panel compartido cuyo alimento se calcula dentro de una vista obliga a la siguiente a copiar el bucle. El Tablero y la Carga piden el plan **bajo demanda** —cero peticiones a `/schedule` antes de abrir una tarjeta, una después, medido espiando la red—: no lo necesitan para dibujarse y programar 1368 líneas para quien solo arrastra sería cobrarle por lo que no mira. Tres defectos que solo se vieron con el panel abierto: la cabecera enseñaba un UUID de 36 caracteres donde el §4.7 pide la miga de pan; cada renglón de vínculo repetía ese UUID en monoespaciado y se comía la fila antes del nombre; y el efecto que pide el plan se cancelaba a sí mismo —`cargando` entre sus dependencias— dejando el cajón diciendo «Calculando...» para siempre con la petición ya resuelta. Falta el Panel de control, y falta la mitad editable del §4.7 |
| **§10.1 · mover fechas exige el permiso del plan** | 2026-08-18 | (este commit) | **Un agujero que abrí yo esta misma sesión.** Al hacer que la ruta general de la línea reprograme (§6.3, criterio 4), `INTERNAL_CONSULTANT` —que tiene `WORK_ITEM_UPDATE` y no `PROJECT_UPDATE`— pasó de mover una línea a mover todo lo que colgara de ella: la guardia de `/reschedule` se saltaba por la puerta de al lado. Ahora un cambio de fechas pide el mismo permiso que la otra ruta, y estado y avance siguen abiertos a quien ejecuta — que es exactamente la distinción `edit_schedule`/`edit_tracking` del §10.1. Demostrado con una sesión real de consultor interno: mover fecha **403** con el motivo escrito, actualizar avance **escribe**, `/reschedule` **403**. Los primeros intentos dieron 200 y no era la guardia: el token llevaba los roles de antes del cambio — de ahí salió la brecha 30 |
| **18 · Vista Panel de control (§9) — 5 de 6 criterios del §9.3, y el sexto a medias** | 2026-08-18 | (sin cambios de código) | Segunda sección que no necesitó tocar nada. **C1** los seis interruptores están —los cuatro que funcionan más «Tiempo en tareas» y «Presupuesto», detrás de bandera como manda el §9.4—; encender dos y recargar con la caché limpia los devuelve encendidos. El diálogo guarda al pulsar «Guardar», no al marcar: mi primera medición se saltó ese paso y pareció que apagar no hacía nada. **C2** contra un proyecto de seis líneas hecho a mano, las ocho métricas coinciden — y en las dos donde discrepé tenía razón el panel: el avance va **ponderado por días hábiles** (13/31 = 41,9 %, no el 41,7 % del promedio simple) y las atrasadas son cuatro porque el hito también vence. **C3** «atrasadas» dice 127 y el filtro unificado «Atrasada = sí» deja pasar 127 de 1368: una sola definición vista desde dos pantallas. **C4** el planificado marca 39,3 %, que es 48/122 días **laborables**; por días naturales saldría 39,5 % (68/172). Las dos cifras casi coinciden en este plan por casualidad, así que se comprobó además una ventana donde difieren 5,7 puntos. **C5** con 5000 tareas, del clic en la pestaña a las cifras en pantalla: 535 ms. **C6** los datos no dependen del color —cada rebanada lleva su cifra en `aria-label`, hay rótulos directos y una tabla equivalente— pero forzando `prefers-color-scheme: light` la pantalla sigue oscura: la aplicación no tiene modo claro en ninguna vista. No es una carencia del panel y construirlo es una decisión de producto |
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

## §9.3 C3 — «Tareas atrasadas» y el conmutador del Gantt

**Lo que pedía el criterio.** Que la cifra del Panel de control coincida *exactamente* con lo que
resalta el conmutador homónimo del Gantt. Solo se volvió comprobable al existir el conmutador
(§4.6), así que estaba esperando.

**Lo que había.** Dos definiciones de la misma palabra:

| | de dónde saca la fecha | qué considera terminado |
|---|---|---|
| Panel (`dashboard-metrics`) | la fecha **guardada** (`estimatedEndDate`) | avance al 100 % **o** estado DONE/CLOSED/CANCELLED |
| Gantt (`gantt.ts`) | la fecha del **motor** | avance al 100 % y nada más |

Medidas sobre el plan de referencia dan **127 y 127**, y comparadas línea por línea —por
identificador, corriendo el motor de verdad, no comparando cuentas— resultan el **mismo conjunto**:
cero líneas en una y no en la otra. Pero coincidían por los datos, no por la regla: basta una línea
cerrada al 50 % para que el Gantt la cuente y el Panel no. Una coincidencia que depende de que los
datos no cambien no es una coincidencia, es una espera.

**Qué se hizo.** El plan pasa ahora el `status` de cada línea (`PlanTask.status`, que el servicio ya
tenía a mano y no seleccionaba), y el Gantt pregunta con `estaTerminada` —la **misma** función que
usa el Panel— en vez de mirar solo el avance. Es la tercera vez esta noche que dos definiciones de
lo mismo en el mismo módulo producen un defecto; esta se cerró antes de que se notara.

**Cómo se demuestra en pantalla.** El conmutador no filtra, resalta, y con 1368 líneas virtualizadas
no hay forma de contar los anillos ámbar a ojo. La cuenta va ahora en la propia etiqueta —
«Resaltar (127)» → «Resaltadas (127)»— calculada sobre el plan **entero** y no sobre el trazado
plegado, que si no doblar una fase haría bajar el número. Panel: 127. Gantt: 127. Y la línea vencida
(«Inicio: presentar y aprobar el plan de trabajo», cierra el 2026-06-19) sale con su anillo.

## §9.3 C1 y C4 — los widgets y el calendario laborable

**C1: los seis se encienden, se apagan y la preferencia persiste.** Comprobado en pantalla en los
tres estados: los seis puestos, los seis quitados (y en su lugar «No hay ningún widget encendido.
Abre "Configurar widgets" y elige qué quieres ver», no una pantalla en blanco), y los cuatro de
omisión. La preferencia sobrevive a recargar la página entera porque se guarda en el servidor
(`PUT /preferences?view=PANEL`), no en el navegador: quien configura su panel en la oficina lo
encuentra igual desde casa.

Los widgets llevan ahora su nombre en el HTML (`data-widget`, con `display: contents` para no tocar
la rejilla ni el árbol de accesibilidad). Sin eso, comprobar qué hay puesto obliga a contar tarjetas
y adivinar cuál es cuál por el texto de dentro.

**Un desajuste encontrado al medir.** El catálogo declaraba un orden —el de la numeración del
§9.1— y la vista y el diálogo dibujaban otro, cada uno con su lista escrita a mano. Nadie lo notaba
porque nada recorre el catálogo para dibujar. El orden bueno es el de la pantalla: tiempo y
presupuesto al final, que son los dos que sólo saben enseñar el aviso de qué falta (§9.4) y en medio
se leerían como huecos. Es la cuarta vez en esta auditoría que dos copias de la misma lista se
separan sin que nadie se entere.

**C4: el avance planificado usa el calendario laborable.** El proyecto va del 2026-06-12 al
2026-11-30; al 2026-08-19 el panel dice **40,2 %**. A mano: 122 días hábiles de proyecto, 49
transcurridos, 49/122 = 0,4016393442622951 — el mismo número que devuelve el servidor, dígito por
dígito. Por almanaque serían 69/172 = 0,4011627906976744, que redondea al 40,1 % y no es lo que
sale. La tarjeta además lo dice en voz alta: «la fracción del calendario laborable ya transcurrida
—no del almanaque—».

## §9.3 C2 — cada métrica contra una cuenta hecha a mano

El criterio pide un proyecto de prueba **pequeño**, y pequeño es la parte importante: en un plan de
1368 líneas no se puede saber si una fórmula está bien, sólo si parece razonable.

`scripts/panel-ocho-lineas.ts` crea ocho líneas con duraciones de cinco días hábiles y de uno, para
que los pesos salgan en enteros; pide el panel al servicio de verdad, no a la fórmula suelta; compara
con quince números escritos a mano en el propio guion; y borra lo que creó. Las quince coinciden:

| | sale | a mano |
|---|---|---|
| avance global ponderado | 0,3695652173913043 | trabajo 4×5+3×1 = 23; hecho 5×1+5×0,5+1×1 = 8,5 |
| avance planificado | 0,65 | 3..19 ago = 5+5+3 = 13 hábiles de 20 |
| atrasadas | 3 | T2, T3 y H2 — T1 y H1 vencieron pero están hechas |
| hojas / resúmenes | 7 / 1 | ocho menos R1, de la que cuelga T4 |
| hitos / atrasados | 3 / 1 | H1, H2, H3 — sólo H2 sin cumplir |
| reparto por estado | TODO 4 · IN_PROGRESS 1 · DONE 2 | sobre las hojas, no sobre las ocho |
| tiempo / presupuesto | null / null | no hay `TimeLog` ni `budget` (§9.4) |

En pantalla: progreso global 37,0 %, 7 líneas de trabajo, 3 atrasadas, 20 días hábiles, planificado
65,0 %, 3 hitos con 1 atrasado. Los mismos números.

**Un defecto de redacción, visto al mirarlo.** Con un solo resumen el panel decía «1 líneas más son
resúmenes: no tienen trabajo propio». Es el caso de cualquier plan pequeño, así que se ve enseguida.
Ahora dice «1 línea más es un resumen: no tiene trabajo propio».

**Una comprobación mía que estaba mal.** Exigía que las fracciones del reparto sumaran 1 exacto;
4/7+1/7+2/7 en binario da 0,9999999999999999. Corregida con tolerancia: era una prueba sobre la coma
flotante, no sobre el reparto.

## §9.3 C6 — legibles en claro y oscuro, y sin depender sólo del color

**La mitad que sí se cierra: no depender sólo del color.** Cada rebanada del embudo lleva su nombre
y su cifra escritos al lado —«Por hacer 4 · 57 %», «En curso 1 · 14 %»—, `BLOQUEADA` sale siempre
con su icono y su nombre, y cada widget de gráfico ofrece «Ver tabla». El color es un canal de
apoyo, no el canal.

**La mitad que no se cierra: el modo claro no existe.** No es un olvido del §9: la aplicación entera
está escrita en oscuro, con los colores puestos a mano en cada componente (`zinc-800`, `#18181b`) y
sin variables de tema. Es la brecha 28 de esta auditoría y es una decisión de producto, no una
tarea de este criterio.

Y hay una razón técnica para no fingir que se arregla con un interruptor. La rampa azul está
comprobada contra la superficie oscura de la tarjeta; medida contra blanco se cae:

| paso | sobre `#18181b` | sobre blanco |
|---|---|---|
| Pendiente `#b7d3f6` | 11,53:1 | **1,54:1** |
| Por hacer `#6da7ec` | 7,08:1 | **2,50:1** |
| En curso `#2a78d6` | 4,01:1 | 4,42:1 |
| Terminada `#184f95` | 2,19:1 | 8,10:1 |

Los dos pasos claros quedan por debajo de 3:1 sobre blanco: sobre papel blanco el «Pendiente» es
casi invisible. Un modo claro no es dar la vuelta a los colores, son **sus propios pasos del mismo
tono**, comprobados contra su propia superficie. Calculados ya, por si la decisión se toma:

| paso | color | sobre blanco | separación con el anterior |
|---|---|---|---|
| Pendiente | `#5492de` | 3,21:1 | — |
| Por hacer | `#2875d2` | 4,60:1 | 1,43:1 |
| En curso | `#1f59a0` | 7,01:1 | 1,52:1 |
| Terminada | `#164072` | 10,45:1 | 1,49:1 |

Mismo tono (h=0,591) y misma saturación que la rampa oscura, luminosidad monótona y ningún paso por
debajo de 3:1. Queda escrito aquí y no en el código: una segunda rampa exportada que nadie usa es
código muerto, y el interruptor que la usaría es lo que hay que decidir primero.

## §9.3 C5 — carga con 5 000 tareas

`scripts/panel-cinco-mil.ts` crea 5 000 líneas de verdad en la base local —diez por resumen, una de
cada cincuenta es hito: la misma forma que usa la prueba de unidad— y las borra cuando se le pide.

Medido con la ruta ya compilada, para que el número sea el coste de las 5 000 líneas y no el de
Turbopack compilando la pantalla la primera vez:

| | dos muestras | mediana |
|---|---|---|
| servidor (consulta + servicio) | 459-576 ms · 513-580 ms | **516 y 534 ms** |
| pantalla (de pulsar la pestaña a widgets dibujados) | | **1 207 y 1 166 ms** |

Por debajo de los dos segundos. Y el número está medido sobre el servidor de **desarrollo**, que es
cota superior: el React de desarrollo no está minificado y hace el doble de dibujado, así que en
producción sale por debajo. Lo que se ve: 4 500 líneas de trabajo, 500 resúmenes, el embudo con sus
cinco rebanadas y el avance ponderado al 55,2 %.

**Por qué no se midió sobre producción, que era lo suyo.** La compilación sale bien —con
`--use-system-ca` para el proxy TLS de la máquina, y con `localhost:3307` horneado, cero RDS
comprobado— pero la sesión del navegador no sobrevive al cambio de servidor y `next start` deja la
pantalla en la de entrar. Como la cota superior ya cumple el criterio, no valía la pena dar más
vueltas; queda anotado por si alguna medición futura necesita producción de verdad.

**Una advertencia para la próxima vez.** `next build` borra el `.next` que el servidor de desarrollo
está usando: si hay uno levantado, se queda sirviendo 500 hasta que se reinicia. No es un fallo del
producto, pero cuesta veinte minutos de despiste.

## §10.4 — la brecha 21 estaba desactualizada

La matriz decía «sólo el panel guarda preferencia». Ya no es cierto y hacía falta comprobarlo antes
de ponerse a implementar algo que ya estaba: las cinco vistas configurables guardan y restauran, y
el servicio tiene esquema de zod para cada una. Comprobado en pantalla, cambiando un control,
recargando la página entera y volviendo a mirar:

| vista | se cambió | tras recargar |
|---|---|---|
| Gantt (pestaña Timeline) | nivel a Fases, flechas a Todas | Fases, Todas |
| Lista | formato a Esquema | Esquema |
| Tablero | agrupar por prioridad | prioridad |
| Carga de trabajo | modo a Tareas | Tareas |
| Panel de control | dos widgets apagados | apagados |

**Un falso negativo que casi me cuesta una implementación entera.** La primera medición dio que el
Gantt no restauraba nada. Era cierto —en `/es/plan`— y no significaba nada: esa ruta monta el mismo
componente **sin `projectId`**, porque enseña el plan del archivo de referencia y no un proyecto, y
el efecto que carga la preferencia se corta a propósito. El Gantt de un proyecto es la pestaña
Timeline, y ahí sí persiste. Medir la superficie equivocada da un número real sobre la pregunta
equivocada.

Todo lo que se tocó para medir quedó como estaba.

## §10.2 — lo que faltaba eran dos columnas que no existen

De los tres pendientes que anotaba la matriz, uno ya estaba hecho y los otros dos no se pueden hacer
sin tocar el modelo.

**La exportación ya respeta el filtro**, y se comprobó donde importa: en la Lista, con la caja de
búsqueda puesta, el botón pasa de «Exportar (1368)» a «Exportar (255)», y el archivo que genera
lleva en su segunda línea «255 de 1368 líneas · 2026-08-19» —interceptando el `Blob` antes de que se
descargue, que es la única forma de leer lo que de verdad se escribió y no lo que uno cree—. Escribir
el «de cuántas» dentro del archivo importa más de lo que parece: un CSV de 255 filas sin ese renglón
es indistinguible de un plan de 255 líneas.

El «Exportar Proyecto» de la barra superior es otra cosa —un informe con niveles de detalle— y
aplicarle un filtro de vista sería recortar un informe, no filtrarlo. Se queda como está.

**Creador y color no existen en `WorkItem`.** El modelo tiene `createdAt` pero no `createdById`, y no
tiene color por línea. Declarar los campos en el registro del filtro sin el dato detrás daría un
filtro que no encuentra nada y parece roto. Son migración, y por tanto de la lista del §2 que espera
decisión — igual que los campos personalizados.

## §10.6 — lo que hace hoy, comprobado moviendo una tarjeta

El Tablero cumple el criterio de punta a punta. Medido en pantalla, con los tres estados:

1. Al entrar: «Deshacer» y «Rehacer» apagados, con sus motivos escritos en el `title` («No hay nada
   que deshacer»).
2. Tras mover una tarjeta de Backlog a To Do: «Deshacer **Mover «Aprobar el plan de trabajo por
   parte del» a To Do**», encendido, con `Ctrl+Z` anunciado en el título.
3. Tras pulsarlo: la tarjeta vuelve a Backlog **en la base**, «Deshacer» se apaga y «Rehacer» se
   enciende con el mismo nombre.

Que el rótulo nombre la operación no es un adorno: «Deshacer» a secas obliga a pulsar para averiguar
qué va a pasar, y en una pantalla donde deshacer escribe en la base eso es un experimento.

**Las tres vistas que pide el §10.6 lo tienen.** La pila vive en el armazón del proyecto
(`project-detail-client.tsx`) y la comparten el Tablero, la Lista y el Gantt de la pestaña Timeline.
Donde no sale es en `/es/plan`, que es el plan del archivo de referencia y no un proyecto — la misma
superficie que ya me había dado un falso negativo con el §10.4. Anotarlo dos veces en una noche
significa que la lección es la superficie, no el caso.

Y el Gantt no solo enseña los botones: apunta **cinco** clases de operación —sangrar y anular
sangría en lote, renombrar, capturar avance, cambiar duración y mover una línea en el árbol—, cada
una con su etiqueta escrita para leerla en el botón. El comentario de una de ellas dice por qué se
apunta también el movimiento suelto: si solo fuera reversible desde la barra de selección, la misma
acción sería reversible desde un sitio e irreversible desde el menú, «que es la clase de
incoherencia que hace que nadie se fíe del Ctrl+Z».

**Lo que falta, y por qué no es enchufar más llamadas.** `Cambio` es `{ workItemId, campos }`: sabe
expresar *parches sobre una línea que ya existe* y nada más. Quedan fuera tres cosas, cada una por su
motivo:

- **Arrastrar una fecha.** Se excluye a propósito y está escrito en el código: mover una línea puede
  empujar quinientas, así que pasa por la previsualización, y prometerlo con un doble clic sería
  saltarse el aviso. Lo bueno es que la reprogramación ya devuelve `cambios` con el `desde` y el
  `hasta` de **todas** las líneas que se movieron, así que la operación de doce líneas que pide el
  §10.6 se puede armar entera. Es trabajo, no un impedimento.
- **Poner y quitar vínculos.** No caben en la forma: un vínculo no es un campo de una línea.
- **Crear y borrar líneas.** Tampoco: un alta no es un parche sobre algo que ya existe.

Las dos últimas piden ampliar el tipo antes de tocar nada, y eso es diseño, no conexión.

## §10.2 — «Es resumen» respondía que no de las 1368

Un filtro que se podía elegir en pantalla y **siempre** decía que no. El campo estaba declarado así:

```ts
isSummary: { tipo: 'booleano', etiqueta: 'Es resumen', leer: () => false }
```

La cabecera de ese mismo archivo explica por qué `color` y los campos personalizados **no** están
declarados: «declararlos aquí haría que un filtro guardado con ellos pareciera válido y no filtrara
nada». Es exactamente lo que hacía `isSummary`, tres pantallas más abajo, en el archivo que enuncia
la regla.

Medido antes del arreglo, en la Lista del plan de referencia:

| | antes | después | lo correcto |
|---|---|---|---|
| «Es resumen = sí» | 0 | **125** | 125 |
| «Es resumen = no» | 1368 | **1243** | 1243 |
| suman | 1368 y 0 | 1368 | 1368 |

Que las dos mitades no sumaran el total es la señal: la misma línea salía en las dos respuestas a la
misma pregunta.

**Por qué estaba así y no era pereza.** «Ser resumen» no se puede saber mirando una línea sola: es
tener hijas, una propiedad del conjunto. La firma `leer(linea, contexto)` no daba forma de
averiguarlo. Ahora el conjunto lo arma `filtrar`, que sí tiene el plan entero delante, y viaja por
el contexto — el mismo sitio por donde ya entraba `hoy`, y por la misma razón: lo que no se puede
deducir de la línea entra por parámetro para poder probarlo.

**Dos extremos, no uno.** Calcular el conjunto no bastaba: la vista construía las líneas filtrables
sin `parentId`, así que el conjunto habría salido vacío igual. Los dos cambios juntos son el
arreglo; cualquiera de los dos solo no habría movido el número, que es la clase de arreglo que se da
por bueno sin comprobarlo en pantalla.

## §10.6 — arrastrar en el Calendario era definitivo

El Calendario escribe la reprogramación **por la misma ruta y el mismo servicio** que el Gantt:
`POST /reschedule` con `confirm: true`. La diferencia era que tiraba la respuesta entera sin
leerla, así que el mismo gesto —arrastrar una línea a otro día— se deshacía desde el diagrama y era
definitivo desde el calendario.

Es literalmente la incoherencia contra la que avisa un comentario del propio código, escrito en otra
ocasión y sobre otro gesto: «la misma acción era reversible desde la barra de selección e
irreversible desde el menú o el teclado — que es la clase de incoherencia que hace que nadie se fíe
del Ctrl+Z».

Ahora lee `resultado.cambios` y avisa con el antes y el después de **todas** las líneas movidas, no
sólo de la arrastrada: una reprogramación empuja a sus sucesoras, y deshacer sólo la arrastrada
dejaría el plan a medio volver. Y la barra de deshacer se dibuja en la pestaña, junto al filtro:
apuntar la operación sin enseñar el botón habría dejado el arreglo a medias —reversible, pero sólo
si cambias de pestaña para verlo—.

La prueba se comprobó por mutación: desconectando el aviso, falla; con él, pasa. Una prueba de un
avisador que pasa con el avisador desconectado no prueba nada, y esta noche ya escribí una así.

**De dónde salió el hallazgo.** De una revisión adversaria: un agente escribió el mapa del §10.6 y
otro tuvo el encargo de refutarlo. El mapa no mencionaba el Calendario —enumeraba las tres vistas
del spec— y fue el refutador quien anotó, como omisión, que el Calendario escribe la misma
reprogramación confirmada y no apunta nada. El encargo de refutar encuentra cosas que el de mapear
no.

## §10.4 — las dos preferencias que el spec llama por su nombre

Cerrada la brecha 21 quedaba lo fino: campos concretos dentro de vistas ya enganchadas. Dos de ellos
el spec los nombra con la palabra «preferencia» y sin embargo eran estado suelto que se perdía en
cada recarga.

**Los resúmenes del Tablero (§5.3).** «Las tareas resumen se muestran o no **según preferencia**;
por omisión sólo hojas e hitos.» Ahora se guarda. Comprobado en pantalla: «Sin resúmenes (125)» →
«Con resúmenes» → recargar la página entera → sigue en «Con resúmenes».

**El conmutador de atrasadas del Gantt (§4.6, `toggles.overdue` del §10.4).** Igual: «Resaltar
(127)» → «Resaltadas (127)» → recargar → «Resaltadas (127)».

Dos detalles que no son adorno:

- Los dos campos son **opcionales** en el esquema de zod. Si fueran obligatorios, estrenar la casilla
  invalidaría todas las filas guardadas antes y cada persona perdería su agrupación por culpa de un
  campo nuevo que no pidió.
- El Tablero lee con `typeof d.settings.conResumenes === 'boolean'` y no con un valor blando.
  `false` es una elección tan válida como `true`: preguntando por la verdad del valor, apagar los
  resúmenes no se guardaría nunca y la casilla volvería sola.

Lo que sigue faltando del §10.4, ya con nombre y apellido: `toggles.criticalPath` y `toggles.float`
—que no existen como conmutadores, la ruta crítica y la sombra de holgura se pintan siempre—,
`toggles.baseline`, `splitterPosition` —hoy la posición del divisor es derivada, la suma de los
anchos de columna—, el ancho por columna en la Lista, y `sortBy` en la Lista. Ninguna es una
conexión: cada una pide construir antes lo que se va a guardar.

## §4.6 conmutador 3 — ruta crítica y reserva, dos casillas independientes

No existía: la ruta crítica se pintaba **siempre** y la sombra de holgura también. El §4.6 pide un
submenú con dos casillas independientes —«ruta crítica: barras críticas en rojo» y «reserva: añade
las columnas Total float y Free float, y dibuja la holgura como sombra»— y el §10.4 pide guardarlas
(`toggles.criticalPath`, `toggles.float`).

**Por qué poder apagar la ruta crítica no es un capricho.** En el plan de referencia el 95 % de las
líneas no tiene días de sobra. Medido en pantalla, a todo el detalle: con el conmutador encendido
salen 3 barras rojas y 18 naranjas de 21; apagado, las 21 en indigo. Un diagrama donde casi todo es
crítico no señala nada, y el color deja de ser información para ser decoración. Los 7 resúmenes
siguen grises en los dos casos, porque el gris de un resumen no es criticidad: es qué clase de línea
es.

**La reserva arrastra sus columnas.** El §4.6 lo dice en una frase, así que es una elección y no dos:
encenderla añade `HOLGURA TOTAL` y `HOLGURA LIBRE` a la rejilla y dibuja la sombra —de 0 a 19
sombras, medido—, y apagarla se las lleva. En orden de catálogo, no al final, para que la rejilla no
cambie de forma según en qué orden se pulsó.

**Y de paso se arregló una incoherencia que llevaba puesta.** La sombra de holgura se dibujaba
siempre mientras sus dos columnas estaban apagadas por omisión: el margen se veía y no se podía
leer. Ahora las dos mitades arrancan de acuerdo.

Comprobado en pantalla de punta a punta: estado limpio → apagar la ruta crítica → encender la
reserva → recargar la página entera → las dos elecciones siguen puestas.

## §4.6 conmutador 4 — la línea base elegida se recuerda

El desplegable ya existía entero —«Tomar una foto del plan de hoy», «Ninguna», y la lista de fotos
con radio— pero la elección arrancaba en blanco en cada visita. Quien compara contra una foto para
leer el desvío tenía que volver a elegirla cada vez.

Ahora vive en la preferencia (`toggles.baseline` del §10.4, que en su ejemplo guarda un
identificador). Comprobado en pantalla: elegir «Plan comprometido con el banco» → recargar la página
entera → el botón dice «Línea base: Plan comprometido con el banco» y **se dibujan las 27 barras de
la foto** con su desvío. Restaurar el rótulo sin restaurar la comparación habría sido medio arreglo,
y por eso se contaron las barras y no el texto.

Se guarda el **identificador** y no las fechas. Las fechas de una foto no cambian, pero la foto puede
borrarse: guardar una copia daría una comparación contra algo que ya no existe, y nadie podría
reproducirla. Si el identificador guardado desaparece, la pantalla se queda sin comparación, que es
lo correcto.

El esquema lo declara `nullable` **y** `optional`, y no son lo mismo: `null` es «ninguna», que es una
elección explícita que hay que poder guardar; ausente es «esta preferencia se guardó antes de que el
campo existiera».

Con esto los cuatro conmutadores del §4.6 existen y los cuatro se recuerdan.

## §10.1 — los diez permisos de proyecto existen

El spec pide como mínimo diez permisos con nombre y **una sola función de autorización**. Ahora
están, en dos piezas: `lib/projects/permisos.ts` es aritmética pura —entra un cargo y un papel, sale
un conjunto— y `services/project-authorize.service.ts` es quien lee la base. Separarlas permite
probar la tabla entera sin levantar nada, que es donde de verdad se ve si una casilla quedó cruzada:
veintidós pruebas sin base de datos.

**El permiso efectivo es una intersección, no una suma.** Lo que el cargo permite, recortado por lo
que el papel en el proyecto permite. Las dos mitades son techo:

- Un **ejecutivo** nombrado propietario de un proyecto sigue sin poder editarlo. Un techo que se
  salta nombrando a alguien no es un techo.
- Un **administrador** invitado como cliente ve lo de un cliente. Es la mitad que más se olvida: el
  cargo alto no abre el proyecto de par en par si allí te sentaron como invitado.
- Y sin papel en el proyecto no hay nada. Pertenecer a la organización no da acceso a un proyecto al
  que nadie te invitó: es la diferencia entre una lista de proyectos y una carpeta compartida.

**Cuatro papeles y no dos.** `ProjectCollaborator.role` sólo contemplaba OWNER y COLLABORATOR, y con
eso no hay dónde sentar al perfil que el §10.1 describe con nombre y apellido: «un cliente externo
al que dar Lista y Tablero pero no el Gantt ni el presupuesto». Ahora hay CLIENT y MANAGER.

**La distinción que el spec llama la más útil.** `edit_schedule` frente a `edit_tracking`, y de
verdad independientes: un colaborador actualiza su avance y no mueve una fecha. La razón es
concreta —mover una fecha en un plan encadenado empuja a las sucesoras, y eso es decisión de quien
lleva el plan, no de quien lleva la tarea—.

**Demostrado en pantalla**, cambiando el papel del usuario en la base y recargando:

| papel | pestañas visibles | permisos |
|---|---|---|
| OWNER | las diez | los diez |
| COLLABORATOR | las diez | seis vistas + `edit_tracking` |
| CLIENT | **siete**: sin Timeline, sin Calendario, sin Carga | `view_board`, `view_list`, `view_dashboard` |

Se **esconden**, no se deshabilitan: una pestaña gris que no se puede pulsar le informa a un cliente
externo de que existe un Gantt que no le enseñan, y eso es peor que no mencionarlo.

**Lo que falta, y no es poco.** Esconder una pestaña es cortesía, no seguridad — está escrito en la
cabecera de la ruta para que nadie lo confunda. Queda llamar a `authorize()` desde cada ruta de
escritura: hoy siguen guardadas por el RBAC de organización, que sí impide lo grave pero no
distingue proyecto de proyecto. Y falta una pantalla para repartir papeles; hoy se hace con un guion
(`scripts/permisos-de-proyecto.ts`).

### §10.1 — la guardia muerde, medido petición a petición

Esconder una pestaña es cortesía; lo que decide es el servidor. Medido con peticiones reales sobre
el plan de referencia, cambiando el papel del usuario en la base entre una tanda y otra:

| | mover fecha (ruta de la línea) | `/reschedule` | capturar avance |
|---|---|---|---|
| **CLIENT** | 403 | 403 | **403** |
| **COLLABORATOR** | 403 | 403 | **200** |
| **OWNER** | 200 | 200 | 200 |

La fila del colaborador es el §10.1 entero en una línea: actualiza lo suyo, no mueve el plan.

**Un agujero encontrado al medir, no al leer.** La primera tanda como CLIENT dio 403 en las dos
puertas de fechas y **200 en capturar avance**. Es lógico visto en frío —sólo había guardia sobre
las fechas— y no se ve leyendo el código, porque cada guardia por separado parece correcta. Un
cliente externo con permiso de organización para editar líneas podía escribir avance en un proyecto
donde sólo se le invitó a mirar. Ahora cualquier escritura sobre una línea pide `edit_tracking`.

**Una prueba que daba por buena una premisa vieja.** «Un consultor interno puede editar cualquier
tarea de su organización» pasaba porque el permiso de organización bastaba. Con el §10.1, «de su
proyecto» dejó de significar «de su organización»: hace falta estar sentado en el proyecto. La
prueba se actualizó y se le añadió la contraria —el mismo consultor, sin fila en ese proyecto,
recibe 403— porque eso es exactamente lo que el §10.1 añade sobre lo que ya había.

Los datos quedaron como estaban: 1368 líneas, 1665 vínculos, cierre el 2026-11-30.

### §10.1 — todas las puertas que escriben, medidas una a una

`lib/middleware/exigir-permiso.ts` reduce la guardia a dos líneas por ruta, que es lo que decide si
se usa: el §10.1 pide invocarla «sin excepción», y una guardia que cuesta doce líneas de
`try`/`catch` por ruta se olvida en la séptima. Devuelve la respuesta armada en vez de lanzar, porque
una ruta que ya está dentro de su propio `try`/`catch` convertiría el 403 en el 500 genérico del
final — que es exactamente lo que pasó la primera vez que se enchufó a mano.

Medido con peticiones reales, cambiando el papel entre tandas:

| puerta | permiso | CLIENT | COLLABORATOR | OWNER |
|---|---|---|---|---|
| crear una línea | `edit_schedule` | 403 | 403 | 200 |
| poner un vínculo | `edit_schedule` | 403 | 403 | 200 |
| quitar un vínculo | `edit_schedule` | 403 | 403 | 200 |
| reordenar | `edit_schedule` | 403 | 403 | 200 |
| mover una fecha | `edit_schedule` | 403 | 403 | 200 |
| `/reschedule` | `edit_schedule` | 403 | 403 | 200 |
| mover de columna | `edit_tracking` | 403 | **200** | 200 |
| capturar avance | `edit_tracking` | 403 | **200** | 200 |

Las dos últimas filas son el §10.1 entero: quien ejecuta actualiza lo suyo y no mueve el plan de
nadie.

**Por qué un vínculo pide el permiso del plan y no el de seguimiento.** Ponerlo o quitarlo cambia
las fechas de la sucesora y de todo lo que cuelgue de ella; quitarlo, además, deja que la sucesora
se adelante, que es un cambio de fechas por omisión en vez de por gesto. Y reordenar cambia el EDT,
porque la numeración sale del orden entre hermanas.

Todo lo que estas mediciones escribieron quedó devuelto: 1368 líneas, 1665 vínculos, cierre el
2026-11-30, y las dos tarjetas que se movieron, en su columna.

## §4.1 — el divisor entre la rejilla y la línea de tiempo

El §4.1 lo pide arrastrable y guardado. Existía la posición pero era **derivada**: la suma de los
anchos de columna. Estrechar la rejilla obligaba a estrechar seis columnas una a una.

**Lo que evita el problema que el propio archivo avisaba.** Si el divisor fijara los anchos habría
dos números que mantener de acuerdo y uno acabaría mintiendo. Aquí el divisor dice **cuánto se ve**
y las columnas siguen mandando sobre cuánto miden: si no caben, la rejilla se desplaza por dentro.
Es lo que hace cualquier Gantt, y son dos preguntas distintas, no dos respuestas a la misma.

Se guarda `null` y no una cifra cuando está suelto: guardar «lo que midan» como número congelaría el
divisor la primera vez que alguien encendiera una columna. Y se acota **al leer**, por lo mismo que
los anchos: lo guardado puede venir de otra pantalla.

Comprobado en pantalla, arrastrando con el ratón de verdad: 648 px → **448 px**, la rejilla pasa a
desplazarse por dentro, se guarda 448, y tras recargar la página entera sigue en 448. El doble clic
lo devuelve a 648 y guarda `null` — es la salida para quien lo estrechó de más, que si no tiene que
arrastrar hacia atrás a ciegas.

**Un fallo de medición que casi lo da por roto.** El primer arrastre no hizo nada: el tirador mide
1372 px de alto y arranca fuera de la ventana, así que los eventos de ratón caían en el vacío. Se
veía exactamente igual que «el divisor no funciona».

## §9.3 C3 — una regresión encontrada al volver a medir

Al comprobar otra cosa, el conmutador del Gantt decía **126** y el Panel **127**. La diferencia era
una sola línea: «Inicio: presentar y aprobar el plan de trabajo», un resumen con el fin **guardado**
en el 19 de junio mientras sus hijas llegan al 6 de octubre. El Panel la contaba atrasada con la
fecha rancia; el Gantt no, porque usa la del motor.

Arreglado por donde había que arreglarlo: **un resumen no se atrasa**. No tiene trabajo propio —el
Panel ya lo excluía del avance ponderado por eso— y contarlo cuenta dos veces el atraso de sus
hijas; en un plan de siete niveles, el mismo día de retraso se contaría siete veces.

Y al hacerlo apareció, otra vez, el mismo patrón: **dos definiciones de «resumen»**. Escribí «es de
clase RESUMEN» y el Panel dice «tiene hijas». No son lo mismo — en el plan de referencia hay catorce
líneas marcadas RESUMEN de las que sí cuelga gente, y la clase declarada decide el gris, no la
cuenta. Unificado en «tener hijas», que es lo que el Panel ya usaba.

Las dos cifras dan ahora **113**, mismo conjunto, comparado línea a línea con el motor de verdad. Y
esta vez coinciden por la regla: la definición es una sola.

**De paso, una lección sobre medir.** La primera comparación decía 127 contra 113 y culpaba a mi
cambio. No era eso: el guion de comparación calculaba el lado del Panel **por su cuenta**, con la
regla vieja. Medía el código de ayer contra el de hoy y llamaba defecto a la diferencia.

## §10.4 — ordenar la Lista por columna

Faltaba entero: no había ningún estado de orden en la Lista. Ahora las cabeceras se pulsan y la
elección se guarda (`sortBy` del §10.4).

**Tres estados y no dos.** Ascendente → descendente → **el orden del plan**. El tercero no es un
capricho: el orden natural de un plan —el del archivo, el del EDT— es información, y sin forma de
volver a él habría que recargar la página para recuperarlo. Pulsar otra columna empieza en
ascendente y no hereda el sentido de la anterior, que daría una tabla al revés sin que nadie lo
pidiera.

**Sólo en los formatos planos.** En el esquema el orden ya significa algo: es la jerarquía, y el EDT
se lee de ella. Ordenar por fecha allí no reordenaría una tabla, desarmaría un árbol — una hija
antes que su madre, con la sangría diciendo una cosa y el orden otra.

**Tres decisiones que se notan al usarlo:**

- **Los vacíos van al final en los dos sentidos.** Una línea sin responsable no es «el responsable
  más pequeño»: es una de la que no se sabe eso. Arriba llenaría la primera pantalla de huecos justo
  cuando alguien busca quién lleva qué. Un cero, en cambio, sí es un dato y ordena como número.
- **Los empates conservan el orden del plan.** Una tabla que baraja los empates parece que cambia
  sola cada vez que se dibuja.
- **El texto se compara con `localeCompare` en español.** Por código, «Ñ» cae después de «Z» y
  «abrir» después de todas las mayúsculas, y a nadie le parece una lista ordenada.

Comprobado en pantalla sobre las 1247 líneas: sin ordenar sale el orden del plan; ascendente empieza
por «[Banco] Confirmar las ventanas»; descendente por «VPC y subredes de QA»; se guarda
`{"campo":"title","sentido":"desc"}`; y tras recargar la página entera sigue descendente con las
mismas filas. El tercer clic devuelve `null` y el orden del plan.

**Y dos pruebas que fallaban por el reloj, no por el código.** `password.test.ts` (bcrypt es lento a
propósito) y el archivo entero de `project-detail-client` (monta la pantalla completa trece veces)
se iban de los cinco segundos por omisión dentro de la suite, y pasaban sueltas. Cada una se cayó ya
dos veces en días distintos; perseguirlas de una en una es arreglar el síntoma. Margen al archivo,
con el motivo escrito.

## §10.4 — el ancho por columna en la Lista, y con eso la sección entera

Era el último hueco: la Lista dibujaba anchos escritos a mano en el JSX, sin catálogo y sin tirador.
Ahora cada columna declara su ancho y su mínimo, se redimensiona arrastrando y el ancho se guarda.

**Una cosa que hay que hacer o el tirador parece roto.** La tabla necesita `table-fixed`. Sin eso el
navegador reparte el ancho a su gusto y los anchos guardados no se notan: la tabla se «arregla» sola
y quien arrastra ve que no pasa nada. Se comprobó midiendo las dos cosas a la vez —el ancho
declarado y el que de verdad ocupa la celda— porque comprobar sólo uno de los dos deja pasar
exactamente ese fallo.

Comprobado en pantalla: «Estado» pasa de **132 a 222 px** arrastrando con el ratón, se guarda
`{"status":222}`, y tras recargar la página entera sigue en 222 con el ancho real igual al
declarado.

Con esto el §10.4 queda completo: columnas con su ancho, zoom, posición del divisor, los cuatro
conmutadores, agrupación, orden y formato de lista. Las cinco vistas configurables guardan y
restauran; el Calendario no guarda nada y está razonado.

## §10.1 — la pantalla para repartir papeles

Repartir papeles se hacía con un guion contra la base. Ahora hay pantalla, en el Resumen del
proyecto y no escondida tras un ajuste: quién ve qué es información del proyecto, y esconderla hace
que nadie lo sepa hasta que hay un problema.

**Cada fila dice qué significa su papel, no sólo cómo se llama.** «Colaborador» no le dice a nadie
que puede capturar avance y no mover fechas, y esa es justo la distinción que hay que entender para
repartir bien. En pantalla se lee «Quien ejecuta — actualiza estado y avance de sus líneas. No mueve
el plan de nadie».

**El desplegable dice qué se gana o se pierde**, y la frase se **calcula** comparando los dos
conjuntos de permisos. Escribirla a mano daría dieciséis frases que envejecen por separado, y la
primera que se quedara vieja mentiría sobre permisos.

**El propietario sale y no se toca.** Lo es por ser dueño del proyecto, no por una fila, así que:
esconderlo diría que el proyecto no tiene propietario, y ofrecer cambiarlo sería ofrecer algo que el
servidor rechaza — comprobado, devuelve **409** con el motivo. Sale con su papel y un título que
explica que se cambia cambiando el propietario del proyecto.

**Lo que escribe pide `manage_project_settings`**, que es el permiso del propietario. Repartir
papeles es repartir permisos: quien pudiera hacerlo sin ese permiso podría dárselo a sí mismo.

Comprobado en pantalla de punta a punta: los dos implícitos salen fijos, se da de alta a alguien
como cliente por la ruta nueva (200), se cambia a «quien ejecuta» desde el desplegable, y el
servidor confirma `Executive User=COLLABORATOR`. Después se quitó y el proyecto quedó con sus dos de
siempre.

## §10.6 — los vínculos ya se deshacen

Era una de las tres cosas que no cabían en la forma `Cambio`. Un vínculo **no es un campo de una
línea**: vive entre dos, y su inversa no es «escribir el valor de antes» sino la operación
contraria. Por eso creció el tipo con un canal propio en vez de forzarlo dentro del que había.

**Tres decisiones que se notan:**

- **El tipo y el desfase viajan también al quitar.** Para deshacer una eliminación hay que reponer
  el vínculo **igual** que estaba, y ese dato ya no está en la base cuando toca reponerlo. Se lee
  antes de borrar, no después.
- **El canal es opcional.** Las operaciones que ya existían —mover de columna, renombrar, capturar
  avance, sangrar— no tocan vínculos, y obligarlas a declarar dos listas vacías sería ruido en cada
  sitio que apunta una. Quien no lo trae, no toca ninguno. Y al leerlo sale lista vacía y nunca
  `undefined`: quien la recorre no comprueba, y un `undefined` reventaría el paso entero.
- **Los vínculos se escriben antes que las fechas.** Si se pusiera el vínculo después de devolver
  las fechas, el motor lo aplicaría sobre unas ya escritas y podría volver a moverlas — deshacer
  acabaría dejando el plan en un sitio distinto del que estaba.

Y `aplicar` recibe ahora el **lado entero** de la operación —campos y vínculos— en una sola llamada:
en dos, si la segunda fallara, media operación quedaría aplicada y la pila diría que se deshizo
entera.

Comprobado en pantalla con el editor de vínculos: **1665 → 1666** al capturar, el botón pasa a decir
«Deshacer Vincular con «Aprobar el plan de trabajo por parte del banco»», y al pulsarlo **1666 →
1665**. El plan quedó igual: 1368 líneas, 1665 vínculos, cierre el 2026-11-30.

## §10.6 — las altas y las bajas de línea, y con eso la sección

Era lo último que no cabía en el tipo. Un alta no es un parche sobre algo que ya existe y una baja
no deja nada que parchear, así que las dos comparten un canal propio.

**La foto es lo que hace posible deshacer una baja.** Se toma **antes** de borrar —después no hay a
quién preguntarle— y conserva el identificador, porque las hijas y los vínculos apuntan a él:
reponerla con otro dejaría todo eso señalando a una línea que nadie conoce. Por eso hay una ruta
aparte, `work-items/restore`: crear y reponer no son lo mismo, y dejar que el alta normal aceptara
un identificador cualquiera permitiría escribir sobre el hueco de una línea ajena. La ruta comprueba
que **no exista** antes de reponer.

**Los vínculos van en la misma operación.** El borrado se los lleva en cascada, así que reponer la
línea sin ellos devolvería una línea suelta y diría que se deshizo. Medido: borrar una línea con un
vínculo deja el proyecto en **2 líneas y 0 vínculos**; deshacer lo devuelve a **3 y 1**.

**Y la madre sólo se repone si sigue viva.** Si se borró la rama entera y esta línea vuelve primero,
colgarla de una madre que ya no está reventaría la clave foránea y dejaría el deshacer a medias. Sin
madre queda en la raíz: visible, y se arregla a mano.

**El alta lleva su foto en el lado de rehacer**, no en el de deshacer. Deshacer un alta sólo necesita
saber a quién borrar; rehacerla es volver a crear **la misma** línea con el mismo identificador, no
una parecida. Medido: crear deja el proyecto en **4 líneas** con el botón diciendo «Deshacer Crear
«Línea de prueba del deshacer»», y deshacer lo devuelve a **3**.

**Un fallo de mi banco de pruebas, no del producto.** El primer intento de alta devolvía 400 con «No
Kanban column found for status: BACKLOG»: había creado el proyecto de prueba prestándole una columna
del proyecto de referencia, que es de otro proyecto. El síntoma parecía un defecto del alta.

Con esto el §10.6 queda cerrado salvo arrastrar fechas, que está fuera **a propósito**: pasa por la
previsualización, y prometer con un doble clic lo que la previsualización avisa sería saltarse el
aviso.

## §2.3 — el EDT dejaba de servir en cuanto alguien añadía una línea

`createWorkItem` nunca ponía `templateOrder`, así que toda línea creada a mano nacía con el campo
nulo. Y el plan se lee ordenado por ese campo: **en MySQL los nulos van primeros**. Resultado: cada
alta se colaba al **principio** del plan y renumeraba el EDT entero.

Medido en pantalla, sobre un proyecto de tres líneas:

| | el plan, en orden |
|---|---|
| antes del alta | Línea 1 · Línea 2 · Línea 3 |
| tras el alta, **antes** del arreglo | **Línea nueva** · Línea 1 · Línea 2 · Línea 3 |
| tras el alta, **después** | Línea 1 · Línea 2 · Línea 3 · **Línea nueva** |

Por qué importa más de lo que parece: el EDT sirve para una sola cosa —nombrar una línea en una
reunión y que todos miren la misma— y eso exige que no baile. Con el defecto, cualquier acta que
dijera «la 4.7» dejaba de señalar lo mismo en cuanto alguien creaba una tarea.

Al final y no al principio porque lo que se acaba de añadir es lo último que se pensó.

**Lo que queda de esta brecha.** `templateOrder` sigue siendo nulable, sin índice y global al
proyecto en vez de entre hermanas — el `sortOrder` del §2.2 es otra cosa y entra en la lista del §2
que espera decisión. Y dos altas simultáneas pueden empatar en el mismo puesto: no rompe nada, el
orden entre esas dos queda indefinido y estable, y resolverlo pediría una secuencia por proyecto.

## §5.5 — dar de alta y de baja columnas del tablero

El spec lo pide con esta frase: «los estados son configurables por proyecto, no un enum fijo: el
Tablero se agrupa por ellos y **el usuario necesita poder añadir columnas**». La tabla existía desde
el principio; lo que faltaba era poder tocarla sin entrar a la base.

Va en el propio tablero y no en un ajuste lejano: quien nota que le falta una columna la está
notando faltar ahí.

**Las dos columnas que no se pueden quedar sin dueño.** La **inicial** —donde nacen las tareas— y la
de **terminado** —de la que depende el avance al 100 %—. Borrar cualquiera de las dos dejaría el
proyecto sin sitio donde poner una tarea nueva o sin forma de decir que algo acabó, y el fallo
aparecería mucho después de la decisión, al crear. Medido en pantalla: las dos salen con «Quitar»
apagado y el motivo en el título.

Y no hay «desmarcar»: se marca otra, y esa se lleva la marca. Desmarcar sería la forma de dejar el
proyecto sin columna inicial en un solo clic.

**Una columna con tarjetas no se borra a la ligera.** Hay que decir **a dónde** van primero, y el
aviso dice cuántas son —«"To Do" tiene 1 tarjeta»— porque borrar una columna vacía y una con treinta
tareas son dos decisiones distintas y el número es lo único que las distingue. Mover y borrar van en
**una transacción**: si no, existiría el instante en que las tarjetas apuntan a una columna que ya
no está.

Comprobado en pantalla: añadir «En revisión» la deja en la lista con 0 tarjetas, el aviso dice «Se
quita la columna «En revisión», que está vacía», y quitarla devuelve el tablero a sus cinco.

**Lo que no hace, y por qué.** Reordenar. `KanbanColumn` tiene `@@unique([projectId, order])`, así
que mover una columna a un puesto ocupado no es un `update` sino un corrimiento de todas las de en
medio dentro de una transacción. Aceptar un `order` suelto daría un error de clave única disfrazado
de fallo del servidor.

**Un defecto encontrado por una prueba, no por la pantalla.** El componente hacía `.map` sobre la
respuesta sin comprobar su forma, y como vive dentro de la pestaña del tablero, una respuesta 200
con otra cosa dentro se llevaba por delante la página entera —incluida la barra de pestañas—. Lo
cazó la prueba de cambio de pestañas: dejó de encontrar «Elementos de Trabajo». Un trozo que no sabe
qué enseñar dice que no lo sabe; no tira la pantalla.

**Y un choque de nombres que ensució mi propia medición.** Marqué las filas con `data-columna`, que
es el atributo que el tablero ya usa para sus columnas: la primera medición devolvió las dos cosas
mezcladas, 130 filas donde había cinco. Renombrado a `data-columna-del-tablero`.

## §4.6 conmutador 4 — el valor original en la rejilla

La matriz decía que faltaban dos cosas y sólo faltaba una. **La barra fina bajo cada barra sí
estaba** —28 dibujadas, contadas— y el selector **sí** está en el Gantt: pone «Línea base: Plan
comprometido con el banco» en la barra de herramientas. Comprobarlo antes de construir ahorró
reimplementar las dos.

Lo que faltaba era la otra mitad de la frase del spec: «en el grid, el valor original en rojo junto
al actual». Ahora las columnas de inicio y fin llevan el corrimiento al lado —`2026-07-02 +9 d` en
rojo— con la fecha de la foto en el título.

**Tres decisiones:**

- **Sólo cuando se corrió.** Enseñar «2026-06-12» en gris junto a «2026-06-12» sería repetir el
  mismo dato en cada fila y convertir la rejilla en ruido. Lo que informa es la diferencia.
- **El corrimiento del cierre se calcula aparte del de arranque.** Una línea puede empezar a tiempo
  y acabar tarde —porque se alargó— y con un solo número eso no se ve. Ahora hay `baseDrift` y
  `baseFinishDrift`.
- **El color no va solo.** Rojo lo que se fue más tarde, verde lo que se adelantó, y el signo
  escrito: el color por sí solo no dice cuánto, y «+9 d» cabe en la celda mejor que una frase.

Una línea que no estaba en la foto no se compara: no tiene contra qué, y darle un corrimiento sería
inventarse un compromiso que nadie hizo.

## §5.4 C1 — cambiar la agrupación reconstruye las columnas sin recargar

Medido en pantalla, cambiando el desplegable y sin tocar la página:

| agrupado por | columnas |
|---|---|
| Estado | Backlog · To Do · In Progress · Blockers · Done |
| Prioridad | CRITICAL · HIGH · MEDIUM · LOW |
| Responsable | Bryan Hernández · Gestión del Cambio · José Cruz · Rafael Oliva · Salomón Suárez |

Y de vuelta a estado, las cinco de siempre. Con esto y las columnas configurables, la brecha 14
queda cerrada.

## Brecha 30 — una revocación que tardaba treinta días no es una revocación

La sesión es JWT: los roles viajan **dentro** del token, que valía treinta días y nunca se releía.
Quitarle un permiso a alguien no se lo quitaba — seguía entrando con el token de antes hasta que
caducara o volviera a entrar. Salió probando la guardia del §10.1: los primeros intentos pasaban con
un token viejo, y parecía que la guardia no funcionaba.

**La respuesta no es releer en cada petición**, que sería una consulta por cada llamada de la
aplicación, sino **acotar** cuánto puede tardar y decir el número. Cinco minutos: una consulta cada
cinco minutos por sesión activa, y una respuesta concreta cuando alguien pregunta «¿cuánto tarda en
aplicarse?».

Medido con el reloj, quitando `ADMIN` y `PROJECT_MANAGER` en la base y mirando la sesión:

| | roles en la sesión |
|---|---|
| t=0 s | ADMIN · PROJECT_MANAGER |
| t=240 s | ADMIN · PROJECT_MANAGER |
| **t=300 s** | **EXECUTIVE** |

Justo en el plazo, ni antes ni mucho después.

**Tres decisiones que se notan:**

- **Sin marca de tiempo, se relee.** Un token emitido antes de que esto existiera no tiene el campo,
  y tratarlo como recién leído lo dejaría con los roles viejos otros treinta días — que es
  exactamente el defecto que se está arreglando.
- **Una cuenta dada de baja se queda sin roles**, no con los de antes. Se comprueba lo mismo que al
  entrar.
- **Si la base no responde, se conserva lo que había.** Dejar a todo el mundo sin permisos porque la
  base tosió es peor que cinco minutos de retraso.

La decisión vive en `lib/auth-refresco.ts` y no dentro del callback de NextAuth, por una razón
práctica: es aritmética con un reloj, y probarla dentro pediría levantar media autenticación o
esperar cinco minutos de reloj real **por caso**. Fuera son trece pruebas instantáneas.

## §3.1 y §3.7 — el calendario y las asignaciones, sin entrar a la base

Dos cosas que existían en el modelo, que el motor leía, y que sólo se podían crear con un cliente de
MySQL.

**El calendario del proyecto (brecha 27).** Semana laborable, país de festivos y festivos propios.
Pide `edit_schedule` y no un permiso de ajustes, porque cambiarlo **mueve fechas**: quitar el viernes
de la semana corre el cierre de mil líneas. Es la decisión de plan más silenciosa que hay, porque el
efecto no se ve donde se pulsa.

Comprobado contra el servidor:

| | resultado |
|---|---|
| leer sin fila guardada | 200 con lunes a viernes y `guardado: false` |
| semana vacía | **400** · «no alarga el proyecto: lo hace imposible de programar» |
| festivo el 30 de febrero | **400** · «2026-02-30: Esa fecha no existe» |
| añadir el sábado | 200, y el motor pasa a `[1,2,3,4,5,6]` |
| borrar la fila | vuelve al calendario de por omisión |

Sin fila se devuelven los valores de por omisión y **no un 404**: el proyecto tiene calendario
—lunes a viernes— aunque nadie haya escrito la fila, y un 404 haría creer que no lo tiene. Se
distingue con `guardado`, porque quien administra necesita saber si mira lo guardado o lo heredado.

Y una regla que parece de detalle: `2026-02-30` **parsea** a marzo, así que validar el formato no
basta; hay que comprobar la ida y vuelta.

**Las asignaciones (parte de la brecha 11).** Asignar y desasignar recursos a una línea. Lo que se
impide es una dedicación imposible —cero, negativa, o más del doble de una jornada, que casi siempre
es un dedo que resbaló—. Lo que **no** se impide es pasarse del 100 %: porque pasa, y entonces la
persona sale sobrecargada, que es exactamente lo que la vista de carga existe para enseñar.
Impedirlo aquí escondería el problema.

**Y una corrección a la matriz.** Decía que la fórmula del §3.7 «usa una constante en vez de minutos
laborables». No es cierto: usa `dailyMinutes` **del recurso**, que es lo que el modelo permite. Lo
que falta para que `minutosLaborables(cal, d)` varíe por día son las franjas horarias, y ésas son
del §2.

## §12 — la batería, y el defecto que apareció al escribirla

El spec presenta estos veinticuatro casos así: «separan un Gantt correcto de uno de juguete», y pide
escribirlos **antes** de dar la etapa por buena. Diez ya tenían prueba con su número, repartidos por
sus archivos temáticos. Ahora están los demás en `bateria-12.test.ts`, con el número en el título
para que la cobertura se pueda auditar leyendo los nombres.

**El caso 6 encontró un defecto de verdad en el motor.** `A —SF→ B` hacía que B terminara el día
hábil **anterior** al arranque de A. El spec dice lo contrario —«B no puede terminar antes de que A
empiece»— y MS Project también: «the successor cannot finish until the predecessor starts».

Estaba puesto a propósito y razonado en el código como «el reflejo exacto de FS». No lo es, y ésa es
la parte que vale la pena entender: el `+1` de FS existe porque une **fin con inicio**, dos extremos
distintos que no pueden caer el mismo día. SF une **inicio con fin**, que sí pueden coincidir — y
coincidir es exactamente lo que describe un relevo: lo viejo acaba el día que lo nuevo arranca.

El día sobraba en los dos pases: adelante daba una fecha equivocada, y atrás le regalaba una jornada
de holgura a toda la cadena que colgara de un SF. Estaba encodado en **cuatro** pruebas, que también
se corrigieron.

El plan de referencia no usa ningún SF —802 SS, 704 FS, 159 FF y ni uno SF— así que corregirlo no
movió ninguna fecha real. Comprobado después: 1368 líneas, 1665 vínculos, cierre el 2026-11-30, y
las dos cifras de atrasadas siguen en 113.

**El caso 13 pedía algo que no existía.** El modo «Promedio» del avance de un resumen. Ahora está,
en `lib/scheduling/rollup-modos.ts`, con los dos modos y el mismo ejemplo del spec: cuatro días
hechos de ocho dan **50 %** ponderando por duración y **20 %** promediando. Ninguno es «el
correcto»: responden preguntas distintas —«cuánto trabajo está hecho» y «cuántas cosas están
hechas»— y por eso el §2 los pone como configuración del proyecto. Elegirlo pide `progressRollup`,
que no existe todavía.

**Dos casos no se pueden escribir contra este motor, y decirlo es más útil que omitirlos.** El 2
(jornada partida 8:00–12:00 / 13:00–17:00) y el 23 (cambio de horario de verano dentro de una tarea)
piden hora del día, y el motor está sobre ordinales de día hábil a propósito. Son la migración de
duración en minutos del §2. Ponerles una prueba que pase con días redondos sería decir que están
cubiertos.

**El caso 24 pasa, pero la prueba estuvo mal escrita dos veces.**

1. **Un tope en milisegundos de reloj** —400—. Fallaba dentro de la suite completa y pasaba sola:
   676 ms acompañada, 119 ms el archivo entero por su cuenta. No medía el motor, medía cuántos
   núcleos libres había.
2. **La razón entre 10 000 y 1 000 tareas**, con tope ×30. La idea era la correcta —lo que separa un
   motor que aguanta de uno con un recorrido cuadrático escondido es la **forma de la curva**— y se
   escribió aquí que era «inmune a la contención porque una máquina ocupada frena las dos medidas
   por igual». **No lo era**: programar 1 000 tareas cuesta cerca de 1 ms, y dividir por un número
   tan pequeño amplifica su ruido en vez de cancelarlo. Salió **34,07 contra 30** y la suite se puso
   roja sin que el motor hubiera cambiado.

La tercera iguala el **trabajo total** de las dos medidas: diez pasadas de 1 000 contra una de
10 000. Ahora sí duran lo mismo, que es lo que la segunda daba por hecho sin cumplirlo. Medida diez
veces seguidas, la razón va de **1,08 a 1,40** contra un tope de 3 — y un motor cuadrático daría
≈10. Eso es margen; lo anterior rozaba el tope y por eso lo cruzaba de vez en cuando. Lo mismo para
el pase atrás del CPM.

Dos veces mal la misma prueba, y las dos veces el síntoma fue el mismo: **rojo en la suite completa,
verde en solitario**. Un fallo intermitente no es ruido que ignorar hasta que se calme; es una
prueba que está midiendo otra cosa que la que dice medir.

---

## §3.4 · `ALAP`, la octava restricción, y por qué no cabía donde caben las otras siete

El §3.4 pide ocho. Siete estaban: `ASAP` es el comportamiento por omisión y las seis con fecha
—`SNET`, `SNLT`, `FNET`, `FNLT`, `MSO`, `MFO`— viven repartidas entre `constraint` y `compromiso`.
Faltaba `ALAP`, y faltaba por una razón de fondo, no por olvido.

**Las otras siete se resuelven mirando una fecha. `ALAP` no tiene fecha.** Dice «ponla donde más
tarde quepa sin mover el cierre», y dónde es eso no se sabe hasta haber hecho el pase atrás — que a
su vez necesita el pase adelante hecho. La restricción depende del resultado del cálculo que la
aplica. Por eso vive en `lib/scheduling/alap.ts` y no en `schedule.ts`: programar con `ALAP` es
programar **dos veces**.

**Y una segunda vuelta basta.** Las fechas tardías no dependen de las predecesoras: salen del cierre
hacia atrás, por la cadena de sucesoras. Clavar una tarea más tarde no cambia el inicio tardío de
nadie, y no puede atrasar el cierre, porque el inicio tardío es por definición el último sitio donde
la tarea cabe sin atrasarlo. Hay prueba de eso: volver a programar sobre el resultado no mueve nada.

Sin ninguna tarea marcada, `programarConALAP` devuelve **exactamente** lo que devuelve
`schedulePlan`, y sin pagar el pase atrás. Es lo que permitió sustituir la llamada en las cinco
superficies que programan el plan para pintarlo —Gantt, Lista, Esquema, Calendario y el panel de
detalle— sin auditar a nadie. Sustituirlas en las cinco no es celo: dejar una fuera habría dado dos
fechas distintas para la misma línea según la pestaña, que es el defecto que ya apareció dos veces
esta sesión —con «atrasada» y con «resumen»—.

### Demostrado en pantalla, sobre las 1368 líneas

La candidata no se eligió a mano: es la hoja con más holgura **que tenga sucesoras**, de las 36 que
cumplen las dos cosas (`scripts/alap-en-pantalla.ts`). Una línea sin sucesoras también vale, pero
enseña el caso flojo: su fecha tardía es el cierre del plan, así que la barra pega un salto al final
en vez de ajustarse contra algo.

Con la marca puesta y sin ella, leyendo la pantalla de Elementos de Trabajo con el árbol desplegado
—**1368 filas en pantalla las dos veces**—:

| línea | sin la marca | con la marca |
|---|---|---|
| Definir la centralización de registros *(la marcada, 82 d de holgura)* | 2026-07-24 → 2026-07-27 | **2026-11-17 → 2026-11-18** |
| Definir CloudWatch… *(su sucesora, `SS+1`)* | 2026-07-27 | **2026-11-18** |
| Definir las alarmas *(aguas abajo)* | 2026-07-28 | **2026-11-19** |
| Presentar el plan de trabajo de Mobilize *(otra rama)* | 2026-06-12 → 2026-06-18 | *sin moverse* |

Las fechas que muestra la pantalla son exactamente las tardías que había calculado el pase atrás
—`2026-11-17 → 2026-11-18`—, la sucesora respeta su `SS+1` al día hábil, se movieron **8 líneas** —la
marcada y su cadena aguas abajo, ninguna más— y **el cierre del plan no se movió**: 2026-11-30 antes
y después.

### Lo que la restricción cuesta, y que conviene decir

Poner una línea `ALAP` es **gastarle toda la holgura**: pasa a holgura cero y cualquier tropiezo
atrasa el plan. Hay prueba con ese nombre. Sirve para lo que se compra o se contrata justo a tiempo
—pedir el equipo lo más tarde posible sin retrasar la salida a producción es dinero que se queda en
caja unas semanas—, y no sirve para el trabajo propio del equipo: poner todo `ALAP` es programar el
proyecto entero sin margen.

Dos casos en que el resultado no es el ideal, y el motor no los disimula: si quien lleva la tarea no
está disponible en su fecha tardía, el pase adelante la desliza y sale con **holgura negativa** —que
es el aviso correcto: ahí, con esa gente, no cabe—; y una línea sin sucesoras se va al cierre del
plan, que es lo que «maximizar el fin» significa y lo que hace MS Project.

Con esto el §3.4 queda entero: las ocho.

El plan de referencia quedó como estaba, y ahora eso se cuenta en vez de afirmarse
(`scripts/verificar-referencia.ts`): **1368 líneas, 1665 vínculos, cierre 2026-11-30, 0 restricciones
guardadas, 0 avance capturado**.

---

## §10.1 — el 403 de las fechas llegaba **después** de escribirlas

Esta guardia ya estaba dada por buena en esta misma bitácora, con su medición y todo. La medición
comprobó el **código de respuesta** y no el dato, y el código de respuesta era correcto.

Salió al ir a añadir la casilla de restricción al diálogo de fechas: leyendo la ruta para saber dónde
enchufarla, la pregunta por `edit_schedule` estaba **debajo** del `prisma.workItem.update`. Medido
contra el servidor, con un colaborador del proyecto —que tiene `edit_tracking` y no `edit_schedule`—
sobre una línea del plan de referencia:

| | |
|---|---|
| fecha antes | 2026-06-12 → 2026-06-18 |
| se pidió | 2027-03-15 |
| respuesta | **403** «Cambiar las fechas mueve el cronograma… no las fechas» |
| fecha luego | **2027-03-15** → 2026-06-18 |

Una guardia que responde después de escribir no es una guardia, es un cartel. Y el 403 hacía el daño
peor de todos: dejaba a quien lo leía —y a quién lo midió— convencido de que no había pasado nada.
Ahora pregunta antes de cualquier escritura, como ya hacía la de `edit_tracking`. Vuelto a medir:
403 y **la fecha no cambia**. Y el dueño sigue pudiendo: 200, la línea se mueve y arrastra a su
sucesora.

### Y de paso, una línea podía empezar después de terminar

En la misma medición, ya como dueño, el 200 dejaba la línea en **2027-03-15 → 2026-06-18**. La ruta
admite mandar **una sola** de las dos fechas y el esquema valida cada una por separado, así que el
inicio se escribía contra el fin guardado sin mirarlo. De ahí en adelante todo lo que la toque
miente: duración negativa que el motor corrige a 1, barra de ancho raro, holgura de una tarea que no
existe. Ahora responde 400 nombrando las dos fechas. Empezar y terminar el mismo día sigue valiendo:
es una tarea de un día, no un error.

### Las pruebas se comprobaron rompiendo el arreglo

Siete pruebas nuevas, y **ninguna mira el código de respuesta para lo que importa**: miran si
`prisma.workItem.update` llegó a llamarse, que es lo único que distingue una guardia de un cartel.
Para saber que no son decorado se volvieron a poner los dos defectos a propósito: se pusieron rojas
las tres que los apuntan y siguieron verdes las cuatro del camino legítimo.

### Lo que esto enseña sobre las mediciones anteriores

**Comprobar el código de respuesta no es comprobar que no se escribió.** Las ocho puertas del §10.1
se midieron así, una por una, y esa medición no distingue «bloqueó» de «escribió y luego se quejó».
Las otras diez piden el permiso antes de tocar nada, y ahora eso lo dice una prueba y no una frase
— ver abajo.

Y el plan de referencia lo demostró en carne propia: al comprobar el camino legítimo, mover una
línea temprana reprogramó el plan entero y el cierre se fue de 2026-11-30 a **2027-05-25**. Lo
devolvió `import-plan-db.ts --merge`, que refresca desde el archivo sin pisar lo capturado: 1368
actualizados, cierre 2026-11-30.

Eso obligó a mejorar la verificación. `scripts/verificar-referencia.ts` contaba líneas, vínculos,
cierre, restricciones y avance —y las **cinco daban «ok»** con una línea que empezaba en 2027 y
terminaba en 2026. Ahora cuenta también las líneas con el inicio después del fin, y fue lo primero
que cantó. Una medición destructiva puede dejar el plan roto por dentro sin mover ninguna cifra de
tamaño.

### La misma regla, ahora comprobada en las once puertas

Escribir en la bitácora «las otras siete piden el permiso antes de tocar nada — se revisó» era una
afirmación sin medición detrás, escrita en la misma página que cuenta cómo una afirmación sin
medición detrás dejó pasar el defecto. Se revisaron las once y todas están bien, y de paso la
comprobación quedó como prueba (`app/api/v1/__tests__/guardias-antes-de-escribir.test.ts`).

Es una prueba sobre la **forma** del código, no sobre su comportamiento, y eso es deliberado: el
defecto es de orden, y ninguna prueba de comportamiento lo encuentra sin buscarlo a propósito, porque
el código de respuesta es el correcto. Lo único que lo delata es dónde está la llamada.

**Estuvo mal escrita dos veces, y las dos se descubrieron metiendo el defecto a propósito en vez de
creerle al verde:**

1. Comparó la **primera** pregunta con la primera escritura. No encontraba el defecto que la motivó:
   la ruta de la línea pregunta dos veces —`edit_tracking` arriba y `edit_schedule` para las
   fechas— y con la segunda mal colocada la primera seguía estando antes del `update`.
2. Comparó **todas** las preguntas del archivo con la primera escritura del archivo. Encontraba el
   defecto, y también cuatro rutas sanas: un `POST` que escribe arriba y un `DELETE` que pregunta
   doscientas líneas más abajo son dos puertas distintas, no una guardia tardía.

La tercera compara por **manejador**, que es lo que de verdad se quiere decir: cuando este manejador
escribe, ya no le queda nada por preguntar. Reconstruido el defecto original, la prueba lo señala
por su nombre — `updateWorkItemHandler: escribe en la línea 230 y todavía pregunta permisos en 304`.

Que una prueba escrita para cazar un defecto pase en verde con el defecto puesto es el mismo error
que la originó, un piso más arriba. La única defensa es romper el arreglo a propósito y mirar.

---

## §3.4 — las ocho restricciones, ahora desde el diálogo

El motor ya sabía las ocho y ninguna se podía poner sin abrir un cliente de MySQL: `constraintType`
sólo entraba por `/reschedule`, que manda el plan entero, y el diálogo de edición no la mencionaba.
Una capacidad que no tiene por dónde entrar es una capacidad que no existe.

Y había un diálogo aparte —`edit-work-item-dates-dialog.tsx`— que parecía el sitio natural para
ponerla. **No lo usa nadie**: 139 líneas de código muerto. El vivo es `edit-work-item-dialog.tsx`, que
abren el Tablero y las dos Listas.

### El catálogo vive en un sitio

`lib/scheduling/restricciones.ts` tiene las ocho con su sigla de MS Project, su nombre, si lleva
fecha, si **empuja** o sólo **compromete**, y una frase que dice qué le pasa a la línea. La frase no
es adorno: `SNET` y `MSO` suenan igual y hacen cosas distintas —una es un piso, la otra un clavo— y
elegir mal aquí no da un error, da un cronograma que miente.

La regla de qué combinaciones valen —`porQueNoSeAdmiteLaRestriccion`— la usan **la pantalla y la
ruta**, no una cada una. Dos redacciones del mismo rechazo acaban divergiendo, y la que se queda
atrás es siempre la del servidor, que es la que nadie lee hasta que falla.

### Recorrido en pantalla

| qué | qué se vio |
|---|---|
| el selector | **9 opciones**: las ocho más «Ninguna — se coloca por sus predecesoras» |
| el campo de fecha | aparece en `SNET` y `MFO`; **desaparece** en `ALAP` y `ASAP` |
| la explicación | cambia con la elegida, y se va al volver a «Ninguna» |
| elegir `ALAP` y **Actualizar** | la línea pasa de `2026-07-24 → 2026-07-27` a `2026-11-17 → 2026-11-18` |
| su sucesora | de `2026-07-27` a `2026-11-18`, respetando el `SS+1` |

Las mismas fechas que había calculado el motor, ahora puestas desde la pantalla y no desde un guion.

Cambiar la restricción cuenta como tocar el cronograma y pide `edit_schedule`, igual que cambiar una
fecha: si no entrara por ahí, quien no puede tocar el plan lo tocaría por la puerta de al lado, que
es exactamente el agujero que abrió esa guardia en su día.

Y elegir una que no lleva fecha **borra** la que hubiera: dejarla puesta e invisible es cómo se
guardan datos que nadie ve y que un día reaparecen.

El plan de referencia se dejó como estaba: `import-plan-db.ts --merge` para las fechas y la
restricción quitada. Comprobado: **1368 líneas, 1665 vínculos, cierre 2026-11-30, 0 restricciones,
0 avance, 0 líneas al revés**.

### Y al ofrecerlas, dos cosas que se rompieron por el camino

Las dos aparecieron al recorrer el ciclo entero —poner `ALAP` desde el diálogo y **deshacerlo**—, no
al escribir el código. Ninguna de las dos se veía con la pantalla parada.

**1. El Ctrl+Z se rompía entero.** La pila decide por qué ruta vuelve cada cambio: los de fecha van
juntos por `/reschedule`, que los escribe en una transacción —deshacer 394 líneas con 394 peticiones
deja el plan medio revertido en cuanto una falle—. La condición era «todos sus campos son de la
familia de fechas», y un cambio de sólo restricción produce `{constraintType, constraintDate}`, que
son dos de esa familia. Se mandaba a esa ruta **sin** el `start` y el `finish` que exige: 400, y el
deshacer fallaba entero. Hasta que el diálogo ofreció las restricciones nadie podía cambiar una sin
mover una fecha, así que la condición floja no se distinguía de la correcta.

Ahora pide **las dos fechas dentro**, no sólo campos de la familia, y la regla salió del componente a
`undo-stack.ts` —donde se puede probar sin montar la pantalla— con seis casos.

**2. La Lista decía «deshecho» y no se movía.** Esta es peor, porque no da error. La vista se pide el
plan ella sola y nadie la enteraba: la pila vive en el proyecto, el Gantt sí recibe la señal de
recarga y la Lista no. Medido:

| | la base | la pantalla |
|---|---|---|
| tras poner `ALAP` | 2026-11-17 | 2026-11-17 |
| tras deshacer | **2026-07-24** | 2026-11-17 |
| ocho segundos después | 2026-07-24 | **2026-11-17** |

El deshacer había funcionado perfectamente. Lo único roto era que no había forma de saberlo mirando.
Ahora la vista recibe el mismo contador que el Gantt, y al recargar **no** vuelve a «cargando»:
parpadear la tabla entera por un cambio de una línea es peor que esperar medio segundo con lo viejo.

Vuelto a recorrer, las cinco lecturas en pantalla:

```
1. antes de nada         2026-07-24 → 2026-07-27
2. con ALAP puesto       2026-11-17 → 2026-11-18
3. deshacer dice         Deshacer «Editar «Definir la centralización de registros»» · Ctrl+Z
4. tras deshacer         sin avisos
5. la línea ahora dice   2026-07-24 → 2026-07-27
```

La lección vuelve a ser la de siempre en esta bitácora, y van tres esta sesión: **funcionalidad nueva
que toca algo viejo hay que recorrerla hasta el final, incluido deshacerla.** Las dos pruebas de
unidad de la restricción pasaban, la ruta responde 200, la base guarda bien — y el ciclo completo
estaba roto en dos sitios.

### Y leída en el panel de detalle, que es donde hacía falta

Poner la restricción no basta: **una línea clavada se ve exactamente igual que una que la cadena
dejó ahí**, y la diferencia es la que decide qué hacer cuando el plan se atrasa. El panel de detalle
del §10.3 —el mismo componente en las seis vistas— ahora lo dice.

Lo que se ve en pantalla, con «Debe empezar el» puesta desde el diálogo:

```
RESTRICCIÓN DE FECHA
Debe empezar el · 2026-08-01
Clava el arranque en ese día, la empujen o no sus predecesoras. Úsala poco:
una línea clavada deja de responder al plan.
```

Tres decisiones que no son de estilo:

- **Sólo aparece cuando hay una.** El plan de referencia son 1368 líneas sin restricción; un renglón
  vacío en todas ellas es ruido que entrena a no leer el panel.
- **Se dice el nombre, no la sigla.** Quien lee un plan no tiene por qué saber que `MSO` y `SNET` son
  cosas distintas, y aquí es exactamente donde importa que lo sepa.
- **Un código que el catálogo no conoce se enseña tal cual.** Un dato guardado que la pantalla no
  sabe leer tiene que verse; esconderlo deja a quien mira creyendo que la línea es libre.

Para llevarla hasta ahí hizo falta un campo nuevo en `PlanTask`: `restriccionGuardada`, **la elección
tal como se guardó**. De los tres campos que consume el motor —`constraint`, `compromiso`, `alap`—
no se puede reconstruir: el servicio ancla **todas** las líneas con un `NO_ANTES_DE` en su fecha
guardada, así que un `constraint` de ese tipo puede ser el ancla o puede ser lo que alguien eligió, y
las dos se ven igual. Sin ese campo, el panel habría puesto «No empieza antes del…» en las 1368.

### Nota de método: tres selectores mal antes de acertar

La sonda dijo «no encuentro el botón del nombre» tres veces seguidas, y las tres veces el fallo era
mío: en la Lista el nombre no es un botón con `title`, es una celda editable cuyo `aria-label` sólo
existe **mientras se edita** — en reposo es un `span` con el texto. Y el campo de fecha no es un
`input[type=date]` sino un desplegable propio con un botón por día.

Se anota porque el patrón se repite en esta bitácora: **una sonda que no encuentra algo no es prueba
de que no esté**. Las tres veces la reacción correcta fue ir a leer el componente, no concluir que
faltaba la funcionalidad.

---

## §10.1 — cinco puertas más, encontradas barriendo en vez de recordando

La fila 29 decía «falta llevar la guardia al resto de rutas de escritura menores», que es una forma
educada de decir «no sé cuántas quedan». Se barrieron **todas** las rutas de `app/api` que exportan
`POST`, `PATCH`, `PUT` o `DELETE` y no llaman a `authorize` ni a `exigirPermiso`: salieron 43.

La mayoría son de organización con razón —sesión, usuarios, plantillas, IA—. **Cinco no lo eran**, y
las cinco escriben el plan:

| puerta | qué hace | tenía |
|---|---|---|
| `POST /projects/[id]/apply-template` | reescribe las líneas y sus fechas | `WORK_ITEM_CREATE` de organización |
| `PATCH /projects/[id]` | mueve `startDate`, el suelo desde el que se coloca todo | `PROJECT_UPDATE` de organización |
| `POST /projects/[id]/baselines` | congela la referencia contra la que se mide | `PROJECT_UPDATE` |
| `DELETE /projects/[id]/baselines` | la borra | `PROJECT_UPDATE` |
| `POST` y `DELETE` de ausencias | estiran las tareas de quien falta (§12 caso 17) | `PROJECT_UPDATE` |

El permiso de **organización** no distingue en qué proyecto. Un gestor de proyectos invitado a
éste sólo como cliente las pasaba todas — y con `apply-template` reescribía el cronograma entero.

Medido con los dos papeles:

| puerta | colaborador | dueño |
|---|---|---|
| aplicar una plantilla | **403** | 400 *(pasa la guardia; falla por el id de plantilla inventado)* |
| editar el proyecto | **403** | 200 |
| tomar una línea base | **403** | 201 |
| quitar una línea base | **403** | 404 *(pasa; el id no existe)* |
| registrar una ausencia | **403** | 404 *(pasa; el recurso no existe)* |

La columna del dueño importa tanto como la del colaborador: una guardia que bloquea a todo el mundo
también «pasa» la prueba de la izquierda.

Las cinco entran en la prueba de forma, que ahora cubre **quince** puertas.

### Y el verificador crece otra vez

Restaurar después de esta medición obligó a mirar a mano dos cosas que `verificar-referencia.ts` no
contaba: el **arranque del proyecto** —que la medición había movido a 2026-05-01, y mover el suelo un
día mueve las 1368 líneas— y las **líneas base**, de las que la prueba dejó una de más. Las ocho
cuentas de tamaño seguían diciendo «ok» con las dos cosas mal. Ya las cuenta.

Es la segunda vez esta sesión que el verificador crece por el mismo motivo: **lo que se restaura a
mano una vez, se olvida la siguiente**.

---

## §5 — reordenar las columnas del tablero, que llevaba meses puesta como «hacerla a medias es peor»

La matriz decía: «Reordenar columnas no está: `@@unique([projectId, order])` lo convierte en un
corrimiento con transacción, y hacerlo a medias es peor que no ofrecerlo». La frase era correcta y
la conclusión no: el corrimiento tiene una solución exacta, no aproximada.

### Dos vueltas, y por qué no cabe una

MySQL comprueba la unicidad **por sentencia**, no al cerrar la transacción. Escribir los puestos
finales de uno en uno choca en cuanto la primera columna aterriza donde todavía está otra — y da
igual el orden en que se escriban, porque cualquier permutación que no sea la identidad tiene al
menos un par que se cruza.

Así que primero se aparcan **todas** en puestos negativos y después se bajan a su sitio:

- En la primera vuelta no chocan entre sí —cada una recibe un negativo distinto— ni con las que
  aún están en positivo, porque los signos no se cruzan.
- En la segunda, todas vienen de negativo, así que el destino está libre.

Los negativos son seguros porque el alta reparte desde cero hacia arriba: ninguna columna real
ocupa nunca un puesto negativo.

### Y se exige la lista completa

La ruta admite `{ orden: [...ids] }` con **todas** las columnas, no «pon esta en el puesto 2». Dos
razones, y la segunda es la de fondo:

1. Con un único puesto, el servidor tendría que adivinar qué hacer con la que ya estaba ahí, y las
   dos respuestas razonables —empujar hacia abajo, intercambiar— dan tableros distintos.
2. Con una lista **parcial**, la segunda vuelta dejaría a las que faltan en su puesto viejo y a las
   enviadas encima: choque de clave única a mitad de la transacción, o —peor— una columna
   abandonada en un puesto negativo, que el tablero dibujaría antes que todas para siempre.

`porQueNoEsUnOrdenValido` lo comprueba, y es la **misma función** que usa la pantalla para calcular
el orden que manda.

### Flechas, no arrastre

El orden de las columnas se cambia una vez cada mucho, se hace con el teclado y se deshace mirando.
Un arrastre horizontal dentro de una lista vertical de administración confunde más de lo que ayuda.
El tablero de verdad sigue arrastrándose; esto es su cuarto de máquinas.

Los botones de los extremos se **apagan** en vez de esconderse —con cinco filas, una acción que
aparece y desaparece hace bailar la columna entera— y dicen por qué: «Ya es la primera».

### En pantalla, sobre el tablero de referencia

```
1. de entrada
   tablero: BACKLOG · TO DO · IN PROGRESS · BLOCKERS · DONE
   lista  : Backlog · To Do · In Progress · Blockers · Done

2. subir «Blockers» un puesto
   tablero: BACKLOG · TO DO · BLOCKERS · IN PROGRESS · DONE
   lista  : Backlog · To Do · Blockers · In Progress · Done

3. los extremos
   la primera hacia arriba → apagado: «Ya es la primera»
   la última hacia abajo   → apagado: «Ya es la última»

4. devolverla con ▼
   tablero: BACKLOG · TO DO · IN PROGRESS · BLOCKERS · DONE
```

Lo que había que ver no era la lista de administración, era **el tablero**: se reordena él, porque
lo que cambió es el dato, no una preferencia de pantalla.

Mover la inicial o la de terminado se permite a propósito: lo protegido es el **borrado**, no el
puesto. Un tablero que empieza por «Hecho» es raro, pero es una decisión de quien lo lleva, no un
estado imposible.

---

## §4.3 — las escalas del Gantt: lo ilegible no era la escala, era la cabecera

Había dos escalas, mes y semana, y una prueba que fijaba la ausencia de «Día» con este motivo
escrito: «los 122 días hábiles del plan serían 122 columnas: no caben, y las que caben quedan tan
angostas que la fecha no se alcanza a leer».

La observación era correcta y el diagnóstico no. Dos cosas lo arreglan:

1. **La cabecera pasa a dos filas.** Por días, la fila de abajo dice «15» y la de arriba dice «junio
   2026». Con una sola fila había que contar hacia atrás hasta encontrar una pista, y eso no es leer
   un plan.
2. **El ancho de día lo manda la escala.** Antes era fijo en 14 px, así que cambiar de «mes» a
   «día» no acercaba nada: repartía la misma anchura en trozos más pequeños. La escala del §4.3 es
   un **zoom**, no una forma de agrupar la cabecera.

### Las cinco, medidas en pantalla sobre las 1368 líneas

| escala | columnas abajo | arriba | primera abajo | primera arriba | ancho del lienzo |
|---|---:|---:|---|---|---:|
| Día | 122 | 6 | `12` | junio 2026 | **2 928 px** |
| Semana | 25 | 6 | `2026-06-12` | junio 2026 | 1 708 px |
| Mes | 6 | 1 | junio 2026 | 2026 | 976 px |
| Trimestre | 3 | 1 | T2 2026 | 2026 | 610 px |
| Año | 1 | 0 | 2026 | *(sin fila de arriba)* | **366 px** |

De 2 928 px a 366: el lienzo se ensancha al acercar y se estrecha al alejar, que es lo que un zoom
significa. La caja visible mide 1 056 px, así que mes, trimestre y año caben enteros y día y semana
se desplazan.

Por años la fila de arriba **no se dibuja** en vez de dibujarse vacía: una franja sin rótulo ocupando
alto es peor que ninguna.

Los trimestres son **naturales**, no contados desde el arranque del plan. Un trimestre es una unidad
de negocio —con sus cierres y sus comités— y llamar «T1» a los tres meses que siguen al arranque
haría que la rejilla y el acta de la reunión hablaran de trimestres distintos.

### La sexta escala del spec no se puede dibujar, y decirlo es la respuesta

El §4.3 pide seis: hora, día, semana, mes, trimestre y año. La **hora** no cabe contra este motor:
está construido sobre ordinales de día hábil a propósito —para no tocar husos ni horario de verano—
así que ninguna tarea tiene hora de inicio ni de fin. Un eje por horas dibujaría ocho columnas
idénticas por día y **todas las barras pegadas al límite del día**: un zoom que no muestra nada
nuevo, sólo más ancho. Es la misma pared que los casos 2 y 23 del §12, y sale de la misma decisión
de modelo del §2.1 que espera decisión.

### Nota de método: la sonda corrió contra la carga

La primera medición dio «Día» dibujando **6 columnas de mes**, y parecía un defecto del zoom. No lo
era: la preferencia guardada se pide en paralelo al montaje y, cuando responde, pisa lo que se acaba
de elegir — mi sonda pulsaba antes de que llegara. Es la tercera vez esta sesión que una sonda
«encuentra» un defecto que es suyo. La reacción correcta las tres veces fue ir a mirar el
componente, no anotar el defecto.

Lo que sí era real y salió de ahí: el `z.enum(['MES', 'SEMANA'])` del servicio de preferencias
rechazaba las tres escalas nuevas en silencio.

---

## §5 — lo que encontró un refutador sobre el reorden que acababa de escribir

El reorden se cerró con su medición en pantalla y su commit. Después, un agente cuyo único encargo
era **refutar el mapa** de esa tarea encontró tres cosas que ni el mapa ni yo habíamos mirado. Dos
eran reales.

### 1. Hay un tercer lector de `order`, y es el único donde reordenar cambia el comportamiento

`order` lo leen el GET de las columnas y el tablero — los dos para **dibujar**. El tercero es
`app/api/v1/work-items/[id]/route.ts`, que pasa las columnas ordenadas a `columnaAlCambiarProgreso`,
y esa función elige **la primera intermedia en el orden recibido**.

O sea: mover «Blockers» delante de «In Progress» cambia a dónde salta una tarea al capturar el
primer avance.

No es un efecto que haya que tapar — es la consecuencia correcta: si el tablero se reordena, «la
siguiente columna después de la inicial» es otra. Pero tenía que dejar de ser un accidente, así que
ahora hay cuatro pruebas que lo fijan, incluida la que dice que **reordenar no mueve a las que ya
están en una intermedia**: quien arrastró una tarjeta a «Blockers» tomó una decisión y reordenar el
tablero no la deshace.

### 2. `recolocar` validaba contra una foto caducada

Leía las columnas **fuera** de la transacción y validaba la lista contra esa foto; los `update` iban
dentro. Basta con que otra petición añada o quite una columna en ese hueco para que la lista deje de
ser completa a mitad del corrimiento — y entonces la segunda vuelta abandona una columna en un
puesto **negativo**, que el tablero dibujaría antes que todas para siempre.

Ventana de milisegundos, daño permanente y silencioso: la combinación que hace que estas cosas se
descubran tarde. La lectura y la comprobación están ya dentro de la transacción, y salir sin escribir
la deshace entera — o se recolocan todas o no se toca ninguna.

### 3. Lo que el refutador señaló y NO era del §5

Que el tablero de verdad no permite arrastrar las cabeceras de columna. Es cierto —no hay `dnd-kit`
en `kanban-board.tsx`, sólo arrastre nativo de tarjetas— pero el §5 no lo pide: habla de agrupar, de
arrastrar **tarjetas** y de virtualización. Las flechas cumplen el criterio; el arrastre de cabeceras
sería una ampliación.

### Y una debilidad de la prueba de guardias, dicha aquí para que no se olvide

`guardias-antes-de-escribir.test.ts` corta por funciones de primer nivel, así que `recolocar` —que
escribe y **no** pregunta por sí misma— le parece un manejador sin escrituras que vigilar. Está
guardada de verdad, porque `patchHandler` pregunta antes de delegar en ella, pero la prueba no lo
comprueba: no sigue llamadas. Es un punto ciego conocido, no una cobertura.

---

## §7.2 — la vista semanal y la agenda, que salían casi gratis

`calendarLayout` recibe `from` y `to`, no un mes. Estaba escrito así desde el principio, así que la
**vista semanal es el mismo cálculo con otro rango**: lo único que faltaba era decir qué rango pide
cada modo.

### El ancla es un día, no un mes

Era `AAAA-MM`. Con sólo el mes no se puede decir qué semana, y con un ancla de día los tres modos
comparten referencia: pasar de la semana del 15 al mes deja el mes del 15, que es donde estaba
mirando quien cambió.

De ahí salió una prueba que no existía: **el 31 de enero más un mes no es el 31 de febrero**. Sin
sujetar el día, avanzar desde un día 31 saltaba meses enteros y las flechas dejaban de ser
reversibles.

### Por semanas caben más carriles, y no es estética

La rejilla del mes reparte su alto entre cinco o seis filas; la de una semana tiene **una**. Con el
mismo tope de tres carriles, la vista semanal desperdiciaría casi todo su alto mandando al «N tareas
más» cosas que caben de sobra — y el sentido de acercarse a una semana es justamente ver lo que el
mes esconde. Por semanas el tope es cuatro veces mayor.

### La agenda no pasa por la rejilla

Una agenda es una lista, y meterla por el mismo camino la obligaría a inventarse carriles que nadie
va a ver.

Lo que la hace útil sobre 1368 líneas es la separación entre lo que **arranca**, lo que **vence** y
lo que sólo sigue en curso. Un renglón que dijera «el martes tocan 63 tareas» no dice nada: en un
plan real casi todos los días tocan decenas de tareas porque duran semanas. Lo accionable es qué
empieza y qué termina; lo demás va **contado**, no listado. Y los días sin nada se omiten: veinte
renglones vacíos entre dos eventos obligan a desplazarse para no encontrar nada.

### Medido en pantalla

| modo | periodo | rótulo | lo que dibuja |
|---|---|---|---|
| Mes | junio 2026 | 25 de 1368 caen en este mes | 35 casillas |
| Semana | 2026-06-08 → 2026-06-14 | **3** de 1368 caen en esta semana | 7 casillas |
| Agenda | junio 2026 | 25 de 1368 caen en este mes | **19 días con algo, 24 entradas** |

### Un defecto que sólo se ve cuando existe una vista estrecha

La primera medición abrió la semanal en **2026-06-01 → 06-07 con cero líneas**. El calendario ancla
en el arranque del plan, y «el arranque del plan» era la fecha del **proyecto** — 1 de junio—,
mientras la primera línea arranca el **12**. Once días de hueco que la vista de mes tapaba y la de
semana cabía entera dentro.

Es exactamente el mismo error que el comentario de al lado ya prevencía —«un plan que empieza en
junio no se mira por primera vez en agosto con la rejilla vacía»— un piso más abajo. Ahora ancla en
el arranque de la **primera línea**, que hay que calcular después del motor porque lo que llega del
servidor son duraciones y vínculos, no fechas.

Queda la tercera del §7.2: crear una tarea arrastrando un rango de días.

---

## §7.2 — crear una línea arrastrando un rango, y con eso la sección entera

La tercera del §7.2. El gesto es continuo —`mousedown`, arrastrar, `mouseup`— y no dos clics: esperar
al clic obligaría a dos pulsaciones y a inventar cuál es «la primera».

### Tres decisiones que no son de estilo

**Arrastrar hacia atrás vale igual.** Quien empieza en el 20 y suelta en el 15 está pidiendo del 15
al 20, y nadie debería tener que pensar en la dirección.

**Las fechas se recortan a días hábiles.** Arrastrar de viernes a lunes pinta **cuatro** casillas y
son **dos** días de trabajo. Guardar el sábado como inicio dejaría una línea cuya fecha el motor
corrige sola en cuanto alguien reprograma — una fecha que cambia sin que nadie la toque es peor que
una fecha mal puesta, porque nadie la busca.

**Un fin de semana entero no crea nada, y no avisa.** Quien pinta sábado y domingo ve que no pasa
nada, que es la respuesta correcta a un gesto sin sentido. Un aviso ahí sería regañar.

### Y dos que evitan estados de los que no se sale

Si el gesto empieza **sobre una barra**, es un arrastre de barra y no una selección: sin esa
comprobación, coger una tarea para moverla pintaba además un rango detrás.

Y el gesto se cierra también al salir el ratón de la rejilla. Un rango a medio pintar que se queda
encendido al soltar fuera es un estado del que no se sale sin recargar.

### En pantalla, con el ratón del protocolo

```
casillas a la vista      35, de 2026-06-01 a 2026-07-05
se pinta de              2026-06-10 a 2026-06-12
resaltadas al arrastrar  3
¿se abrió el diálogo?    sí — «Crear Elemento de Trabajo»
fechas que trae          10 de jun de 2026 · 12 de jun de 2026
```

Con el ratón de verdad y no con eventos sintéticos: lo que había que demostrar es que el **gesto
llega**, no que el manejador funciona — eso ya lo dicen las siete pruebas de unidad.

El diálogo de alta acepta ahora fechas por omisión. Quien pinta del 15 al 19 ya dijo las fechas, y
pedirle que las teclee otra vez convierte un gesto en un formulario.

Sin permiso para crear líneas **no hay gesto**: un rango que se pinta y no lleva a ningún sitio es
peor que no poder pintarlo.

Con esto el §7.2 queda entero: mes, semana, agenda y crear arrastrando.

---

## §6.2 — el panel de Campos ya estaba; lo que no respetaba la elección era **exportar**

Esta entrada empezó como «construir el panel de Campos de la Lista y la exportación de la vista», y
al ir a construirlo resultó que **el panel existe y funciona**: `columnasVisiblesDeLaLista`, el
catálogo con sus grupos, el ancho por columna y la preferencia propia. Lo dijo un agente cuyo
encargo era mapear la tarea, y lo confirmó el que la refutó.

Lo que faltaba era una línea, y era la que importa.

### El comentario decía la verdad y el código de debajo no

La función de exportar llevaba escrito encima: «las filas son las que el filtro dejó pasar, y **las
columnas son las que esta tabla dibuja**». Debajo, las nueve del catálogo escritas a mano.

Quien apagaba cuatro columnas para poder leer la tabla se encontraba las nueve en el CSV. La frase
era la correcta desde el principio; lo que falló es que nadie la volvió a leer cuando el panel de
Campos llegó **después**.

Ahora las columnas salen de `columnasDeLaTabla`, que es la misma variable que dibuja las cabeceras:
el CSV y la pantalla no pueden divergir porque son el mismo array. Y la cabecera del fichero lo dice
en números, junto a las líneas.

### Medido en pantalla

```
1. Campos (9)   CSV:  "1368 de 1368 líneas · 9 de 9 columnas · 2026-08-19"
2. se apagan Prioridad, Responsable y Fase
   Campos (6)   CSV:  "1368 de 1368 líneas · 6 de 9 columnas · 2026-08-19"
3. devueltas: Campos (9)
```

### Nota de método, la cuarta de la sesión

Dos intentos fallidos antes de esta medición, los dos míos:

1. El botón. Hay **dos** que empiezan por «Exportar» —el del proyecto entero y el de la Lista— y mi
   sonda pulsaba el primero, así que el fichero nunca llegaba al atrapador. Se distingue porque el de
   la Lista lleva las líneas entre paréntesis.
2. La expresión regular. Escribí `^Exportar \(` dentro de un literal de plantilla que va a la
   página, el escape se degradó y el paréntesis rompió el grupo. El encabezado de `cdp2.mjs` lo
   advierte con todas las letras — lo escribí yo mismo, y volví a caer.

Lo que queda del §6.2 son las columnas de presupuesto, costo real y tiempo registrado: no existen
como campos en el modelo, y ofrecer una columna que siempre sale vacía es peor que no ofrecerla —
parece un dato y es un hueco.

---

## §4.7 — la mitad editable del panel de detalle, por donde el spec empieza

El §4.7 dibuja un panel con nombre editable, avance, estado, prioridad, tiempo registrado,
adjuntos, comentarios y campos personalizados. La mitad de esa lista **no existe como modelo** —
`TimeLog`, adjuntos, comentarios y campos personalizados son del §2, que espera decisión. Lo que sí
se podía hacer son las dos primeras, y son las dos que el spec pone antes que nada: el **nombre**
—«editable inline», dice literalmente— y el **avance**.

### La misma celda, no una copia

`CeldaEditable` ya existía y la usan la rejilla del Gantt y la Lista. El panel monta esa, no una
propia: son las mismas reglas —Enter guarda, Escape cancela, lo vacío se rechaza— y dos celdas
editables que se comportan distinto es peor que una sola en menos sitios.

### Las dos props son opcionales, y eso no es prudencia

El panel lo montan **las seis vistas**, y no todas pueden escribir. El Panel de control entra por el
widget de hitos, donde lo que hay son cifras agregadas: un campo editable ahí prometería algo que
esa vista no sabe hacer. Sin las props, el nombre y el avance se dibujan como texto.

### Un resumen no captura avance

Lo acumula de sus hijas (§3.6). Ofrecer el campo ahí sería ofrecer un valor que el próximo cálculo
pisa sin avisar, así que el panel dice «60 % · se acumula de sus líneas» y no deja teclear.

### Se teclea en porcentaje y se guarda de 0 a 1

Convertir **en el borde** y no en cada llamador es lo que impide que una vista guarde `40` donde
otra guarda `0,4`. Y se admiten la coma decimal y el signo: quien teclea «33,5 %» está diciendo algo
perfectamente claro, y rechazarlo por la forma es hacerle aprender el formato del campo.

### Recorrido en pantalla, sobre el plan de referencia

```
1. panel abierto para «Presentar el plan de trabajo de Mobilize al banco»
2. renombrada desde el panel
3. capturado 45 %
4. el panel dice: «… [renombrada en el panel]» · 45 %
```

Y en la base, que es lo que había que comprobar y no la pantalla:

```
title        Presentar el plan de trabajo de Mobilize al banco [renombrada en el panel]
progressPct  0.45
columna      To Do        ← la movió el acoplamiento estado↔avance, desde Backlog
```

Esa tercera línea es el acoplamiento del §4.7 funcionando desde una pantalla nueva: capturar avance
por encima de cero saca la tarjeta de la columna inicial. No hizo falta escribirlo otra vez.

Restaurado después: título, avance a cero y la tarjeta de vuelta en Backlog.

Renombrar **recarga el plan** en vez de parchear en local: el nombre sale también en la ruta del
panel y en los renglones de vínculos de otras líneas, y parchear uno solo dejaría la pantalla
diciendo dos nombres para la misma línea.

Queda del §4.7 todo lo que necesita modelo: tiempo registrado, adjuntos, comentarios, campos
personalizados y el creador.

---

## §5 — el tablero dibujaba 1 243 tarjetas de golpe

Saltó al recorrer la lista de comprobación del §13, que tiene una casilla literal:
«virtualización y carga paginada por columna». No había ninguna de las dos.

Medido en el tablero del plan de referencia:

| | antes | después |
|---|---:|---:|
| tarjetas en el DOM | **1 243** | 827 |
| nodos en la página | **36 098** | 24 878 |

### Por qué paginar y no una ventana de desplazamiento

La Lista virtualiza con una ventana de altura fija y aquí no sirve: **las tarjetas no miden lo
mismo**. Medidas sobre el propio plan, van de **102 a 202 px** según si el título envuelve, si lleva
EDT, avance o aviso de atraso. Una ventana de altura fija sobre alturas variables desajusta los
espaciadores y la columna da tirones al desplazarse.

El spec pide literalmente «carga paginada por columna», que además es robusta ante alturas distintas
y se explica sola: un botón que dice cuántas faltan.

### Por qué 827 y no 250

Porque el tablero dibuja las cinco columnas **por cada fase**. Con veinticinco fases desplegadas son
125 contenedores de columna, cada uno con su tanda. Se descubrió midiendo: `columna-*` apareció 125
veces en el DOM con **cinco** identificadores distintos, cada uno veinticinco veces, y por un momento
pareció un defecto de duplicación. No lo es — es el diseño de la vista por fases.

Lo que la paginación garantiza es que **ninguna columna sola** pueda reventar la página, que es el
caso que rompía: 1 243 tarjetas vivían casi todas en «Backlog».

### Lo que NO se midió, y conviene decirlo

El tiempo de montaje. El ayudante que lleva la página al tablero **duerme once segundos por
construcción** antes de mirar, así que los «veinte segundos» que salían son en su mayor parte mis
propias esperas. Decir que la paginación bajó el tiempo de montaje sería atribuirme una mejora que
no he medido. Lo que sí está medido es el DOM.

---

## §8 — la Carga de trabajo contaba los resúmenes como trabajo

Lo encontró un agente auditando la lista de comprobación del §13. La consulta del corte de carga
traía **todo** el plan:

```ts
where: { projectId }
```

Un resumen no es trabajo: es la suma del de sus hijas (§3.6). Contarlo **además** de ellas duplica la
carga, y no un poco — un resumen abarca el rango entero de lo que cuelga de él, así que su asignación
reparte jornada completa a lo largo de semanas donde ya están contadas las tareas de verdad.

Medido contra el plan de referencia:

| | antes | después |
|---|---:|---:|
| tareas en el corte | 1 368 | **1 243** |
| asignaciones | 1 368 | **1 243** |
| …de ellas a resúmenes | **125** | **0** |

**Todas** las líneas del plan tienen asignación, incluidos los 121 marcados `RESUMEN`. No era un caso
raro: era el 9 % del corte, y precisamente el 9 % que abarca los tramos más largos.

### Por hijas, no por `kind`, y van tres

Se filtra por **no tener hijas**, no por `kind: 'RESUMEN'`. En este mismo plan hay **125 líneas con
hijas y 121 marcadas `RESUMEN`**: cuatro discrepan. Una línea con hijas es un resumen aunque su
`kind` diga otra cosa, porque sus fechas y su esfuerzo salen de acumular, no de ejecutar.

Es la **tercera** vez en esta base que las dos definiciones de «resumen» se separan — ya pasó en el
filtro del §10.2 y en la cuenta de atrasadas del §9.3 — y las tres veces la buena fue «tiene hijas».

### Lo que el arreglo NO cambió, y hay que decirlo

En la matriz de la pantalla, las celdas marcadas como sobrecarga son **cuatro antes y cuatro
después**. La carga de esos recursos ya estaba por encima de la línea sin las asignaciones fantasma,
así que quitarlas baja la cifra pero no cruza el umbral en ninguna celda de este plan.

Decirlo importa: el defecto es real y el arreglo es correcto, pero **el efecto visible en este plan
es menor de lo que el defecto suena**. En otro plan —con menos gente o más holgura— la diferencia
sería entre «sobrecargado» y «no».

Se comprobó volviendo a poner el defecto y midiendo otra vez, que es la única forma de saberlo.

---

## §10.1 — los permisos de vista estaban en la barra de pestañas y no en la puerta

Salió barriendo la lista del §13 con agentes, y es el mismo defecto que el de las escrituras un piso
más abajo: **las escrituras llevaban meses guardadas y ninguna lectura lo estaba**.

`vistasVisibles` recorta la barra —comprobado en su día: un cliente ve siete pestañas de diez— pero
las rutas contestaban 200 a quien las pidiera a mano. Un permiso que sólo esconde el botón no es un
permiso: es una sugerencia.

Medido con los dos papeles:

| lectura | permiso | cliente | dueño |
|---|---|---:|---:|
| `/schedule` — el plan del Gantt | `view_gantt` | **403** | 200 |
| `/kanban` — el tablero | `view_board` | 200 | 200 |
| `/workload` — la carga | `view_workload` | **403** | 200 |
| `/dashboard` — el panel | `view_dashboard` | 200 | 200 |

Los dos 200 del cliente **no son un fallo**: un cliente sí tiene `view_board` y `view_dashboard`. Es
exactamente lo que su barra de pestañas dice, y esa coincidencia es la prueba — si la guardia
bloqueara las cuatro, la columna de la izquierda sería igual de «buena» y no significaría nada.

### Y cinco pruebas pasaron a 500 de golpe

Los bancos de esas rutas no simulaban las tres consultas que hace la guardia, así que `authorize`
reventaba con un `TypeError` que el `catch` de la ruta convertía en 500. Es la **tercera** vez esta
sesión que enchufar una guardia pone en rojo el banco de la ruta, y las tres por lo mismo: la ruta
hace una pregunta más y el simulacro no la contesta.

---

## §4.2 — la columna de restricción decía lo mismo en las 1 368 filas

También del barrido del §13. La columna leía `task.constraint`, y el plan que llega del servidor
ancla **todas** las líneas con un `NO_ANTES_DE` en su fecha guardada — así reproduce las fechas
negociadas del archivo en vez de comprimirlo todo al arranque más temprano.

Resultado: «No antes del…» en las mil trescientas sesenta y ocho, donde nadie ha elegido ninguna.

Una columna que dice lo mismo en todas las filas no informa: enseña a no leerla, y cuando alguien
pone una restricción de verdad se pierde entre mil trescientas iguales.

Ahora lee `restriccionGuardada`, el campo que se añadió hace unas horas para el panel de detalle — y
que resulta que tenía **dos** lectores, no uno. Y `enPalabras` sabe ya de las dos flexibles del
§3.4, que no llevan fecha: pegarles una cadena vacía detrás dejaría la celda con un espacio colgando
y pinta de dato a medio cargar.

---

## §5.4 — agrupar por Asignados dejaba el tablero **en blanco**

El peor defecto que ha salido en toda la auditoría, y llevaba ahí desde que se añadió la agrupación
por responsable. Lo señaló un agente refutando el informe de otro; el primero lo había visto a
medias —dijo que «esas tarjetas quedan fuera de su columna»— y el refutador lo completó: **no
quedan fuera de su columna, desaparecen del tablero entero**.

La clave estaba escrita **dos veces y distinta**:

| dónde | cómo |
|---|---|
| al armar las columnas (`kanban-group.ts`) | `responsibleName \|\| ownerId \|\| SIN_RESPONSABLE` |
| al decidir la pertenencia (`kanban-board.tsx`) | `item.ownerId ?? SIN_RESPONSABLE` |

Una línea con responsable en el plan tiene por clave de columna «Salomón Suárez» y por prueba de
pertenencia un UUID. No coinciden nunca, así que la tarjeta no cae en ninguna columna.

Medido en pantalla, sobre el plan de referencia:

| | antes | después |
|---|---:|---:|
| columnas | 5, con los cinco responsables de verdad | 5 |
| tarjetas dibujadas | **0** | **1 221** |

Cinco columnas bien nombradas, todas diciendo cero, y el tablero vacío. Es peor que un error: **no
parece roto**, parece que no hay trabajo asignado.

Ahora la clave vive en una sola función exportada, `claveDeResponsable`, y la usan los dos.

### La prueba de unidad no lo cazaba, y se comprobó

Se añadieron cuatro casos a `kanban-group.test.ts` —incluido uno que comprueba que toda tarjeta cae
en alguna columna— y luego se volvió a partir la clave en el **componente**: las cuatro siguieron en
verde. Claro: el defecto no estaba en la regla, estaba en quién la ignora.

La que lo caza es una prueba de componente que agrupa por responsable y comprueba que la tarjeta
sigue en pantalla. Con el defecto puesto se pone roja; sin él, verde. Es la tercera vez esta sesión
que hace falta romper el arreglo a propósito para saber si la prueba servía, y la tercera que la
primera versión no servía.

---

## §10.1 — borrar una línea no pedía asiento en el proyecto, y mi prueba no lo veía

La quinta puerta sin guardia, y la más destructiva de todas: `DELETE /api/v1/work-items/[id]` borra
la línea **y sus vínculos en cascada**. `withAuth` exigía `WORK_ITEM_DELETE`, que es el cargo de
organización, y ese cargo no dice en qué proyecto.

Se quedó sin guardia cuando se pusieron las demás. La encontró un agente refutando el informe de
otro; no la encontró mi prueba de guardias, y ese es el segundo hallazgo.

### La prueba comprobaba el orden y no la existencia

`guardias-antes-de-escribir.test.ts` compara **dónde** están las preguntas contra dónde está la
primera escritura. Un manejador que escribe y **no pregunta nada** pasaba tan campante: sin preguntas
no hay preguntas tardías.

Ahora exige primero que **haya** pregunta. Reponiendo el defecto, la prueba lo nombra:

```
work-items/[id]/route.ts · deleteWorkItemHandler: escribe en la línea 460 y no pregunta
por ningún permiso de proyecto.
```

### Y al reforzarla, cayó mi propio punto ciego

Lo primero que se puso rojo no fue el `DELETE`: fue `recolocar`, la función de reordenar columnas que
escribí anoche y de la que dejé escrito en esta misma bitácora que la prueba «no la comprueba: no
sigue llamadas. Es un punto ciego conocido, no una cobertura».

Documentar un hueco no lo cierra. Ahora `recolocar` pregunta también, aunque `patchHandler` ya haya
preguntado antes de delegar en ella, y la regla queda **sin excepciones**: una función que escribe
pide permiso.

Esa uniformidad es lo que hace la regla comprobable. La versión con excepción —«escribe sin
preguntar porque su llamador pregunta»— exige seguir llamadas para verificarla, y lo que no se puede
comprobar se pudre: con ese hueco abierto se coló el `DELETE`.

---

## §8.1 — la fila «Sin asignar» no se veía justo cuando importa

`MatrizDeCarga` tiene una fila para el trabajo huérfano desde el principio, con su comentario y su
regla —nunca sale en rojo, porque «rojo» significaría «esta persona está saturada» y el problema es
el contrario: no hay ninguna persona—.

Pero la pestaña cortaba antes de dibujar la matriz cuando no había **ninguna** asignación:

```ts
if (corte.assignments.length === 0) {
  return ( …el ofrecimiento de sembrarlas… )
}
```

Es decir: en el único caso donde toda la carga es huérfana, la vista decía «este plan todavía no
tiene asignaciones» y callaba **cuánto** trabajo hay sin dueño y en qué días — que es exactamente la
pregunta que trae a alguien a esa pantalla.

Ahora se dibujan las dos cosas: el ofrecimiento arriba, porque sigue siendo lo primero que hay que
leer, y la matriz debajo con su fila de huérfanos y las filas de los recursos vacías. Quién está
libre es la mitad de la respuesta a «¿a quién le paso esto?».

Tres pruebas nuevas sobre la vista con `assignments: []`.

---

## §4.1 — contraer un resumen no hacía nada, y en el nivel «Todo» nunca podía hacerlo

Lo encontró el agente que auditó el Gantt contra la lista del §13, y es un defecto de bulto en una
interacción central: el triángulo de un resumen.

El plegado salía de **una** lista:

```ts
const plegados = collapseToLevel(abierto.rows, level).filter((id) => !abiertosAMano.has(id))
```

`abiertosAMano` sólo podía **restar** de lo que el nivel de detalle había cerrado. Un resumen que el
nivel ya mostraba abierto no estaba en esa lista, así que añadirlo no lo quitaba de ningún sitio y
pulsar su ▾ no hacía nada.

Y en nivel **«Todo»** el plegado automático es la lista vacía, o sea que **ningún** resumen se podía
cerrar — y «Todo» es justo el nivel desde el que alguien va a querer ir cerrando lo que no mira.

Ahora hay **dos** listas, abierto a mano y cerrado a mano, y el nivel de detalle propone mientras
ellas corrigen en los dos sentidos. Al alternar se limpia la contraria: dejar un id en las dos
haría que el siguiente cambio de nivel decidiera por desempate.

El triángulo manda además **cómo estaba**, y no es redundante: el estado visible sale de tres cosas
—el nivel, lo abierto y lo cerrado— y quien escucha no puede deducirlo de ninguna por separado. La
fila sí lo sabe, porque es lo que dibuja.

### En pantalla, sobre las 1368

```
1. al llegar                                        1 368 de 1 368 líneas
2. cerrar «BANCO UNIÓN · ETAPA MOBILIZE…»            1 178 de 1 368 líneas
3. volver a abrirlo                                 1 368 de 1 368 líneas
```

### Nota de método: seis selectores mal en una noche

Esta medición costó tres intentos, los tres míos:

1. Conté `[data-testid^="celda-name-"]` y salía **28 antes y 28 después**. Son las filas
   **dibujadas**, y el Gantt virtualiza: el número es el de la ventana, no el del plan.
2. Busqué los triángulos por `button[aria-expanded]` y estuve pulsando «Exportar Proyecto»,
   «Analizar Proyecto» y «Filtro ▾», que llevan el mismo atributo. Se localizan por su `aria-label`:
   «Abrir X» / «Cerrar X».
3. El rótulo del total lo encontré con un `indexOf(' de ')` que casaba antes con la descripción del
   plan importado —que también lleva «de» y nunca cambia—.

Van **seis** veces esta sesión que una sonda «encuentra» algo que es suyo. Las seis, la reacción
correcta fue ir a leer el componente.

---

## §4.3 — el Gantt no decía dónde está hoy

Tercera casilla del §13 que salía del barrido: «6 escalas de zoom, **marcador de hoy**, días no
laborables sombreados». El marcador no existía — `hoy` entraba al trazado sólo para contar atrasadas.

Un Gantt sin marca de hoy se lee a ciegas: la pregunta que trae a alguien a mirarlo es «¿vamos
bien?», y sin saber dónde está el presente no hay forma de contestarla mirando las barras.

Tres decisiones:

**Se cuenta en ordinales hábiles**, como todo el eje. Un sábado cae en el mismo sitio que el lunes
siguiente, y ahí es donde debe verse: el lunes por la mañana, «hoy» sigue estando después de lo que
se cerró el viernes.

**Fuera del plan devuelve `null`**, no un valor recortado al borde. Una raya pegada al principio
diría «hoy es el primer día» en un plan que empieza el mes que viene, que es peor que no dibujar
nada. Y sin decir qué día es tampoco se marca: no saberlo no es lo mismo que saber que hoy no cae
aquí.

**Va debajo de las barras**, porque es una referencia y no un dato: encima taparía el borde de la
barra que justo cae ahí, que es la que interesa.

Medido en pantalla en escala de año: la raya cae a **144 px de un lienzo de 366**, o sea a unos 48
días hábiles del arranque — mediados de agosto sobre un plan que va del 12 de junio al 30 de
noviembre.

De esa casilla queda el **sombreado de días no laborables**, y no es barato: el eje son ordinales
hábiles, así que los fines de semana y los festivos **ni se dibujan**. Sombrearlos exige pasar el
eje a días civiles, que es rehacer el trazado entero.

---

## §6.2 — la fila de totales sólo cuadraba con las seis columnas de por omisión

Cuarta del barrido del §13, y el **mismo descuido** que tenía la exportación: el panel de Campos
llegó después que estas filas y nadie volvió a mirarlas.

Los tramos estaban escritos a mano —`colSpan={4}`, `colSpan={2}`, `colSpan={7}`, `colSpan={6}`— y
suman siempre siete. La tabla tiene tantas columnas como el panel de Campos diga, **más una** de
acciones. Encender tres columnas más dejaba la fila de totales tres celdas corta, con los bordes sin
alinear; apagar dos la desbordaba por la derecha.

Ahora los tramos salen de las columnas elegidas. Medido en pantalla, cuatro configuraciones:

| el panel dice | celdas de la cabecera | celdas de la fila de totales |
|---|---:|---:|
| Campos (9) | 10 | **10** |
| Campos (6) | 7 | **7** |
| Campos (4) | 5 | **5** |
| Campos (9) | 10 | **10** |

Antes eran siete en las cuatro.

---

## §13 · transversal — «mensajes de error concretos, nunca genéricos»

Las cuatro pestañas del proyecto caían en el mismo patrón:

```ts
setError(err instanceof Error ? err.message : 'An error occurred')
```

Lo que llega ahí sin ser `Error` es lo imprevisto —una promesa rechazada con un valor suelto, un
fallo de red sin cuerpo— y aun así se puede decir **qué se estaba intentando**. «No se pudieron
cargar los bloqueadores de este proyecto» no resuelve nada por sí solo, pero dice dónde mirar y qué
contar si alguien llama a soporte; «An error occurred» no dice siquiera en qué idioma está la
aplicación.

Y los `throw` de respaldo llevan el código HTTP, que es lo único que distingue «el servidor dijo que
no» de «el servidor no está».

Corregidas: el detalle del proyecto y las pestañas de acuerdos, bloqueadores y riesgos.

---

## §9 — el caché del panel: medido, y por eso no se pone

La lista del §13 pide «un solo server action, **con caché**». Lo primero está; lo segundo se midió
antes de construirlo:

```
cinco medidas: 26 · 27 · 28 · 28 · 29 ms      mediana 28 ms
```

Veintiocho milisegundos para las 1368 líneas. Un caché de proceso ahí no compra nada medible — y
cuesta algo real: con sesenta segundos de vida, el panel **mentiría hasta un minuto** después de que
alguien capture avance, que es justo el gesto que lleva a mirarlo.

Un caché con invalidación en cada escritura sí sería correcto, pero es más código y más formas de
equivocarse por veintiocho milisegundos.

Se deja **sin caché a propósito**, con el número escrito. Lo que cambiaría la decisión: que la
medida suba de unos cientos de milisegundos, o que el panel pase a leerse muchas veces por minuto.

---

## §4.7 — los vínculos ya se editan desde el detalle del Gantt

Casilla del §13: «Dependencias FS/SS/FF/SF con lag, creadas arrastrando **y editables en el
detalle**». Las dos primeras estaban; la tercera no.

`DependencyEditor` existía —con los cuatro tipos y el campo de desfase— y **sólo lo montaba la
Lista**. Desde el Gantt se podía crear un vínculo arrastrando de conector a conector, pero con
desfase **cero y sin poder tocarlo**: para poner un `FS+3` había que irse a otra vista.

Se monta el mismo componente, no una copia — dos editores de vínculos con reglas distintas sería
peor que uno solo en menos sitios— y va como cajón flotante: un aside de 440 px junto al Gantt
desbordaría la página, que ya vive apretada entre la rejilla y el lienzo.

Los dos manejadores nuevos apuntan en la **misma** pila de deshacer y por el mismo canal de
vínculos, con el tipo y el desfase leídos **antes** de borrar: para deshacer hay que reponer el
vínculo igual que estaba, no uno parecido.

Comprobado en pantalla:

```
1. panel abierto, con botón de editar vínculos
2. el cajón trae: «Buscar la línea predecesora» · «Tipo de vínculo» (FS, SS, FF, SF)
                  · «Desfase en días hábiles»
```

### Nota de método, la séptima

La primera medición dijo «panel abierto **SIN** botón», y por un momento pareció que el botón no se
dibujaba. El panel no estaba abierto: mi sonda buscaba el nombre con
`[data-testid^="celda-name-"]` y luego un `span, button, div` **dentro**, y daba con un envoltorio
que no escucha el clic. La celda del nombre es un `span` con `role="button"` y `data-editable`.

---

## §6.2 — el CSV exportaba **otras filas** que la tabla, y la cuarta aparición de «resumen»

Anoche se arregló que el CSV llevara las **columnas** elegidas. Faltaba lo otro: que llevara las
mismas **filas**.

Salía de `filteredWorkItems`, que es un paso anterior a lo que la tabla dibuja:

- **incluía los resúmenes**, que el formato plano no enseña;
- venía **sin ordenar**, aunque la tabla estuviera ordenada por una columna.

El botón decía «Exportar (1368)» mientras la tabla dibujaba 1243 líneas. El número estaba a la vista
en la cabecera del propio CSV de la medición de anoche — lo miré y no lo cuestioné.

### Y al arreglarlo salió 1247, no 1243

El formato plano filtraba por `kind !== 'RESUMEN'`, y en este plan eso deja pasar **cuatro** líneas
que sí tienen hijas: hay **125 con descendencia y 121 marcadas**. Cuatro resúmenes colándose entre
las hojas, con sus fechas acumuladas y su avance heredado mezclados con trabajo real — y saliendo
también en el CSV.

Es la **cuarta** vez en esta base que las dos definiciones de «resumen» se separan:

| dónde | cuándo |
|---|---|
| el filtro «Es resumen» del §10.2 | decía que no de las 1368 |
| la cuenta de atrasadas del §9.3 | 127 contra 113 |
| el corte de carga del §8 | 125 asignaciones fantasma |
| el formato plano de la Lista | 4 resúmenes entre las hojas |

Las cuatro veces la buena fue **«tiene hijas»**, y las cuatro veces el error fue el mismo: creerle al
campo `kind` en vez de mirar el árbol.

La pertenencia se calcula sobre el plan **entero** y no sobre lo filtrado: sobre lo filtrado,
esconder a las hijas convertiría a su madre en una hoja y el formato plano empezaría a enseñar
resúmenes en cuanto alguien filtrara.

Medido: el CSV dice ahora **1 243 de 1 368**, que es exactamente el número de hojas del plan.

---

## §13 — las columnas del Gantt ya se reordenan, y por qué no podían

La casilla pide columnas «configurables, **reordenables**, redimensionables y persistidas». Tres de
las cuatro estaban. La que faltaba no faltaba por falta de pantalla: **el modelo la pisaba**.

`alternarColumna` y `alternarReserva` terminaban las dos igual:

```ts
columnas: COLUMNAS.filter((c) => puestas.has(c.id)).map((c) => c.id)
```

Es decir, reconstruían el orden del **catálogo** en cada gesto. Con eso, un orden elegido no podía
existir ni un segundo: apagar una columna cualquiera devolvía todas a fábrica. Y la preferencia ya
guardaba un array de identificadores, o sea que la base nunca estorbó.

Había una prueba fijando ese comportamiento con su motivo escrito —«así dos personas con las mismas
columnas ven la misma rejilla»—, que era coherente **mientras el orden no se podía elegir**.

Ahora se conserva el orden elegido, y una columna que se enciende va **al final**: es donde quien la
enciende espera verla aparecer, y meterla en su hueco del catálogo la escondera entre las que ya
estaban.

Ninguna se pone delante de la columna del nombre — una rejilla cuya primera columna no dice de qué
línea se habla no es una rejilla.

Las flechas sólo salen en las columnas **encendidas**: mover una apagada no significa nada. Y llevan
`preventDefault`, porque viven dentro de la etiqueta de la casilla y sin eso pulsarlas apagaría la
columna además de moverla.

Medido en pantalla sobre la rejilla real:

```
orden inicial          name · start · finish
pulsar «Mover Inicio después»
orden después          name · finish · start
```

Con esto la casilla queda entera: configurables, reordenables, redimensionables y persistidas.

---

## §3.3 — la quinta aparición de «resumen», ahora en la ruta crítica

Buscada a propósito: con la regla ya escrita en la memoria del proyecto, se barrió el código entero
buscando `kind === 'RESUMEN'` en producción. Salió en `lib/scheduling/critical-path.ts:111`.

El clasificador tiene una opción `excludeSummaries` para el informe ejecutivo, con este motivo
escrito: «un resumen no se ejecuta: hereda las fechas de sus hijas, y contarlo infla la ruta crítica
con líneas que nadie puede acelerar ni atrasar». Correcto. Pero la excluía **por el campo**.

Medido en el plan de referencia:

| | |
|---|---:|
| líneas del plan | 1 368 |
| con hijas | 125 |
| marcadas `RESUMEN` | 121 |
| **coladas en el conteo** | **4** |

Las cuatro son `COMPUERTA` con hijas —HAB-01 a HAB-04, los habilitadores de ambiente—. El informe
decía **1 247 líneas ejecutables** donde hay **1 243**.

Ninguna de las cuatro es crítica, así que en **este** plan las demás cifras no se movían. En otro
donde una compuerta con hijas caiga en la ruta crítica, sí: la contaría como trabajo que alguien
puede acelerar, y no lo es.

Las dos reglas **suman**, no se sustituyen: una línea marcada `RESUMEN` sin hijas tampoco cuenta,
porque quien la marcó a mano sabe algo que el árbol no dice.

### Y las otras dos, cosméticas pero incoherentes consigo mismas

El mismo barrido sacó dos usos más del campo en producción:

**La columna «Clase» del Gantt** decía «Actividad» en las cuatro compuertas con hijas, mientras el
resto de la misma fila las trataba de resumen — `GanttRow.isSummary` ya es «marcada o con hijas».
Una fila que se contradice a sí misma en dos celdas contiguas.

**El editor de vínculos** marca con un aviso «resumen» las candidatas, y ese aviso es lo único que
impide vincular contra un resumen sin darse cuenta — y un vínculo contra algo que hereda sus fechas
de otros no significa lo que parece. Las cuatro compuertas salían sin aviso.

En los dos sitios las dos reglas **suman**: tener hijas o estar marcada.

---

## Comprobado y **no** es un defecto: «terminada» en el panel ejecutivo

Buscando más vetas de «dos definiciones de lo mismo» apareció una que parecía del mismo tipo:

- `lib/urgency.ts:16` — `ESTADOS_TERMINALES = new Set(['DONE', 'CLOSED', 'CANCELLED'])`
- `services/dashboard.service.ts` — la tasa de avance cuenta sólo `status === DONE`

Con eso, una línea `CANCELLED` viviría en el denominador para siempre sin poder estar nunca en el
numerador, y la salud del proyecto quedaría topeándose por debajo del 100 % sin motivo.

**No ocurre, porque esos dos estados no son alcanzables.** Comprobado por cuatro caminos:

1. `WorkItemStatus` tiene cinco valores: `BACKLOG`, `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`.
2. `estadoDeLaColumna` —la única función que deriva estado de una columna del tablero— sólo puede
   devolver esos cinco.
3. La ruta de la línea valida con `z.nativeEnum(WorkItemStatus)`.
4. En **toda** la base local hay un único estado: `TODO` × 1368.

Las apariciones de `'CLOSED'` en el resto del código son del modelo de **riesgos**, que tiene su
propio estado y su propio ciclo.

Se deja el conjunto de `urgency.ts` como está: tres entradas de las que sobran dos no hacen daño, y el
día que el modelo gane un estado de cierre la función ya lo trata bien. Queda anotado para que nadie
vuelva a investigarlo: **se miró, y la tasa de avance está bien**.

---

## §10.6 — dos escrituras de la Lista que no se apuntaban, y una que se tragaba el fallo

Veta nueva: comparar, archivo por archivo, cuántas escrituras hace un componente contra cuántas
apunta en la pila de deshacer. `work-items-list.tsx` salía **2 escrituras y 0 apuntes**.

### Renombrar desde la celda no se podía deshacer

Y renombrar **desde el panel de detalle** sí — se conectó anoche. La misma acción, reversible o no
según por dónde entres. Es literalmente la clase de incoherencia que otro comentario de esta misma
base llama «la que hace que nadie se fíe del Ctrl+Z».

Ahora apunta, por el mismo canal y con la misma etiqueta.

### Reordenar arrastrando se tragó el fallo en la consola

```ts
} catch (e) {
  console.error('Failed to save order', e)
}
```

La tabla se quedaba enseñando un orden que la base no tenía. Y el orden de la Lista **es el EDT**:
los números que la gente se dice por teléfono. Una pantalla que miente sobre eso es peor que una que
no deja arrastrar.

Ahora revierte al orden anterior y lo dice, pegado a la tabla y no en la barra de filtros — el aviso
es de lo que hay debajo.

Deshacer un reorden completo sigue sin estar: escribe `templateOrder` en cientos de líneas y su
inversa es otro reorden, no un campo que devolver, así que pide un canal propio en la pila como lo
pidieron en su día los vínculos y las bajas. Queda dicho, no hecho.

---

## §3.5 — un hito cargaba una jornada completa, y 86 de ellos

De la auditoría del motor con agentes. `Work = Duration × Units`, y la duración de un hito es cero:
la línea que lo dice está escrita en tres sitios de esta base. La matriz de carga le cobraba una
**jornada entera** el día que cae.

Medido sobre el plan de referencia:

| | |
|---|---:|
| hitos en el plan | **86** |
| de ellos con asignación | **86** |
| carga total del corte, antes | 999 360 min |
| carga total, ahora | **958 080 min** |
| diferencia | **41 280 min = 86 × 480** |

Al minuto. Eran 86 jornadas completas de trabajo que nadie hace.

### Por qué no se podía deducir de las fechas

`TareaDeCarga` sólo llevaba `id`, `name`, `start` y `finish`. La tentación es decir «si empieza y
acaba el mismo día, es un hito» — y es falso: **1 064 de las 1 243 hojas del plan duran un solo
día**. Un hito y una tarea de un día tienen las mismas fechas y no son lo mismo, así que hacía falta
traer la clase desde la base.

### El hito sigue en el corte

Se salta en el bucle de carga, no al construir el corte: el desglose de un día lo enumera, y quien
mira quiere ver **qué vence** ese día aunque no pese.

Tener a alguien asignado a un hito significa «esta persona responde de este punto de control», y
responder de un punto de control no es trabajo que ocupe una jornada.

### Lo que NO cambió

Las celdas marcadas como sobrecarga son **169 antes y 169 después**, igual que con las asignaciones
fantasma de los resúmenes: la carga de esos recursos ya estaba por encima de la línea. El 4,1 % de
la carga del corte era falso y no movía ninguna celda de color — en este plan.

---

## §3.5 — el reparto diario: la promesa del comentario era otra

El mismo informe decía que `dedicacionDiaria` «pierde e inventa minutos». Medido por fuerza bruta
sobre **22 880 combinaciones** de trabajo, días y personas:

- el total **del día** se conserva en las **22 880**: cero excepciones;
- el total **comprometido** se rompe en **19 012**.

O sea: la aritmética está bien y **el comentario prometía otra cosa**. Decía «para que la suma de
las dedicaciones dé exactamente el trabajo comprometido», y eso no puede cumplirse con esta firma:
devuelve **una sola cifra por persona**, la misma todos los días, así que el total sólo cuadra cuando
el trabajo divide exacto entre los días. Un minuto repartido en dos días es medio minuto al día o no
es nada.

Corregido el comentario con los dos números, y cuatro pruebas que fijan **las dos mitades**: la que
vale y la que provablemente no puede valer. Cambiar la firma para poder cuadrar el total sólo tiene
sentido el día que el modelo guarde el trabajo en minutos (§2.1).

---

## §3.1–§3.4 — seis acusaciones al motor, cinco ciertas

Segunda auditoría con agentes, esta vez contra el motor de programación. Trajo seis hallazgos con
reproducción. Las reproduje **todas**, una por una, con código: cinco eran ciertas y una no.

### 1 — `ALAP` rompía el vínculo y **acortaba** el plan

Lo escribí yo anoche. `programarConALAP` clava la línea en su inicio tardío, y con holgura negativa
el inicio tardío cae **antes** que el temprano.

| `A(5d) —FS+0→ B(3d)`, B con `dueDate` 2026-06-05 | B | cierre |
|---|---|---|
| sin la marca | 06-08 → 06-10 | 2026-06-10 |
| con `ALAP`, antes | **06-03 → 06-05** | **2026-06-05** |
| con `ALAP`, ahora | 06-08 → 06-10 | 2026-06-10 |

B arrancaba **tres días hábiles antes de que A terminara** y el plan se acortaba cinco días. Un
cronograma que mejora porque alguien pidió empezar más tarde. Ahora se clava en
`max(inicioTardío, inicioTemprano)`: con holgura negativa no hay «más tarde» que ganar.

### 2 — la holgura libre rompía su propio invariante

El §3.3 lo escribe literal: `0 ≤ Free Float ≤ Total Float`. Con desfase negativo no se cumplía,
porque el adelanto que el vínculo permite sólo se cobra si la sucesora tiene dónde retroceder, y
contra el arranque del plan no lo tiene.

| | TF | FF antes | FF ahora |
|---|---:|---:|---:|
| `A(4d) —FS−6→ B(3d)` | 0 | **2** | 0 |
| `A(4d) —SS−4→ B(3d)` | 0 | **4** | 0 |

El panel de detalle dibuja la fila de holgura libre **sólo cuando difiere de la total**, o sea
exactamente en este caso: escribía «2 días» sobre una línea crítica que no puede resbalar ni uno.

### 3 — `DEBE_EMPEZAR_EL` empezaba el plan antes que el plan

Un plan que arranca el 2026-06-01 con una línea clavada el 2026-05-04 devolvía **2026-05-04** como
su primer día. El §3.3 acota el inicio temprano «por Project.Start, restricciones y calendario», en
ese orden. Ahora hay suelo.

Que pise a sus **predecesoras** se queda: es lo que la restricción promete y lo que hace MS Project;
el pase atrás se lo cobra a la predecesora con holgura negativa, que es la señal honesta.

### 4 — el auditor toleraba un día que el motor no produce

`audit.ts` conservaba el `−1` de `SF` que se quitó de los dos pases del motor. Filas
`A 06-08→06-10` y `B 06-04→06-05` con `A SF+0`:

| | controles emitidos |
|---|---|
| con el `−1` viejo | `C14` |
| ahora | **`C09`**, `C14` |

Y el mismo grafo programado coloca a B terminando el **8**, el día en que A arranca. La tabla de la
cabecera de `cpm.ts` también conservaba la fórmula vieja, contradiciendo al código veinte líneas
más abajo.

### 5 — un resumen se podía vincular con su propia hija

Regla dura del §3.2, que no estaba escrita en ningún sitio. `P(5d)` con hija `H1(2d)` y
`P —FS+0→ H1` se aceptaba y colocaba a H1 **después de su propia madre** — P del 1 al 5 de junio,
H1 del 8 al 9 —, con el roll-up diciendo entonces que P termina el 9 por culpa de una hija a la que
la propia P empuja.

No es un ciclo y por eso no lo cazaba el detector: en el grafo de vínculos no hay ciclo ninguno. El
ciclo está **entre el grafo y el árbol**. Se comprueba subiendo por `parentId` en los dos sentidos,
en `buildDependencyGraph`, así que lo cumplen igual el motor y el alta de vínculos — que ahora trae
`parentId` de la base para poder comprobarlo, y rechaza **sin persistir nada**.

Antes de ponerlo: el plan de referencia tiene **1 665 vínculos y cero** con ascendencia compartida.

### 6 — y una que no era

El informe decía que el `tramo` se calcula distinto en los dos pases y que con ausencias el vínculo
`FF` «deja de alinear los fines». Los números son ciertos —`A(5d) —FF+0→ B(4d)` con B ausente el 17,
18 y 19 de junio cierra el 24 en vez del 19— y **la conclusión es falsa**: `FF` pide un fin
**mínimo**, no una igualdad, y terminar después lo cumple.

Lo descubrí arreglándolo mal. Retrocedí desde el fin contando días disponibles, que sería lo
correcto si la regla pidiera terminar ese día exacto: B pasó a arrancar el 11 y terminar el **16**,
tres días hábiles **antes** que A — rompiendo el vínculo que yo intentaba respetar. Con ausencias el
fin real cae igual o más tarde que `inicio + tramo`, nunca antes, así que restar el tramo declarado
siempre cumple la regla.

Revertido, y el motivo escrito donde estaba la duda. La única crítica que sobrevive es que el
arranque no es el más temprano *posible* — empezar el 12 también valdría —, y eso no es un
invariante roto sino una elección discutible: adelantar el arranque hace que la persona trabaje
antes y espere después.

---

## §4.1, §6 — el avance de un resumen no subía, y sus fechas dependían de la pestaña

Tres hallazgos de la auditoría del motor que son la misma familia: **un resumen no se captura, se
acumula**, y había tres sitios que no lo hacían.

### La barra de un resumen salía siempre vacía

`gantt.ts` leía `task.progress`, que en un resumen vale **cero** porque nadie lo escribe. Las 125
líneas con descendencia del plan salían al 0 % — y es la fila que más se mira, porque es la que
queda cuando el plan está plegado.

Medido sobre el plan de referencia, marcando 400 hojas al 100 %:

| resúmenes con la barra llenándose | |
|---|---:|
| antes | **0** de 125 |
| ahora | **80** de 125 |

### El Esquema tiraba el promedio simple

`avanceEfectivo` rehacía la división `ganado / peso` en vez de tomar el avance ya calculado, y con
peso cero devolvía **0**. Peso cero es exactamente el caso que `rollUpProgress` resuelve a propósito:
un bloque que sólo agrupa **hitos** no pesa nada, y su avance es el promedio simple. Un bloque de
cinco hitos con tres cumplidos va por el **60 %**, y esa pantalla decía 0 %.

La misma fórmula escrita dos veces siempre acaba dando dos números.

### El mismo resumen, dos fechas según la pestaña

El Gantt acumula el tramo en vivo; la Lista enseñaba `estimatedEndDate` tal como vino de la base. Y
el `PATCH` de una línea escribe **esa fila y ninguna más**.

| en el plan de referencia | resúmenes en desacuerdo |
|---|---:|
| hoy, sin tocar nada | **0** de 125 |
| tras mover **una** hoja al 2026-12-15 | **3** |

Los tres son la cadena de ascendientes de esa hoja, y el de arriba es la etapa cuyo fin **es el
cierre del proyecto**: la Lista habría seguido diciendo `2026-11-30` mientras el Gantt decía
`2026-12-15`. Quien mira no tiene forma de saber cuál de las dos es la buena.

Se calcula **al leer**, en `conFechasDeResumen`, y no guardando los ascendientes en cada edición:
una línea profunda escribiría toda su rama en cada guardado, y el número volvería a desacoplarse en
cuanto algo entrara por otra puerta —una importación, una reprogramación, un `DELETE` en cascada—.
Derivarlo al leer no puede quedar viejo. Va antes de filtrar, ordenar, totalizar y exportar, así que
el CSV también sale con la fecha buena.

### Y una cuarta que no era un defecto

`rollup-modos.ts` no tiene quien lo llame en producción, sólo pruebas. Es correcto y está dicho en
su propia cabecera: implementa los **dos** modos que pide el §12 —ponderado por duración y promedio
simple— y elegir entre ellos necesita `Project.progressRollup`, que es una de las migraciones del
§2 que esperan decisión. Mientras tanto la aplicación usa el ponderado. Borrarlo costaría volver a
escribir la fórmula el día que exista el campo.

---

## §8.4 — la tercera mejora sobre la referencia: mover a alguien desde la propia vista

El §8.4 pide tres cosas que GanttPRO no hace, «aunque sea en una segunda iteración». Dos ya
estaban: la **fila de capacidad agregada** del equipo y la **sugerencia de reasignación** al pulsar
una celda roja. Faltaba la tercera, **la nivelación manual**.

Y faltaba de la peor manera: el panel del día ya listaba «quién tiene hueco ese día» —con los
minutos libres de cada uno— y **los nombres no eran accionables**. Enseñar la sobrecarga, decir quién
podría absorberla, y no dejar hacerlo.

### Cómo quedó

Elegir una línea del desglose y pulsar a quién se le pasa. No es arrastrar —que es lo que dice el
spec— porque el panel es una lista, no un lienzo: con dos pulsaciones se hace lo mismo, funciona con
teclado y cada botón dice en voz alta qué mueve y a dónde («Mover «Migrar la red» a Luis Pérez»).

Tres decisiones que no se ven pero cambian el resultado:

- **Va en una sola transacción.** El `PUT` acepta `desdeResourceId` y hace el alta y la baja juntas.
  En dos llamadas del navegador, media falla deja la línea asignada a los dos y la carga contada
  **dos veces** — justo lo que quien mueve estaba intentando arreglar.
- **Se recarga el corte entero al volver**, no se parchea el estado: la matriz depende de las
  asignaciones de todos los días del rango, y adivinar cuáles cambiaron es cómo una vista empieza a
  enseñar una cosa distinta de lo que hay guardado.
- **Sin permiso, la fila no finge ser un botón.** La prop es opcional; sin ella la vista es de sólo
  lectura y no ofrece mover. Un control que no hace nada al pulsarlo es peor que no tenerlo.

Se mueve con **la dedicación que la línea tenía**, no con una inventada: quien estaba al 100 % en esa
tarea sigue al 100 % con el otro nombre. Y el permiso es el mismo `edit_schedule` que ya pedía la
ruta, con el mismo motivo escrito: repartir el trabajo cambia la carga del equipo, que es parte del
plan.

### La nivelación, medida en pantalla sobre el plan real

No en una prueba: en el navegador, contra las 1 368 líneas.

| carga del 1 de septiembre de 2026 | |
|---|---:|
| celdas rojas a la vista | 61 |
| la peor, Admin User | **3 000 %** |
| tras pasarle **una** línea a Rafael Oliva | **2 900 %** |

Exactamente los cien puntos de esa línea. Y hay una segunda cosa que la medición demuestra sin
querer: **la vuelta atrás no se puede hacer por la pantalla**. Admin User sigue al 2 900 %, así que
ya no aparece entre quienes tienen hueco, y no hay botón para devolverle la línea. La lista de
destinos dice la verdad también cuando la verdad es incómoda. Hubo que deshacerlo por la base.

Los 3 000 % no son un error de la vista: el sembrado de asignaciones le puso a esa cuenta **1 189
líneas**, treinta de ellas activas ese mismo día. Es exactamente el trabajo huérfano que la vista
existe para enseñar.

---

## §10.2, §10.6 — el deshacer que deshacía dos veces, y el filtro que no filtraba

### Manteniendo `Ctrl+Z` pulsado se deshacía **la misma** operación tres veces

Escribir es un viaje a la red, y el teclado no espera: el autorrepetido llama otra vez **dentro** de
ese viaje. El paso leía la pila del cierre de `useState`, que en ese momento sigue siendo la de
antes, así que la segunda llamada calculaba **el mismo** lado que la primera.

Medido con la escritura retenida a propósito: **tres** llamadas a la escritura donde debía haber
**una**. Y la pila sólo avanza un paso, así que el siguiente `Ctrl+Z` se salta un cambio.

Se arregla con dos cosas y hacen falta las dos: la pila se lee de una `ref` —al día en el mismo
tic— y un cerrojo descarta cualquier paso mientras haya uno en vuelo. **Descartar y no encolar**:
perder una pulsación rápida se corrige pulsando otra vez; deshacer dos veces lo mismo no se corrige
de ninguna manera.

### Se apuntaba **antes** de escribir, y no se retiraba al fallar

Renombrar y capturar avance desde el Esquema apuntaban la operación antes del `PATCH`. Si el
servidor la rechazaba, la pantalla volvía al valor viejo —eso sí estaba— pero **la pila se quedaba
con la entrada**: la barra ofrecía deshacer un cambio que nunca ocurrió.

Es exactamente lo que la cabecera del gancho dice que no puede pasar —«la pila... sólo se adopta si
la escritura salió bien»— aplicado a quien la llama. Ahora se apunta después del `ok`.

### «Fecha de creación» estaba en el selector y no señalaba nada

El §10.2 la pide entre los criterios del filtro unificado. Estaba declarada, con su etiqueta y sus
nueve operadores — y el dato **nunca se mapeaba** desde el tablero: `createdAt` no viaja en el
resumen de la línea.

Lo que hacía no era «nada», que sería visible. Las fechas se comparan como cadenas `AAAA-MM-DD`
—correcto y barato— y `String(null)` es `'null'`, que empieza por `n`:

```
'null' > '2026-01-01'  →  true      «creada después de» dejaba pasar las 1 368
'null' < '2027-01-01'  →  false     «creada antes de» no dejaba pasar ninguna
```

Dos arreglos, porque son dos defectos. **Uno**: `createdAt` viaja ahora desde el servicio hasta la
línea filtrable. **Dos**: un valor vacío ya no compara — sólo responde a «está vacío», y a «no es»,
que es cierto de una línea sin valor. Un dato que falta no es ni anterior ni posterior a nada, y la
regla vale para los tres campos de fecha y para los de texto.

### Borrar era irreversible desde dos de las tres vistas

El diálogo de baja hace lo correcto: toma la **foto** de la línea y la lista de sus vínculos antes
de borrar, porque después no hay a quién preguntárselos. Pero sólo si quien lo abre le pasa el
proyecto — y de las tres vistas que lo abren, sólo el **Esquema** se lo pasaba.

| borrar una línea desde | ¿se podía deshacer? |
|---|---|
| Esquema | sí |
| Tablero | **no** |
| Lista y Agrupada | **no** |

Y un borrado se lleva **los vínculos en cascada**, así que lo que se pierde no es una fila: es una
fila y todo lo que la ataba al plan. Que eso dependa de **por qué pantalla se pasó** no es algo que
nadie pueda adivinar mirando.

La operación estaba escrita a mano dentro del Esquema. Ahora vive en `operacionDeBorrado`, con las
dos reglas que la hacen correcta escritas donde no se olvidan: la foto **conserva el
identificador** —las hijas y los vínculos apuntan a él— y los vínculos van en la **misma**
operación —reponer la línea sin ellos devolvería una línea suelta y diría que se deshizo—. Sin foto
devuelve `null`: encender el botón de deshacer para nada es peor que dejarlo apagado.

---

## §10.5 — refresco a demanda, decidido en vez de tiempo real

Decisión del dueño del producto, tomada con la pregunta delante: **un botón de actualizar, a
demanda**. Ni Supabase Realtime ni sondeo.

Se construye como **una sola pieza: el botón y la edad**. Sin tiempo real, el daño no es que los
datos sean viejos —lo son entre dos recargas de todas formas— sino que **nadie sepa que lo son**. Un
botón de actualizar suelto es el mismo problema con un botón más.

### Tres tramos, no un contador

| edad | qué dice | por qué |
|---|---|---|
| < 1 min | «actualizado hace un momento» | que sean 41 o 47 segundos no cambia ninguna decisión |
| minutos | «hace 3 minutos» | puede haber algo nuevo; si te importa, actualiza |
| ≥ 5 min | **«· puede haber cambios»** | la diferencia deja de ser teórica |
| horas, días | «hace 3 horas» | esto es una pestaña olvidada |

El aviso va **en palabras**, no sólo en color: que la única señal de «esto está viejo» fuera el
color dejaría fuera a quien no lo distingue.

### Tres decisiones que no se ven

- **Repintar la edad no es un sondeo.** No pide datos: vuelve a escribir el texto. Y el intervalo
  **crece con la edad** — un temporizador al minuto en una pestaña olvidada toda la tarde son
  seiscientos despertares para no cambiar ni una letra.
- **Se recarga el proyecto entero**, no la pestaña visible. Las seis vistas leen del mismo plan, y
  dejar cuatro con datos de hace media hora mientras una se actualiza es exactamente la incoherencia
  que el botón existe para quitar.
- **La marca se pone al terminar**, no al empezar: la edad que importa es la de lo que se está
  viendo.

Un reloj de navegador atrasado no produce «hace −3 minutos»: la edad se acota en cero.

---

## Brecha 28 — el conmutador de claro y oscuro: el mecanismo

Decisión del dueño del producto: **un conmutador**, no sólo seguir al sistema. Antes de tocar un
solo componente hacía falta saber cuánto hay que tocar, así que se inventarió con agentes en
paralelo:

| subsistema | colores escritos a mano |
|---|---:|
| Lista y Esquema | 424 |
| El marco (layouts, navegación, `globals.css`) | 413 |
| Tablero | 357 |
| Gantt y espacio de plan | 225 |
| Calendario y Carga | 225 |
| Panel de control y piezas compartidas | 223 |
| **total** | **1 867** |

Más **69 trampas**: color que se **calcula**, color con opacidad sobre fondo oscuro que no traduce,
y —el grupo que importa— color que **codifica un dato** y no decora: el rojo de sobrecarga, la rampa
de ocupación de la matriz de carga, la rampa del embudo del panel. En esos, cambiar el color cambia
lo que la pantalla **dice**.

### Lo que ya está puesto: el mecanismo, sin tocar ningún componente

**Tres estados y no dos.** `sistema` —el inicial—, `claro` y `oscuro`. Un conmutador de dos
posiciones obliga a decidir en nombre de quien no ha decidido, y una vez pulsado no hay forma de
volver. Y la elección explícita gana sobre el sistema **en los dos sentidos**: quien tiene el
sistema en claro y quiere esta aplicación oscura necesita poder decirlo.

**Sin elegir nada, sigue oscura.** Son 1 867 colores escritos a mano: cambiarle el aspecto a quien no
ha pedido nada no sería una mejora, sería una sorpresa.

**Sin parpadeo.** El servidor no sabe qué eligió esta persona —la elección vive en el navegador—, así
que hay un guión en línea en el `<head>` que estampa `data-theme` **antes del primer pintado**. Va
como cadena y no como módulo porque cualquier cosa que Next cargue como módulo llega después. Un
parpadeo de oscuro a claro en cada navegación sería peor que no tener modo claro.

**Los tokens se nombran por su papel**, no por su color: un token llamado `--zinc-900` no puede valer
blanco sin mentir. `--fondo`, `--superficie`, `--tinta`, `--acento`, `--grave`… y sólo se redefinen
**tokens** bajo el atributo, nunca reglas de componente — un color cuya única definición vive dentro
de un `[data-theme]` no aplica en el estado sin estampar, y la página sale con el texto de un tema
sobre el fondo del otro.

**El acento cambia de valor, no se hereda.** `#6366f1` sobre blanco da 3.9:1, por debajo de lo que
necesita un texto pequeño. En claro baja a `#4f46e5`, que da 6.0:1.

Y tres cosas que sólo se ven cuando fallan: `localStorage` **lanza** en modo privado y dentro de un
`iframe` con cookies bloqueadas —si lanza, se queda oscuro—; basura guardada a mano vuelve a
«como el sistema»; y con la elección en `sistema` la pantalla **sigue al sistema en vivo**, sin
recargar, porque quien cambia el tema de su ordenador a mediodía no tiene por qué saber que hay que
recargar.

### Y una acusación del inventario que era falsa

Uno de los agentes abrió su plan con «PASO 0 · arreglar el corredor de pruebas: hoy
`npx vitest --run lib/scheduling` recoge **cero** pruebas en los 39 archivos». Comprobado antes de
hacerle caso: recoge **39 archivos y 927 pruebas**, en las dos formas de invocarlo. Séptima vez que
una acusación de un informe no sobrevive a reproducirla.

### La conversión: 2 139 sustituciones, y tres colores de la paleta que no pasaban

**Diecinueve literales cubren casi todo.** `text-zinc-500` sale 294 veces, `#27272a` 268,
`bg-zinc-800` 265, `text-zinc-400` 244… Así que la conversión es mecánica — con una condición: las
reglas van por **prefijo**, no por valor. `zinc-400` no significa nada por sí solo: en
`text-zinc-400` es texto secundario y en `border-zinc-400` es un borde. El mismo número, dos papeles,
un token distinto para cada uno.

**2 139 sustituciones en 106 archivos.** Cuatro archivos quedan fuera a propósito: aquellos donde el
color **codifica un dato** — el rojo de sobrecarga, la rampa de ocupación, la del embudo. Ahí
cambiar el color cambia lo que la pantalla dice.

Medido en pantalla sobre la página del proyecto, con el tema en claro:

| elementos pintados a mano de oscuro | |
|---|---:|
| antes de convertir | 18 de 769 |
| ahora | **2** de 769 |

### Y tres fallos de contraste en la paleta que había escrito yo

La síntesis del inventario los señaló y los comprobé con la aritmética de WCAG antes de hacerle
caso. Los tres eran ciertos, al decimal:

| | medído | hacía falta | ahora |
|---|---:|---:|---|
| `--tinta-3` sobre lo hundido | **3.08:1** | 4.5:1 | `#91919a` → 4.77:1 |
| `--grave` como **texto** | **3.69:1** | 4.5:1 | `--grave-tinta` `#f87171` → 6.40:1 |
| `--borde-fuerte` como **anillo de foco** | **1.70:1** | 3:1 | `--foco` = el acento → 3.97:1 |

El de `--tinta-3` es el que más pesa: cubre unas **450** ocurrencias —`text-zinc-500` incluido, la
clase de color más usada del repositorio—, así que heredar ese fallo era heredarlo en todas partes.
Subirlo de `#71717a` a `#91919a` **cambia el aspecto** de esos 450 sitios, y es una decisión, no un
detalle: se toma una vez, con el número delante.

Y una cuarta, que no era un fallo sino una trampa: `--sobre-color` vale negro en oscuro y sirve para
un chip relleno de ámbar (11.92:1), pero **no** es la tinta del botón primario — blanco sobre
`#6366f1` da 4.47:1, a un pelo del mínimo. De ahí `--acento-relleno` = `#4f46e5` en los dos temas,
que con blanco encima da **6.29:1**.

---

## §2 — `Project.progressRollup`, la primera migración autorizada

Autorizada por el dueño del producto. Una columna, `VARCHAR(20) NOT NULL DEFAULT 'DURACION'`, y el
código de los dos modos **ya estaba escrito y probado** por los casos 12 y 13 del §12 — esperando
dónde guardar la elección.

### De dos fórmulas a una

El hallazgo original decía: «hay dos implementaciones del roll-up y **la que prueban los casos 12 y
13 no la llama nadie**». Era cierto, y arreglarlo bien no era cablear la segunda: era **quedarse con
una**.

`progress.ts` ahora llama a `avanceDelResumen` pasándole el **peso de rama** de cada hija como si
fuera su duración — que es lo que es: una hija que a su vez es resumen pesa lo que pesa todo lo que
cuelga de ella. Con eso, el modo ponderado da **exactamente** lo que daba la división de antes, el
promedio simple sale gratis, y `simpleMean` —que resolvía a mano el caso del bloque de puros hitos—
se retira: esa rama ya la resuelve la función buena.

### El total del plan también, y eso sí cambia una cifra

El avance del **plan entero** era siempre ponderado. Eso dejaba el ajuste aplicado a las 125 líneas
con descendencia y **no a la 126ª** — el proyecto, que es la cifra que sale en el panel de control.
Quien elige «promedio de las hijas» porque sus entregables son comparables espera que el proyecto se
lea igual; que la raíz se lea al revés que sus ramas es la clase de incoherencia que hace que nadie
se fíe de la cifra.

### Cuánto cambia, medido

Sobre el plan de referencia, con 400 hojas al 100 % **en memoria** —la base no se tocó—:

| | |
|---|---:|
| resúmenes | 125 |
| donde los dos modos **difieren** | **3** |
| la mayor diferencia | 6 puntos: «Ola 0 QA · 12 servidores» va por 29 % ponderado y 35 % promedio |

Tres de 125 parece poco, y lo es — con este avance de prueba, que deja ramas enteras acabadas o
enteras sin empezar. Los dos modos sólo se separan donde hay hijas **de tamaños distintos y avances
distintos**, que es exactamente el caso del ejemplo del spec: cuatro días al 100 % y cuatro de uno al
0 % dan 50 % y 20 %.

### Dónde se elige

En la barra del corte del Esquema, al lado de la fecha — que es donde **se ve** el número que cambia:
quien duda de una cifra la está mirando. El rótulo dice de qué pregunta responde cada modo
(«¿cuánto trabajo está hecho?» contra «¿cuántas cosas están hechas?») y el título avisa de que es un
ajuste **del proyecto**: lo ven todos los que lo abran.

Sin permiso para cambiarlo, el selector no se dibuja — la vista lo enseña pero no deja tocarlo.

---

## §9.3 C6 — la sobrecarga dependía del color, y el color nunca fue una señal fuerte

El criterio tiene dos mitades: «los gráficos son legibles en modo claro y oscuro **y accesibles sin
depender sólo del color**». Al ir a por la primera apareció un agujero en la segunda.

La celda sobrecargada de la matriz de carga llevaba **tres** señales —fondo rojo, cifra en rojo y
negrita— y las tres son visuales. El título decía «8 h de 8 h · 3 líneas» y **en ningún sitio decía
la palabra**. Quien no distingue el rojo tenía la negrita, que es sutil; quien escucha la pantalla no
tenía nada — había que restar dos cifras de cabeza.

Y midiendo el velo rojo salió algo peor: `#d03b3b` al 27 % da

| sobre | compuesto | contra su fondo |
|---|---|---:|
| oscuro `#18181b` | `#492124` | **1.29:1** |
| claro `#ffffff` | `#f2cbcb` | **1.48:1** |

Una señal que no es texto necesita **3:1**. O sea que el color de la sobrecarga **nunca** fue una
señal fuerte, ni en el tema para el que se diseñó. Lo que sostiene el aviso es la palabra.

Ahora la celda lleva `aria-label` con la frase entera —«2026-06-01: 10 h de 8 h, sobrecargada»— y el
título termina en `· SOBRECARGADA`. Va en `aria-label` y **no** en un `<span className="sr-only">`
porque el añadido invisible ensucia el texto de la celda —y con él cualquier prueba y cualquier copia
al portapapeles—; la etiqueta sustituye lo que se anuncia, que aquí es lo que se quiere: «diez» no
significa nada sin «sobre ocho».

### Y dos vistas que se saltaron por proteger un color que no estaba ahí

La lista de archivos «delicados» tenía cuatro entradas y sobraban tres. `workload-view.tsx` y
`gantt.ts` **importan** los colores de dato, no los escriben: sus literales son todos superficies y
textos. Saltarlos enteros dejó dos vistas sin convertir por proteger algo que vivía en otro archivo.

Corregida la lista —queda sólo `dashboard-charts.tsx`, que es donde **se declaran**— y aprovechado
para unificar las **nueve superficies hundidas** que el inventario encontró haciendo el mismo papel
(`#141416`, `#0e0e12`, `#0f0f11`, `#131316`…): **100 sustituciones más en 15 archivos**.

---

## §9.3 C6 — cerrado, y de camino tres defectos que ya estaban

Los colores que **codifican un dato** —la rampa del embudo, la de ocupación, los cuatro estados
reservados, el velo de sobrecarga— pasan a ser tokens con valor por tema. Y al medirlos aparecieron
tres cosas que fallaban **antes** de que existiera el modo claro.

### La rampa no servía sobre blanco

`#b7d3f6` da **1.54:1** sobre blanco: invisible. La rampa clara se construyó en OKLCH —tono clavado
en 255°, huecos de luminosidad de 0,13— y da **2.19 / 3.57 / 6.17 / 10.77**, monotónica.

El sentido **no se invierte**: sigue yendo de claro a oscuro. Lo que cambia es quién paga el suelo de
contraste — sobre blanco lo paga el paso pálido, que es PENDIENTE: trabajo que ni ha empezado.

### La inversión de la matriz de carga se resuelve en CSS, sin JavaScript

La matriz usaba la rampa **al revés** —más carga, más claro— porque sobre fondo oscuro lo que grita
es lo claro. Sobre blanco el argumento se da la vuelta. Estaba resuelto invirtiendo el arreglo en
JavaScript, que sirve mientras haya un solo tema.

Ahora la rampa de carga se **declara** en un orden en cada tema. No es la misma escala pintada
distinto: es la misma **regla** —distancia al fondo— aplicada a dos fondos.

### La cifra escrita sobre la celda: 1.47:1, en el tema para el que se diseñó

El peor de los tres, y anterior a todo esto. Una rampa se cruza con el texto que lleva escrito, y con
la tinta de siempre:

| paso | tinta clara, oscuro | tinta oscura, claro |
|---|---:|---:|
| carga-1 | 7.76 | 8.07 |
| carga-2 | **4.23** | 4.96 |
| carga-3 | **2.40** | **2.87** |
| carga-4 | **1.47** | **1.65** |

La celda **llena** —que es justo la que se busca de un vistazo— tenía el número ilegible. Cada paso
va ahora emparejado con su tinta, y el punto donde la tinta cambia de bando **no es el mismo en los
dos temas**: en oscuro salta tras el primer paso, en claro tras el segundo. Un `if` con índice fijo
acierta en un tema y falla en el otro.

### Y el velo de sobrecarga pesaba al revés

Un tinte hereda la luminancia del fondo. Medida la parrilla en oscuro, los cuatro pasos van de 0,080
a 0,633 — y el tinte rojo se quedaba en **0,026**, por debajo del más vacío. En claro, 0,659 contra
0,429: lo mismo del otro lado.

En los dos temas la celda con problema era **la más ligera de la parrilla**: parecía la más vacía
justo la que está desbordada. Ahora es un relleno macizo, que no depende del fondo: `#f87171` en
oscuro cae entre el segundo y el tercer paso — pesa como una celda llena, que es lo que es.

### Seis fondos que dejaban el desglose ilegible en claro

`bg-[#141416]` y compañía seguían escritos a mano: las reglas de conversión miraban el hexadecimal
**entrecomillado** y éstos van entre corchetes. En tema claro dejaban la tinta a **1.04:1** — el
desglose entero, un rectángulo negro. Añadidas las reglas para que no vuelva a colarse.

### Demostrado en pantalla, en los dos temas

| | oscuro | claro |
|---|---|---|
| paso más vacío de la carga | `#184f95` | `#77b2fd` |
| paso más lleno | `#b7d3f6` | `#053d79` |
| velo de sobrecarga | `#f87171` | `#b91c1c` |
| tinta encima del velo | `#09090b` | `#ffffff` |
| celdas con carga que llevan **su propia tinta** | **83 de 83** | **83 de 83** |
| celdas sobrecargadas que dicen **la palabra** | **61 de 61** | **61 de 61** |

### Y la novena acusación caída

El informe decía que `var()` no resuelve en un atributo de presentación SVG, y que por eso los
gráficos de recharts se romperían. Comprobado en el navegador: `fill="var(--acento)"` computa a
`rgb(79, 70, 229)`. **Sí resuelve.**

---

## §2, §10.2 — campos personalizados: los nueve tipos, y qué significa filtrar por una lista

Segunda migración autorizada. El spec los declara en el modelo —`CustomField` con su `type` y sus
`options`— y los pide en dos sitios más: entre los criterios del filtro unificado («todos los campos
personalizados») y en el catálogo de columnas del §4.2.

### Tres de los nueve guardan listas, y eso cambia los operadores

`MULTISELECT`, `PEOPLE` y `TAGS` no guardan un valor: guardan **varios**. Y sobre una lista, los
operadores de siempre significan otra cosa:

- «es igual a» pasa a ser **«contiene»** — una línea etiquetada `[riesgo, banco]` responde que sí a
  «etiqueta = riesgo»; preguntar por igualdad exacta contra una lista no le sirve a nadie.
- los de **orden** —mayor, menor, entre— no aplican: una lista no es mayor que otra. No se ofrecen.

Ofrecer un operador que no significa nada es peor que no ofrecerlo: quien lo elige obtiene un
resultado, y el resultado es basura con pinta de dato.

### La trampa que esto evita

Dentro del `switch` general el valor se convierte a texto, y `['riesgo','banco']` convertido a texto
es `'riesgo,banco'`. Entonces «contiene banco» acertaría **por casualidad** — y «contiene esgo,ban»
también. Es la clase de acierto que hace que un filtro parezca funcionar hasta el día que no.

### Se archivan, no se borran

Es la decisión que gobierna el servicio entero, y no hay `DELETE` en la ruta. Un filtro guardado
puede apuntar a un campo, y el §10.2 dice que los filtros se guardan con nombre y se comparten.
Borrarlo dejaría el filtro señalando algo que nadie conoce — y el filtro **no avisaría**:
devolvería cero líneas y parecería que no hay nada que enseñar.

Por eso el catálogo se lee **con los archivados dentro**, y quien construye un filtro nuevo se queda
con los vivos. Son dos decisiones distintas y por eso son dos funciones.

### Lo que sale de la base no está tipado

`value Json` es lo que permite nueve tipos en una tabla. El precio es que un campo declarado
`NUMBER` puede tener guardada la cadena `"ocho"`. Todo pasa por `leerValor`, que devuelve `null` en
vez de propagar la sorpresa — un `NaN` se propaga por todas las pantallas hasta salir como «—» donde
nadie entiende por qué. Y en los de lista, un elemento corrupto no esconde a los tres que están
bien.

### Dos decisiones pequeñas con motivo

- **La clave lleva prefijo** (`cf:`). Un campo personalizado llamado «status» existiría al lado del
  estado de verdad y el filtro elegiría uno de los dos sin decir cuál. Y por si acaso, el catálogo
  mezcla poniendo los de siempre **encima**, así que la garantía no depende de esa convención.
- **La lista vacía pasa «no es ninguno de»**, igual que el valor ausente pasa «no es»: una línea sin
  etiquetas **no está** etiquetada como riesgo.

### Demostrado en pantalla, sobre el plan de 1 368 líneas

Con un campo `TAGS` sembrado desde los propios títulos del plan — así el número que salga se puede
comprobar contra la siembra:

| | |
|---|---|
| el campo aparece en la barra | **«Etiquetas»**, junto a los trece de siempre |
| operadores que ofrece para una lista | `contiene` · `es alguno de` · `no es ninguno de` · `está vacío` · `tiene valor` |
| filtrando «contiene banco» | **189 de 1 368** |

Los cinco operadores son exactamente los que significan algo: **no aparece «es igual a»** — sobre una
lista no le sirve a nadie — **ni ninguno de orden**.

Y 189 es justo lo que el sembrador etiquetó con `banco`, así que el dato llega entero desde la tabla
`custom_field_values` hasta el conteo de la barra.

Una nota de la medición, que casi me lleva a un defecto que no existía: el primer intento leía
«0 de 1368» y parecía que el filtro no encontraba nada. Ese número era el **contador de completadas**
del panel, que dice lo mismo con otras palabras en la misma página. El conteo del filtro tiene su
propio `data-testid` — buscar por texto en `document.body` es la séptima vez que engaña.

---

## §3.4 — dos de las ocho restricciones no cabían en su columna

De la auditoría adversarial de las cuatro vistas. Salió **enterrado en un matiz** de una refutación
—el agente lo encontró al intentar reproducir otro hallazgo y chocar con un `P2000`—, y es lo más
grave de la tanda.

`NO_TERMINA_DESPUES_DE` y `NO_EMPIEZA_DESPUES_DE` miden **21 caracteres**. La columna era
`VARCHAR(20)`.

```
DEBE_TERMINAR_EL       (16) → guardado y leído
NO_TERMINA_DESPUES_DE  (21) → RECHAZADO: too long for the column's type
NO_EMPIEZA_DESPUES_DE  (21) → RECHAZADO: too long for the column's type
```

Estaban **declaradas** en `restricciones.ts`, **ofrecidas** en el diálogo, y **probadas** — la
batería del §12 las ejercita y pasan. Lo único que no se podía era **guardarlas**. La fila 82 de esta
bitácora dice «§3.4 CERRADA · las ocho»: dos de esas ocho no llegaban a la base.

Ninguna prueba lo veía porque **ninguna escribe en la base**: el motor es puro y se prueba en
memoria, que es lo que lo hace rápido y lo que aquí lo dejó ciego.

Columna a `VARCHAR(24)`, y una prueba que compara **el largo de cada código contra el ancho que el
esquema declara** — lo único comprobable sin base. Validada estrechándola a 20: se pone roja
nombrando las dos. Medido después contra la base: **las ocho se guardan, 8 de 8**.

---

## §10.6 — deshacer un arrastre a «Terminado» borraba el avance capturado

Mover una tarjeta a «Terminado» no mueve una tarjeta: el servidor deriva de la columna el estado
**y el avance** (§5.2, §5.5). La operación apuntaba sólo `kanbanColumnId`.

Medido por el auditor contra el plan real, y restaurado después: capturar **60 %** → arrastrar a
«Terminado» → 100 % → `Ctrl+Z` → **1 %**. Igual desde 5 %, 25 % y 99 %: los cuatro acaban en 1 %,
porque al deshacer el servidor vuelve a derivar el avance de la columna y una columna intermedia
significa «arrancada».

En pantalla la tarjeta vuelve a su sitio —que es lo que se mira— y el número perdido está en la
barrita de avance. Quien pulsa `Ctrl+Z` cree haber vuelto atrás.

La operación lleva ahora **las tres cosas que el movimiento cambia**. Y una que se ve al escribir la
prueba: `progressPct: 0` es un valor capturado —una línea que nadie ha empezado— y si se cayera por
ser *falsy*, deshacer la dejaría al 100 % exactamente igual que si no se hubiera apuntado.

---

## §13 — el sombreado del día no laborable, que apagué yo al convertir a tokens

La celda de un día no laborable era `#111113`: **más oscura** que la tarjeta. Mi regla la mapeó a
`--superficie`, que es **exactamente** el color de la rejilla. El sombreado que pide el §13
desapareció — y ninguna prueba se puso roja.

De los 97 sitios que usaban ese tono, sólo dos lo usaban como **hueco dentro** de una tarjeta: la
celda del Calendario y la de la matriz de carga. Los otros 95 eran tarjetas sobre el fondo de la
página, donde `--superficie` es correcto.

De ahí `--hueco`, que no es `--superficie-3`: eso es lo que se **eleva** —cabecera de tabla, campo— y
en oscuro es más claro que la tarjeta. Un hueco va al revés.

---

## §6 — la segunda vez que se apunta antes de escribir

Renombrar desde la celda de la Lista apuntaba la operación antes del `PATCH`, con el comentario
escrito al lado: «si la escritura falla, la recarga devuelve la pantalla a lo que hay en la base y el
apunte **queda inocuo**». No queda inocuo: la pantalla vuelve, pero la pila se queda con la entrada y
la barra ofrece deshacer un cambio que nunca ocurrió.

Es la misma trampa del Esquema, con el razonamiento escrito de otra forma — y esta vez el comentario
la **defiende**, que es lo que la hizo sobrevivir a la primera pasada.

---

## §5.4 — agrupado por responsable, soltar una tarjeta no reasignaba nunca

La clave de una columna de responsable **no dice de dónde viene**. Una persona del plan da un
`responsibleName` —un **nombre**— y una cuenta del sistema da un `ownerId` —un **identificador**—, y
los dos acaban siendo el `id` de la columna. El arrastre mandaba siempre `ownerId`, así que soltar
una tarjeta en la columna «Salomón Suárez» enviaba la cadena «Salomón Suárez» como si fuera un
identificador.

Y había una segunda pared detrás: **`responsibleName` no estaba en el esquema del `PATCH`**. Aunque
se hubiera mandado el campo correcto, la ruta lo habría ignorado. Con las dos cosas, ese arrastre no
podía funcionar de ninguna manera — se veía hacer y no cambiaba nada.

La columna lleva ahora `campoDeOrigen`, y `cambioAlSoltar` escribe **el campo del que salió**. Sin
él se cae a `ownerId`, que es lo que hacía antes: una columna vieja no puede quedarse sin
comportamiento.

### Demostrado en pantalla

Agrupando por Responsable, el tablero da las cinco personas de verdad del plan. Moviendo una tarjeta
de una a otra y devolviéndola:

| | José Cruz | Rafael Oliva |
|---|---:|---:|
| antes | 328 | 450 |
| tras soltarla | **327** | **451** |
| devuelta | 328 | 450 |

Las dos escrituras, `HTTP 200`. El plan de referencia verifica antes y después.

---

## §4 — arrastrar una barra borraba la restricción guardada, y el diálogo no lo decía

`confirmar()` clava la línea arrastrada con `DEBE_EMPEZAR_EL` en su fecha nueva, y `WorkItem` tiene
**una sola** pareja de columnas de restricción: lo que hubiera se sobrescribe. El diálogo de
confirmación decía cuántas líneas se mueven y si el cierre cambia. Nada más.

### La distinción que faltaba

No toda restricción perdida es una pérdida. Cada línea llega **anclada** con un `NO_ANTES_DE` —es lo
que fija la fecha guardada para que el motor no recoloque el plan en cada lectura (§3.0)—, y
reemplazar un ancla por otra ancla no es perder nada.

Lo que sí lo es: un **compromiso**. «No termina después del 18», «debe terminar el 18». Es lo único
que distingue una fecha negociada de una calculada, y es lo más caro de capturar del §3.4 — que acaba
de estrenar diálogo para capturarlo.

Medido contra el plan real, sobre la línea «Presentar el plan de trabajo de Mobilize al banco»:

| lo que tenía guardado | lo que dice la previsualización |
|---|---|
| nada | `null` |
| el ancla `NO_ANTES_DE` | `null` — correcto, no es perder nada |
| `NO_TERMINA_DESPUES_DE 2026-06-18` | **el tipo y la fecha** |

De paso, esa medición **ejercita la columna recién ensanchada**: `NO_TERMINA_DESPUES_DE` mide 21
caracteres y hace una hora no se podía guardar.

### Se dice, no se impide

Quien arrastra sabe lo que hace. Lo que no puede es enterarse semanas después, cuando el plan deje de
respetar un compromiso que nadie recuerda haber quitado. El diálogo lo nombra con su nombre legible y
añade que se recupera con `Ctrl+Z` — que es cierto: `confirmar()` ya devolvía las restricciones
previas en `cambios[].antes` y la pila las repone.

Y un código que no reconocemos **también avisa**: si hay algo guardado que no sabemos leer, avisar de
más es mejor que borrarlo callando.

---

## §12 caso 24 — dejé de cronometrar y me puse a contar

La prueba de linealidad se puso roja **cuatro veces** con el motor intacto, y las cuatro la arreglé
mal: primero equilibrando el trabajo, luego cambiando qué se compara. Seguía siendo un cronómetro.

Los números dicen por qué no podía funcionar. Las razones reales quedaban en **2.06 y 2.60** contra
un tope de 3: entre un 15 y un 45 % de margen. Esta suite corre **ciento ochenta archivos en
paralelo**; ahí un ruido de medio segundo es lo normal, no la excepción.

### Contar visitas, no milisegundos

Un `Proxy` por vínculo cuenta cada vez que el motor mira uno de sus campos. No toca el código de
producción — lo que se mide es cuántas veces lo recorre, que es exactamente la pregunta que la
prueba quería hacer.

| al doblar el plan de 5 000 a 10 000 | razón |
|---|---:|
| con el reloj, pase adelante | 2.06 |
| con el reloj, pase atrás | 2.60 |
| **contando, los dos pases** | **2** |

Exactamente 2. No 2.06 ni 1.98: **2**, en las seis corridas seguidas que hice. Eso es lo que da un
conteo determinista, y es lo que un cronómetro no puede dar en una máquina compartida.

La aserción se validó bajando el tope a 1.9 — se pone roja nombrando el 2. Y lleva un **suelo** de
1.5 además del techo: sin él, algo que no dependiera del tamaño pasaría por vacía.

El reloj no se fue del todo: queda el tope absoluto de tres segundos, que es la red contra una
regresión de orden de magnitud y tiene margen de sobra para no flaquear.

---

## §5.1 — el EDT del Tablero se numeraba sobre lo filtrado, y el comentario decía lo contrario

El tablero recibe `kanbanBoard.workItems.filter(...)` — ya filtrado. Y numeraba el EDT sobre eso, con
este comentario dos líneas más arriba:

> «El EDT se numera sobre el plan entero, no sobre lo visible: si cambiara al filtrar, dejaría de
> servir para nombrar una línea en una reunión.»

El comentario tenía razón y el código no lo hacía. Es la segunda vez esta semana que un comentario
**defiende** lo que el código hace mal — la otra fue «el apunte queda inocuo» en la Lista.

### Y al lado, la séptima aparición de la trampa del resumen

Dos líneas antes, `esResumen` recorría **lo filtrado** para saber quién tiene hijas. Sobre un
subconjunto, esconder a las hijas convierte a su madre en hoja. Es exactamente lo que esta bitácora
lleva seis entradas advirtiendo, y estaba en el mismo `useMemo` de al lado.

El orden de las fases salía del mismo sitio: tres propiedades **del conjunto** calculadas sobre un
subconjunto.

### Demostrado en pantalla, sobre las 1 368

| | tarjetas dibujadas | las tres primeras |
|---|---:|---|
| sin filtro | 1 221 | `1.1.1` · `1.1.2` · `1.2.1.5.1.1` |
| con filtro (**189 de 1 368**) | 184 | `1.1.1` · `1.1.2` · **`1.2.1.5.1.1`** |

Lo que lo prueba no es que los números coincidan, es **cuáles son**: `1.2.1.5.1.1` es un camino de
seis niveles, y con 189 líneas visibles casi ninguno de sus ascendientes está dibujado. Un EDT
calculado sobre lo visible no puede producir ese número — se habría acortado a dos o tres niveles.

---

## §7 — la cabecera del Calendario contaba la rejilla y lo llamaba «este mes»

Una rejilla de mes empieza el **lunes anterior** al día 1 y acaba el **domingo posterior** al último:
hasta doce días de más. La propia vista los dibuja atenuados — precisamente porque no son de este
mes. Y la cifra de la cabecera los contaba.

Medido sobre el plan de referencia:

| mes | la cabecera decía | caen de verdad | error |
|---|---:|---:|---:|
| agosto de 2026 | **300** | 171 | **129** |
| septiembre de 2026 | **549** | 490 | **59** |

Ciento veintinueve líneas de diferencia en un mes. La cifra que se enseña tiene que responder a la
pregunta que hace quien la lee —«¿cuánto hay este mes?»— y no a la que le resulta cómoda al repartidor
de carriles.

Cruzar la frontera **sí** cuenta: una línea que empieza el 29 de julio y termina el 3 de agosto está
en agosto. Lo que no cuenta es quedarse fuera del todo y aparecer dibujada sólo porque la rejilla
tiene orillas.

### Demostrado en pantalla

La vista cuenta sobre las **1 368** líneas del plan; la medición de arriba fue sobre las 1 243 hojas.
Sobre la misma población que la pantalla, en agosto de 2026:

| | |
|---|---:|
| lo que diría contando la rejilla expandida | **364** |
| lo que caen de verdad en agosto | **230** |
| lo que dice ahora la cabecera | **230** |

Ciento treinta y cuatro líneas de error, en la cifra que alguien lee para decidir si el mes está
cargado.

---

## §7 — los hitos rompían el repartidor de carriles, y el motivo que lo just ificaba ya estaba cubierto

El voraz de reparto —«el primer carril cuyo último día ocupado sea anterior a mi inicio»— sólo da el
**mínimo** de carriles si los intervalos entran ordenados por inicio. El comparador ponía los hitos
primero de todo, con el motivo escrito al lado:

> «Así toman los carriles altos y nunca caen en el recorte.»

El motivo era bueno. La implementación sobraba: **los hitos ya están exentos del recorte** unas
líneas más abajo (`carril >= maxLanes && tarea.isMilestone !== true`). Adelantarlos no los protegía
de nada — sólo rompía el empaquetado.

Fuera de orden, el voraz sigue produciendo un dibujo **válido** —nada se solapa— pero abre carriles
de más, y cada carril de más empuja tareas detrás del «N más». Medido sobre el plan de referencia:

| mes | dibujadas antes | ahora | escondidas antes | ahora |
|---|---:|---:|---:|---:|
| agosto | 14 | 14 | 1 364 | 1 329 |
| septiembre | 37 | **44** | 1 559 | **1 473** |
| octubre | 36 | **38** | 1 098 | **1 015** |

Los hitos siguen sin recortarse — lo garantiza la exención, que es donde siempre estuvo. Y entre dos
que arrancan el **mismo día** el hito sigue yendo primero: el orden entre iguales no toca la
invariante, y ahí sí es el que alguien vino a buscar.

---

## Y el intermitente que llevaba dos turnos anotado sin diagnosticar

`template-structure.property.test.ts` falló en **dos de tres** corridas completas y en **cinco de
cinco** corriendo sola pasó. Esa asimetría es la firma de un plazo corto, no de un defecto.

La propiedad tarda **391 ms** y hace cien pasadas. El plazo de cinco segundos no se agotaba por
trabajo sino por espera: la suite lanza ciento ochenta archivos en paralelo.

Veinte segundos, y **no se bajan las cien pasadas** — eso arreglaría el síntoma debilitando lo único
que la prueba aporta. Tres corridas completas seguidas en verde después.

Es el segundo plazo de reloj que se rompe hoy en esta suite. El primero fue el caso 24 del §12, que
acabó dejando de cronometrar. La lección se repite: **en una máquina compartida, un límite de tiempo
mide la máquina.**

---

## §7 — una tarea que no se dibuja reservaba carril igual

El informe culpaba a la exención de los hitos: «los hitos están exentos del recorte y nada los
acota». La exención no era el problema. El problema estaba una línea antes.

El carril se reservaba **antes** de decidir el recorte:

```
carril = primer carril libre     ← y lo ocupa
…
if (carril >= maxLanes && no es hito) { cuenta como «N más»; continue }
```

Así que una tarea destinada a quedar detrás del «N más» dejaba ocupado un carril que **nadie
ocupa** — no se dibuja, luego no estorba a nadie. Con **tres** carriles visibles, el reparto llegaba
a **setenta y cuatro** en el plan real.

Y eso rompía justo el caso que la exención existe para resolver: un hito pedía carril, le tocaba el
40 —porque los cuarenta anteriores estaban «ocupados» por tareas invisibles— y como está exento **se
dibujaba ahí**.

| la fila de semana más alta del plan | |
|---|---:|
| antes | **902 px** |
| ahora | **198 px** |
| una casilla vacía mide | 104 px |

Y en pantalla, las cinco filas de septiembre: **204 · 138 · 248 · 182 · 137**. La más alta, 248 — la
fila del DOM lleva además el mínimo de la casilla y su relleno.

Lo dibujado y lo escondido no cambian: 44 y 1 473 en septiembre, igual que antes del arreglo. Lo que
cambia es que caben en pantalla.

Vale la pena anotar que el informe señaló el síntoma correcto y la causa equivocada. Arreglar lo que
decía —acotar los hitos— habría escondido hitos para tapar un carril fantasma.

---

## §6.2 — la cabecera de grupo hablaba en enum, y una celda de más

Dos defectos en el mismo bloque de la Lista, y los dos se ven al mirar.

### El mismo dato con dos nombres, a dos centímetros

La cabecera de grupo enseñaba **el valor crudo**: «TODO», «CRITICAL». Las celdas de las filas de
debajo, en la misma pantalla, decían «Por hacer» y «Crítica». El crudo encima, en la línea que las
titula.

Se traduce con **las mismas funciones** que las celdas, no con una copia: dos tablas de nombres
acaban divergiendo, y la que se olvida es siempre la del sitio menos mirado. Responsable y fase salen
tal cual porque son texto libre.

### Y una celda que no existía

`colSpan={columnasDeLaFila}` seguido de otra celda, cuando `columnasDeLaFila` **ya incluye** la de
acciones. La fila de cabecera emitía una columna más que la tabla, en **todas** las configuraciones
del panel de Campos. Un `colSpan` de más no da error: estira la fila y descuadra los bordes, que es
de las cosas que se ven y no se miran.

### Por qué sobrevivieron

**La Lista no tenía ninguna prueba de componente.** Es la vista con más código de las seis —mil
cuatrocientas líneas— y la única sin un solo `render()`. Los dos defectos son de los que una prueba
de siete líneas caza.

Ahora hay siete, y tres de ellas comprueban la cuenta de celdas **en tres configuraciones distintas
del panel de Campos**, que es donde el `colSpan` fijo se rompe.

### Demostrado en pantalla

Agrupando por Estado sobre las 1 368: la clave del grupo sigue siendo `TODO` —es el dato— y lo que
se lee es **«POR HACER»**. Y la fila de cabecera suma **10 celdas** contra las **10 columnas** de la
tabla.


## §6.2 · El CSV de la vista Agrupada no llevaba los grupos

`exportar` sacaba las filas de `lineasPlanas`, que **no depende de `agruparPor`**. En la vista
Agrupada el archivo salía byte a byte igual que el de la Lista: el orden del plan, sin cabeceras y
sin subtotales, mientras la pantalla enseñaba los grupos. El propio archivo que exporta encabeza su
documentación con «se exporta lo que se ve».

Ahora las filas salen de `filasConGrupos`, que es lo que la tabla dibuja en los dos formatos, y
`csvDeLaLista` admite una fila de cabecera. En un CSV no hay celdas combinadas, así que la cabecera
se escribe en las primeras columnas y **se rellena hasta el ancho de la tabla**: una fila corta deja
la hoja con los bordes torcidos.

### Demostrado en pantalla

Interceptando el archivo que el botón descarga, sobre las 1 368 líneas del plan de referencia:

| Formato | Contexto del archivo | Cabeceras | Líneas |
|---|---|---|---|
| Lista | `1243 de 1368 líneas · 9 de 9 columnas` | 0 | 1 243 |
| Agrupada | `1243 de 1368 líneas en 1 grupo · 9 de 9 columnas` | 1 | 1 243 |
| Lista otra vez | `1243 de 1368 líneas · 9 de 9 columnas` | 0 | 1 243 |

Agrupando por Prioridad salen tres cabeceras —`"Crítica";"312 líneas"`, `"Alta";"815 líneas"`,
`"Media";"116 líneas"`— y **los subtotales suman 1 243**, las mismas líneas que el archivo lleva.

## §6.3 · El alfabeto no es un orden

`agrupar` ordenaba las claves con `localeCompare('es')`. La clave de grupo es el **valor crudo**, así
que eso no es ni siquiera el orden alfabético de lo que se lee:

- los estados salían `BLOCKED, DONE, IN_PROGRESS, TODO`, el revés del flujo de trabajo;
- las prioridades ponen `LOW` delante de `MEDIUM` en cuanto hay una línea baja —con sólo
  CRITICAL, HIGH y MEDIUM el alfabeto acierta por casualidad, y por eso no se veía;
- las fases salían en orden alfabético, y una lista de fases se lee **como una secuencia**.

El orden bueno ya estaba escrito en el repositorio en tres sitios —`ORDEN_DE_ESTADOS`,
`ORDEN_DE_PRIORIDAD` y `buildPhaseRank`— y ésta era la única función que no lo usaba. Peor: **esta
misma vista ya calculaba `phaseRank`** doce líneas más abajo, para ordenar el esquema, y al agrupar
lo tiraba. Por eso el orden se recibe de fuera en vez de escribirlo aquí una cuarta vez.

### Demostrado en pantalla

Agrupando las 1 368 líneas por Fase salen **25 grupos**, ahora en el orden del proyecto: Inicio,
Planificación, Ejecución, Dirección, Cierre, y después la etapa Migrate con sus **Ola 0 … Ola 10**
en orden. Con el alfabeto, sobre esos mismos 25 nombres:

- el plan **empezaba por sus dos cierres** («Cierre de la etapa Migrate», «Cierre de Mobilize»);
- las olas salían `Ola 0, Ola 1, Ola 10, Ola 2, Ola 3, …`;
- y **no coincidía ni una** de las 25 posiciones con el orden real.

## §5 · La paginación del Tablero se perdía al mover una tarjeta

La columna devolvía su paginación al principio cuando cambiaba `workItemsInColumn.length`. El
comentario de al lado explicaba bien el motivo —«al cambiar de agrupación o de filtro la columna trae
otras tarjetas»— y el disparador era otra cosa: **mover una tarjeta cambia el largo de dos
columnas**. Quien desplegaba ocho tandas para llegar a la suya y la arrastraba se encontraba las dos
columnas plegadas a cincuenta otra vez, y su tarjeta —ya movida— fuera de la vista. Lo mismo al crear
y al borrar.

Y por el otro lado tampoco disparaba cuando debía: un filtro que cambia **qué** tarjetas hay sin
cambiar cuántas dejaba la paginación como estaba.

Ahora el disparador es la vista —agrupación, filtros y búsqueda—, que es lo que el motivo decía desde
el principio. Que la lista mengüe no hace falta vigilarlo: un `slice` de más nunca esconde nada, y
por eso el «o —peor— escondidas las únicas que quedan tras filtrar» del comentario viejo describía
algo que no podía pasar.

**Esta carga paginada del §5 no tenía ninguna prueba.** Ahora hay cinco, y una de ellas comprueba que
el reajuste legítimo —al buscar— sigue ocurriendo, para que arreglar esto no lo quite.

### Demostrado en pantalla

Tablero agrupado por Estado, columna **Backlog** con 158 tarjetas, arrastrando una a «To Do»:

| | tarjetas en la columna | dibujadas | el botón dice |
|---|---|---|---|
| al entrar | 158 | 50 | 108 tarjetas más |
| tras desplegar una tanda | 158 | **100** | 58 tarjetas más |
| tras mover una a «To Do» | **157** | **100** | 57 tarjetas más |

Con el defecto puesto, la última fila decía **50 dibujadas** y «107 tarjetas más»: cien tarjetas
escondidas de golpe, entre ellas la que se acababa de mover.

### Y una cosa que salió al restaurar

El arrastre de la medición movió una línea de verdad, así que tocó restaurar con el procedimiento de
siempre. `import-plan-db --merge` dejó **dos cosas fuera de sitio**: conservó el avance de 0,01 que
el propio movimiento había escrito —hace bien, es avance capturado— y **movió el `startDate` del
proyecto** de `2026-06-01` a `2026-06-12`, la fecha de la primera línea.

Es decir: el procedimiento de restauración rompe por su cuenta uno de los ocho controles del
verificador. Restaurar es entonces tres pasos, no uno: limpiar el avance que dejó la medición,
`--merge`, y devolver el `startDate` del proyecto.

## §4.8 · La foto de un resumen no era la de su rama

La barra de hoy de un resumen se dibuja con **lo que abarca su rama** —está así a propósito, y el
porqué lleva escrito en `abarcado` desde que se puso: las fechas guardadas de un resumen envejecen en
cuanto alguien mueve una hija—. La barra de la línea base se dibujaba con **las fechas guardadas del
resumen**, que son justo lo que ese comentario dice que no sirve.

Son dos cosas distintas puestas una encima de la otra. El corrimiento que se leía entre ellas no lo
había provocado nadie.

Ahora la foto de un resumen se calcula con la **misma función y de la misma manera** que su barra de
hoy: sólo las hojas, y que ella suba. Y los dos corrimientos —el de arranque y el de cierre— se miden
entre las dos barras que se ven, no contra `earlyStart`, que para un resumen es otra cifra. Si la
rama no está en la foto —una foto parcial, hijas creadas después— se cae a lo guardado: mejor la
referencia vieja que ninguna.

### Demostrado en pantalla

Con la foto real «Plan comprometido con el banco» (18 ago 2026) sobre el plan de referencia, contando
las 28 barras de foto que hay en pantalla:

| | coinciden | discrepan |
|---|---|---|
| antes | 27 | **1** |
| después | **28** | 0 |

La que discrepaba era **la raíz del plan**, la fila que queda cuando todo está plegado, con la barra
de foto **dos días hábiles más corta** que la de hoy —648 px contra 664, a ocho píxeles el día— y con
`data-desvio` diciendo **cero**. El número negaba lo que el dibujo enseñaba, que es la peor de las dos
maneras de estar mal.

El informe de auditoría hablaba de doce días. Medidos son dos, en esa fila. La forma del defecto era
la descrita; la cifra no.

## §4.6 · Un hito no llevaba nada de lo que lleva una barra

El rombo se dibujaba en un `return` propio, **antes de todo lo demás**. Eso lo dejaba fuera de tres
cosas que el motor sí le calcula —la banda de holgura, la barra de la línea base y el vencimiento— y,
de regalo, de los conectores del §4.4.

Las tres del §4.6 importan **más** en un hito que en una tarea, porque un hito *es* una fecha
comprometida. El propio `gantt.ts` lo dice con todas las letras al calcular `atrasada`: «un hito
vencido también cuenta: es una fecha que pasó sin ocurrir, que es peor que una tarea a medias». Lo
calculaba, y la vista lo tiraba.

Y sin conectores no se podía vincular un hito arrastrando, siendo el destino de vínculo más común que
hay en un plan de olas.

Ahora el rombo ocupa **el sitio de la barra**, no el de la fila entera: lo que cambia entre un hito y
una tarea es la forma, no qué se dibuja alrededor. Los dos conectores se abren a las puntas del rombo
porque un hito mide cero y, sin separarlos, los dos caían en el mismo píxel y sólo uno se podía
agarrar.

### Demostrado en pantalla

Sobre el plan de referencia con la foto puesta, muestreando siete profundidades del diagrama —21
hitos distintos y 227 barras—:

| | hitos | con barra de foto | con conectores | dicen si vencieron |
|---|---|---|---|---|
| antes | 21 | **0** | **0** | **0** |
| después | 21 | **21** | **21** | **21** |

Las 227 barras llevaban su barra de foto en los dos casos: el defecto era sólo de los hitos.

La banda de holgura sale 0 de 21 en los dos, y no es un defecto: los 21 hitos muestreados son los
cierres de ola y están todos en la ruta crítica, con holgura cero. La prueba de componente sí monta
un hito con margen y comprueba que la banda se le dibuja.

## §4.4 · El arrastre a la izquierda: la acusación no se sostiene

El informe decía que arrastrar una barra hacia la izquierda promete una fecha que el plan no puede
cumplir. **No se reproduce.**

`reprogramarDesde` coloca la arrastrada exactamente donde se soltó —está escrito así a propósito, con
su porqué, y hay una prueba que lo fija—, `confirmar()` la clava con `DEBE_EMPEZAR_EL`, y el motor
respeta esa restricción **por encima de la predecesora**: `schedule.ts` lo dice con todas las letras
—«la única que pisa hacia atrás… es lo que hace MS Project»— y `schedule.test.ts` ya lo comprobaba con
una predecesora de diez días.

### Lo que sí pasó, y de quién fue

Mi primera reproducción **daba la razón al informe**: la línea se iba al `2026-06-15` habiendo
prometido el `2026-06-03`. El fallo era del montaje, no del código: puse `constraintType` y
`constraintDate` sueltos en la tarea, y el motor lee `constraint: { type, date }`. La restricción
nunca llegó, así que la predecesora mandó. Con la forma buena, la línea empieza el `2026-06-03`.

Van diez acusaciones caídas al reproducirlas. Ésta es la primera que me la fabriqué yo.

### Lo que deja el error

Al equivocarme simulé **exactamente** el fallo que sí rompería la promesa: que la restricción no
llegue de la base al motor. Ese eslabón —`restriccionDe`, que traduce las dos columnas de `WorkItem`
a lo que el motor lee— **no tenía ninguna prueba**, ni en el servicio ni en ningún sitio. El motor
estaba probado, y la traducción hasta él no.

Ahora hay cinco, incluida la del recorrido entero: lo que el arrastre escribe, traducido y
programado, empezando el día que se prometió. Rompiendo el reparto entre `constraint` y `compromiso`,
dos se ponen rojas.

## §4.5 · La línea creada desde el menú contextual nacía al final del plan

El puesto al final es lo correcto para el botón de alta —lo que se acaba de añadir es lo último que
se pensó, y está escrito así con su porqué— y es un disparate para el menú contextual, que **se abre
sobre una fila concreta**. Pedir «añadir tarea al mismo nivel» sobre la fila 12 dejaba la línea en la
**1368**: mil trescientas cincuenta y seis filas más abajo de donde se estaba mirando.

Con «añadir subtarea» era peor que un incordio. La hija se quedaba con la fila 12 de madre y con el
puesto 1368, así que **el árbol y el orden decían cosas distintas**: el EDT la numeraba dentro de su
rama y el plan la dibujaba al final, suelta de su madre.

El §4.5 dice «observado en GanttPRO, replicar», y en GanttPRO una tarea añadida desde el menú de una
fila aparece **debajo de esa fila**. Es lo único que tiene sentido en un menú anclado a una fila.

Ahora el alta admite `insertAfterId`: el puesto es el del ancla más uno y lo que venía detrás se
corre un lugar **de una sola escritura** —de una en una serían mil trescientas idas y venidas a la
base por una tecla—. Sin ancla no cambia nada, y un ancla que no es de este proyecto se cae al final:
mejor una línea al final, que se ve, que un error y ninguna línea.

### Demostrado en pantalla

Creando una línea con el ancla en «Definir la cuenta de seguridad (Security)», la fila 12 del plan:

| fila | qué se lee en el Gantt |
|---|---|
| 11 | Definir la cuenta de archivo de registros (Log archive) |
| 12 | Definir la cuenta de seguridad (Security) |
| **13** | **PRUEBA · línea creada desde el menú contextual** |
| 14 | Definir la cuenta de servicios compartidos (Shared services) |

Antes habría sido la **1369**. La línea de prueba se borró y los 1 356 puestos que la inserción había
corrido se devolvieron; el plan verifica en 1 368 líneas y 1 665 vínculos.

### Y una prueba mía que se pasaba de tiempo

La de «al buscar sí vuelve al principio» del §5 dibuja doscientas tarjetas y las redibuja tres veces.
Sola pasa; con los ciento ochenta archivos de la suite en paralelo se pasaba de los cinco segundos
por reparto de procesador. Se le dan veinte y no se recorta el caso: hacen falta más de 111 tarjetas
dibujadas para que la prueba pueda distinguir si la paginación volvió al principio.

## §10.2 · El filtro compartido no llegaba a las seis vistas

«**Un solo filtro para las 6 vistas.** Si el usuario filtra en el Gantt y cambia a Tablero, el filtro
sigue puesto», dice el spec con esas palabras. El Panel de control se montaba **pelado**
—`<DashboardTab projectId={projectId} />`, sin barra— así que al llegar desde el Gantt el filtro
*parecía* haberse quitado. No se había quitado: seguía puesto y volvía a aplicarse al salir. Pero eso
no lo adivina nadie mirando una pantalla que no lo enseña.

Y buscando ese defecto salieron **otros dos, del mismo molde**: en la Carga de trabajo y en el
Calendario la barra estaba **detrás de las salidas tempranas**, así que desaparecía mientras la vista
cargaba y volvía al llegar los datos. Una barra que parpadea al cambiar de pestaña tampoco parece un
solo filtro.

### Lo que se hizo, y lo que a propósito no

La barra está ahora en las seis, y en las tres fases de cada una: cargando, con error y con datos.

Lo que **no** se hizo es recalcular las cifras del Panel sobre lo filtrado, y es una decisión escrita,
no un olvido. Las cifras del Panel las calcula el servidor recorriendo el plan entero; el filtro se
evalúa en el navegador, sobre líneas con campos derivados —vencida, campos personalizados— que la
base no tiene. Aplicarlo pedía una de dos: mandar mil trescientos identificadores en cada petición, o
**escribir el filtro por segunda vez en el servidor**. Lo segundo es exactamente cómo este proyecto
se ganó varios de los defectos de esta bitácora: dos definiciones de la misma palabra acaban
divergiendo, y la que se olvida es siempre la del sitio menos mirado.

Mientras tanto el Panel **dice de qué está hablando**: con un filtro puesto avisa de que sus cifras
son del proyecto entero. Una cifra con el alcance escrito al lado es honesta; la misma cifra junto a
una barra de filtro puesta, callando, es una trampa.

### Demostrado en pantalla

Recorriendo las seis vistas del proyecto de referencia y mirando si la barra está:

| vista | antes | después |
|---|---|---|
| Tablero Kanban | sí | sí |
| Elementos de Trabajo | sí | sí |
| Timeline | sí | sí |
| Calendario | sí (salvo al cargar) | sí |
| Carga de trabajo | sí (salvo al cargar) | sí |
| **Panel de control** | **no** | **sí** |

### Y el bloque de pruebas del §5, otra vez

Se pasó de tiempo una segunda prueba del bloque de la paginación, distinta de la de anoche. Dibujan
entre ciento veinte y doscientas tarjetas dos o tres veces cada una: solas pasan de sobra, y con los
ciento ochenta y cuatro archivos en paralelo se acercan a los cinco segundos por reparto de
procesador. El margen se le pone **al bloque entero** y no prueba a prueba, porque el problema es del
bloque.

## §10.7 · Dos de las seis vistas enseñaban una línea de texto, no un esqueleto

«**Skeleton** en el primer render, no un spinner a pantalla completa», pide el §10.7. El Gantt, la
Lista y el Panel lo cumplían —con `EsqueletoDeGantt`, `EsqueletoDeTabla` y `EsqueletoDeWidgets`, y el
del Gantt hasta cita el §10.7 en su comentario—. El **Calendario** y la **Carga de trabajo** enseñaban
una línea centrada: «Armando el calendario del proyecto...».

Los componentes existían y la regla que los hace útiles estaba escrita en el mismo archivo —«tiene
que parecerse a lo que viene»—; esas dos vistas se quedaron sin el suyo.

Hay ahora un `EsqueletoDeMes` de siete columnas por cinco semanas, con **las casillas desiguales a
propósito** —un mes real tiene días vacíos y días con cuatro cosas, y un esqueleto perfectamente
regular delante de una rejilla irregular vuelve a dar el salto que el esqueleto existe para evitar— y
un `EsqueletoDeCarga` con la primera columna ancha para los nombres y los días en cuadraditos, que es
lo que distingue esa forma de una tabla cualquiera.

### Demostrado en pantalla

Entrando a cada vista y mirando el primer dibujado antes de que lleguen los datos:

| vista | qué se ve al entrar | y se anuncia |
|---|---|---|
| Calendario | esqueleto | «Armando el calendario del proyecto» |
| Carga de trabajo | esqueleto | «Armando la carga del equipo» |
| Panel de control | esqueleto | «Armando el panel de control» |
| Timeline | esqueleto | «Calculando el plan del proyecto» |
| Elementos de Trabajo | esqueleto | «Cargando las líneas del plan» |

Las cinco con `aria-busy="true"`. Un esqueleto es puramente visual: sin anunciarse es **peor** que la
rueda que sustituye, porque la rueda al menos solía llevar la palabra «Cargando» al lado.

## Acelerar el paso: la suite montaba un navegador para no usarlo

La operación que más se repite en este trabajo es correr la suite entera —antes de cada commit, y
varias veces por hallazgo—, así que lo que cueste se paga muchas veces al día. Costaba **117
segundos**.

El desglose lo decía y nadie lo había leído: **461 segundos acumulados preparando el entorno** contra
275 ejecutando pruebas. `vitest.config.ts` declaraba `environment: 'happy-dom'` para las 185 suites, y
la mayoría no toca el DOM: las 39 de `lib/scheduling` son aritmética de días hábiles y las de
`services` no dibujan nada. Se montaba un documento entero por archivo para no usarlo.

Ahora el corte va **por extensión y no por carpeta**, que es lo que de verdad separa los dos mundos:
`.test.tsx` dibuja y corre en `happy-dom`; `.test.ts` no, y corre en `node`. La única suite de `lib`
que sí necesita documento —`auth-client`, que arma la URL de vuelta con `window.location`— lo pide en
su cabecera con `// @vitest-environment happy-dom`, así que la excepción se ve en el archivo que la
necesita y no escondida en la configuración.

| | antes | después |
|---|---|---|
| la suite entera | **117 s** | **64 s** |
| preparación de entorno (acumulada) | 461 s | 171 s |
| pruebas en verde | 3 466 | 3 466 |

### Dos trampas por el camino

**`environmentMatchGlobs` ya no existe en Vitest 4 y se ignora en silencio.** Puesto en la
configuración *parecía* funcionar; lo que hacía era correrlo todo en `node` y dejar **810 pruebas en
rojo**. La forma que sí soporta es `projects`.

**El fichero de arranque cargaba `@testing-library/jest-dom` siempre**, y eso necesita un documento:
con él sin condición, ninguna suite podía correr en `node` aunque no dibujara. Ahora se carga sólo
donde hay DOM.

## §10.4 · El Calendario era la única vista que no recordaba nada

Cinco de las seis guardaban lo suyo —columnas y anchos, escala, divisor, agrupación, orden,
formato—. El Calendario no guardaba nada, y **la tubería estaba hecha desde el principio**:
`CALENDARIO` lleva desde siempre en la lista de vistas que admite `ViewPreference`, y nadie la usaba.
Quien trabaja en la vista semanal volvía al mes cada vez que entraba.

### El comentario que lo defendía

En el servicio había esto, con todas las letras:

> `CALENDARIO` no tiene ninguno, **y no es un olvido**: sus únicas elecciones son el mes que se mira
> —que es dónde estás, no cómo lees— y el filtro, que ya vive en el proyecto por el §10.2.

Era cierto **el día que se escribió**, cuando el Calendario sólo tenía el mes. Después llegaron la
vista semanal y la de agenda del §7, y el modo es exactamente «cómo lees», que es el criterio que el
propio comentario usaba para decidir. La frase seguía ahí, sonando a decisión pensada, defendiendo lo
contrario de lo que su propia regla pedía.

Van tres comentarios así en esta sesión —el de la paginación del Tablero, el del `abarcado` del Gantt
y éste—: ciertos al escribirse y falsos desde que alguien añadió lo de al lado. Son los más caros de
encontrar, porque leerlos convence.

El ancla sigue sin guardarse, y por la razón que ese comentario daba bien: en qué mes estás es dónde
estás mirando, no cómo lees.

### El defecto tenía dos mitades

Conectar la vista no bastaba: la primera medición en pantalla enseñó el modo volviendo al mes tras
recargar, y en la base **no había fila de `CALENDARIO`**. El guardado la rechazaba por no tener
esquema declarado, en silencio y sin que nadie viera un error.

### Demostrado en pantalla

| | antes | después |
|---|---|---|
| modo al entrar | Mes | Mes |
| tras pulsar «Semana» | Semana | Semana |
| **tras recargar la página entera** | **Mes** | **Semana** |

Y en la base, una fila nueva: `CALENDARIO {"modo":"SEMANA"}`, con lo que las seis vistas guardan ya
su preferencia.

## §3 · El motor, recorrido entero: sano, con un guardián que faltaba

Se auditó el §3 completo contra el spec, punto por punto. **No hay defecto de producto.** Lo que
sigue es lo comprobado, porque un «está bien» sin decir contra qué se comprobó no vale nada.

### Lo que el spec avisa y aquí está bien

El §3.3 dedica un aviso a la **fórmula simplificada de la holgura libre** —`min(ES_j) − EF_i`— que
«circula por internet y es incorrecta», con su caso: `A —FS+3→ B` daría holgura libre 3 cuando la
real es 0. `latestFinish` la calcula **por tipo de vínculo y con desfase**, y el caso exacto del spec
ya estaba en `cpm.test.ts` dando 0.

Las **ocho restricciones** del §3.4 están las ocho, con la sigla de MS Project de cada una —SNET,
FNET, SNLT, FNLT, MSO, MFO más ASAP y ALAP—. El **deadline** hace lo que el spec pide y sólo eso: no
mueve el cronograma y acota la fecha tardía, con los casos 9 y 10 del §12 citados en el código.

En el roll-up del §3.6, **un hito pesa cero**, así que queda fuera del numerador y del denominador
del modo ponderado, que es lo que el spec pide con esas palabras. Un bloque que sólo agrupa hitos
—peso total cero— cae al promedio simple en vez de dividir por cero.

### Los objetivos del §3.8, medidos

Con **10 000 tareas y 8 000 vínculos**, mejor de cinco, fuera de la suite:

| operación | medido | objetivo |
|---|---|---|
| `schedule()` completo | **28,1 ms** | < 400 ms |
| `analyzeCriticalPath()` | 17,9 ms | — |
| `rescheduleFrom()` al mover la primera | **38,8 ms** | < 50 ms |

Los dos se cumplen. El de reprogramar es el más ajustado de los cuatro: **22 % de margen**, empujando
8 001 líneas.

### Lo que sí faltaba

`rescheduleFrom()` es lo que corre **en cada arrastre de barra**, y su única prueba de carga medía
**reloj a 1 368 líneas con un tope de 500 ms**. Eso no atrapa lo que de verdad hay que temer: una
regresión de orden. Con mil trescientas líneas un algoritmo cuadrático sigue siendo rápido, así que
el tope no se cruzaría y nadie se enteraría hasta que un plan grande lo hiciera imposible de usar.

Ahora se **cuenta** en vez de cronometrar, como en el §12 caso 24 —cuya versión con reloj se puso
roja cuatro veces con el motor intacto—: doblar el plan tiene que doblar las visitas a los vínculos,
no cuadruplicarlas. Validado volviendo el algoritmo cuadrático a propósito —cambiando el índice de
sucesoras por un `filter` sobre todos los vínculos—: la razón salta de ≈2 a **3,996** y la prueba se
pone roja.

La acompaña una segunda que comprueba que la reprogramación **empuja las 4 000 líneas**: sin ella, un
motor que no empujara nada pasaría la de la razón con la proporción perfecta.

## §8 · La carga de trabajo, recorrida entera: los seis criterios se cumplen

Segunda sección seguida que sale limpia. **No hay defecto**, y como en el §3 lo que sigue es contra
qué se comprobó, porque un «está bien» sin eso no vale nada.

### Los seis criterios del §8.5

1. **Rojo en los tres modos.** `fondoDeCelda` decide la sobrecarga **antes** de mirar el modo, así
   que el velo crítico se aplica igual en Horas, Tareas y Porcentajes. Demostrado en pantalla más
   abajo.
2. **Cambiar de modo recalcula sin recargar.** El componente recibe la matriz ya calculada; cambiar
   de modo sólo cambia el texto de la celda.
3. **Vacaciones ponen la capacidad a 0 y cualquier carga es sobrecarga.** `sobrecargado = carga >
   capacidad`, y con capacidad cero cualquier carga positiva lo cumple. En modo Porcentajes la celda
   dice `✕` en vez de «∞ %»: sin capacidad no hay porcentaje que calcular.
4. **El desglose cuadra con el total de la celda.** Hay una prueba que recorre **todos los días** de
   la matriz comprobando que la suma de las filas del desglose es exactamente `cargaMin`, y otra que
   lo repite con el recurso sobrecargado.
5. **Las tareas sin asignar aparecen en su fila.** `matriz.sinAsignar`, dibujada al final.
6. **50 recursos × 3 meses en menos de un segundo.** Medido abajo.

### Lo medido

Con **50 recursos × 91 días = 4 550 celdas**, tres tareas solapadas por persona al 50 % cada una,
mejor de cinco fuera de la suite:

| | medido | objetivo |
|---|---|---|
| `workloadMatrix()` | **1,3 ms** | < 500 ms (§8.3) |

Y comprobando que la medición ejercita el camino de verdad y no uno vacío: **50 filas sobrecargadas**,
pico de 720 min contra 480 de capacidad, 3 tareas activas.

### Demostrado en pantalla

Sobre el proyecto de referencia, recorriendo los tres modos sin salir de la vista:

| modo | celdas | sobrecargadas | con fondo rojo | con cifra | la misma celda dice |
|---|---|---|---|---|---|
| Horas | 651 | **101** | 101 | 101 | 48 |
| Tareas | 651 | **101** | 101 | 101 | 6 |
| Porcentajes | 651 | **101** | 101 | 101 | 120 |

Las 101 en los tres, y la celda del 30 de junio se anuncia igual en los tres —«48 h de 40 h,
sobrecargada»— mientras la cifra que enseña cambia. Es el criterio 1 y el 2 a la vez: el número
cambia sin que la vista vuelva a pedir nada.

### Una corrección de mi propia medición

El primer montaje daba **cero filas sobrecargadas** y estuve a punto de anotarlo como hallazgo. Eran
dos tareas al 50 % solapadas: exactamente el 100 %, y la sobrecarga es `>`, no `≥`. El montaje era
mío. Solapando las tres del todo salen las 50 filas en rojo que tenían que salir.

## Barrido de las seis vistas en pantalla: limpio

Con el §3 y el §8 recorridos sin hallazgos, tocaba lo que el guion dice para ese caso: buscar
defectos midiendo. Se recorrieron las seis vistas del proyecto de referencia con un recolector
puesto **dentro de la página** —`console.error`, `error` y `unhandledrejection`—, que sobrevive a los
cambios de pestaña, que es justo cuando hay que mirar.

| vista | monta | nodos | NaN | undefined | ∞ | `[object Object]` | avisos |
|---|---|---|---|---|---|---|---|
| Tablero Kanban | sí | 24 198 | no | no | no | no | 0 |
| Elementos de Trabajo | sí | 3 153 | no | no | no | no | 0 |
| Timeline | sí | 917 | no | no | no | no | 0 |
| Calendario | sí | 370 | no | no | no | no | 0 |
| Carga de trabajo | sí | 1 133 | no | no | no | no | 0 |
| Panel de control | sí | 1 316 | no | no | no | no | 0 |

**Cero avisos distintos** en las seis.

### Lo único que llamó la atención, y lo que resultó ser

El Tablero pesa **24 198 nodos contra los 3 153 de la siguiente**. Perseguido hasta el fondo: 130
columnas dibujadas, 804 tarjetas en el DOM, 104 columnas vacías, 26 filas de fase y **ninguna fila de
fase entera vacía**.

No es un defecto: la rejilla se dibuja completa para que las columnas queden alineadas de una fase a
la siguiente, y la paginación funciona. Pero el comentario de `TARJETAS_POR_TANDA` **decía sólo la
mitad**: contaba las 1 243 tarjetas y los 36 098 nodos de antes y no lo que queda después. Quien lea
«cincuenta por tanda» supondrá cincuenta tarjetas en pantalla, y hay ochocientas — porque **el tope
es por instancia de columna** y agrupado por fases hay 26 × 5 = 130 instancias, cada una con su
cuenta. El techo real es 50 × 130.

Se deja así a propósito —una cuenta compartida entre instancias haría que desplegar una columna
plegara otra— pero ahora está escrito con las dos cifras. Es el cuarto comentario de esta sesión que
decía algo cierto y dejaba fuera lo que hacía falta para entenderlo.

## §6 · En el formato Esquema no se puede renombrar, y es el formato por omisión

El barrido activo —editar, mover, deshacer— encontró esto en el primer intento. La celda del nombre
se abre con doble clic o con `F2` en los formatos **Lista** y **Agrupada**, y en **Esquema** no se
abre: no hay celda editable ninguna.

Esquema es **el formato por omisión** en los dos sitios donde se decide: `useState<Modo>('ESQUEMA')`
en la vista y `{ formato: 'ESQUEMA' }` en la preferencia por omisión del servicio, con su comentario
—«es el que enseña la forma del plan»—. O sea que es justo el formato en el que aterriza quien entra
por primera vez.

La razón es que los dos formatos planos los dibuja `WorkItemsList`, que usa `CeldaEditable`, y el
esquema lo dibuja `WorkItemsOutline`, que **no la usa en ninguna parte**. Es exactamente lo que el
§6.4 manda auditar antes de nada: «¿la lista actual es el mismo componente de grid que el Gantt o hay
dos implementaciones distintas? **Si hay dos, unifícalas**: es la causa habitual de que las columnas
se comporten distinto en cada vista».

### Demostrado en pantalla

Recorriendo los formatos sin salir de la vista:

| formato | filas dibujadas | celdas editables |
|---|---|---|
| **Esquema** (por omisión) | 127 | **0** |
| Lista | 21 | **19** |

### Estado: medido y sin arreglar

Se deja escrito y sin tocar a propósito. El arreglo no es poner otro `CeldaEditable` en el esquema
—eso sería la tercera implementación de la misma celda, que es de lo que avisa el §6.4— sino que el
esquema use la misma, con su mismo `renombrar`, sus mismas reglas de Enter y Escape y su mismo
apunte en la pila de deshacer. Eso es trabajo de una tanda entera, no de la cola de ésta.

## §6.4 · El Esquema ya renombra, y con la misma celda que las otras dos

Arreglado el hallazgo de la tanda anterior. No se puso otra celda editable en el esquema —habría sido
la tercera implementación de la misma cosa, que es justo de lo que avisa el §6.4— sino que las tres
vistas llaman ahora a lo mismo:

- la celda es `CeldaEditable`, la que ya usaban la Lista y el Gantt, con su `F2`, su Enter, su Escape
  y su `validarNombre`;
- lo que hace al guardar vive en `lib/projects/renombrar`, con las **cuatro decisiones** que se
  pueden tomar mal por separado: si se escribe, cuándo se apunta, qué se apunta y qué pasa cuando el
  servidor dice que no.

Que esas cuatro tenían que vivir juntas lo demuestra su propia historia: el apunte **antes** de
escribir apareció dos veces —una en el Esquema y otra en la Lista— con el mismo razonamiento escrito
de otra forma. Es el defecto que deja la barra ofreciendo deshacer un cambio que nunca ocurrió.

### La segunda mitad la encontró la pantalla, no las pruebas

Con el arreglo puesto y las pruebas en verde, la primera medición en pantalla dijo esto: se escribía,
el botón de deshacer se encendía… y **el nombre nuevo no aparecía**. La Lista dibuja de `workItems`,
que es del padre y el padre sí lo recarga; el Esquema dibuja de **su propia** carga de `/schedule`,
que ese aviso no toca.

La vista ya sabía resolverlo doce líneas más abajo —la captura de avance es optimista—, así que el
renombrado hace lo mismo: pinta el nombre nuevo sin esperar a la red y **devuelve el viejo si el
servidor dice que no**. Dejar en pantalla un nombre que no está guardado es peor que no haber dejado
escribir.

### Demostrado en pantalla

Celdas editables por formato, antes y después:

| formato | antes | después | filas |
|---|---|---|---|
| **Esquema** (por omisión) | **0** | **127** | 127 |
| Lista | 19 | 19 | 21 |
| Agrupada | 18 | 18 | 21 |

Y el recorrido entero sobre el plan de referencia, renombrando «Implementación Mobilize» desde el
Esquema:

| | |
|---|---|
| deshacer al entrar | `↶ apagado` `↷ apagado` |
| tras `F2` | campo abierto con «Implementación Mobilize» |
| tras escribir y pulsar Enter | **la marca está en pantalla** |
| deshacer tras renombrar | `↶ ACTIVO` `↷ apagado` |
| tras `Ctrl+Z` | **la marca se fue** |
| deshacer tras deshacer | `↶ apagado` `↷ ACTIVO` |

El plan de referencia queda verificado y sin ninguna línea con la marca de prueba.

## §4.4 · El arrastre del Gantt, medido de punta a punta: funciona

Barrido activo del Gantt. **No hay defecto.** Arrastrando «Presentar el plan de trabajo de Mobilize
al banco» ciento veinte píxeles a la derecha, con la red y la consola instrumentadas:

| paso | qué se observó |
|---|---|
| `pointerdown` | la barra se pone a media opacidad y captura el puntero |
| `pointermove` | se desplaza con `translateX(126px)`, sin pasar por el estado |
| `pointerup` | sale un `POST …/reschedule` que contesta **200** |
| la respuesta | `previsualizacion.cambios` con la arrastrada del 2026-06-12 al 2026-06-25 |
| en pantalla | «Mover «…» al 2026-06-25 **cambia 3 líneas** — la arrastrada y 2 que quedaban en falso» |
| los botones | `Aplicar` · `Cancelar` |

No se pulsó `Aplicar`: la demostración está completa sin escribir, y escribir habría movido el plan
de referencia.

### Tres sondas equivocadas en una noche

Esta medición dijo primero «el arrastre no abre nada», y era mentira mía: busqué en la página la
palabra **«Reprogramar»**, que es la etiqueta del **deshacer**, cuando el diálogo dice «Mover «…»
al …». Es la tercera vez esta noche:

1. `data-celda-editable` cuando el atributo es `data-editable` → «la Lista no tiene celdas editables»;
2. la pestaña «Panel de control» buscada como «Resumen» → «el Panel no tiene barra de filtro»;
3. ésta, que estuvo a punto de entrar aquí como defecto del Gantt.

Y dos veces más el montaje de la medición: `constraintType` suelto en vez de `constraint: {type,
date}`, y dos tareas al 50 % que dan el 100 % exacto y por tanto **no** sobrecarga.

La regla queda escrita en memoria: **leer el componente y copiar la cadena exacta antes de escribir
la sonda**, y cuando una sonda no encuentre algo, comprobar el selector antes que el código.

## §7.2 · Pintar un rango en el Calendario, medido: funciona

Barrido activo del Calendario. **No hay defecto.** Pintando tres días seguidos en la rejilla del mes
—`mousedown` en el primero, `mouseenter` en los dos siguientes, `mouseup`—:

| | |
|---|---|
| días pintados | 2026-06-01 → 2026-06-02 → 2026-06-03 |
| se abre | el diálogo de alta |
| con las fechas | **«1 de jun de 2026»** y **«3 de jun de 2026»**, ya puestas |
| avisos en consola | ninguno |

No se pulsó guardar: la demostración está completa sin escribir, y escribir habría añadido una línea
al plan de referencia.

### La regla de anoche, funcionando

Esta medición también falló dos veces antes de dar la cifra buena, y **las dos veces el fallo era
mío y lo comprobé antes de acusar al código**:

1. busqué las fechas en `input[type="date"]` y el alta usa un `DatePicker` propio, que las escribe en
   un `span` de clase `dp-input-text`. Leí el componente en vez de escribir «el alta no recibe las
   fechas»;
2. al corregir la sonda metí **acentos graves dentro de la plantilla** que se manda a la página, y
   cerraron la cadena: `ReferenceError: input is not defined`. Es el hermano del problema que ya
   estaba anotado —los escapes se degradan— con otra cara.

Anoche tres sondas equivocadas se convirtieron en tres hallazgos falsos. Hoy dos se quedaron en dos
sondas equivocadas.

## §5.4 · Mover a Terminado pone el avance al 100 %, medido

Barrido activo del Tablero, el último de las seis vistas. **No hay defecto.**

Agrupado por Estado —Backlog, To Do, In Progress, Blockers, Done—, arrastrando la tarjeta «1.1»
(«Inicio: presentar y aprobar el plan de trabajo de Mobilize») de Backlog a Done:

| | antes | después |
|---|---|---|
| avance de la tarjeta | **0 %** | **100 %** |
| pastilla de atraso | −6,0 d | desaparece |
| tarjetas en Done | 0 | 1 |
| avisos en consola | — | ninguno |

El criterio del §5.4 dice «al instante», y así es: la cifra cambia sin recargar, porque el tablero
calcula el avance nuevo con **la misma función que el servidor** y lo pinta antes de que la respuesta
vuelva.

### Restaurado

Esta medición sí escribe, y el verificador lo cazó: `conAvance 1` contra el 0 esperado. Se devolvió
la línea a `BACKLOG` con avance cero y su columna original, y el plan vuelve a verificar entero.

### Las seis vistas, recorridas también en activo

Con ésta se cierra el barrido activo: **Lista** (renombrar y deshacer), **Esquema** (el defecto que
se arregló en la tanda 38), **Gantt** (arrastrar una barra hasta el diálogo con sus cifras),
**Calendario** (pintar un rango y abrir el alta con las fechas puestas), **Carga de trabajo** (los
tres modos) y **Tablero** (mover a Terminado). Un defecto encontrado y arreglado; el resto, en pie.

## §13 · La lista de comprobación, recorrida contra lo demostrado esta noche

Con las seis vistas ya recorridas en pasivo y en activo, tiene sentido decir qué de la lista final
está cerrado **con evidencia en pantalla de esta sesión** y qué no. Sólo lo demostrado; lo que se
comprobó leyendo código no cuenta aquí.

### Demostrado en pantalla esta noche

| §13 | evidencia |
|---|---|
| Gantt · arrastre de barra | «Mover «…» al 2026-06-25 cambia 3 líneas», tras un `POST /reschedule` 200 |
| Gantt · toggles y línea base | 28 barras de foto, y **21 hitos** que estrenaron foto, conectores y vencimiento |
| Gantt · panel de detalle compartido | el mismo `PlanDetailPanel` en las seis |
| Tablero · drag & drop con reglas de progreso | de Backlog a Done: **0 % → 100 %** al instante |
| Tablero · carga paginada por columna | 804 tarjetas de 1 243, y la paginación aguanta al mover |
| Lista · tres formatos | Esquema 127 filas, Lista 21, Agrupada 21 |
| Lista · edición inline | **127 de 127** celdas editables en Esquema, tras el arreglo |
| Lista · exportar a CSV | Agrupada con cabeceras y subtotales que suman **1 243** |
| Calendario · crear arrastrando un rango | el alta abre con «1 de jun» y «3 de jun» puestas |
| Calendario · vista semanal | y ahora **se recuerda** entre visitas |
| Carga · matriz con los 3 modos | las mismas **101 celdas** rojas en Horas, Tareas y Porcentajes |
| Carga · desglose por tarea | la suma cuadra con la celda, todos los días |
| Transversal · filtro en las 6 vistas | la barra está en las seis, y en las tres fases de cada una |
| Transversal · preferencias por usuario × proyecto × vista | **seis filas** en `ViewPreference` |
| Transversal · esqueletos (§10.7) | las cinco vistas que cargan, con `aria-busy` y su anuncio |

### Lo que falta, y de qué depende

**Las seis escalas de zoom del Gantt son cinco.** Están día, semana, mes, trimestre y año; **falta
hora**. Y no es un olvido: el código lo dice donde se declara la lista —«el motor trabaja en
ordinales de día hábil, así que ninguna tarea tiene hora; un eje por horas dibujaría ocho columnas
idénticas por día y todas las barras pegadas al límite del día»—.

O sea que la sexta escala **no es una tarea, es una consecuencia**: sale sola el día que se haga la
migración de duración a minutos y horas por día del §2, que está autorizada y sin empezar. Ponerla
antes sería dibujar una resolución que los datos no tienen.

Lo mismo con **tiempo real** (§10.5) y el **modo claro**: son las dos decisiones que quedan, y ya
están dichas en su sitio.

## §3.2 · El ciclo se rechaza nombrando la cadena, y no se escribe nada

El §3.2 pone dos reglas duras juntas: «detección de ciclos obligatoria **antes de persistir**.
Rechaza **nombrando la cadena completa**, y **no persistas nada**». Y el §10.7 pide que el motivo sea
concreto, «nunca un “Error” genérico». Las tres se demuestran de una vez.

Sobre el plan de referencia, tomando un vínculo real y pidiendo el contrario —el ciclo más corto que
existe—:

| | |
|---|---|
| vínculos antes | **1 665** |
| respuesta | **400** |
| el mensaje | «Ese vínculo crearía un ciclo y el plan dejaría de poder programarse. El plan tiene un ciclo de dependencias: *Reintegrar cada servidor migrado al dominio de Active Directory del banco → Actualizar en las aplicaciones la conexión hacia las bases de datos ya migradas → …*» |
| vínculos después | **1 665** — no se escribió nada |

El mensaje nombra **las líneas por su título**, no por identificador, y dice qué hacer: «hay que
quitar uno de esos vínculos». Es lo contrario de un «Error» genérico, y es lo que separa un rechazo
que se entiende de uno que sólo frustra.

La medición no es destructiva por construcción: el caso que se prueba es justamente el que el
servidor tiene que rechazar, así que demostrarlo deja el plan igual que estaba. Verificado: 1 368
líneas y 1 665 vínculos.

## §10.1 · Un permiso que se ofrecía y luego se negaba

Los diez permisos del §10.1 están, con el nombre que les da el spec, y la barra de pestañas los
respeta: `PERMISO_POR_VISTA` da la Lista con `view_list` y el Calendario con `view_calendar`.

Pero **las dos vistas cargan de `/schedule`**, y esa ruta exigía **`view_gantt` a secas**. O sea que
un perfil con `view_list` y sin Gantt veía la pestaña de Lista —la barra se la ofrece— y al entrar
recibía un **403**. Lo mismo el Calendario.

Y no es un caso rebuscado: es **el ejemplo con el que el §10.1 explica para qué sirven estos
permisos**, con todas las letras — «hay perfiles (un cliente externo, un colaborador) a los que se
les quiere dar **Lista y Tablero pero no el Gantt**».

Un permiso ofrecido y después negado es peor que uno que no se ofrece: el primero parece una avería y
el segundo es una decisión.

### El arreglo

`exigirPermiso` admite ahora **una lista, y basta uno**: `/schedule` acepta `view_gantt`,
`view_list` o `view_calendar`, que son las tres vistas que cargan el plan de ahí. Se prueba en orden
y se corta en el primero que valga, así que el caso normal sigue costando una sola comprobación.

### Lo que demostré en pantalla, y lo que no

**Sí:** que el arreglo no rompe nada. Las seis vistas vuelven a montar, con cero avisos y sin ninguna
cifra rota.

**No:** el caso negativo —un usuario con `view_list` y sin `view_gantt`— **no lo demostré en
pantalla**, porque hace falta un segundo usuario con ese rol y crearlo en la base para una medición
es más invasivo que lo que la medición vale. Está cubierto por prueba, validada rompiendo el arreglo:
al volver a exigir sólo el primer permiso, las dos que importan se ponen rojas.

Lo digo aquí en vez de dejarlo implícito porque la regla de esta sesión es que un cierre sólo cuenta
demostrado en pantalla. Éste está cerrado a medias, y ésa es la mitad que falta.

## §10.1 · El mismo molde, otra vez: `custom-fields`

Barriendo las dieciséis rutas con guardia buscando el defecto de la tanda anterior, apareció otra con
la misma forma. `/custom-fields` exigía **`view_gantt` a secas**, y de ahí salen los campos
personalizados que el §10.2 nombra entre los criterios del **filtro compartido por las seis vistas**.

Ésta era **peor de encontrar** que la de `/schedule`. Aquélla daba un 403 visible: se entraba a la
Lista y la vista se caía con su mensaje. Ésta no rompe nada — el cliente se cae de pie a un catálogo
vacío, con su comentario y todo («sin catálogo se filtra por los campos de siempre») — así que un
perfil sin Gantt **perdía los campos propios del filtro en las seis vistas y nadie veía un error**.

Un fallo silencioso que degrada bien es más difícil de encontrar que uno que revienta, y ésta es la
demostración: el mismo defecto, la ruta de al lado, y hasta hoy invisible.

### El censo, que es lo que lo encontró

Dieciséis rutas con guardia. Once exigen sólo permisos de escritura y no aplican. De las cinco que
piden permiso de vista, **dos servían a más vistas de las que su permiso nombra**:

| ruta | exigía | a quién sirve |
|---|---|---|
| `schedule` | `view_gantt` | Gantt, **Lista** y **Calendario** |
| `custom-fields` | `view_gantt` | el filtro de **las seis** |
| `kanban`, `dashboard`, `workload` | el suyo | su vista, y sólo la suya |

Las dos arregladas; las otras tres estaban bien.

### Demostrado en pantalla

Con el arreglo puesto, `custom-fields` responde **200 con su campo** y `schedule` **200 con las
1 368 líneas**. La lista larga no convierte la guardia en «pasa cualquiera»: hay prueba de que quien
no tiene ninguno de los seis sigue recibiendo 403.

## §10.1 · `edit_schedule` frente a `edit_tracking`: el reparto está bien

El spec llama a esta distinción «**el permiso más útil de todo el sistema y el que casi nadie
implementa**», así que merecía el mismo censo que las lecturas. **No hay defecto.**

Quince rutas escriben. El reparto:

| ruta | pide |
|---|---|
| `dependencies`, `reschedule`, `calendar`, `baselines`, `apply-template`, `work-items/reorder`, `work-items/restore`, `absences`, `assignments`, `projects/[id]`, `work-items` (alta) | `edit_schedule` |
| `work-items/[id]/status` | **sólo** `edit_tracking` |
| `work-items/[id]` | **las dos, según el campo** |

La última es la que importa, y está resuelta donde tiene que estarlo: cualquier escritura exige
`edit_tracking`, y **sólo si vienen fechas** se exige además `edit_schedule`. El comentario del
código nombra el caso exacto del spec —un colaborador con `edit_tracking` y sin `edit_schedule` que
movía una línea del 2026-06-12— y hay dos suites dedicadas: `guardias-antes-de-escribir` y
`fechas-antes-de-escribir`.

Es decir: un ejecutor puede poner su tarea en curso, capturar avance y cambiar su estado, y **no
puede mover una fecha**. Que es exactamente lo que el §10.1 pide.

### Lo que no demostré en pantalla

Igual que con las lecturas: el caso que lo prueba de verdad —un usuario con `edit_tracking` y sin
`edit_schedule` recibiendo un 403 al mover una fecha— **necesita un segundo rol en la base**. Está
cubierto por prueba y no por medición, y lo digo en vez de dejarlo implícito.

Con esto el §10.1 queda recorrido entero: los diez permisos existen con el nombre del spec, la barra
de pestañas los respeta, las lecturas ya no piden el permiso de otra vista —dos defectos arreglados—
y las escrituras reparten bien las dos clases de edición.

## §9.2 · Las cifras del Panel, contra un cálculo hecho aparte

El criterio del §9 pide «fórmulas verificadas **contra cálculo manual**». Se calcularon las cifras
por separado, leyendo la base con un guion propio, y se compararon con lo que el Panel devuelve:

| | calculado aparte | el Panel |
|---|---|---|
| líneas | 1 368 | **1 368** |
| resúmenes | 125 | **125** |
| hojas | 1 243 | **1 243** |
| atrasadas | 116 | **116** |
| hitos | 86 | **109** |
| progreso global | 0 | **0** |

Cinco de seis, exactas. Y **la sexta era mía**.

### El mismo error de siempre, con otra cara

Conté los hitos como `kind === 'HITO'` y salieron 86. El Panel usa `esClaseDeHito`, que cuenta
también los **puntos de control**: 86 + 23 = **109**, que es justo su cifra.

Es el hermano del error que esta bitácora lleva anotado cuatro veces —«resumen» es **tener hijas**,
nunca `kind === 'RESUMEN'`— y que en este mismo plan da 125 contra 121. Lo llamativo es que el Panel
acierta el difícil: mi cuenta independiente de resúmenes por descendencia dio 125 y la suya también,
mientras la columna `kind` diría 121.

Así que la lección se amplía: **en este modelo, el campo `kind` casi nunca es la definición**. Ni
para los resúmenes ni para los hitos. Quien cuente por la etiqueta se equivoca en las dos.

### Estado

El §9.2 queda comprobado contra cálculo independiente, con las seis cifras cuadrando una vez
corregida la mía. No hay defecto.

## §9.1 · El progreso planificado, contado a mano

La fórmula del widget 5 es la que el spec escribe con su aviso: «el `clamp` importa: antes de que el
proyecto empiece el numerador es negativo, y después de su fecha de fin supera al denominador».

Se contó **a mano, del almanaque**, sin tocar el motor: sólo lunes a viernes entre las fechas del
proyecto.

| | |
|---|---|
| transcurrido | **59** días hábiles (2026-06-01 → 2026-08-20, ambos incluidos) |
| total | **131** días hábiles (2026-06-01 → 2026-11-30) |
| planificado | 59/131 = **0.45038167938931295** |
| lo que devuelve el servidor | **0.45038167938931295** |

Exacto hasta el último decimal.

### Y en pantalla

El widget dice **«AVANCE TEMPORAL ▼ 45,0 % de retraso sobre lo planificado»**. Cuadra: el avance real
del plan de referencia es cero y el planificado es 45,04 %, así que la desviación es justo eso.

Con esto quedan verificadas las dos mitades del §9 que el criterio pide —«fórmulas verificadas contra
cálculo manual» y «progreso planificado sobre calendario laborable»— y las dos coinciden con el
cálculo independiente. No hay defecto.

Un detalle que la cuenta a mano deja claro de paso: los 131 días salieron contando **sólo fines de
semana**, sin festivos, y coincidieron. O sea que este proyecto no tiene festivos propios
configurados — que es cierto, y explica por qué el almanaque y el motor dan lo mismo.

## §12 · Los veinticuatro casos, censados uno a uno

Último trozo del spec sin recorrer con esta dureza. La batería `bateria-12.test.ts` tiene diecinueve
casos y **el resto vive donde le toca**: el 9 y el 10 en `cpm.ts` con el deadline, el 11 en `gantt.ts`
con las fechas de resumen, el 17 en el esquema con las ausencias, el 2 y el 23 en el control de
escalas del Gantt. Contando las citas por número en todo el repositorio salen **23 de 24**.

El que faltaba era el **18** —«recurso con 10 h asignadas un día de 8 h»—, y no porque no estuviera
cubierto: es el criterio del §8.5 que se demostró en pantalla con las **101 celdas rojas en los tres
modos**, y tiene su prueba con las cifras exactas (600 minutos contra 480). Lo que faltaba era **la
cita**. Se le puso, porque un caso cubierto que nadie sabe que está cubierto se vuelve a escribir
tarde o temprano.

Ahora el censo da los 24.

### Y otra vez el mismo tropiezo

El primer censo dio 21 y me faltaban el 2, el 18 y el 23. Dos de esos tres estaban citados y mi
patrón no los cogía: buscaba «§12 caso N» y el comentario dice «los **casos 2 y 23** del §12», con el
§12 detrás y en plural.

Es la misma clase de error que las sondas de anoche —buscar una forma supuesta en vez de la escrita—
sólo que aquí sobre el propio repositorio en vez de sobre la pantalla. La diferencia es que esta vez
lo comprobé antes de escribir «faltan tres casos» en la bitácora.

## El spec, recorrido entero

Con el §12 censado se cierra el recorrido. Cada sección se comprobó contra sus propios criterios y
con la medición al lado:

| sección | cómo se recorrió | resultado |
|---|---|---|
| §3 · el motor | holgura libre, las ocho restricciones, el deadline, el roll-up y los objetivos del §3.8 medidos | sin defecto |
| §4 · Gantt | arrastre hasta el diálogo, hitos, línea base, inserción | **4 defectos**, arreglados |
| §5 · Tablero | paginación, 0 %→100 % al mover | **1 defecto**, arreglado |
| §6 · Lista | tres formatos, CSV agrupado, edición inline | **3 defectos**, arreglados |
| §7 · Calendario | rango arrastrado, esqueleto, memoria del modo | **2 defectos**, arreglados |
| §8 · Carga | los seis criterios, y 4 550 celdas en 1,3 ms | sin defecto |
| §9 · Panel | cifras y progreso planificado contra cálculo a mano | sin defecto |
| §10 · transversal | filtro, preferencias, permisos, esqueletos | **5 defectos**, arreglados |
| §12 · los 24 casos | censados uno a uno | los 24 cubiertos |

Lo que queda pendiente no es trabajo: es la migración de duración a minutos del §2 —que arrastra la
sexta escala del Gantt—, el modo claro y el tiempo real. Tres decisiones.

### Lo que no se demostró en pantalla, dicho una vez más

El caso negativo de los permisos —un usuario con `view_list` y sin `view_gantt`, o con
`edit_tracking` y sin `edit_schedule`, recibiendo su 403— **necesita un segundo rol en la base**.
Está cubierto por prueba y no por medición, y se repite aquí para que el recorrido no se lea como si
todo tuviera evidencia de pantalla. No la tiene: eso sí.

## §13 · El «N líneas más» del Calendario, medido

Punto de la lista final que no tenía medida. Sobre el mes de junio del plan de referencia:

| | |
|---|---|
| días que desbordan | **17** |
| lo que dice el primero | «3 líneas más» |
| al pulsarlo | se abre el panel encabezado **«3 líneas más el 2026-06-19»**, con sus renglones |

Funciona de punta a punta. No hay defecto.

### Cuarta sonda equivocada, y la cuarta cazada a tiempo

La primera medición dijo «no se abrió el panel del día», y otra vez era mía: busqué
`data-testid="panel-del-dia"`, que es **el de la Carga de trabajo**. El Calendario no usa ese
testid — su panel se reconoce por lo que dice, «N líneas más el AAAA-MM-DD».

Van cuatro sondas equivocadas desde que anoté la regla. Las cuatro se quedaron en sondas: ninguna
llegó a la bitácora como defecto. Antes de la regla, tres de tres sí llegaron.

## §13 · Tres puntos más del Calendario y el Gantt: uno medido, dos no

### Medido: el corte de barras entre semanas

En el mes de junio del plan de referencia hay **13 barras** dibujadas y **5 tareas aparecen en varios
trozos** — una por cada semana que cruzan. Es el criterio «corte correcto entre semanas y entre
meses», y se cumple: cada trozo lleva su propia columna de arranque, así que una tarea de diez días
no se dibuja como una barra que se sale del mes.

### No medido: los hitos en rombo

**Junio no tiene ningún hito.** Los del plan de referencia son los cierres de ola, que caen de
septiembre a noviembre. La sonda contó cero, y eso no dice nada del rombo: dice que el mes elegido no
tenía con qué probarlo.

Queda pendiente de medir en un mes que sí los tenga. Se anota como no medido y no como cumplido,
porque el código dibuje `◆` no es lo mismo que haberlo visto.

### No medido: el EDT del Gantt

La sonda tomó el primer trozo de texto de cada fila y devolvió `▾ | ▸ | ▸ | ▸…` — los **triángulos
del árbol**, no la numeración. El EDT va en su columna, no al principio del renglón.

Quinta sonda equivocada desde la regla, y la quinta que se queda en sonda: no se apunta como defecto
del EDT, se apunta como medición pendiente.

## §13 · Los hitos en rombo, cerrado; el EDT, sigue pendiente y por qué

### Cerrado: los hitos se dibujan como rombo

Avanzando el Calendario hasta un mes que sí los tiene —los cierres de ola del plan caen de
septiembre a noviembre—: **11 hitos**, y **los 11 con su rombo**. El primero dice «◆ HITO ·
Aprobación formal del diseño de…».

La medición de la tanda anterior contó cero y no significaba nada: junio no tiene hitos. Ahora sí
está visto.

### Sigue pendiente: el EDT del Gantt

La sonda buscó la celda `data-celda="wbs"` —esta vez el selector correcto, leído del componente— y
devolvió «la columna wbs no está encendida». **No es un defecto**: es que la preferencia guardada de
este usuario tiene esa columna apagada, y el panel de Campos decide qué se dibuja.

Para medirlo hay que encenderla primero. Se deja anotado como lo que es —una medición que necesita un
paso más— y no como criterio cumplido ni como fallo.

Van dos noches diciendo esto mismo de cosas distintas, y conviene que quede claro por qué: **la
diferencia entre «no lo he visto» y «no funciona» es la que hace que este informe sirva para algo**.

## §13 · El EDT del Gantt, cerrado

Última medición pendiente. Encendiendo la columna «EDT» desde el panel de Campos —que era lo que
faltaba, no un arreglo—:

| | |
|---|---|
| antes | **0** celdas de EDT (la columna estaba apagada en la preferencia) |
| después | **12** celdas: `1 · 1.1 · 1.1.1 · 1.1.2 · 1.2 · 1.2.1 · 1.2.1.1 · 1.2.1.1.1 · 1.2.1.1.1.1 …` |

Numeración jerárquica por `parentId`, como pide el §3.6 —«se materializa recorriendo el árbol: `1`,
`1.1`, `1.1.1`…»— y hasta seis niveles en las doce primeras filas.

Con esto quedan cerradas **todas** las mediciones que se habían anotado como pendientes.

### Un efecto que dejo dicho

Encender esa casilla **guarda la preferencia**: la columna del EDT se queda encendida en el Gantt de
este usuario. Es reversible con un clic en el mismo panel de Campos, y se avisa en vez de dejarlo
como un cambio silencioso — la medición tocó una preferencia, no datos del plan.

## §10.2 · Con un filtro puesto, las seis vistas cuentan lo mismo

Combinación que faltaba: no sólo que la barra esté en las seis —eso ya se midió— sino que **el filtro
dé la misma cuenta** al cambiar de vista. Puesta una condición y recorridas las seis sin tocar nada
más:

| vista | dice |
|---|---|
| Elementos de Trabajo | 0 de 1368 |
| Tablero Kanban | 0 de 1368 |
| Timeline | 0 de 1368 |
| Calendario | 0 de 1368 |
| Carga de trabajo | 0 de 1368 |
| Panel de control | 0 de 1368 |

**Las seis idénticas.** Es lo que el §10.2 pide con «un solo filtro para las 6 vistas», y va más allá
de que la barra aparezca: la cuenta sale del mismo cálculo, hecho una vez.

### Lo que sale de paso, y que NO llamo defecto todavía

La condición que dejé puesta es la que crea el botón «+ condición» **sin tocar nada más**: campo
`status`, sin valor. Y eso deja la cuenta en **0 de 1368** — o sea que pulsar «+ condición» esconde el
plan entero hasta que se elige un valor.

Puede ser correcto —una condición incompleta no casa con nada, y un `in` con lista vacía no casa por
definición— o puede ser una trampa: quien pulsa para empezar a filtrar ve desaparecer las mil
trescientas líneas antes de haber pedido nada.

No lo apunto como defecto porque **no lo he mirado con calma** y esta noche ya llevo cinco sondas
equivocadas. Queda como lo primero de la próxima tanda, con la pregunta escrita: ¿qué debe enseñar la
pantalla entre que se añade una condición y se le da valor?

## §10.2 · «+ condición» esconde el plan: es deliberado, y está escrito

Pregunta que dejé abierta anoche: al pulsar «+ condición» la cuenta cae a **0 de 1368** hasta elegir
un valor. ¿Trampa o decisión?

**Decisión, y con el porqué escrito en el propio evaluador**, tres líneas encima del código que lo
hace:

> No debería llegar aquí sin validar; si llega, **no coincide con nada en vez de coincidir con
> todo**. Un filtro roto que no esconde nada es peor que uno que no enseña nada: **el segundo se ve**.

Una condición a medias —campo elegido, valor todavía no— cae en ese caso. Y la elección es la
defendible: si una condición incompleta dejara pasar las 1 368, quien la escribe **no notaría** que
le falta algo, y se llevaría una lista que parece filtrada y no lo está. Con el 0 delante, el hueco
se ve en el acto.

No hay defecto. Lo que había era una pregunta mía sin responder, y la respuesta estaba escrita al
lado del código.

### Por qué lo dejé abierto en vez de arreglarlo

Porque a las once de la noche, con cinco sondas equivocadas encima, «esto se ve raro» no es
suficiente para tocar una decisión de producto que alguien tomó con un motivo. Esta sesión ha
enseñado dos veces lo contrario —comentarios que envejecieron mintiendo— pero también que **la mitad
de las veces el comentario tiene razón y el que va con prisa soy yo**.

## §10.2 · Filtros guardados con nombre y compartidos: funcionan

El §10.2 pide que los filtros «se guarden con nombre (`SavedFilter`), se marquen como compartidos con
el proyecto, y se apliquen también a la exportación». Medido de punta a punta contra la API real:

| paso | resultado |
|---|---|
| listar antes | **200**, 0 filtros |
| guardar con nombre y compartido | **201**, con su id |
| listar después | el filtro aparece, con `isShared: true` y su nombre |

Lo de la exportación ya estaba demostrado en la tanda 28: el CSV lleva en su cabecera «1243 de 1368
líneas», que es la cuenta **filtrada**.

### Dos sondas equivocadas más, las dos mías

1. Mandé el árbol del filtro en un campo `definition`; la ruta lo espera en **`expression`** —lo dice
   su esquema, con el porqué de no validarlo con zod al lado—. Devolvió un 400 honesto: «se esperaba
   un objeto».
2. Borré con `DELETE /filters/{id}` y la ruta usa **`DELETE /filters?id=…`**, que es lo que hace la
   propia interfaz. Un 404 que era mío, no de la ruta.

Van seis en dos noches. La sexta tuvo consecuencia, y la anoto: **la fila de prueba se quedó
escrita** porque mi borrado falló, y hubo que quitarla por la base. El plan de referencia no se tocó
—`SavedFilter` no es plan— pero la lección es que **una medición que escribe necesita su limpieza
comprobada, no supuesta**. La comprobé: quedan 0 filtros guardados.

## §4.6 · Líneas base: crear, listar, comparar y borrar

El §13 pide «líneas base: crear, listar, seleccionar una, comparar en grid y en timeline». Hasta
ahora sólo se había usado la foto que ya existía. El ciclo entero, contra la API real:

| paso | resultado |
|---|---|
| listar antes | **200** · 1 foto («Plan comprometido con el banco») |
| crear | **201** con su id |
| comparar | **200** · 1 368 líneas, **las 1 368 con foto** |
| borrar | **200** · quedan 1, las mismas que antes → **limpio** |

Esta vez la limpieza se comprobó contando, que es la lección de la tanda anterior. Y el plan de
referencia verifica entero después.

### La cifra que NO doy por buena

Mi sonda dijo «1 368 movidas contra la foto», lo cual es imposible en una foto recién tomada. Fui a
mirar la forma de la respuesta antes de escribirlo como hallazgo: cada línea es
`{ id, base, hoy: { start, finish, durationDays } }`, y yo comparaba `l.base.start` contra `l.start`
—que no existe— en vez de contra **`l.hoy.start`**. Con `undefined` a un lado, las 1 368 «se habían
movido».

Séptima sonda equivocada. **El recorrido crear-listar-comparar-borrar queda demostrado; el número de
líneas movidas contra una foto, no** — y no lo apunto como medido hasta volver con el campo correcto.

## §4.6 · La cifra que faltaba: cero movidas contra una foto recién tomada

Vuelta con el campo correcto —`l.hoy.start`, no `l.start`—:

| | |
|---|---|
| líneas comparadas | 1 368 |
| con foto | 1 368 |
| **movidas contra ella** | **0** |
| una cualquiera | base `2026-06-12 → 2026-10-02`, 81 días · hoy **idéntico** |

Cero, que es lo único que puede salir de una foto tomada hace un segundo. La comparación del §4.6
está bien; lo que estaba mal era mi sonda, y ahora la cifra sí está medida.

El ciclo se repitió entero —crear, comparar, borrar— y volvió a quedar **limpio**: una foto, la misma
que había. Plan de referencia verificado.

### Octava sonda equivocada, y era una que ya me sabía

Al corregir el campo metí en el comentario del guion los nombres entre **acentos graves**, dentro de
una plantilla delimitada por acentos graves. La cerraron: `SyntaxError: missing ) after argument
list`.

Es **exactamente** el mismo error de la tanda 40, con el mismo síntoma. Está anotado en la bitácora y
lo repetí igual. Que una lección esté escrita no basta si lo que hay que cambiar es un reflejo: el
reflejo es escribir código legible en un comentario, y aquí ese hábito rompe la cadena.

## §4.4 · Crear un vínculo y quitarlo

El §13 pide «dependencias FS/SS/FF/SF con lag, creadas arrastrando y editables en el detalle». El
rechazo de ciclos ya estaba demostrado; faltaba el camino que **sí** debe funcionar:

| paso | resultado |
|---|---|
| vínculos antes | **1 665** |
| crear uno FS entre dos hojas libres | **201**, con su id |
| releer el plan | **1 666** · el nuevo **está** |
| quitarlo | **200** · quedan **1 665** → **limpio** |

El par se eligió con cuidado: dos hojas seguidas en el orden del plan, sin vínculo entre ellas en
ninguna dirección y con la primera terminando antes de que la segunda empiece. Así el vínculo es
válido y no reprograma nada.

La limpieza se comprobó **contando**, y el plan de referencia verifica entero después: 1 368 líneas y
1 665 vínculos.

### Sin sondas equivocadas esta vez

Primera tanda de la noche en la que la medición sale a la primera. Las tres reglas que costaron ocho
errores se aplicaron antes de escribir: leer el esquema de la ruta —`predecessorId` y `successorId`
por consulta en el `DELETE`—, nada de acentos graves dentro de la expresión, y contar después de
limpiar en vez de fiarse del código de estado.

## §4.4 · Los cuatro tipos de vínculo, censados sobre el plan real

Medición no destructiva sobre los 1 665 vínculos del plan de referencia:

| tipo | cuántos | con desfase |
|---|---|---|
| SS | **802** | 117 |
| FS | **704** | 277 |
| FF | **159** | — |
| **SF** | **0** | — |

Los tres primeros están bien representados y **394 vínculos llevan desfase**, que es lo que hace que
el §3.2 —«`lag` positivo = retraso, negativo = adelanto»— no sea teoría en este plan.

### Lo que el censo deja claro

**No hay ni un solo vínculo SF.** El motor lo soporta —hay pruebas suyas en `cpm.test.ts` y su fila
en la tabla de anclajes— pero **contra datos reales no se ha ejercitado nunca**, porque el plan de
referencia no usa ese tipo. Es el único de los cuatro del que no puedo decir «se ve funcionando en el
plan», y lo dejo escrito como tal.

### Novena sonda equivocada

Quise comprobar que cada tipo se respeta leyendo `start` y `finish` de las tareas de `/schedule`, y
salieron `undefined`. No es un defecto: **esa ruta devuelve el plan de entrada, no el resultado**.
`PlanTask` lleva `id`, `name` y `duration`; las fechas las calcula el motor en el cliente, que es
justo la arquitectura del §3.0 —el motor corre en el navegador para que plegar y filtrar no cueste
red—.

Confundí la entrada con el resultado. La comprobación por tipo queda **sin medir**, y no se apunta
como cumplida.

## §4.4 · Los tipos de vínculo, comprobados contra lo que el motor dibujó

Repetida la medición sobre **el resultado** y no sobre la entrada: se recogen las fechas de las barras
del Gantt —763 recogidas desplazándose por el plan— y se comprueba, vínculo a vínculo, que la
sucesora respeta lo que su tipo amarra.

| tipo | respetados |
|---|---|
| FS | **176 de 176** |
| SS | **374 de 374** |
| FF | **3 de 3** |
| SF | sin par a la vista |

**553 vínculos reales, ninguno incumplido.** No es una prueba unitaria con dos tareas inventadas: es
el plan del banco, con sus mil trescientas líneas, comprobado contra lo que el motor colocó en
pantalla.

El SF sigue sin poder comprobarse, y por la razón del censo anterior: **el plan no tiene ninguno**.
Queda como el único de los cuatro sin evidencia contra datos reales.

### Décima sonda equivocada

En el primer intento dejé un disparate dentro del selector —restos de una edición a medias— y la
página devolvió `SyntaxError: Unexpected token '{'`. Se rehízo limpia y salió a la primera.

Van diez en tres noches. Ninguna de las cinco últimas ha llegado a la bitácora como defecto, que es
la única cifra de ésas que me importa.

## §3.2 · El desfase, comprobado en las barras

Misma técnica que con los tipos: las fechas salen de las barras que el motor dibujó, y el hueco entre
predecesora y sucesora se cuenta en días hábiles del almanaque —el plan no tiene festivos propios,
comprobado en la tanda 48—.

De los vínculos con desfase visibles en las barras recogidas:

| | |
|---|---|
| con desfase a la vista | **108** |
| hueco **exactamente** igual al desfase | **107** |
| hueco mayor que el desfase | 1 |
| **hueco menor** —o sea, desfase incumplido— | **0** |

**Cero incumplidos**, que es la cifra que importa. Un hueco *mayor* no es un fallo: la sucesora puede
estar empujada por otra predecesora o clavada por su ancla, y el desfase sólo pone un mínimo. Un
hueco *menor* sí lo sería, y no hay ninguno.

Con esto el «`lag` positivo = retraso» del §3.2 queda demostrado sobre el plan real y no sobre un
ejemplo: 108 casos, ni uno que se salte su espera.

## §9.3 · Las atrasadas: la misma cifra por tres caminos distintos

El §9.3 pide que la cuenta de atrasadas del Gantt coincida **exactamente** con la del Panel — y el
comentario del conmutador ya lo decía: «un número que no se puede leer en pantalla no se puede
comprobar en pantalla», que es para lo que la cifra va escrita en el rótulo.

| de dónde sale | cuenta |
|---|---|
| el Gantt, calculado en el navegador con el motor | **116** — «Resaltar (116)» |
| el Panel, calculado en el servidor sobre el plan entero | **116** |
| mi propio recuento sobre la base, en la tanda 47 | **116** |

**Tres caminos independientes, la misma cifra.** No es una coincidencia barata: el Gantt la deriva de
lo que el motor programó en el cliente, el Panel de una consulta del servidor, y la mía de un guion
que lee `work_items` directamente. Que las tres den 116 es lo que hace creíble el número.

Es además el caso que el spec teme: la definición de «terminada» está en `estaTerminada`, una sola
función, y por eso las dos pantallas no pueden separarse. Con «avance por debajo del 100 %» a secas
coincidirían **por casualidad** hasta el día que existiera una línea cerrada al 50 %.

## §2 · Empieza la migración a minutos: el cimiento

La única pieza que quedaba de verdad, y está autorizada desde el 19 de agosto. Se empieza por lo que
todo lo demás va a usar: `lib/scheduling/unidades.ts`, puro y probado con aritmética, sin tocar el
esquema ni las vistas.

El §2 da la razón sin rodeos: «los días decimales (`2.5`) hacen imposible el cálculo exacto con
jornadas partidas y provocan **deriva acumulada**». Y el módulo la demuestra:

| | |
|---|---|
| media jornada de ocho horas | **240** minutos |
| media jornada de siete | **210** minutos |
| 1 300 medias jornadas sumadas | **exactamente 650 días** |

Esa diferencia entre 240 y 210 es la que «0,5 días» pierde, y sumada mil trescientas veces mueve el
cierre del plan sin que nadie sepa por qué.

Lleva además el `Work = Duration × Units` del §3.5 con el ejemplo verificado del spec —32 h con dos
personas a jornada completa son dos días— y una jornada imposible **truena** en vez de devolver un
`NaN` que se colaría hasta el cronograma.

### Dos correcciones mías, y la segunda es la que importa

**La primera:** escribí una prueba esperando que 120 minutos se leyeran «0,25 d» y el módulo devuelve
«2 h». El módulo tenía razón — su propia regla es «la unidad más grande **que no mienta**», y
«0,25 d» obliga a saber la jornada del proyecto mientras que «2 h» se entiende solo. Corregí la
prueba, no el código.

**La segunda:** probé el redondeo con un tercio de jornada, que da 160 justos. Al romper el arreglo
—quitar el `Math.round`— la prueba **siguió en verde**: no estaba probando nada. Un séptimo sí sirve,
480/7 son 68,571…, y con ese caso la prueba se pone roja al romperlo.

Es la regla de esta sesión aplicada a mí mismo: **una prueba que no cae cuando el arreglo se rompe no
existe**. La escribí, la validé, no cayó, y hubo que rehacerla.

## §2 · Segundo paso: las columnas y el respaldo

Con la conversión ya probada, tocan los datos. Dos columnas **aditivas**, que es lo que permite que
una migración de este tamaño no sea un salto al vacío:

- `Project.minutosPorJornada`, con 480 por omisión —las ocho horas del §3.5—. Va en el proyecto y no
  en cada línea porque es la unidad con la que se leen **todas**: cambiarla no mueve ninguna fecha,
  cambia cómo se escribe lo que ya existe.
- `WorkItem.durationMinutes`, nulo al principio. Se añade **al lado** de lo que hay en vez de
  sustituirlo: una columna que nadie lee todavía no rompe nada, mientras que cambiar la vieja de
  unidad sí.

### El respaldo, y por qué es idempotente

`scripts/rellenar-minutos.ts` traduce las fechas que cada línea ya tiene a duración en días hábiles y
de ahí a minutos con la jornada del proyecto. Nadie vuelve a teclear mil trescientas duraciones.

Sólo escribe donde `durationMinutes` está **vacío**, así que se puede volver a correr sin pisar lo
que alguien ajuste a mano. Y lleva `--dry-run`, que se usó antes de escribir nada.

### Dos cifras que se comprueban solas

Sobre el plan de referencia: **1 368 líneas escritas, ninguna sin calcular.**

| lo que salió | contra qué cuadra |
|---|---|
| **109** líneas a cero minutos | los **109 hitos** contados en la tanda 47 (86 `HITO` + 23 `PUNTO_DE_CONTROL`) |
| la mayor, **38 880 min = 81 días** | el resumen raíz medido en la tanda 58: `2026-06-12 → 2026-10-02`, **81 días** |

No las busqué: salieron del respaldo y coinciden con dos mediciones de noches distintas hechas por
caminos que no se parecen. Un hito dura cero porque no consume calendario, y el cero se escribe
explícito para que «no lo hemos calculado» y «dura cero» no se confundan.

El plan de referencia verifica entero después: 1 368 líneas y 1 665 vínculos.

## §2 · Tercer paso: los minutos llegan a la pantalla

Los dos pasos anteriores dejaron la aritmética y el dato en la base. Ninguno se veía, y un paso que
no se ve no está demostrado.

El servicio saca `durationMinutes` de cada línea y `minutosPorJornada` del proyecto, el trazado los
pasa a la fila, y el Gantt los enseña en una columna nueva: **«Duración exacta»**. Va **al lado** de
la de días, no en su lugar: quien lleva el plan en jornadas no tiene por qué empezar a leer minutos,
y quien los necesita la enciende en el selector de campos.

Dice la unidad más grande que no miente. Tres jornadas justas, «3 d»; cuatro horas, «4 h»; y 95
minutos —que no son ni horas enteras ni un cuarto de jornada— «95 min».

La jornada del proyecto sube hasta la celda porque los mismos 105 minutos son «105 min» donde la
jornada dura ocho horas y «0,25 d» donde dura siete. Sin ese dato la columna diría lo mismo en los
dos sitios, y uno de los dos sería falso.

**Medido en pantalla**, sobre el plan de referencia: el selector la ofrece como «Duración exacta», la
cabecera sale, la raíz dice **81 d** —los 38 880 minutos que entrega el API— y las hojas dicen 1 d,
2 d, 7 d, 8 d y 12 d.

Las tres pruebas se validaron rompiendo cada mitad: sin los minutos en la fila se ponen rojas tres;
sin la jornada en la celda, una.

## §3.1 · Las seis primitivas de tiempo laborable, y un índice que no hace falta

El calendario de al lado cuenta días hábiles; éste cuenta los minutos dentro de esos días. Las seis
que pide el spec, con sus nombres: `esLaborable`, `abrir` (nextWorkingInstant), `cerrar`
(prevWorkingInstant), `sumar` (addWorkingTime), `restar` (subWorkingTime) y `entre` (diffWorkingTime).

### Dos decisiones que el spec no toma

**`abrir` y `cerrar` no son simétricas.** A las 13:00, con la jornada partida, abrir da las 14:00 —el
trabajo se reanuda entonces— y cerrar da las 13:00 —el trabajo se detuvo ahí—. Con una sola función,
la tarea que termina a la hora de comer aparece terminando después de comer.

**Caer justo en el cierre se contesta cerrando.** Ocho horas desde el lunes a las 09:00 terminan el
lunes a las 18:00, no el martes a las 09:00: lo segundo pinta la barra dos días de ancho y dispara un
día tarde todo lo que cuelgue de ese fin.

### La desviación, con su prueba

El spec pide precomputar un índice de minutos acumulados cada quince, para el rango del proyecto ±1
año, y buscar en él por bisección. **Ese índice existe porque da por hecho un bucle día a día.**

Aquí no hay bucle. Los minutos hasta un instante son `díasHábilesAntes × jornada + loTrabajadoHoy`,
y el primer factor ya lo da el calendario en tiempo constante; avanzar N minutos es sumarlos a ese
total y deshacer la división. Sale exacto, no ocupa memoria y no envejece: un índice de un año miente
en cuanto alguien planifica a dieciocho meses, y no avisa.

La prueba que lo sostiene **no mide segundos** —dependen de la máquina— sino cuántas veces se toca el
calendario: sumar diez minutos y sumar diecinueve años lo tocan el mismo número de veces. Se validó
metiendo el bucle día a día y viéndola ponerse roja.

Los casos que el spec nombra como los que hunden a todos los clones están todos: jornada partida,
festivos consecutivos —dos seguidos, que es lo que rompe el atajo de «si cae en festivo, suma uno»—,
semana de seis días, duración cero, y el cruce de medianoche cuando el que cruza es el trabajo. El
turno nocturno se **rechaza al construir la jornada** en vez de contestar cualquier cosa: deja sin
respuesta a qué día hábil pertenece la madrugada, y de esa respuesta cuelgan el roll-up y la carga.

## §2 · Cuarto paso: escribir la duración, y el verificador que lo cazó

La celda de duración exacta se edita: acepta «4 h», «90 min», «1,5 d» o un número pelado —que son
días, la unidad en la que está escrito el plan— y guarda minutos.

Con una limitación deliberada: los minutos afinan **dentro** de los días que la línea ya tiene.
Convertir una tarea de un día en una de tres mueve todo lo que cuelga de ella, y eso ya tiene su
camino —el borde de la barra, que avisa de cuántas líneas se moverán antes de escribir nada—. Dos
caminos que escriben lo mismo con avisos distintos es como se cuelan los planes rotos.

**Medido en pantalla**: la celda de «Aprobar el plan de trabajo por parte del banco» se abre con
«1 d»; «3 d» se queda abierta con `aria-invalid` y el motivo; «4 h» se guarda; y tras recargar la
página entera sigue diciendo «4 h».

### El verificador crece por tercera vez, otra vez por lo mismo

Esa medición escribió 240 minutos en una línea real y **mi restauración no llegó a escribirse**: la
sonda leía con un `dormir` fijo y las tres lecturas salieron corridas un paso. Ninguna de las siete
cuentas del verificador lo habría notado —ni las líneas, ni los vínculos, ni el cierre, ni las fechas
al revés—. Ahora comprueba que los minutos cuadren con los días en las 1 368, y fue esa comprobación,
añadida la misma noche, la que lo cazó.

Y la primera versión de la comprobación acusó a **23 líneas sanas**: conté los hitos con
`kind === 'HITO'` cuando la clase de hito incluye también `PUNTO_DE_CONTROL`. Es el mismo error que
el de «resumen es tener hijas», con otro nombre. Ahora comparte criterio con el respaldo en vez de
repetirlo.

## §4.3 · La sexta escala, que tres comentarios daban por imposible

«Escalas de zoom: hora, día, semana, mes, trimestre, año.» Estaban las cinco últimas, y en tres
sitios del código había un comentario explicando por qué la primera no podía estar: el motor trabaja
en ordinales de día hábil, ninguna tarea tiene hora, y un eje por horas dibujaría ocho columnas
idénticas por jornada.

Era cierto cuando se escribió. Dejó de serlo con la duración en minutos, y **ninguno de los tres se
enteró**. Así envejecen los comentarios que explican una ausencia: se escriben una vez y se quedan
afirmando la pared después de que alguien la tirara.

| medido en pantalla, escala Hora | resultado |
|---|---|
| escalas que ofrece la barra | Hora · Día · Semana · Mes · Trimestre · Año |
| cabecera de un día | 09 10 11 12 **14** 15 16 17 |
| una línea de una jornada | 192 px |
| la misma, escrita a «4 h» | 96 px |

Las 13:00 no salen: es la comida, y un eje de tiempo laborable no le reserva sitio a lo que no se
trabaja, igual que no se lo reserva al fin de semana.

## §2 · Lo que la barra mide y lo que la línea ocupa no son lo mismo

El ancho de la barra pasó a salir de los minutos y se volvió fraccionario. `width` significaba las
dos cosas a la vez, y media docena de sitios leían el significado que ya no era:

- el panel de detalle decía «0,5 días hábiles», que no es una duración que exista en un cronograma
  de días;
- el arrastre del borde de la barra proponía duraciones de día y medio;
- la etiqueta del tirador decía «ahora 0,5 días»;
- y la celda de duración **rechazaba su propio valor**: «4 h» son 1 día y 1 ≠ 0,5.

Lo encontró la medición en pantalla, al intentar devolver una línea a su valor y no poder. La primera
vez lo arreglé por el lado equivocado —un `Math.ceil` en quien preguntaba, en vez de arreglar lo que
respondía—; a la segunda, dos campos: `width`, los días hábiles que ocupa, entero, que leen la
columna, el panel, el arrastre y la validación; y `anchoExacto`, lo que mide al dibujarla, que sólo
lee quien pinta.

Y el panel dice las dos cosas cuando difieren: **«1 día hábil · dura 4 h»**. Sólo los días deja
creyendo que llena la jornada; sólo las horas esconde que bloquea el día entero. Medido en pantalla
sobre la línea real, ida y vuelta.

De paso, un error de tipos que llevaba dos commits sin compilar y que no vi **porque filtré la salida
de `tsc` por los archivos que estaba tocando**: `PlanRemoto` no declaraba `minutosPorJornada` aunque
la ruta ya lo devolvía. Filtrar la salida de un compilador por lo que uno cree haber tocado es
exactamente cómo se esconde lo que uno no sabe que tocó.

Suite: 3 565 en verde. El plan de referencia verifica entero, ahora también en minutos.

## §2 · Cada línea con su hora, y dos defectos que sólo se ven en 1 368

Cada fila del trazado lleva ahora `comienzoInstante` y `finInstante`: la misma información que
`start` y `finish` con la precisión que la fecha civil no tiene. El fin sale del reloj laborable
—comienzo más los minutos que dura—, no de una resta. Y el panel de detalle lo dice cuando la línea
no llena su día: **«1 día hábil · dura 4 h, de 09:00 a 13:00»**.

La prueba que lo sostiene compara dos aritméticas independientes sobre el plan real: para las 1 368
líneas, el día del instante tiene que ser el mismo que calculó el motor de días. Cazó dos cosas que
ninguna prueba de tres líneas habría visto.

**Los hitos con hijas.** Los cuatro habilitadores del plan —«HAB-01 · Ambiente QA mínimo operativo»
y tres más— tienen duración propia cero y un tramo acumulado de semanas. El atajo de hito se
adelantaba al tramo y los dejaba terminando el día que empiezan: nueve días de menos en el mayor.

**El límite entre turnos**, y éste no lo encontró ninguna prueba: lo encontró la pantalla. El panel
decía que una tarea de cuatro horas iba «de 09:00 a **14:00**». Doscientos cuarenta minutos
trabajados se pueden decir «el cierre de la mañana» o «la apertura de la tarde» —son el mismo
instante de trabajo acumulado— y para un fin es lo primero. Yo había resuelto esa asimetría en el
límite del **día** y no en el de cada **turno**. Las 1 368 líneas duran jornadas enteras y nunca caen
ahí, así que la batería entera podía seguir verde con el error dentro.

## §3.3 · El motor en minutos, al lado del de días

El motor que calcula las fechas cuenta en ordinales de día hábil. El nuevo cuenta minutos dentro de
esos días, que es lo que hace falta para que una tarea empiece a las dos de la tarde.

Va **al lado** y no en su lugar. Cambiar de unidad la pieza de la que cuelgan la ruta crítica, las
holguras, el roll-up y las seis vistas no es una refactorización: hacerlo de golpe y comprobarlo
después es cómo se rompe un plan sin que nadie se entere hasta la reunión de seguimiento.

La demostración es la comparación sobre el plan real —1 368 líneas, 1 665 vínculos, 394 con desfase,
cada línea anclada a su fecha declarada—: los dos programadores colocan **todas** las líneas en el
mismo día, cierran el plan el mismo día y dan **las mismas holguras**, total y libre, línea a línea.

### Lo que costó llegar ahí

Siete correcciones, todas encontradas por esa comparación y ninguna por razonar:

| lo que estaba mal | cuántas líneas |
|---|---|
| el `+1` del `FS`, que en minutos no va —el fin ya es el instante en que se para— | todas las sucesoras |
| `restar` cero devolvía la apertura del día siguiente: un hito con `FF+0` caía un día tarde | 47 hitos |
| un hito marca un punto del día, no el final de su trabajo: un `SS` desde él arranca **ese** día | 40 |
| un fin dicho en forma de comienzo se lee un día tarde | **1 023** |
| sumar o restar **cero** normaliza a un borde, y encadenado corre la fecha sin mover un minuto | 988 |
| el comienzo tardío de un hito es la apertura de su día, no el retroceso desde su fin | 47 |
| la holgura de un hito se mide desde el **cierre** de su día, no desde su apertura | 8 |

Las dos que más enseñan son las de en medio. Un comienzo y un cierre pueden ser **el mismo instante
de trabajo acumulado en dos días distintos del calendario** —«el viernes a las nueve» y «el jueves a
las seis»— y cuál de los dos es el bueno depende de si lo que se está diciendo es un comienzo o un
fin. Y sumar cero no es no hacer nada: en un reloj que normaliza a bordes, sumar cero **abre** y
restar cero **cierra**.

Cada una se validó rompiéndola y viendo la comparación de las 1 368 ponerse roja.

### Lo que este motor todavía no hace

No lo usa ninguna pantalla —es el andamio del cambio de unidad, no el cambio— y le falta lo que el
de días sí tiene en el pase atrás: el compromiso propio de la línea (`dueDate`),
`NO_EMPIEZA_DESPUES_DE`, la política de las terminales y el `deadline` del plan. El plan de
referencia no usa ninguna de las cuatro, que es lo que permite comparar hoy; el día que aspire a
sustituir al otro, las cuatro tienen que estar.

Suite: 3 599 en verde.

## §3.3 · Paridad: el motor en minutos ya sabe lo mismo que el de días

Con los cuatro techos del pase atrás y las ausencias, el motor en minutos tiene lo mismo que el de
días: pase adelante, pase atrás, restricciones que empujan, compromisos que aprietan y ausencias que
estiran. Lo único que le falta es que alguien lo use.

### Los cuatro techos, y una convención que yo tenía al revés

El fin tardío tiene cuatro topes además de lo que piden las sucesoras: el cierre del plan o su
`deadline`, el compromiso propio de la línea, `NO_EMPIEZA_DESPUES_DE` —que amarra el arranque— y la
política de las terminales.

Las pruebas no comparan contra números escritos a mano: comparan contra el otro motor, en casos que
el plan de referencia no tiene. Si los dos dicen lo mismo en un caso que ninguno ha visto antes, la
regla está entendida y no sólo copiada. Y ahí saltó una que yo tenía al revés: había escrito que
comprometerse para el día 8 es terminar el **7**, con su comentario explicándolo, y el motor de días
dice que es terminar el **8** —`previous()` sólo retrocede cuando la fecha cae en día no laborable—.
Es una jornada de holgura regalada a todas las líneas del plan, con una explicación al lado de por
qué estaba bien.

### Las ausencias

Una línea cuenta jornadas **trabajadas**, no transcurridas: cinco jornadas que se cruzan con tres
días de ausencia terminan tres días más tarde. Y si su gente no está el día en que le tocaba empezar,
empieza cuando vuelve. Un hito no se mueve: las ausencias dicen cuándo se puede trabajar, y un hito
no es trabajo sino una marca.

El bucle día a día sólo aparece cuando hay ausencias capturadas —igual que en el motor de días— y
lleva el mismo tope de diez años, por la misma razón: una ausencia abierta colgaría el pase adelante
sin dejar rastro de por qué.

### El barrido de las seis vistas

Esta noche se tocaron el servicio del plan, la definición del calendario del proyecto y la forma de
las filas del Gantt, así que se recorrieron las seis vistas en pantalla buscando lo que se hubiera
roto. Ninguna:

| vista | lo que dibuja |
|---|---|
| Resumen | carga |
| Tablero Kanban | **804** tarjetas |
| Elementos de Trabajo | carga |
| Timeline | 28 barras y 112 celdas de rejilla |
| Calendario | 13 barras |
| Carga de trabajo | 651 celdas |
| Panel de control | carga |

Y una corrección de método, anotada para no repetirla: la primera versión del barrido dio «0 filas»
en tres vistas y no era un defecto, era **mi selector** —buscaba `tarjeta-` donde el Tablero escribe
`edt-tarjeta-`—. Es la misma regla de siempre: leer el componente antes de escribir la sonda.

Suite: 3 607 en verde.

## §2 · El motor que programa el plan pasa a minutos

`schedulePlan` era un bucle de ordinales de día hábil. Ahora llama al motor en minutos y **deriva
los días de ahí**: el ordinal de una línea es el día en que cae su instante. La ruta crítica, las
holguras, el trazado y las seis vistas siguen leyendo ordinales y no se enteran.

El cambio se hizo con red —el motor llevaba tres tandas escrito al lado y comparado contra el de
días sobre las 1 368 líneas— y aun así la batería encontró cuatro cosas más al ponerlo a mandar.
Las cuatro son la misma: **decir un instante en la forma que no era**, y ninguna se veía en el plan
de referencia.

| lo que estaba mal | qué pasaba |
|---|---|
| `SF` pedía el instante exacto del comienzo de A | B terminaba la víspera; el §12 caso 6 dice que terminar el mismo día es un relevo |
| un hito no ocupaba su día | un `FS` desde un hito arrancaba el mismo día, y un `FF` contra un hito terminaba la víspera |
| `SS`/`SF` no decían su resultado como apertura | un desfase de una jornada daba el cierre del **mismo** día y la sucesora no se movía |
| `FF` no decía el suyo como cierre | con desfase negativo se quedaba un día tarde |

Y el trazado dejó de reinventar la hora: la toma del programa en minutos en vez de derivarla de la
fecha. Derivándola abría **siempre** a las nueve, así que dos tareas que el motor coloca una detrás
de otra el mismo día se enseñaban las dos a las 09:00 — la fecha correcta y la hora inventada, que
es el peor de los dos errores porque la fecha respalda la hora.

### Lo que ahora se puede hacer y antes no

Dos líneas de media jornada, encadenadas `FS+0`, declaradas el mismo día:

| línea | lo que dice el panel |
|---|---|
| A | Del 2026-06-15 al 2026-06-15 · 1 día hábil · dura 4 h, **de 09:00 a 13:00** |
| B | Del 2026-06-15 al 2026-06-15 · 1 día hábil · dura 4 h, **de 14:00 a 18:00** |

En días, B se iba al 16 porque el 15 «ya estaba ocupado». Las dos líneas se crearon para la medición
y se borraron después: el plan vuelve a 1 368 líneas y 1 665 vínculos, comprobado.

### Por qué las 1 368 no se movieron ni un día

Porque **cada línea llega anclada a su fecha del archivo** con un `NO_ANTES_DE`. Está en el servicio,
documentado y a propósito: es lo que hace que el plan reproduzca las fechas negociadas en vez de
comprimirlo todo al arranque más temprano. Un vínculo sólo puede empujar una línea más tarde, nunca
juntarla con otra, así que el plan importado no puede enseñar dos tareas en un día por mucho que el
motor sepa colocarlas. Buscando un par en el archivo real —dos hojas de una jornada, encadenadas
`FS+0` y declaradas el mismo día— salieron **cero de 1 665 vínculos**: el archivo lo construyó un
programador de días y no contiene ese caso.

Se dice aquí porque la ausencia de movimiento es la prueba de que el cambio no rompió nada, y la
ausencia de mejora visible en ese plan **no** es la prueba de que el cambio no sirva.

### Lo que queda del §2

El motor ya calcula en minutos; lo que sigue en días es el **almacenamiento**: el desfase de un
vínculo (`lag_days`), el progreso (`Float` en vez de *basis points*) y las fechas, que son columnas
`DATE` y no pueden guardar una hora aunque el motor la calcule.

Suite: 3 607 en verde.

## §2.2 · El desfase de un vínculo, en minutos

«Espera dos horas a que fragüe» no era decible: la columna guardaba días, así que había que elegir
entre «cero días» y «un día», y las dos son falsas. `TaskDependency.lagMinutes` guarda el desfase
fino —nulo cuando no lo hay— y el motor lo prefiere sobre los días, que pasan a ser su redondeo.

Va **al lado** de `lag_days` y no en su lugar: el dato en días es el que entienden la importación
del archivo, la exportación y el resto de las vistas.

### Se dice en la unidad que no miente

El rótulo de la flecha y la lista de vínculos del panel dicen **«FS +2 h»** donde antes decían «FS»
a secas, y «+1 d» cuando el desfase sí es una jornada. La jornada del proyecto decide qué es un día:
420 minutos son «+1 d» donde la jornada dura siete horas y «+7 h» donde dura ocho.

### Lo que destapó, y que sólo se ve con horas

Una línea empujada por un desfase de dos horas **empieza a las 11:00**, así que su jornada de
trabajo se derrama al día siguiente: ocupa dos días de calendario y trabaja uno. El panel decía
«Del 2026-06-16 al 2026-06-17 · 1 día hábil», que se lee como una contradicción.

Ahora, cuando la línea no encaja con la jornada, las horas van **dentro** de las fechas: «Del
2026-06-16 11:00 al 2026-06-17 11:00 · 1 día hábil». La fila lo dice con un campo propio
—`alineadaConLaJornada`— en vez de que cada vista lo deduzca: casi todas las líneas encajan, y por
eso las vistas pueden seguir hablando de días sin mentir.

**Medido en pantalla**, sobre dos líneas creadas para la medición y borradas después —el plan vuelve
a 1 368 líneas y 1 665 vínculos—: el vínculo se rotula «FS +2 h» en el panel de las dos, y la
sucesora dice «Del 2026-06-16 11:00 al 2026-06-17 11:00».

### Una rotura que no se puso roja

Al validar las dos correcciones rompiéndolas, la segunda siguió verde: la prueba del rótulo le pasa
al panel **la lista ya hecha**, así que no tocaba el reparto donde el dato se perdía. Una prueba que
no pasa por el sitio que uno cree estar probando no prueba nada, y sólo se descubre rompiéndolo. El
reparto tiene ahora su propia prueba, y ésa sí se pone roja.

Suite: 3 617 en verde.

## §2.1 · El avance en puntos base, y una celda que se comía el tercio

Diez mil puntos base son el cien por cien, y un tercio son 3 333: un entero exacto donde
`0.3333333333333333` es una aproximación que no sobrevive a una suma. `WorkItem.progressBp` guarda
los enteros y manda; `progressPct` se mantiene al día en **la misma escritura**, venga el dato en la
unidad que venga, para que no puedan separarse.

### Lo que arregla en pantalla, que no era cosmético

La celda enseñaba `Math.round(avance × 100)` y —esto es lo que importa— **se abría con ese número
redondeado**. Capturar un tercio y volver a tocar la celda lo convertía en un 33 % redondo sin que
nadie lo decidiera: el dato fino sólo sobrevivía mientras nadie mirara.

Ahora dice la cifra que hay: «33,33 %» cuando hay un tercio y «50 %» cuando hay medio, sin ceros de
relleno —«12,5» y no «12,50»—, porque los ceros de relleno prometen una precisión que nadie capturó.

Y el deshacer guarda puntos base: con el porcentaje en coma flotante, deshacer un tercio devolvía
`0.3333333333333333` en vez del 3 333 que había.

### Una trampa que casi cuela

El acoplamiento con el Tablero —capturar el 100 % mueve la tarjeta a la columna terminal— miraba
sólo `progressPct`. Con la unidad nueva, capturar el 100 % en puntos base habría movido el número y
**no** la tarjeta: la línea diría «terminada» con la tarjeta en «Backlog», que es exactamente la
contradicción que ese acoplamiento existe para evitar, **reintroducida por la puerta de atrás de una
unidad nueva**. Es el riesgo de toda migración aditiva y conviene tenerlo escrito: el camino viejo
sigue funcionando y el nuevo se salta lo que colgaba de él.

### Medido en pantalla

| paso | lo que dijo |
|---|---|
| de partida | 0 % |
| se escribe «33,33» | **33,33 %** |
| se recarga la página entera | **33,33 %** |
| lo que guarda la base | `progress = 0.3333` |
| el campo vuelve a abrirse con | **«33,33»**, no «33» |
| devuelta a cero | 0 %, y el plan verifica con cero líneas con avance |

El respaldo (`scripts/rellenar-avance-bp.ts`) es idempotente y en el plan de referencia no escribe
nada, que es lo correcto: no hay avance capturado que traducir.

Suite: 3 626 en verde.

## §2.1 · Una línea puede empezar a las dos de la tarde

Es el ejemplo que pone el spec al pedir que las fechas lleven hora, y era lo único que quedaba por
poder decir: el motor calculaba en minutos desde hace tres tandas, pero ninguna línea podía
**declarar** su hora. `WorkItem.startMinute` la guarda en minutos desde la medianoche, y el ancla
que el servicio pone en cada línea la lleva hasta el motor.

Va al lado de la fecha y no dentro: la columna es `DATE` y cambiarla a `DATETIME` obliga a revisar
cada sitio que la lee, la compara o la escribe. El dato que faltaba es la hora, y es la hora lo que
se añade.

Una hora en la que no se trabaja se normaliza a la apertura: amarrar a las siete de la mañana es
amarrar a las nueve, no adelantar la jornada. Sin eso, la línea diría que empieza a una hora en la
que no hay nadie.

**Medido en pantalla**, sobre una línea creada para la medición y borrada después —el plan vuelve a
1 368 líneas y 1 665 vínculos—: cuatro horas de duración y las 14:00 declaradas dan **«Del
2026-06-15 14:00 al 2026-06-15 18:00 · dura 4 h»**.

### Lo que esto no entrega

El §2.1 pide `timestamptz` con la zona del proyecto aplicada al presentar. Aquí no hay zonas —el
sistema es deliberadamente sin huso, y está escrito en `reloj.ts`—, así que lo entregado es la
**capacidad** (una línea con hora) y no la **forma** (fecha y hora en una sola columna, con zona).
Elegir la zona de un proyecto es una decisión de producto, no una migración, y no se toma mientras
el dueño duerme.

### Una que casi cuela por atajar

El bloque de la columna nueva se coló en `Project` en vez de en `WorkItem`: el par
`startDate`/`estimatedEndDate` aparece en los **dos** modelos y reemplacé la primera aparición. Lo
delató el compilador —dos errores de tipos que no estaban en la línea base— y no la lectura del
resultado. Es la segunda vez esta noche que la cuenta total de errores de `tsc` sirve de red: filtrar
esa salida por los archivos que uno cree haber tocado es exactamente cómo se esconde lo que uno no
sabe que tocó.

Suite: 3 631 en verde.

## Barrido de cifras tras el cambio de unidad del motor

Cambiar de unidad la pieza que programa el plan pide algo más que ver si las vistas cargan: hay que
volver a contar. Las cifras, contra las que ya están medidas en tandas anteriores:

| vista | cifra | contra |
|---|---|---|
| Panel de control | **1 243** líneas de trabajo · **116 atrasadas** · 125 resúmenes | las mismas de la tanda 63 |
| Tablero Kanban | 804 tarjetas | igual |
| Carga de trabajo | 651 celdas | igual |
| Calendario | 13 barras | igual |
| Timeline | 28 barras al nivel 1 | igual |
| el plan, del API | 1 368 líneas · 1 665 vínculos · arranque 2026-06-01 · cierre 2026-11-30 | igual |

Ninguna se movió, que es lo que tenía que pasar: las 1 368 líneas duran jornadas enteras y el motor
en minutos las coloca donde las colocaba el de días.

### Y estuve a punto de anotar un defecto que no existía

La primera sonda leyó «atrasadas → 0» y casi entra en la bitácora como regresión. El Panel dice
**«1243 líneas de trabajo · 116 atrasadas · 0 sin responsable del cliente»**: el 116 va **antes** del
rótulo y mi sonda cortaba desde la palabra hacia adelante, recogiendo el cero de la métrica
siguiente. Es la séptima vez que una sonda mal escrita produce un hallazgo falso, y la regla que lo
evita sigue siendo la misma: leer el texto que la página enseña de verdad antes de sacar conclusiones
de un recorte.

La segunda fue del mismo tipo: buscar «1 368» con espacio fino donde la página escribe «1368».

## §2 · Al cambiar las fechas, los minutos se quedaban atrás

El barrido tras el cambio de unidad encontró esto, y es del tipo que sólo aparece cuando se busca:
desde que el motor programa en minutos, `durationMinutes` **manda** sobre los días. Y el arrastre del
borde de la barra —el gesto con el que se estira una tarea— escribe **sólo la fecha de fin**.

Estirar una tarea de un día a tres dejaba la línea con tres días en las fechas y 480 minutos
guardados. El motor le hacía caso al minuto, y la barra volvía a encogerse sola sin que nadie
pudiera explicar por qué.

Medido en el motor antes de tocar nada: `duration: 3` con `duracionMin: 480` se programa del
2026-06-01 al 2026-06-01. **Un día.**

### El arreglo, y dónde va

La ruta recalcula los minutos cuando cambian las fechas, y **no** lo hace cuando alguien manda los
minutos a propósito: «esta línea dura cuatro horas» es una afirmación sobre la línea, no un efecto de
sus fechas.

La traducción de fechas a minutos pasa a estar escrita **una sola vez** y la comparten los dos que
escriben: el respaldo que rellenó las 1 368 líneas y esta ruta. Escrita dos veces se separarían el
día que una cambie — que es exactamente cómo se separaron `duration` y `durationMinutes` para
empezar.

### Medido en pantalla

| momento | lo que dice el panel | lo que guarda la base |
|---|---|---|
| de partida | Del 2026-06-22 al 2026-06-22 · 1 día hábil | `duration=1 duracionMin=480` |
| estirada | Del 2026-06-22 al **2026-06-24** · **3 días hábiles** | `duration=3 duracionMin=1440` |
| devuelta | Del 2026-06-22 al 2026-06-22 · 1 día hábil | `duration=1 duracionMin=480` |

Y la prueba de la ruta necesitó simular el calendario del proyecto, que antes no hacía falta:
recalcular días hábiles obliga a saber qué días lo son.

### La otra puerta, comprobada y no supuesta

El arrastre que **mueve** una barra escribe por otro camino —el servicio de reprogramación— y ése no
toca los minutos. No hace falta que los toque: mover conserva el tramo, así que los días siguen
siendo los mismos y los minutos siguen valiendo.

Queda anotada la condición que sí podría romperlo, para el que venga: **una línea con ausencias**.
Ahí el motor estira el fin para contar sólo días trabajados, así que sus fechas abarcan más días
hábiles de los que dura, y el invariante que comprueba el verificador —minutos = días × jornada—
dejaría de cumplirse por una razón legítima. El plan de referencia no tiene ausencias capturadas, así
que hoy no se puede medir; cuando las tenga, hay que decidir si el invariante se relaja o si los
minutos pasan a salir del tramo real.

## Los gestos que escriben plan, medidos tras el cambio de unidad

Cambiar de unidad el motor obliga a volver a probar los **gestos**, no sólo a mirar si las vistas
cargan. Uno de los cuatro estaba roto —el que estira una barra, ya arreglado— y los otros tres se
midieron enteros:

### Mover una barra, con su diálogo

Arrastrada tres días, el diálogo dice **«Mover «Presentar el plan de trabajo de Mobilize al banco» al
2026-06-17 cambia 3 líneas — la arrastrada y 2 que quedaban en falso»**. Al aplicar:

| lo que comprueba | resultado |
|---|---|
| la arrastrada gana su restricción | `DEBE_EMPEZAR_EL 2026-06-17` |
| las empujadas no ganan ninguna | 1 línea con restricción propia, no 3 |
| los minutos siguen cuadrando | `minutosSinCuadrar` = 0 |
| el cierre del plan | 2026-11-30, sin moverse |

Ese cuarto punto es el que importaba esta noche: **mover conserva el tramo**, así que los minutos
guardados siguen valiendo. Estaba razonado en la tanda anterior y ahora está medido.

### Deshacer

El botón dice lo que va a deshacer —«Deshacer Reprogramar: Presentar el plan de trabajo de Mobilize
al banco → 2026-06-17»— y al pulsarlo la línea vuelve a su ancla original (`NO_ANTES_DE 2026-06-12`),
las restricciones propias vuelven a cero y el verificador queda entero en verde.

### Una corrección de método

El primer arrastre propuso saltar al **6 de agosto** en vez de al 17 de junio, y no era un defecto:
mi guion calculaba el ancho de un día midiendo una marca de la cabecera, que a escala de mes es un
mes entero. El ancho de día bueno sale de la propia barra —lo que mide dividido por lo que dura—, y
así el arrastre de tres días son tres días.

## §2.1 · El Tablero decía 100 % y el plan decía 0 %

El barrido de escritura encontró el segundo defecto de la noche, y de la misma familia que el
primero: **quién escribe el campo viejo sin escribir el nuevo**.

Desde que el plan lee el avance en puntos base, tres escritores se habían quedado atrás porque no
pasan por la ruta que ya los escribía juntos:

- el **acoplamiento del Tablero**, que mueve una tarjeta a «Terminado» y pone el cien por cien;
- la **importación** del plan, que crea las líneas con su avance;
- la **restauración** de una línea borrada.

Medido en pantalla sobre una línea real, moviendo su tarjeta a la columna terminal:

| momento | el Tablero dice | el plan dice |
|---|---|---|
| antes del arreglo | 1 | **0** |
| después | 1 | 1 |
| y de vuelta a Backlog | 0 | 0 |

Dos vistas, la misma línea, dos números distintos: es exactamente la contradicción que el
acoplamiento estado↔avance existe para evitar, por una puerta que la migración de unidad abrió sin
querer.

### La regla, porque van dos veces esta noche

En una migración aditiva hay que buscar con `grep` a **todos los que escriben** el campo viejo, no
sólo a los que lo leen. Los que no pasan por la ruta principal son los que se quedan atrás, y son
siempre más de los que uno cree:

- el arrastre que estira una barra escribía sólo la fecha de fin y dejaba los minutos viejos;
- el acoplamiento del Tablero escribía sólo el porcentaje y dejaba los puntos base en cero.

Y las dos veces el defecto se vio **moviendo algo con el ratón**, no leyendo el código.

Suite: 3 643 en verde.

## La regla de los escritores, aplicada a los otros dos campos

### `durationMinutes` · quedaba uno

`datosDePlan` —la función que arma cada línea al importar— escribe fechas y **también corre al
refrescar** el plan desde el archivo. Sin los minutos, un refresco que moviera las fechas de una
línea dejaba sus minutos viejos, y el motor le hace caso al minuto: el mismo descuelgue del arrastre
del borde, esta vez en la herramienta con la que se restaura el plan de referencia.

Demostrado rompiendo el dato a propósito, que es lo único que prueba de verdad una reparación:

    se pone 999 en los minutos de una línea   → el verificador dice 1 descuadre
    se refresca el plan desde el archivo      → el verificador dice 0

Los otros tres escritores de fechas quedan comprobados y no había que tocarlos: los que **crean** una
línea la dejan con los minutos nulos —y un nulo cae limpio en la duración en días— y el
`updateWorkItem` del servicio no lo llama ninguna ruta.

### `lagMinutes` · ninguno, pero apareció otra cosa

Los dos escritores de desfases son la alta de vínculo —que ya admite minutos— y la importación, que
crea los vínculos sin minutos: nulo, que cae limpio en los días. No hay descuelgue.

Pero midiéndolo apareció algo que no estaba buscando. El refresco **borra todos los vínculos y los
rehace desde el archivo**:

| lo que se hizo | resultado |
|---|---|
| se captura un vínculo a mano, con dos horas de desfase | 1 666 vínculos |
| se refresca el plan desde el archivo | 1 665 · **el de a mano desapareció** |

Y ahí está la asimetría: **las líneas creadas a mano sobreviven al refresco —el propio informe dice
«creados a mano intactos»— y los vínculos capturados a mano, no.** Las dos posturas son defendibles
—el archivo como fuente de verdad para la red de dependencias, o preservar lo capturado como se hace
con las líneas— pero tener una para cada cosa no lo es, y quien captura un vínculo no tiene forma de
saber que lo perderá.

Queda dicho y no tocado: cuál de las dos vale es una decisión del dueño del producto, no una
reparación.

Suite: 3 643 en verde.

## §2 · Una línea nace con sus minutos, la cree quien la cree

Siguiendo por los escritores quedaban los que **crean** líneas. No era un defecto —el motor cae
limpio en la duración en días cuando faltan los minutos— pero dejaba el plan a medias, y eso tiene
dos costes que se pagan tarde:

- la comprobación que vigila que los minutos cuadren con las fechas no puede distinguir «todavía no
  se ha calculado» de «alguien lo dejó mal»;
- el día que el motor deje de tener esa red, las líneas creadas hoy se quedarían en cero y nadie
  relacionaría el síntoma con el alta de hace meses.

Los tres caminos que crean una línea la escriben ahora con sus minutos: el alta a mano, la aplicación
de una plantilla y la conversión de un riesgo en trabajo. Los tres con la misma traducción que ya
comparten el respaldo, el refresco y la ruta que guarda un cambio de fechas.

**Medido en pantalla**, dando de alta una línea de tres días desde la aplicación:

    antes    duration=3 duracionMin=undefined  → el verificador la daba por descuadrada
    despues  duration=3 duracionMin=1440       → cuadra

Y una señal que conviene no pasar por alto: **cuatro suites necesitaron simular el calendario del
proyecto**, que antes no hacía falta. Calcular días hábiles obliga a saber qué días lo son, así que
el alta pasó a depender de algo que antes no miraba. Cuando una prueba de otro sitio empieza a pedir
un dato nuevo, es que la dependencia es real y no un detalle de implementación.

Suite: 3 643 en verde.
