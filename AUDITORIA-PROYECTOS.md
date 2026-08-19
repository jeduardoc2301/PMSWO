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
| 16 | Vista Calendario (§7) | **CERRADA (con una corrección)** | `lib/scheduling/calendar-layout.ts`, `components/projects/calendar-view.tsx`, `calendar-tab.tsx`, `services/reschedule.service.ts` | **6 de 6 criterios del §7.5 demostrados en pantalla — pero el 5 se dio por bueno de más y hubo que volver.** Mi demostración soltaba la barra sobre casillas vacías; un auditor cuyo encargo era refutarme encontró que soltar sobre **otra barra** no hacía nada, y eso es el 21 % de la rejilla y más de la mitad del alto útil de un día cargado. Corregido y vuelto a medir: de 0 % a 100 % de aceptación en los puntos que caen sobre una barra. La lección no es del Calendario: una demostración en pantalla que no busca el caso denso no es una demostración. Del §7.2 quedan fuera la vista semanal, la de agenda y crear tarea arrastrando un rango: son mejoras propuestas, no criterios. Y el calendario del proyecto sólo se puede **leer**: no hay pantalla ni ruta para crearlo — brecha 27 | L | Bajo |
| 17 | Vista Carga de trabajo (§8) | **CERRADA** | `lib/scheduling/workload.ts`, `components/projects/workload-*.tsx` | **6 de 6 criterios del §8.5, cada uno demostrado en pantalla** (ver la bitácora). Es la única vista que no necesitó tocar código: estaba bien y lo que faltaba era recorrerla. Del §8.2 queda fuera el calendario por recurso —hay jornada diaria y ausencias, no semana laboral propia— | L | Medio |
| 18 | Vista Panel de control (§9) | **PARCIAL** | `lib/projects/dashboard-metrics.ts`, `components/projects/dashboard-*.tsx`, `services/project-dashboard.service.ts` | **5 de 6 criterios del §9.3 demostrados en pantalla, y el sexto a medias** (ver la bitácora). Lo que falta no es del panel: la aplicación **no tiene modo claro** —ni `prefers-color-scheme`, ni clases `dark:`, ni conmutador— en ninguna de las seis vistas, así que «legibles en claro y oscuro» no se puede cumplir aquí. La otra mitad —accesibles sin depender sólo del color— sí | L | Bajo |
| 27 | Calendario del proyecto: sólo lectura | **NO EXISTE** | `services/project-calendar.service.ts` (sólo `load*`) | El sombreado de festivos propios funciona —medido—, pero `ProjectCalendar` y `ProjectHoliday` sólo se pueden crear escribiendo en la base. No hay ruta `/calendar` ni pantalla. Descubierto al demostrar el criterio 2 del §7.5 | M | Medio |
| 19 | Estados configurables (§5) | **PARCIAL** | `KanbanColumn.isInitial/isDone`, `lib/projects/status-progress.ts` | El acoplamiento funciona; falta el alta/baja de columnas desde la pantalla | M | Medio |
| 20 | Líneas base (§3) | **PARCIAL** | `Baseline`, `BaselineItem`, `lib/scheduling/baseline.ts` | El motor y la rejilla, sí. Falta la barra bajo la barra del Gantt (§4.6) y el selector no está en el Gantt | M | Bajo |
| 21 | Preferencias de vista (§10.4) | **CERRADA** | `ViewPreference`, `services/view-preference.service.ts` | Las cinco vistas configurables guardan y restauran. Comprobado en pantalla una por una: Gantt (Fases/Todas), Lista (Esquema), Tablero (agrupar por prioridad), Carga (Tareas) y Panel (widgets) sobreviven a recargar la página entera. `/es/plan` no persiste **a propósito**: monta el Gantt sin `projectId` porque es el plan del archivo de referencia, no un proyecto | M | Bajo |
| 22 | Filtros unificados (§10.2) | **PARCIAL · bloqueada por el modelo** | `lib/projects/filter.ts`, `SavedFilter`, `components/projects/filter-bar.tsx` | Llega a 5 vistas de 6; el Panel queda fuera a propósito. La exportación **sí** respeta el filtro: con 255 líneas filtradas el botón dice «Exportar (255)» y el CSV escribe «255 de 1368 líneas» en su propia cabecera. Lo único que falta son los campos **creador** y **color**: ninguno de los dos existe en `WorkItem` —sólo hay `createdAt`—, así que son migración y entran en la lista del §2 que espera decisión. Los campos personalizados, igual | M | Bajo |
| 28 | Modo claro (§9.3) | **NO EXISTE** | (ninguno) | La aplicación es oscura en las seis vistas: sin `prefers-color-scheme`, sin clases `dark:`, sin conmutador. Es lo único que impide cerrar el sexto criterio del §9.3, y es transversal, no del panel. Descubierto forzando el esquema claro del navegador | L | Bajo |
| 29 | Permisos por vista y `edit_schedule`/`edit_tracking` (§10.1) | **PARCIAL · los diez existen** | `lib/projects/permisos.ts`, `services/project-authorize.service.ts`, `app/api/v1/projects/[id]/permissions/` | Los diez permisos del §10.1 existen con su nombre, con cuatro papeles de proyecto (OWNER, MANAGER, COLLABORATOR, CLIENT) y `authorize(userId, projectId, permission)` que lanza 403 nombrando el permiso que faltó. El permiso efectivo es la **intersección** del techo del cargo y el papel en el proyecto. La barra de vistas se recorta: comprobado en pantalla, un cliente ve 7 pestañas y no ve Timeline, Calendario ni Carga. `authorize()` guarda ya las tres puertas que mueven datos: fechas por la ruta de la línea, `/reschedule`, y cualquier escritura sobre una línea. Falta llevarlo al resto de rutas de escritura y una pantalla para repartir papeles | M | Alto |
| 30 | Revocar un rol no surte efecto hasta volver a entrar | **EXISTE PERO MAL** | `lib/auth.ts` (sesión JWT) | Los roles viajan en el token y no se releen de la base. Cambiar el rol de alguien en la base no le quita nada hasta que su sesión caduca o vuelve a entrar. Es el comportamiento normal de una sesión JWT, y es una decisión consciente que hay que tomar —no un descuido— porque una revocación de permisos que tarda no es una revocación. Descubierto al probar la guardia del §10.1: los primeros intentos pasaron con un token viejo | M | Alto |
| 31 | Panel de detalle compartido (§10.3) | **CERRADA** | `components/plan/plan-detail-panel.tsx`, `lib/plan/detail-links.ts`, `lib/plan/usar-plan.ts` | **Un solo componente en las SEIS vistas.** Las cinco primeras se comprobaron abriendo la misma línea desde cada una: panel idéntico carácter a carácter (426). La sexta —el Panel de control— entra por el widget de hitos, que es el único sitio donde hay líneas y no cifras agregadas; inventarle una lista de tareas al Panel para que la cuenta diera seis habría sido construir otra vista, no cerrar esta. Comprobada la firma del componente en las cuatro que abren líneas distintas: mismo encabezado, mismo cierre, mismos rótulos. La auditoría anterior decía «dos implementaciones»: no era cierto — había una sola y cuatro vistas que no abrían ninguna. Lo que sí falta es la mitad editable del §4.7: el panel **lee** (fechas del motor, holgura, vínculos, recuperabilidad) y editar sigue en un diálogo aparte; adjuntos, tiempo registrado, asignados y campos personalizados no existen | M | Medio |
| 23 | Tiempo real (§10.5) | **NO EXISTE** | — | Ni Realtime ni sondeo | M | Bajo |
| 24 | Deshacer / rehacer (§10.6) | **PARCIAL · casi cerrada** | `lib/projects/undo-stack.ts`, `components/projects/use-undo.ts` | Las tres vistas que pide el spec lo tienen. El Gantt apunta cinco clases de operación (sangrar en lote, renombrar, avance, duración, mover en el árbol), el Tablero apunta el movimiento —comprobado en pantalla: mover, deshacer, la tarjeta vuelve a su columna en la base—. Faltan tres: arrastrar fechas (excluida a propósito, pasa por la previsualización; la reprogramación ya devuelve el antes y el después de todas las líneas empujadas, así que es trabajo y no impedimento), vínculos y altas/bajas — estas dos no caben en la forma `Cambio` y piden ampliar el tipo | L | Bajo |
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
