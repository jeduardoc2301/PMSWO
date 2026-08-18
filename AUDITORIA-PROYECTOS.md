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
| 9 | Restricciones de tarea (§3.4) | **PARCIAL** | `PlanTask.constraint` en memoria | El motor entiende `NO_ANTES_DE` y `DEBE_EMPEZAR_EL`, pero no hay columna: no se capturan ni se guardan. Falta `deadline` | M | Bajo |
| 10 | Roll-up a resúmenes (§3.6) | **EXISTE** | `lib/scheduling/progress.ts` | Nada. Ponderado por trabajo, con hitos en peso cero | — | — |
| 11 | Carga y sobrecarga de recursos (§3.7) | **NO EXISTE** | — | Un solo responsable por tarea (`ownerId`), sin modelo `Assignment`, sin `units` ni `work` | L | Bajo |
| 12 | Jerarquía con `sortOrder` y EDT (§2.3) | **PARCIAL** | `WorkItem.parentId`, `templateOrder` | Jerarquía sí; `sortOrder` y `wbs` no existen | M | Medio |
| 13 | Vista Gantt (§4) | **PARCIAL** | `components/plan/gantt-chart.tsx` | Dibuja barras, vínculos por tipo, ruta crítica y holgura. Falta: arrastrar barras para reprogramar, crear vínculos desde el diagrama, líneas base, zoom persistente | L | Medio |
| 14 | Vista Tablero (§5) | **PARCIAL** | `components/projects/kanban-board.tsx` | Kanban con arrastre, urgencias, avance y atraso. Falta: agrupar por algo distinto de la fase, columnas configurables | M | Bajo |
| 15 | Vista Lista (§6) | **EXISTE** | `work-items-outline.tsx` + `work-items-list.tsx` | Dos modos: esquema multinivel y lista por fase. Cumple lo esencial | S | Bajo |
| 16 | Vista Calendario (§7) | **NO EXISTE** | — | Todo. Cero archivos | L | Bajo |
| 17 | Vista Carga de trabajo (§8) | **NO EXISTE** | — | Todo, y depende de la brecha 11 | L | Bajo |
| 18 | Vista Panel de control (§9) | **NO EXISTE** | — | Los 6 widgets. Hay tablero ejecutivo de portafolio, pero no por proyecto | M | Bajo |
| 19 | Estados configurables (§5) | **NO EXISTE** | `WorkItem.status String` | Texto libre validado solo en TypeScript; no hay `TaskStatusOption` | M | Medio |
| 20 | Líneas base (§3) | **NO EXISTE** | — | Todo | M | Bajo |
| 21 | Preferencias de vista (§10.4) | **NO EXISTE** | — | El plegado, el zoom y las columnas se pierden al recargar | S | Bajo |
| 22 | Filtros unificados (§10.2) | **PARCIAL** | Cada vista trae los suyos | No se comparten entre vistas ni se guardan | M | Bajo |
| 23 | Tiempo real (§10.5) | **NO EXISTE** | — | Ni Realtime ni sondeo | M | Bajo |
| 24 | Deshacer / rehacer (§10.6) | **NO EXISTE** | — | Todo | L | Bajo |
| 25 | Campos personalizados (§2) | **NO EXISTE** | — | Todo | L | Bajo |

**Recuento:** 3 EXISTE · 8 PARCIAL · 11 NO EXISTE · 3 EXISTE PERO MAL · 1 NO APLICA.

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

## Bitácora de cierre de brechas

Cada brecha cerrada actualiza aquí su fila con la fecha y el commit, como pide §0.3.

| Brecha | Cerrada el | Commit | Nota |
|---|---|---|---|
| — | — | — | Ninguna todavía: la construcción arranca tras el punto de control del §0.2 |
