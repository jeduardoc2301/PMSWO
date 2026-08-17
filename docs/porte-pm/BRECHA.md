# Brecha: las 13 capacidades

Diagnóstico levantado el 16 de agosto de 2026 sobre el repositorio y sobre
`referencia/PDT BU V7 - Plan Integrado.xlsx`. Ver [ENCARGO.md](ENCARGO.md) para la definición de
cada capacidad y [BITACORA.md](BITACORA.md) para el avance.

**Cómo llegó** es el diagnóstico de partida. Se llenó una sola vez y no se vuelve a tocar.
**Cómo va** es el avance. **«YA EXISTE» no es «HECHO»**: solo la prueba de aceptación mueve la
segunda columna. Sin ruta de prueba llena, ninguna capacidad puede estar en HECHO.

---

## Tablero

| Capacidad | Cómo llegó | Cómo va | Prueba que lo acredita |
|---|---|---|---|
| **C1** · Dependencias con tipo y desfase | **NO EXISTE** — ningún modelo guarda enlaces entre tareas; el único campo parecido, `Blocker.blockedBy`, es texto libre | **HECHO** | [schedule.test.ts](lib/scheduling/__tests__/schedule.test.ts) · [dependencies.test.ts](lib/scheduling/__tests__/dependencies.test.ts) · [schedule.property.test.ts](lib/scheduling/__tests__/schedule.property.test.ts) · [calendar.test.ts](lib/scheduling/__tests__/calendar.test.ts) · [date.test.ts](lib/scheduling/__tests__/date.test.ts) |
| **C2** · Pase adelante, pase atrás y holgura total | **NO EXISTE** — cero coincidencias de `earlyStart`, `lateFinish`, `totalFloat`, `criticalPath`, `topological` en todo el repositorio | **HECHO** | [cpm.test.ts](lib/scheduling/__tests__/cpm.test.ts) · [cpm.property.test.ts](lib/scheduling/__tests__/cpm.property.test.ts) |
| **C3** · Calendario laboral con feriados | **NO EXISTE** — toda la aritmética del sistema es de días corridos; no hay librería de fechas ni concepto de día hábil en la capa de negocio | **HECHO** | [holidays.test.ts](lib/scheduling/__tests__/holidays.test.ts) · [simulation.test.ts](lib/scheduling/__tests__/simulation.test.ts) · [calendar.test.ts](lib/scheduling/__tests__/calendar.test.ts) |
| **C4** · Ruta crítica y Ruta Súper Crítica | **NO EXISTE** — sin grafo ni holgura no hay sobre qué calcular; lo más cercano es una heurística de salud por SPI | **HECHO** | [plan-referencia.test.ts](lib/scheduling/__tests__/plan-referencia.test.ts) · [critical-path.test.ts](lib/scheduling/__tests__/critical-path.test.ts) |
| **C5** · Compuertas (gates) como objeto propio | **NO EXISTE** — no hay modelo `Gate` ni `Milestone`, y `WorkItem` no tiene campo de tipo | **HECHO** | [gates.test.ts](lib/scheduling/__tests__/gates.test.ts) |
| **C6** · La responsabilidad del cliente como tipo de primera clase | **NO EXISTE** — `WorkItem.ownerId` exige que el responsable pertenezca a la organización proveedora; `Project.client` es solo un nombre | **HECHO** | [client-commitments.test.ts](lib/scheduling/__tests__/client-commitments.test.ts) |
| **C7** · Avance ponderado por trabajo real | **PARCIAL** — los insumos están en la base (`estimatedHours`, `plannedHours`) pero el avance se calcula por conteo binario de tareas en cuatro lugares | **HECHO** | [progress.test.ts](lib/scheduling/__tests__/progress.test.ts) · [plan-referencia.test.ts](lib/scheduling/__tests__/plan-referencia.test.ts) |
| **C8** · Motor de auditoría permanente | **NO EXISTE** — `lib/services/audit-logger.ts` audita seguridad (accesos, roles), no consistencia del plan | **HECHO** | [audit.test.ts](lib/scheduling/__tests__/audit.test.ts) · [plan-referencia.test.ts](lib/scheduling/__tests__/plan-referencia.test.ts) |
| **C9** · Trazabilidad por línea | **PARCIAL** — `WorkItemChange` registra quién cambió qué campo y cuándo; falta de dónde salió la línea | **HECHO** | [traceability.test.ts](lib/scheduling/__tests__/traceability.test.ts) |
| **C10** · Criterios de salida verificables | **NO EXISTE** — no hay campo de entregable ni de criterio de salida en ningún modelo | **HECHO** | [exit-criteria.test.ts](lib/scheduling/__tests__/exit-criteria.test.ts) · [plan-referencia.test.ts](lib/scheduling/__tests__/plan-referencia.test.ts) |
| **C11** · Gantt con estas capacidades | **PARCIAL** — hay una línea de tiempo, pero inventa las fechas que faltan con un desplazamiento pseudoaleatorio | **HECHO** | [gantt.test.ts](lib/scheduling/__tests__/gantt.test.ts) (41) · [gantt-chart.test.tsx](components/plan/__tests__/gantt-chart.test.tsx) (24) · [plan-referencia.test.ts](lib/scheduling/__tests__/plan-referencia.test.ts) (10) |
| **C12** · Documentación que se calcula sola | **PARCIAL** — el reporte Word ya calcula sus cifras en el servidor y se las entrega a la IA como hechos; el patrón es correcto y no hay plan del cual sacar cifras | **HECHO** | [plan-summary.test.ts](lib/scheduling/__tests__/plan-summary.test.ts) |
| **C13** · Vista ejecutiva | **PARCIAL** — hay tablero ejecutivo con puntaje de salud y tendencia; no responde fecha de cierre, margen, qué lo mueve ni qué depende del cliente | **HECHO** | `lib/scheduling/__tests__/executive-brief.test.ts` (20) · `components/plan/__tests__/executive-brief-panel.test.tsx` (12) |

**Recuento del diagnóstico:** 8 en NO EXISTE, 5 en PARCIAL, 0 en YA EXISTE.

**Avance:** **13 en HECHO** · 0 en PENDIENTE · 0 en EN CURSO · 0 DESCARTADA. **Las cuatro fases cerradas.**

---

## El diagnóstico, capacidad por capacidad

### C1 · Dependencias con tipo y desfase — NO EXISTE

Los 20 modelos del esquema no incluyen ninguna relación tarea→tarea. El único grafo entre entidades
es `AgreementWorkItem` ([prisma/schema.prisma:262](prisma/schema.prisma#L262)), una relación N:M entre
acuerdo y tarea. `Blocker.blockedBy` ([prisma/schema.prisma:186](prisma/schema.prisma#L186)) es un
`String` que describe quién bloquea, no una llave foránea. No hay enumeración de tipo de vínculo en
`types/index.ts`.

Lo que exige el archivo de referencia: la notación viene en **inglés y separada por coma**, no por
punto y coma —`288,302FF,258FS+3 days`—. El token desnudo (`288`) es FS. Gramática observada:
`<id>[FS|SS|FF|SF][+|-<n> day(s)]`.

### C2 · Pase adelante, pase atrás y holgura total — NO EXISTE

Búsqueda de `earlyStart`, `earlyFinish`, `lateStart`, `lateFinish`, `totalFloat`, `freeFloat`,
`holgura`, `topological`, `criticalPath`: cero resultados en `.ts`, `.tsx` y `.prisma`.

Existe un generador de fechas de una sola pasada,
[services/template-application.service.ts:204-262](services/template-application.service.ts#L204-L262),
que encadena las actividades de una plantilla en serie estricta y calcula el fin sumando las horas
estimadas como milisegundos de reloj corrido
([:241-242](services/template-application.service.ts#L241-L242)). Una actividad de 40 horas termina
1.67 días después, sábado y domingo incluidos, a media madrugada. No hay recálculo: mover una tarea
no mueve nada.

**Defecto que hay que resolver antes de tocar el motor:** el asistente de plantillas convierte a días
con `Math.ceil(duración / 8)` ([components/templates/date-assignment-step.tsx:126-129](components/templates/date-assignment-step.tsx#L126-L129))
mientras el servidor suma horas de reloj. Para 40 horas el usuario ve 5 días y la base guarda 1.67.
Las fechas que se aprueban no son las que se persisten.

### C3 · Calendario laboral con feriados — NO EXISTE

No hay tabla de calendario ni de feriados, ni función de día hábil, ni librería de fechas instalada
(cero referencias a `date-fns`, `dayjs`, `luxon`, `moment`; se usa `Date` nativa). Los únicos lugares
que reconocen el fin de semana son de presentación:
[components/ui/date-picker.tsx:190](components/ui/date-picker.tsx#L190) lo pinta y
[timeline-tab.tsx:112](components/projects/timeline/timeline-tab.tsx#L112) alinea el eje al lunes.

El libro de referencia trae una séptima hoja, **«Días feriados de Colombia»**, con 30 filas. El plan
está construido de lunes a viernes **sin feriados aplicados**, y 9 de esos feriados caen dentro de su
ventana en día hábil. Es decir: la hoja existe y el plan la ignora. Eso convierte a C3 y a su
simulación en una capacidad con caso de prueba real y consecuencias medibles.

### C4 · Ruta crítica y Ruta Súper Crítica — NO EXISTE

Sin C1 ni C2 no hay sobre qué calcular. Lo más cercano es
[services/health-config.service.ts:103-167](services/health-config.service.ts#L103-L167), que deriva
un índice de avance y clasifica en CRÍTICO / EN RIESGO / A TIEMPO. Es criticidad de estado, no de
ruta, y no aporta al cálculo.

En el archivo de referencia la Ruta Súper Crítica **sí es dato duro**: la columna S del plan marca
276 líneas con tres valores —«Sí · Decide un tercero» 174, «Sí · Tiempo transcurrido» 58, «Sí · Fecha
pactada» 44— que corresponden exactamente a las tres familias del encargo. Las 276 son líneas hoja.
El reparto cliente/proveedor vive en la hoja 3, columna «Depende de»: Banco Unión 131, SoftwareOne
102, Ambos (comité) 43.

### C5 · Compuertas (gates) como objeto propio — NO EXISTE

No hay modelo `Gate` ni `Milestone`, y `WorkItem` no tiene campo de tipo, así que no se puede
distinguir una tarea de una compuerta. Los «hitos» que muestra la interfaz se sintetizan en memoria
como la fecha máxima de cada fase ([timeline-tab.tsx:170-187](components/projects/timeline/timeline-tab.tsx#L170-L187))
y no se persisten.

El archivo de referencia sí las modela, y de una forma que conviene copiar: los **4 Habilitadores**
(IDs 414, 425, 436, 444) son las únicas filas con duración cero e **inicio distinto de fin**. No son
hitos: son ventanas de compuerta. Un motor que asuma «duración cero implica inicio igual a fin» los
rompe.

### C6 · La responsabilidad del cliente como tipo de primera clase — NO EXISTE

`WorkItem.ownerId` es llave foránea obligatoria a `User`, y
[services/workitem.service.ts:128-130](services/workitem.service.ts#L128-L130) exige que el
responsable comparta organización con el proyecto. Con el mecanismo actual **no se puede nombrar
responsable a alguien del cliente**. `Project.client` ([prisma/schema.prisma:66](prisma/schema.prisma#L66))
es un `String` con el nombre, no una entidad ni un rol.

En la referencia son 178 líneas y están como dato filtrable en la columna «Tipo»: 130 «Prerrequisito
Banco» + 48 «Aprobación Banco». Ojo con no confundirlas: la columna «Participa Banco Unión» marca
716 líneas, pero eso es participación, no responsabilidad.

### C7 · Avance ponderado por trabajo real — PARCIAL

Todo el avance del sistema es conteo binario: `completadas / totales * 100`, repetido en cuatro
lugares ([project.service.ts:739-741](services/project.service.ts#L739-L741),
[dashboard.service.ts:216-218](services/dashboard.service.ts#L216-L218) y
[:351-353](services/dashboard.service.ts#L351-L353),
[health-config.service.ts:120-123](services/health-config.service.ts#L120-L123)). Una tarea está
terminada o no; no hay porcentaje por tarea.

Los insumos para ponderar sí están en la base y nadie los usa en la lógica: `WorkItem.estimatedHours`
y `Project.plannedHours`. Por eso el diagnóstico es PARCIAL y no NO EXISTE.

**Consecuencia que hay que manejar:** ese número alimenta el índice de avance de
`health-config.service.ts`. Cambiar el numerador reclasifica la salud de todo el portafolio y deja
incomparables los `PortfolioHealthSnapshot` ya guardados.

El archivo de referencia resuelve la ponderación con una columna **oculta** llamada «Peso»: las 125
líneas de resumen calculan su avance con `SUMPRODUCT(Peso, %avance) / SUM(Peso)`.

### C8 · Motor de auditoría permanente — NO EXISTE

[lib/services/audit-logger.ts](lib/services/audit-logger.ts) audita seguridad —accesos, cambios de
rol, altas y bajas—, no consistencia del plan. No hay motor de reglas ni catálogo de controles.

El plan de referencia da los casos de prueba servidos: 27 vínculos cuya predecesora es una fila
resumen (control 9), 6 desfases negativos que hay que reportar sin fallar (control 17), 9 filas cuyas
fechas no cuadran con sus enlaces, y cuatro contradicciones internas de su propia hoja de
instrucciones que ilustran por qué C12 importa.

### C9 · Trazabilidad por línea — PARCIAL

`WorkItemChange` ([prisma/schema.prisma:164-178](prisma/schema.prisma#L164-L178)) guarda campo, valor
anterior, valor nuevo, autor y fecha, y se escribe dentro de la misma transacción que la
actualización. Cubre el «quién cambió qué», que es justo lo que un motor de calendarización necesita
bitacorear.

Falta el «de dónde salió»: la tarea creada desde una plantilla descarta el identificador de la
actividad de origen ([template-application.service.ts:158-174](services/template-application.service.ts#L158-L174))
y solo conserva `templateOrder`, un entero de posición aplanada.

El archivo de referencia tiene una columna **Q «Trazabilidad»** dedicada a esto.

### C10 · Criterios de salida verificables — NO EXISTE

No existe campo `deliverable` ni `exitCriteria` en ningún modelo. Lo más cercano es
`Agreement.description` y `Blocker.resolution`, texto libre que no es criterio por tarea.

En la referencia son las columnas N «Entregable / evidencia» y O «Criterio de salida», y su
integridad es notable: **las dos están llenas exactamente en las mismas 1 258 filas**, y las 110
vacías son todas de resumen. Las 1 243 líneas hoja traen ambas sin una sola excepción. El propio
libro define el criterio como «la regla que decide si la línea está cerrada; debe poder verificarla
un tercero sin preguntarle a nadie».

### C11 · Gantt con estas capacidades — HECHO

Existe [components/projects/timeline/timeline-tab.tsx](components/projects/timeline/timeline-tab.tsx),
pero cuando a una tarea le faltan fechas **las inventa**: divide la ventana del proyecto entre el
número de fases, desplaza con un factor pseudoaleatorio (`globalIdx * 37`) y asigna duración según
prioridad ([:72-94](components/projects/timeline/timeline-tab.tsx#L72-L94)). Es decoración, no plan.

Del Gantt de referencia hay decisiones que vale la pena conservar —el plegado de flechas al ancestro
visible reduce 1 665 vínculos a 52 y es lo que lo hace legible; el resaltado bicolor de entrantes y
salientes; preservar plegado, selección y desplazamiento al recargar— y defectos que **no** conviene
heredar: dibuja FF y SF con la geometría de FS (miente en 159 vínculos), parsea el desfase y no lo
usa (394 vínculos con desfase de −22 a +46 días se ven como si fueran cero), y mide el ancho de la
barra en días calendario mientras todos los textos hablan de días hábiles.

Se resolvió en dos capas, igual que C13. El trazado
([lib/scheduling/gantt.ts](lib/scheduling/gantt.ts)) calcula **dónde va cada cosa** y devuelve
geometría en unidades de día hábil; la vista
([components/plan/gantt-chart.tsx](components/plan/gantt-chart.tsx)) multiplica por el ancho de un
día y no hace más aritmética. La separación no es estética: la línea de tiempo que ya existía
inventaba fechas **en el componente**, y una vista que puede inventar datos termina inventándolos.

Las cuatro reglas del trazado, cada una contra un defecto medido de la referencia:

| Regla | Qué corrige | Medido en el archivo |
|---|---|---|
| Cada tipo se ancla donde amarra | La referencia dibuja `FF` y `SF` con geometría de `FS` | 159 vínculos fin-fin, ahora anclados de fin a fin |
| La barra se mide en días hábiles | La referencia la mide en días de calendario | ninguna de las 1 243 hojas se estira por cruzar un fin de semana |
| El desfase llega al dibujo con su signo | La referencia lo parsea y lo descarta | 394 con desfase, 6 de ellos negativos |
| Al plegar, las flechas se pliegan y se cuentan | La referencia pliega pero no dice cuántas representa | 1 665 flechas se leen como 55 al nivel de etapas |

Y una regla que la referencia no tiene: **una flecha se pinta como crítica solo si de verdad empuja**.
Que sus dos puntas sean críticas no basta —una tarea crítica puede tener cuatro predecesoras críticas
y solo una la está empujando—. El trazado usa el vínculo conductor que ya guardaba el pase adelante.

El filtro de ruta súper crítica deja 312 líneas y conserva los 66 resúmenes de los que cuelgan: sin
ellos queda una lista de tareas sueltas sin la etapa de la que salen, que es la respuesta sin la
pregunta.

### C12 · Documentación que se calcula sola — PARCIAL

El patrón correcto **ya existe y funciona**:
[app/api/v1/ai/generate-report/docx/route.ts:74-122](app/api/v1/ai/generate-report/docx/route.ts#L74-L122)
calcula las cifras en el servidor y se las entrega a la IA como hechos, con respaldo explícito: si la
narrativa falla, el documento sale igual con las cifras. Solo cambia el origen de los datos.

La referencia demuestra por qué la regla importa: su hoja de instrucciones afirma cuatro cifras que
contradicen a sus propios datos —el reparto por nivel suma 1 354 en vez de 1 368; dice 322 líneas de
un responsable cuando son 328; dice 66 hitos cuando son 86; y menciona 3 desfases negativos cuando
hay 6—.

### C13 · Vista ejecutiva — HECHO

Hay tablero ejecutivo con puntaje de salud por factores y tendencia semana contra semana
([services/dashboard.service.ts](services/dashboard.service.ts)), y ya se genera un informe Word con
tono ejecutivo. Lo que no respondía es lo que pide el encargo: en qué fecha cierra, cuánto margen hay,
qué lo puede mover y qué depende del cliente.

Se resolvió en dos capas. El motor
([lib/scheduling/executive-brief.ts](lib/scheduling/executive-brief.ts)) arma el informe a partir del
resumen del plan y de los compromisos del cliente, y escribe la prosa. La vista
([components/plan/executive-brief-panel.tsx](components/plan/executive-brief-panel.tsx)) solo dibuja:
no consulta la base, no llama al motor y no arma texto propio. Si esta pantalla mostrara una cifra
que no está en el informe, esa cifra estaría escrita a mano, que es justo lo que C12 prohíbe.

El tono es la mitad del trabajo y por eso está bajo prueba. Un plan armado hacia atrás desde una
fecha de compromiso sale con casi todo crítico —en el de referencia, nueve de cada diez líneas—, y
presentarlo como alarma es a la vez alarmista y falso. El informe lo explica como consecuencia
aritmética de haberlo armado para caber en una fecha. El reparto entre cliente y proveedor hay que
decirlo —si no, el proveedor carga con atrasos que no controla— y decirlo como reproche arruina la
reunión: se dice como mapa de quién puede desatorar qué. Hay una prueba que prohíbe la palabra
«culpa» en todo el informe, **incluso para negarla**; atrapó una primera versión que decía «no es un
reparto de culpas», porque nombrar la culpa planta el marco que se quería evitar.

Nota de configuración, no de capacidad: el componente y su prueba importan `React` de forma
explícita. El repositorio compila JSX en modo clásico —[tsconfig.json](tsconfig.json) usa
`jsx: "preserve"` y [vitest.config.ts](vitest.config.ts) no fija `esbuild.jsx` ni carga el plugin de
React—, así que sin ese import las pruebas fallan con «React is not defined». Es el mismo defecto que
hoy tiene en rojo a 15 pruebas de [components/ui/date-picker.tsx](components/ui/date-picker.tsx). Se
resolvió con el import local en vez de tocar la configuración global, que es un cambio de una línea
pero afecta a todo el repositorio; queda propuesto en la bitácora.

---

## Riesgo sobre la condición 3 del cierre

La condición 3 exige reproducir tres cosas con tolerancia cero. Medidas contra el archivo, **dos son
verificables con exactitud y una no lo es**.

| Cifra | Estado | Detalle |
|---|---|---|
| **Fecha de cierre del plan** | ✅ verificable | **2026-11-30**, lunes. Máximo de la columna F. La comparten 17 filas; la última es el ID 1368, «HITO · Compromiso contractual cumplido». El plan arranca el 2026-06-12 y abarca 122 días hábiles |
| **Ruta súper crítica y reparto cliente/proveedor** | ✅ verificable | **276** líneas en la columna S (174 / 58 / 44 por familia) y **131** Banco Unión, 102 SoftwareOne, 43 Ambos en la hoja 3. Confirmado por dos caminos independientes que coinciden |
| **Tareas con holgura cero** | ⛔ **no reproducible** | Ver abajo |

**No existe columna de holgura, ni de ruta crítica, ni de fechas tardías en ninguna de las 7 hojas.**
Se barrieron las 30 846 celdas del libro buscando «holgura», «slack», «float» y «margen»: solo hay
5 menciones en prosa. La cifra **932 aparece únicamente como texto narrativo** en
`'Ruta Súper Crítica'!A4`, y ese texto ni siquiera dice 74 %: dice «cerca de 75 de cada cien»
(932 / 1 243 = 74.98 %).

La reconstrucción del método del camino crítico sobre el plan da **882 tareas con holgura total cero**
(70.96 %), más 245 con holgura negativa y 116 con holgura positiva. Se probaron ocho definiciones
distintas —holgura total ≤ 0, terminales anclados a su propio fin, sobre las 1 368 filas en vez de
las 1 243, holgura libre— y **ninguna arroja 932**.

Hay dos hallazgos que explican parte de la diferencia y que el motor tendrá que decidir:

1. **La convención del desfase negativo no es la de MS Project.** Los 388 desfases positivos siguen
   la regla estándar (`inicio = fin_predecesora + 1 + desfase`), pero los **6 negativos** se
   aplicaron sin el `+1`. Al recalcular con la regla estándar, las líneas 30, 46, 64, 468, 796 y 878
   se corren un día y arrastran holgura negativa: 228 de las 245 holguras negativas valen exactamente
   −1 día. Es la misma clase de error de un solo día que el encargo describe en C2 para el hito
   fin-fin.
2. **Tres filas tienen fechas metidas a mano que contradicen sus enlaces.** Las líneas 157 y 180
   arrancan 3 y 8 días hábiles después de lo que exige su vínculo comienzo-comienzo, que es holgura
   libre deliberada. La línea 182 arranca **4 días hábiles antes** de lo que exige su predecesora: eso
   no es holgura, es una violación de enlace que cualquier motor corregiría empujando la línea.

**Cómo se procedió, y qué salió.** No se inventó el 932 ni se ajustó el motor hasta que diera esa
cifra: eso sería exactamente lo que el encargo prohíbe. Se midió, y el resultado está acreditado en
[plan-referencia.test.ts](lib/scheduling/__tests__/plan-referencia.test.ts), 28 pruebas contra el
archivo real.

**Las dos primeras salen exactas.**

- **Fecha de cierre: 2026-11-30.** El motor la reproduce reprogramando el plan completo desde su
  fecha de arranque, y también respetando las fechas del archivo como piso. En este segundo modo,
  **1 363 de las 1 368 líneas caen exactamente donde el archivo dice**.
- **Ruta súper crítica: 276 líneas**, repartidas en 174 «decide un tercero», 58 «tiempo transcurrido»
  y 44 «fecha pactada», con **131 del cliente y 145 del proveedor**. Leídas y clasificadas sin
  desviación.

**La tercera se midió cuatro veces y ninguna da 932:**

| Lectura | Tareas con holgura cero |
|---|---|
| Reprogramando lo más pronto posible, plazo hasta el cierre del plan | **796** |
| Reprogramando, terminales ancladas a su propio fin | **888** |
| Respetando las fechas del archivo, plazo hasta el cierre | **1 127** |
| Respetando las fechas, terminales ancladas a su propio fin | **1 209** |

El 932 queda entre la segunda y la tercera, y no coincide con ninguna. Se agrega la prueba de que no
hay de dónde leerlo: **ninguna hoja del libro tiene una columna llamada holgura, slack, float ni
margen**. Toda cifra de holgura que el sistema publique irá acompañada del criterio con que se
calculó, que es justo lo que exige C12.

**Hallazgo que cambia la lectura de la fecha de cierre.** El archivo aplica sus **6 desfases
negativos** con una convención distinta a la de sus 388 positivos: `inicio = fin + desfase`, sin el
día de separación de MS Project. Con la regla estándar el plan cierra el **2026-12-02**; con la del
archivo, el **2026-11-30**. Dos días hábiles, y de ahí salen las 228 holguras negativas de −1 día que
apareció en el diagnóstico. La convención se declara al importar y, si no se declara, la importación
lo advierte nombrando las seis líneas: 30, 46, 64, 468, 796 y 878.

**Y una corrección al enunciado del encargo.** El encargo advierte que un hito de duración cero
enlazado en fin-comienzo donde debería ir fin-fin corre el plan. La regla es cierta y el motor la
implementa bien, pero **el plan de referencia no tiene ese defecto**: se buscaron los hitos que el
archivo coloca el mismo día que su predecesora enlazados en fin-comienzo, y son **cero**. Sus 159
vínculos fin-fin ya están donde deben.

---

## Fuera del alcance de las 13, pero en la ruta

Tres cosas que el diagnóstico encontró y que van a estorbar si no se atienden. Ninguna se impone: se
anota y se propone.

**1. La batería de pruebas ya está roja.** Línea base medida hoy: **37 de 73 archivos pasan y 973 de
1 232 pruebas pasan**. Los 259 fallos son deuda previa, ninguno causado por este encargo. Las causas
dominantes son claves de idioma que las pruebas de componente no tienen, `React is not defined` en
`components/ui/date-picker.tsx:157`, y mocks de Prisma desactualizados. Además `npm run type-check`
arroja 782 errores, de los que **778 están en archivos de prueba y solo 4 en código real**.

*Lectura operativa:* «no rompas lo que ya funciona» se ancla a **973 pruebas y 37 archivos**, no a
«todo verde». Y el código nuevo sí se puede exigir con cero errores de tipos, porque el código real
casi lo está.

**2. Los 20 mocks de Prisma escritos a mano son el riesgo real.** Cada uno declara solo los modelos
que esa prueba cree necesitar. Agregar un modelo que un servicio ya probado empiece a consultar tumba
la prueba con `Cannot read properties of undefined`. **Ya está pasando**: `dashboard.service.test.ts`
tiene 12 fallos porque su mock no incluye `projectHealthConfig`. C1, C3 y C5 agregan modelos nuevos,
así que conviene un mock compartido **antes** de tocar el esquema.

**3. No hay base de datos local.** `DATABASE_URL` apunta a RDS en AWS. No hay Docker, ni servicio
MySQL, ni binarios `mysql`/`mysqldump`, ni nada escuchando en el 3306. Por eso el motor se construye
como módulo puro sin base: se prueba completo y sin riesgo, y la persistencia se conecta después.

---

## Dónde va a vivir el motor

El repositorio ya tiene el molde exacto: [lib/rbac.ts](lib/rbac.ts) con su prueba
[lib/\_\_tests\_\_/rbac.test.ts](lib/__tests__/rbac.test.ts), que importa funciones puras del módulo
hermano, importa `describe`/`it`/`expect` explícitamente de `vitest` —lo que evita los errores de
tipos— y no declara un solo `vi.mock`.

```
lib/scheduling/
  calendar.ts        C3 · días hábiles, feriados, Pascua, Ley Emiliani, simulación
  dependencies.ts    C1 · los cuatro tipos de vínculo, desfase con signo, detección de ciclos
  cpm.ts             C2 · pase adelante, pase atrás, holgura total
  critical-path.ts   C4 · ruta crítica y clasificación de la súper crítica
  progress.ts        C7 · avance ponderado por trabajo real
  audit.ts           C8 · los 17 controles
  import-xlsx.ts     lector del plan de referencia
  __tests__/         una prueba por módulo, más *.property.test.ts con fast-check
```

Las entradas son estructuras planas propias, **no modelos de Prisma**, para que el motor sea probable
sin base y las capas de servicio se limiten a traducir. `fast-check` ya está instalado, ya se usa en
dos archivos y **ambos están en verde**: es el vehículo natural para las propiedades de C2 y C4.
