# Bitácora del porte

Se anota al cierre de cada tramo: qué se tocó, qué pruebas se agregaron y si pasan, qué se encontró
que no se esperaba, qué preguntas quedaron abiertas y cuál es la siguiente capacidad.

Si el contexto se compacta, este archivo es lo que devuelve el hilo. Leerlo antes de retomar, junto
con [ENCARGO.md](ENCARGO.md) y [BRECHA.md](BRECHA.md).

---

## Tramo 0 — Arranque y diagnóstico

**Estado:** CERRADO. `BRECHA.md` escrito con las 13 filas: 8 en NO EXISTE, 5 en PARCIAL, 0 en YA
EXISTE, y las 13 en PENDIENTE. Sin código tocado.

### Qué se tocó

Nada de código. Solo se crearon documentos:

- `docs/porte-pm/ENCARGO.md` — el encargo completo, palabra por palabra. Es la fuente de verdad.
- `docs/porte-pm/BITACORA.md` — este archivo.

### Reconocimiento del terreno (lectura directa, antes de delegar)

El stack quedó confirmado: Next.js 15 con App Router, Prisma 5 sobre MySQL, NextAuth v5, Vitest,
next-intl, Tailwind 4, zod. Node 26 y Python 3.12 disponibles. 438 archivos versionados, 73 archivos
de prueba, 11 migraciones aplicadas.

Dato que ya está en dependencias y sirve: `fast-check` para pruebas basadas en propiedades, `docx`
para generar reportes, `react-google-charts` y `recharts` para gráficas.

### Lo que se encontró y no se esperaba

**1. Este sistema no tiene motor de planeación. Tiene un tablero kanban.**

La unidad de trabajo es `WorkItem` (`prisma/schema.prisma:126`): título, descripción, fase como texto
libre, estado, prioridad, fecha de inicio, fecha estimada de fin, horas estimadas y columna de kanban.
Las fechas se capturan a mano y nada las deriva.

No existe, en ninguno de los 20 modelos del esquema:

- jerarquía padre/hijo, nivel, distinción entre resumen y hoja, ni orden consecutivo de plan
- dependencia entre tareas de ninguna forma, ni tipo de vínculo, ni desfase
- duración en días hábiles, fechas tempranas o tardías, holgura
- hito de duración cero
- calendario laboral ni tabla de feriados
- entregable, criterio de salida ni trazabilidad de origen
- marca de responsabilidad del cliente
- compuerta o *gate*

Consecuencia para el plan de trabajo: **la Fase 1 completa (C1, C2, C3) es construcción desde cero**,
no un ajuste al modelo existente. Y como las fases 2 a 4 se apoyan en ella, el orden del encargo
—fase por fase, sin adelantarse— no es una formalidad: es la única secuencia viable.

**2. La base de datos configurada es compartida y remota, no local.**

`DATABASE_URL` en `.env.local` apunta a una instancia de RDS en AWS
(`swo-projects.…us-east-1.rds.amazonaws.com:3306/pm`), no a un MySQL de esta máquina.

Decisión tomada, y la razón: **no se corre `prisma migrate dev` contra esa base.** Un `migrate dev`
puede reescribir el historial de migraciones y, ante una desviación, ofrecer reiniciar la base. Sobre
una instancia compartida eso es destructivo y no es reversible desde aquí.

La estrategia que se adopta en consecuencia:

- El motor de cálculo se construye como **módulo puro de TypeScript, sin base de datos**: recibe
  tareas y vínculos en memoria, devuelve fechas, holguras y clasificaciones. Se prueba con casos
  fijos y con `fast-check`. Así C1 a C4 y C7 quedan acreditadas sin tocar persistencia.
- Los cambios de esquema se **escriben** como migración pero **no se aplican** a RDS sin
  confirmación explícita.
- La verificación de la condición 3 del cierre —importar el xlsx y reproducir fecha de cierre,
  holgura cero y reparto cliente/proveedor— se hace **contra el motor puro**, leyendo el archivo
  directamente. No necesita base de datos.

Esto no reduce el alcance: lo reordena para no arriesgar datos ajenos.

### Reconocimiento delegado, en curso

Ocho agentes de solo lectura, ninguno modifica archivos:

| Frente | Qué levanta |
|---|---|
| Modelo de datos | esquema completo, convenciones que un modelo nuevo debe respetar, migraciones |
| Motor de cálculo | qué lógica temporal existe hoy y qué es reutilizable para C2, C3 y C7 |
| API y contratos | patrón obligatorio de una ruta nueva: `withAuth`, permisos, zod, errores, multi-tenant |
| Pruebas | convenciones, cómo se simula Prisma, y **la línea base**: qué pasa hoy y qué falla |
| Interfaz e i18n | páginas, componentes, qué hay de visualización temporal, los *design handoffs* sin versionar |
| Excel · estructura | las 7 hojas, columnas exactas, qué objetos viven ahí |
| Excel · vínculos y cifras | los ~1 660 vínculos con su tipo y desfase, y verificación de cada cifra afirmada |
| Gantt · interacciones | interacciones a conservar y, sobre todo, el contrato de datos columna → concepto |

La instrucción al agente de cifras fue explícita: **medir, no asumir**. Si el archivo trae columnas de
holgura y de clasificación, se usan; si esas cifras solo aparecen en texto narrativo, tiene que
decirlo, porque cambia qué debe calcular el motor por sí mismo.

### Resultados del reconocimiento

Las cifras y la evidencia por capacidad están en [BRECHA.md](BRECHA.md). Aquí queda solo lo que
cambia el plan de trabajo.

**El archivo de referencia quedó medido, no supuesto.** Hoja «Plan», 1 368 líneas (filas 7 a 1374,
ID consecutivo 1..1368), 19 columnas, 125 resúmenes y 1 243 hojas. **1 665 vínculos** —no ~1 660—
repartidos en FS 704, SS 802, FF 159 y **SF cero**. 394 llevan desfase, de −22 a +46 días, y solo 6
son negativos. Integridad perfecta: ninguna predecesora inexistente, ninguna autorreferencia, ningún
par duplicado y **ninguna predecesora apuntando hacia adelante**, que es justo lo que exige la regla
de interoperabilidad con MS Project. Fecha de cierre **2026-11-30**; arranque 2026-06-12; 122 días
hábiles. Calendario lunes a viernes sin feriados, y consistente al 100 %: cero fechas en fin de
semana y cero filas donde los días hábiles del rango no coincidan con la duración declarada.

**Cuatro cifras del encargo se confirmaron como dato duro** —1 368 líneas, 1 243 tareas, 276 de ruta
súper crítica con reparto 174/58/44, y 131 que dependen del banco por dos caminos independientes—.
**Dos no.** El total de vínculos es 1 665, no ~1 660. Y la de fondo, abajo.

### Lo que se encontró y no se esperaba

**1. El 932 no es reproducible desde el archivo.** No existe columna de holgura, slack, float ni
margen en ninguna de las 7 hojas; se barrieron las 30 846 celdas del libro. El 932 vive solo como
prosa en `'Ruta Súper Crítica'!A4`, que además dice «cerca de 75 de cada cien», no 74 %. La
reconstrucción por método del camino crítico da **882** con holgura total cero (70.96 %). Se probaron
ocho definiciones y ninguna arroja 932.

Se procede sin inventar la cifra: el motor calcula con semántica estricta de MS Project, la prueba de
aceptación fija con tolerancia cero la fecha de cierre y el reparto de la ruta súper crítica —que sí
son dato duro—, y para la holgura fija el número que produce el motor bajo semántica declarada,
explicando la diferencia. El detalle y el razonamiento están en la sección «Riesgo sobre la condición
3 del cierre» de `BRECHA.md`.

**2. El plan de referencia tiene su propia versión del error de un día que describe C2.** Los 388
desfases positivos siguen la regla estándar; los 6 negativos se aplicaron sin el `+1`. Al recalcular
con la regla correcta, seis líneas se corren un día y arrastran holgura negativa: **228 de las 245
holguras negativas valen exactamente −1 día**. El encargo advierte de este error para el hito
fin-fin; aquí aparece por otra vía, y confirma que la advertencia no era teórica.

**3. La batería de pruebas ya estaba roja antes de empezar.** Línea base: **37 de 73 archivos y 973
de 1 232 pruebas pasan**. `npm run type-check` arroja 782 errores, pero **778 están en archivos de
prueba y solo 4 en código real**. Ningún fallo lo causó este encargo. La línea base contra la que hay
que medir es 973/37, y está enumerada archivo por archivo en el diagnóstico.

**4. Los 20 mocks de Prisma artesanales son el riesgo real de romper cosas.** Cada prueba declara a
mano los modelos que cree necesitar; agregar un modelo que un servicio ya probado consulte tumba la
prueba en silencio. Ya está pasando: `dashboard.service.test.ts` tiene 12 fallos porque su mock no
incluye `projectHealthConfig`. C1, C3 y C5 agregan modelos, así que conviene un mock compartido antes
de tocar el esquema.

**5. El asistente de plantillas y el servidor calculan fechas distinto.** El servidor suma horas como
milisegundos de reloj corrido; el asistente divide entre 8 y suma días. Para 40 horas el usuario ve
5 días y la base guarda 1.67. Hay que unificarlo en una sola función antes de que el motor herede la
ambigüedad.

**6. La hoja de feriados existe y el plan la ignora.** El libro trae «Días feriados de Colombia» con
30 filas, y 9 de esos feriados caen dentro de la ventana del plan en día hábil. Eso le da a C3 un
caso de prueba real: la simulación tiene un corrimiento concreto que medir.

### Preguntas abiertas

1. **¿De dónde sale el 932?** Ver arriba. Es la decisión más cara del encargo. Se avanza con
   semántica declarada; si aparece el algoritmo original, se ajusta.
2. **¿Qué convención de desfase negativo adopta el motor?** ¿Se replica la anomalía del archivo o se
   corrige a la regla de MS Project? Se implementa la regla estándar y se deja la anomalía como
   hallazgo del control 17 de la auditoría, que reporta sin fallar.
3. **¿Qué se hace con la línea 182?** Su inicio guardado es 4 días hábiles anterior a lo que exige su
   predecesora. No es holgura, es violación de enlace. ¿Manda la fecha o manda el vínculo?
4. **¿Las fechas calculadas sobrescriben las capturadas, o van en columnas nuevas dejando las
   capturadas como línea base?** Hoy no existe concepto de línea base en el esquema.
5. **¿Un gate es un `WorkItem` con tipo distinto o una entidad aparte?** La primera opción hereda
   tablero, bloqueos y acuerdos gratis; la segunda es más limpia y duplica plomería.
6. **¿La responsabilidad del cliente exige usuarios reales del lado del cliente, o basta una etiqueta
   de parte responsable sin cuenta?** Hoy el servicio rechaza cualquier responsable fuera de la
   organización proveedora.
7. **¿El avance ponderado reemplaza el conteo binario o convive con él?** De eso depende si los
   snapshots de portafolio ya guardados quedan comparables.
8. **¿Se autoriza tocar `vitest.config.ts` y `tsconfig.json`?** Dos líneas —`types: ["vitest/globals"]`
   y `esbuild.jsx: 'automatic'`— desbloquean 304 errores de tipos y 15 fallos. No se tocan sin
   permiso: son configuración global y podrían mover la línea base.

### Resuelto en este tramo

- **La fecha de compromiso del plan es 2026-11-30**, y es el hito ID 1368 «Compromiso contractual
  cumplido». El control 15 de la auditoría ya tiene contra qué medir.
- **El calendario del plan de referencia es lunes a viernes sin feriados**, declarado por el propio
  archivo y verificado celda a celda. Colombia 2026 sigue siendo el caso de prueba de C3, y la hoja
  de feriados del libro da el caso de simulación.
- **No hay base de datos local.** Ni Docker, ni servicio MySQL, ni binarios `mysql`/`mysqldump`, ni
  nada escuchando en el 3306, ni rastro histórico de un `.env` apuntando a localhost. Confirmado.

### Siguiente

C1 · Dependencias con tipo y desfase. El motor nace en `lib/scheduling/` como módulo puro, siguiendo
el molde de `lib/rbac.ts` con su prueba: funciones puras, importación explícita de `vitest`, cero
`vi.mock`, cero contacto con Prisma.

---

## Tramo 1 — C1 · Dependencias con tipo y desfase

**Estado:** CERRADO. C1 pasa a HECHO.

### Qué se tocó

Nace el motor, como módulo puro en `lib/scheduling/`. Sin Prisma, sin React, sin peticiones: recibe
tareas y vínculos en memoria y devuelve fechas. El molde es `lib/rbac.ts` con su prueba.

- `lib/scheduling/date.ts` — fechas civiles. Una fecha del plan es el número de días desde el 1 de
  enero de 1970, no un `Date`. Con `Date` el horario de verano hace que algunos días duren 23 horas
  y sumar un día deje de dar el día siguiente.
- `lib/scheduling/calendar.ts` — calendario laboral. Traduce entre fecha y **ordinal de día hábil**;
  en ordinales, programar es sumar enteros y ninguna fecha puede caer en sábado ni en feriado.
- `lib/scheduling/types.ts` — el vocabulario: `LinkType`, `Dependency`, `PlanTask`, `Constraint`.
- `lib/scheduling/dependencies.ts` — lectura de la notación de MS Project, validación del grafo,
  orden topológico y detección de ciclos.
- `lib/scheduling/schedule.ts` — pase adelante con las cuatro reglas de vínculo.
- `prisma/schema.prisma` — modelo `TaskDependency` con `link_type` y `lag_days` **entero con
  signo**, más la migración `20260816185306_add_task_dependencies`.

### Las cuatro reglas, en días hábiles

Con `tramo = duración − 1` para una tarea con duración, y `0` para un hito:

| Vínculo | Regla |
|---|---|
| `FS` | `inicio_suc = fin_pred + 1 + desfase` |
| `SS` | `inicio_suc = inicio_pred + desfase` |
| `FF` | `inicio_suc = fin_pred + desfase − tramo_suc` |
| `SF` | `inicio_suc = inicio_pred − 1 + desfase − tramo_suc` |

El `+1` de `FS` y el `−1` de `SF` son el mismo día de separación visto desde los dos lados: el fin
de una tarea es su último día trabajado, no el siguiente. De ahí sale, sin regla aparte, que un hito
atado en `FF` caiga el mismo día que termina su predecesora y atado en `FS` caiga al día siguiente.

### Pruebas agregadas, y pasan

106 pruebas nuevas en `lib/scheduling/__tests__/`, 5 archivos:

| Archivo | Qué acredita |
|---|---|
| `schedule.test.ts` | **La prueba de aceptación de C1**: las cuatro combinaciones colgando de la misma predecesora, más un desfase de −5 que solapa cinco días. Fechas exactas, no aproximadas |
| `dependencies.test.ts` | Lectura de la notación en las dos formas reales; rechazo de ciclos **nombrando las tareas**; rechazo de predecesoras inexistentes, autorreferencias y vínculos duplicados |
| `schedule.property.test.ts` | 7 propiedades sobre 700 planes generados al azar con `fast-check` |
| `calendar.test.ts` | Días hábiles, feriados, semanas laborales distintas, fechas anteriores a 1970 |
| `date.test.ts` | Conversiones, años bisiestos, fechas imposibles |

Línea base: **de 37 a 42 archivos en verde y de 973 a 1080 pruebas**, con los mismos 36 archivos
rojos de siempre. Las fallidas bajan de 259 a 258 —una prueba se recuperó al regenerarse el cliente
de Prisma—. Ninguna de las que pasaban dejó de pasar.

### Lo que se encontró y no se esperaba

**El desfase declarado en días corridos se rechaza en vez de convertirse.** MS Project sabe escribir
«3 edays», que atraviesan el fin de semana. Tratarlos como días hábiles correría las fechas sin que
nadie se enterara, así que el lector se niega y lo dice. Mismo criterio con cualquier unidad que no
reconozca: preferimos el error a la suposición.

**Las propiedades encontraron el valor de la que casi no escribo.** La séptima —barajar el orden de
entrada no cambia ninguna fecha— parecía trivial. Es la que protege contra que el resultado dependa
del orden en que vengan las filas del Excel, que es exactamente lo que va a pasar al importar.

**Hay base de datos local.** No existía ninguna: ni Docker, ni servicio, ni binarios. Se levantó
MySQL 8.4.9 desde la distribución en ZIP, que no necesita instalador ni privilegios de
administrador, en `C:\Claude\mysql-local`, puerto **3307**, base `pm`, usuario `root` sin
contraseña. Las 11 migraciones existentes más la de C1 quedaron aplicadas: 21 tablas.

El esquema de producción se leyó **solo por introspección** y resultó idéntico al del repositorio,
así que no hubo nada que reconstruir a mano. En producción no se escribió nada.

`.env.local` sigue apuntando a producción y no se tocó. Los comandos contra la base local llevan la
cadena en línea:

```
DATABASE_URL="mysql://root@127.0.0.1:3307/pm" npx prisma migrate deploy
```

Queda pendiente decidir si `.env.local` se cambia para que la aplicación arranque contra la base
local por omisión.

### Preguntas abiertas nuevas

1. **`SF` no se pudo contrastar contra la referencia**: el plan tiene 704 `FS`, 802 `SS`, 159 `FF`
   y **cero** `SF`. Se implementó la regla simétrica de MS Project —la sucesora termina el día hábil
   anterior al inicio de la predecesora— y queda probada contra sí misma, no contra el archivo.
2. **El desfase se aplica siempre en días hábiles.** Es lo que dice el encargo y lo que se midió en
   el archivo. Si algún cliente lo escribe en días corridos, el lector se niega; habrá que decidir
   si se convierte o se rechaza en la importación.
3. **`DEBE_EMPEZAR_EL` gana sobre las predecesoras y no avisa.** MS Project marca un conflicto
   cuando la restricción contradice al vínculo. Por ahora la restricción manda en silencio; el
   control 9 de la auditoría (C8) es el lugar natural para reportarlo.

### Siguiente

C2 · Pase atrás y holgura total. El pase adelante ya publica los ordinales de inicio y fin
tempranos, que es justo lo que el pase atrás consume. La prueba de aceptación es la cadena con el
hito de cierre: con `FF` el plan cierra en su fecha, con `FS` se corre un día.

---

## Tramo 2 — C2 · Pase atrás y holgura total

**Estado:** CERRADO. C2 pasa a HECHO.

### Qué se tocó

- `lib/scheduling/cpm.ts` — pase atrás y holgura total. Una sola pasada sobre el orden topológico al
  revés, así que cuesta lo mismo que el pase adelante.
- `lib/scheduling/__tests__/cpm.test.ts` — 22 pruebas, incluida la de aceptación.
- `lib/scheduling/__tests__/cpm.property.test.ts` — 7 propiedades sobre 700 planes generados.

### Las cuatro reglas del pase atrás son las del pase adelante despejadas

| Vínculo | Pase adelante | Pase atrás |
|---|---|---|
| `FS` | `inicio_suc ≥ fin_pred + 1 + desfase` | `fin_pred ≤ inicio_suc − 1 − desfase` |
| `SS` | `inicio_suc ≥ inicio_pred + desfase` | `inicio_pred ≤ inicio_suc − desfase` |
| `FF` | `fin_suc ≥ fin_pred + desfase` | `fin_pred ≤ fin_suc − desfase` |
| `SF` | `fin_suc ≥ inicio_pred − 1 + desfase` | `inicio_pred ≤ fin_suc + 1 − desfase` |

No son reglas nuevas: es la misma desigualdad leída del otro lado. Que lo sean está probado como
propiedad, no supuesto: la número 3 verifica sobre planes al azar que las fechas tardías cumplen los
mismos vínculos que las tempranas.

### La prueba de aceptación

La cadena del encargo, con el único cambio del tipo de vínculo del hito de cierre:

|  | hito | cierre del plan |
|---|---|---|
| `FF` | 2026-06-09, el mismo día en que termina su predecesora | **2026-06-11** |
| `FS` | 2026-06-10, un día hábil después | **2026-06-12** |

Y contra una fecha de compromiso del 11 de junio: con `FF` las cuatro tareas quedan en holgura cero
y el plan cumple; con `FS` las cuatro quedan en **−1**, y el sistema lo dice en vez de esconderlo.
El día no se queda en el hito: la tarea que sigue también se corre. Eso es lo que propaga el error
por todo un plan de mil líneas.

### Lo que se encontró y no se esperaba

**El pase atrás necesita un techo, y la primera versión no lo tenía.** Dos pruebas fallaron: una
tarea con un vínculo saliente laxo —un `SF`, o un `SS` hacia algo corto— salía con holgura aunque
fuera ella misma la que fijaba la fecha de cierre. La causa: el libro de texto pone
`fin tardío = cierre del plan` solo para las tareas sin sucesoras, y deja que las demás tomen su
límite únicamente de sus sucesoras. Con vínculos laxos ese límite queda **más allá** del cierre.

MS Project no tiene el problema porque acota toda fecha tardía al cierre del plan. Se corrigió
igual, y quedó como propiedad 5. Vale la pena anotarlo: no era un error de aritmética sino de
condición inicial, y solo se vio porque una prueba preguntaba por `SF`, que es el tipo de vínculo
que el plan de referencia **no** usa ni una vez. Si me hubiera limitado a lo que el archivo ejercita,
el defecto habría llegado intacto hasta C4.

**La política sobre las tareas sin sucesoras cambia el conteo, así que se declara.** Con el criterio
de MS Project —plazo hasta el cierre del plan— una tarea suelta tiene holgura; con el otro
—anclada a su propio fin— no la tiene. En el plan de referencia hay **138 líneas de las que nadie
depende**, y esa sola decisión mueve el conteo de holgura cero de 882 a 987. Por eso `terminalPolicy`
es un parámetro explícito y no una constante escondida: cuando se reporte una cifra de holgura habrá
que decir bajo qué criterio se calculó.

**La holgura se puede medir contra la fecha de compromiso, no solo contra el cierre calculado.** Es
lo que convierte la holgura en margen de negocio: si el plan cierra antes del compromiso, todas las
tareas ganan ese margen; si cierra después, la ruta crítica sale negativa y el número dice cuántos
días se deben. Es el insumo directo de la vista ejecutiva (C13).

### Pruebas y línea base

135 pruebas en el motor, 7 archivos, todas en verde. 14 propiedades con `fast-check` sobre 1 400
planes generados al azar.

### Preguntas abiertas nuevas

1. **¿Qué `terminalPolicy` se usa para reportar «tareas con holgura cero» al cliente?** La decisión
   mueve la cifra en cientos de líneas. Se propone la de MS Project por interoperabilidad, y que la
   cifra siempre se publique diciendo el criterio.
2. **La holgura negativa hoy solo aparece con fecha de compromiso o con `DEBE_EMPEZAR_EL`.** En el
   plan de referencia aparecería además por las 9 filas cuyas fechas no cuadran con sus enlaces. Al
   importar habrá que decidir si esas fechas se respetan —y generan holgura negativa— o si el motor
   las recalcula.

### Siguiente

C3 · Calendario laboral con feriados. La aritmética de días hábiles y feriados ya está y está
probada; falta el catálogo por país y año con los móviles calculados —Pascua y Ley Emiliani—, y la
simulación que responde a qué fecha se movería el cierre sin tocar el plan.

---

## Tramo 3 — C3 · Calendario laboral con feriados

**Estado:** CERRADO. C3 pasa a HECHO. **Con esto cierra la Fase 1: el motor de cálculo.**

### Qué se tocó

- `lib/scheduling/holidays.ts` — catálogo de feriados por reglas, no por tabla.
- `lib/scheduling/simulation.ts` — la simulación, que no toca el plan.
- `prisma/schema.prisma` — modelos `ProjectCalendar` y `ProjectHoliday`, más la migración
  `add_project_calendar`, aplicada en local.

### Los feriados no se capturan: se calculan

Se capturan las reglas y las fechas salen solas. Una tabla escrita a mano envejece: alguien la llena
para un año, el plan cruza a diciembre y las fechas del siguiente sencillamente no existen.

Hay tres clases de regla —fija, colgada de la Pascua, y de lunes contado— más un modificador: la
**Ley Emiliani**, que en Colombia traslada al lunes siguiente el feriado que no caiga en lunes. Diez
de los dieciocho feriados colombianos son así.

La Pascua se calcula con el algoritmo gregoriano de Meeus, Jones y Butcher. Está probado en dos
sentidos: contra años conocidos, y como propiedad sobre 111 años —siempre cae en domingo y siempre
entre el 22 de marzo y el 25 de abril—.

México quedó implementado con los días de descanso obligatorio del artículo 74 de la Ley Federal del
Trabajo, incluidos los tres lunes contados y la transmisión del Poder Ejecutivo cada seis años.
**Jueves y Viernes Santo no están**, porque la ley no los declara obligatorios aunque medio país no
trabaje; quien los pare los agrega como días propios del proyecto. El motor no los supone.

### Lo que se encontró y no se esperaba

**Dos feriados colombianos pueden caer el mismo día, y no es un caso raro.** Una prueba de
consistencia falló: en algún año entre 2020 y 2035 las dieciocho conmemoraciones no daban dieciocho
fechas distintas. Al buscarlo apareció el patrón completo: el **Sagrado Corazón** —Pascua más
sesenta y ocho días, corrido al lunes— aterriza sobre el lunes de **San Pedro y San Pablo** cuando
la Pascua es tardía. Ocurre en **20 de 111 años**, uno de cada cinco o seis, y **2025 fue uno**.

Ese año hay dieciocho conmemoraciones y diecisiete días de descanso. Son dos preguntas distintas y
ahora el código las separa: `holidaysFor` devuelve las dieciocho, `holidayDates` devuelve las fechas
sin repetir, y `overlappingHolidays` dice cuáles se encimaron para poder explicarlo en la interfaz.
Si se hubieran contado dieciocho días de descanso, el plan de 2025 habría perdido un día sin que
nadie supiera de dónde.

**Una prueba mal planteada enseñó algo del dominio.** Escribí «un feriado fuera de la ruta crítica
mueve la tarea pero no el cierre» con dos ramas paralelas, y falló: la rama larga abarcaba todo el
plan, así que cualquier feriado también la tocaba. El caso real es otro —una tarea **con holgura**
se come el feriado de su margen mientras una fecha pactada no se mueve— y así quedó escrito. La
prueba original no probaba lo que decía probar.

### La simulación

Responde «¿y si estos días no se trabajaran?» **sin tocar el plan**: arma un calendario aparte,
vuelve a programar sobre él y compara. Devuelve el corrimiento del cierre en días hábiles, qué
feriados quitaron trabajo de verdad y cuáles no —los que caen en fin de semana no quitan nada—, qué
tareas se movieron y cuánto, y el margen contra la fecha de compromiso antes y después.

La prueba de aceptación usa la ventana real del plan de referencia:

| | |
|---|---|
| Ventana | 12 de junio a 30 de noviembre de 2026, **122 días hábiles** sin feriados |
| Con los feriados de Colombia | el cierre se va al **11 de diciembre** |
| Corrimiento | **9 días hábiles** |
| Margen contra el compromiso | de 0 a **−9** |

Nueve y no ocho: ocho feriados caen dentro de la ventana original, y el noveno —la Inmaculada
Concepción del 8 de diciembre— cae dentro de la cola que los ocho anteriores acaban de empujar. Un
cálculo que solo contara los feriados del rango original habría dicho ocho, y se habría quedado
corto un día.

### Pruebas y línea base

176 pruebas en el motor, 9 archivos, todas en verde.

### Preguntas abiertas nuevas

1. **¿Contra qué país se planea el proyecto de referencia?** El plan está construido de lunes a
   viernes **sin feriados**, y su propio libro trae una hoja de feriados de Colombia que el plan
   ignora. Es decir: el plan auditado no aplica los feriados de su propio país. Al importarlo habrá
   que decidir si se respeta como está —y la simulación queda como advertencia— o si se recalcula.
2. **¿El calendario es por proyecto o también por recurso?** Quedó por proyecto, que es lo que pide
   el encargo. Un calendario por persona o por equipo es otra cosa y no está.

### Siguiente

Fase 2. **C4 · Ruta crítica y Ruta Súper Crítica**, que es la capacidad que distingue al sistema.
La ruta crítica clásica ya sale del pase atrás; falta la segunda clasificación sobre las tareas de
holgura cero según si se recuperan metiendo más recursos, y el reparto entre cliente y proveedor.

> **Nota sobre la línea base.** El total de pruebas rojas oscila entre 257 y 259 entre corridas sin
> que cambie nada del código. El causante es `components/templates/__tests__/final-preview-step.test.tsx`,
> que tarda unos nueve segundos y falla 8 o 10 veces según la corrida: es inestable de origen. Por eso
> la comparación con la línea base se hace **archivo por archivo**, no contra el total. El criterio es
> que ningún archivo verde se ponga rojo y que ninguno empeore su conteo.

---

## Tramo 4 — C4 · Ruta crítica y Ruta Súper Crítica

**Estado:** CERRADO. C4 pasa a HECHO.

### Qué se tocó

- `lib/scheduling/critical-path.ts` — la segunda clasificación y el reparto cliente/proveedor.
- `lib/scheduling/xlsx.ts` — lector de xlsx propio, sin dependencias: ZIP con `zlib` y XML por
  expresiones regulares.
- `lib/scheduling/import-plan.ts` — importación de un plan desde hoja de cálculo.
- `lib/scheduling/types.ts` — `TaskKind`, `ResponsibleParty` y `Recoverability`.
- Tres archivos de prueba nuevos, uno de ellos contra el plan real.

### Las reglas de sugerencia salen de la estructura, no del nombre

Buscar palabras en el nombre de la tarea habría sido más cómodo y se habría roto en cuanto alguien
redactara distinto. El Gantt de referencia hace justamente eso y ya está roto: clasifica los bloques
por expresiones regulares sobre el nombre y deja el 96 % del plan de un solo color.

Las reglas de aquí miran la estructura: una línea que el cliente aprueba o entrega la decide un
tercero; un punto de control es un Go/No-Go; una tarea con fecha impuesta es una fecha pactada por
definición. El tiempo transcurrido es la única de las tres familias que no se deduce de nada, así
que se declara. Y la marca a mano siempre gana, porque quien conoce el proyecto sabe cosas que el
modelo no. Hay una prueba que lo fija: una tarea llamada «Aprobación del comité y firma del acta
Go/No-Go», sin clase declarada, **no** se clasifica sola.

### El lector de Excel

Un xlsx es un ZIP con XML adentro; se abre con `zlib`, que ya trae Node. No se metió una librería
porque la parte que hace falta cabe en un archivo, y una librería de hojas de cálculo entera es peso
y superficie de ataque a cambio de nada.

Lo que hay que hacer bien es lo que casi nunca se documenta: las fechas son números —días desde el
30 de diciembre de 1899, no el 31—; el texto puede venir de una tabla compartida **o incrustado en
la celda**, y este archivo usa lo segundo porque lo generó una herramienta, no Excel; y las celdas
con fórmula pueden no traer resultado guardado, en cuyo caso están vacías y no valen cero.

Las columnas se buscan **por su encabezado, no por su letra**: alguien inserta una columna y todo lo
demás se corre.

### El resultado: el archivo entero, sin una advertencia

La importación reprodujo a la primera todas las cifras que el diagnóstico había medido por separado:
1 368 líneas, 1 665 vínculos, 125 resúmenes y 1 243 hojas, 704 fin-comienzo / 802
comienzo-comienzo / 159 fin-fin / **cero** comienzo-fin, 394 desfases con 6 negativos, 178 líneas
del cliente, 1 258 con entregable y criterio, y las 276 marcas de ruta súper crítica repartidas en
174 / 58 / 44.

### Lo que se encontró y no se esperaba

**1. La fecha de cierre depende de la convención del desfase negativo, y son dos días.**

Con la regla estándar de MS Project el plan cierra el **2026-12-02**. Con la que usa el archivo
—`inicio = fin + desfase`, sin el día de separación— cierra el **2026-11-30**, que es su fecha
declarada, exacta. Seis vínculos, dos días hábiles, y de ahí salen las 228 holguras de −1 día que el
diagnóstico había visto sin explicación.

La convención se declara al importar. Si no se declara, la importación **lo advierte y nombra las
seis líneas** en lugar de elegir en silencio.

**2. Reprogramar y respetar las fechas son dos lecturas distintas, y las dos hacen falta.**

Reprogramando lo más pronto posible, 826 de 1 243 hojas caen donde el archivo dice y las otras 417
salen **antes** —ninguna después, o sea que ningún vínculo está incumplido—. Ese plan trae holgura
metida a mano, y reprogramar la recupera.

Respetando las fechas del archivo como piso, **1 363 de 1 368 líneas** caen exactamente donde dice.
Es la lectura correcta para un plan ya construido; la otra sirve para preguntar «¿qué pasaría si lo
reprogramáramos?».

**3. El 932 no existe, y ahora está probado que no hay de dónde sacarlo.**

Cuatro lecturas razonables dan 796, 888, 1 127 y 1 209. Ninguna da 932, y el 932 queda entre la
segunda y la tercera. Se agregó la prueba de fondo: **ninguna hoja del libro tiene una columna
llamada holgura, slack, float ni margen**. La cifra solo vive en la prosa.

**4. El encargo advierte de un defecto que este archivo no tiene.** La regla del hito fin-fin es
correcta y el motor la implementa, pero se buscaron los hitos que el archivo coloca el mismo día que
su predecesora enlazados en fin-comienzo y son **cero**. Sus 159 vínculos fin-fin ya están bien
puestos. La advertencia sigue valiendo para planes futuros; para este, no aplica.

**5. Una prueba mía se pasó de estricta.** Afirmé que el número 932 no aparecía en ninguna celda del
libro. Falló: aparece, porque el plan tiene una línea con **identificador** 932. La afirmación útil
era otra —que no hay ninguna columna de holgura— y así quedó.

### Pruebas y línea base

225 pruebas en el motor, 11 archivos. De ellas, **28 corren contra el plan real** y se saltan solas
si el archivo de referencia no está, porque no se versiona.

### Preguntas abiertas nuevas

1. **¿Qué lectura se le muestra al cliente por omisión, la reprogramada o la anclada?** Cambia la
   holgura cero de 796 a 1 127. Se propone anclada para ver el plan como está, y reprogramada como
   una simulación aparte —«¿qué ganaríamos si lo reprogramáramos?»—.
2. **Los resúmenes se programan como tareas normales.** Lo correcto es que hereden fechas de sus
   hijas. Hoy funciona porque el archivo trae sus fechas y se respetan, pero al crear un plan desde
   cero hará falta la jerarquía real. Entra con C7, que la necesita para ponderar.

### Siguiente

C5 · Compuertas como objeto propio. El plan de referencia tiene cuatro «Habilitadores» que ya se
importan como `COMPUERTA`, y son las únicas líneas con duración cero e inicio distinto de fin: son
ventanas, no hitos.

---

## Tramo 5 — C5 · Compuertas como objeto propio

**Estado:** CERRADO. C5 pasa a HECHO.

### Qué se tocó

- `lib/scheduling/gates.ts` — el modelo de compuerta y su evaluación.
- `lib/scheduling/__tests__/gates.test.ts` — 16 pruebas.
- `prisma/schema.prisma` — modelos `Gate`, `GateCondition` y `GateUnlock`, migración `add_gates`,
  aplicada en local.

### Por qué una compuerta no es un hito

Un hito es una fecha: llega, y el plan la registra. Una compuerta es una condición: si no se cumple,
no hay plan que seguir. De ahí las cuatro cosas que lleva y un hito no necesita: condiciones **con
dueño y fecha límite**, las tareas que habilita, un hito de cierre, y un **plan alterno obligatorio**.

El plan alterno se valida, no se sugiere: una compuerta sin plan alterno hace fallar la evaluación
con un mensaje que dice por qué. Sin él, lo que sigue cuando la compuerta no cierra es una reunión
de emergencia — y esa reunión se puede tener antes.

### La prueba de aceptación

Una tarea habilitada por una compuerta con una condición pendiente sale **bloqueada**. Al registrar
el cumplimiento de esa última condición, sale **desbloqueada**, sin que nadie toque la tarea: lo
único que cambió fue el cumplimiento. La compuerta además cierra en la fecha de la **última**
condición cumplida, no de la primera.

### Decisiones que quedaron en el código

**Las fechas límite de las condiciones se cuentan en días de calendario, no hábiles.** Es lo
contrario de todo el resto del motor, y a propósito: la fecha límite de una condición la mira una
persona en un calendario de pared. «Vence el viernes» significa el viernes, se trabaje el sábado o
no. La función que lo calcula se llamó primero `businessDaysBetween` y se renombró: el nombre mentía.

**Una condición cumplida tarde no queda vencida.** Vencida es un estado de lo que falta, no un
reproche sobre lo que ya pasó.

**Una tarea puede colgar de varias compuertas** y sigue bloqueada mientras cualquiera no cierre.

### Preguntas abiertas nuevas

1. **Las compuertas todavía no participan del cálculo de fechas.** Hoy una compuerta bloquea o no
   bloquea, pero el pase adelante no la consulta. Falta decidir si una compuerta abierta empuja las
   fechas de lo que habilita —y con qué fecha— o si solo se marca. Depende de qué signifique la
   fecha límite de la condición frente a la fecha planeada de la tarea.
2. **Los cuatro Habilitadores del plan de referencia ya se importan como compuerta**, pero el
   archivo no trae sus condiciones: están descritas en prosa. Convertirlas es trabajo de captura, no
   de importación.

### Siguiente

C6 · La responsabilidad del cliente como tipo de primera clase. Buena parte ya está: el importador
distingue las 178 líneas del cliente y `ResponsibleParty` existe. Falta la vista propia filtrable,
ordenada por fecha y con alerta de vencimiento próximo, y resolver que hoy `WorkItem.ownerId` exige
que el responsable pertenezca a la organización del proveedor.

---

## Tramo 6 — C6 · La responsabilidad del cliente como tipo de primera clase

**Estado:** CERRADO. C6 pasa a HECHO.

### Qué se tocó

- `lib/scheduling/client-commitments.ts` — la vista de lo que el cliente debe entregar o decidir.
- `lib/scheduling/types.ts` — `owner`, `dueDate` y `progress` en `PlanTask`.
- `lib/scheduling/__tests__/client-commitments.test.ts` — 23 pruebas.
- `prisma/schema.prisma` — `kind`, `party`, `clientOwner` y `dueDate` en `WorkItem`, con índice para la
  vista; migración `add_client_responsibility`, aplicada en local.

### El choque con el diseño actual, y cómo se resolvió

`WorkItem.ownerId` es llave foránea obligatoria a `User`, y `workitem.service.ts:128` exige que el
responsable comparta organización con el proyecto. Con ese mecanismo **no se puede nombrar
responsable a alguien del banco**.

No se tocó esa regla: sigue valiendo para el trabajo del proveedor, que es de quien habla. Se agregó
al lado un `clientOwner` que es **un nombre, no una cuenta**. Quien entrega del lado del cliente casi
nunca tiene usuario en la herramienta del proveedor, y exigirle uno es la forma más rápida de que
esas líneas terminen asignadas a alguien del proveedor que no las controla — que es exactamente el
problema que C6 viene a resolver.

### Lo que la vista responde

Ordenada por fecha, porque quien la trabaja lo hace de arriba hacia abajo. Para cada compromiso: qué
falta, de quién es, para cuándo, en qué estado —cumplida, vencida, por vencer, pendiente— y **cuánto
arrastra si no llega**.

Ese último dato es el que cambia la conversación. Convierte «falta una firma» en «falta una firma y
las cinco líneas que cuelgan de ella». Se calcula por alcance transitivo en el grafo, no solo por
sucesoras directas, y en una sola pasada sobre el orden topológico al revés: el arrastre de una
tarea sale de los de sus sucesoras, en vez de recorrer el grafo una vez por compromiso.

A igualdad de fecha, primero lo que más arrastra. Si dos cosas vencen el mismo día, la que detiene
cuarenta líneas se persigue antes que la que no detiene ninguna.

### Decisiones que quedaron en el código

**Lo cumplido sale de la lista de trabajo pero no del histórico.** `pendingCommitments()` filtra;
la vista completa conserva todo. Un compromiso cumplido tarde queda como cumplido, no como vencido:
vencido es un estado de lo que falta.

**El total de líneas detenidas no cuenta dos veces.** Una tarea que depende de dos compromisos
pendientes se cuenta una sola vez — si no, el número se infla y deja de servir para decidir.

**La fecha del compromiso es la pactada si la hay, y si no la que calcula el plan.** Sin fecha
pactada el compromiso vence cuando el plan diga; con ella, cuando se acordó.

### Preguntas abiertas nuevas

1. **La vista existe en el motor, no en la interfaz.** C6 queda acreditada con la lógica y su prueba;
   la pantalla filtrable entra con la Fase 4 junto a C11 y C13, que comparten componentes.
2. **`progress` se lee pero todavía no se persiste.** El campo de avance por tarea entra con C7, que
   es donde se define cómo se pondera. Hoy la vista lo recibe como dato de entrada.

### Siguiente

C7 · Avance ponderado por trabajo real. Es la última de la Fase 2 y necesita la jerarquía padre/hijo
que quedó anotada como pendiente en el tramo 4: el peso de un resumen es la suma de los días hábiles
de las hojas que cuelgan, no su lapso de calendario.

---

## Tramo 7 — C7 · Avance ponderado por trabajo real

**Estado:** CERRADO. C7 pasa a HECHO. **Con esto cierra la Fase 2.**

### Qué se tocó

- `lib/scheduling/progress.ts` — jerarquía, peso y prorrateo del avance.
- `lib/scheduling/types.ts` — `parentId` en `PlanTask`.
- `lib/scheduling/__tests__/progress.test.ts` — 25 pruebas.
- `lib/scheduling/__tests__/plan-referencia.test.ts` — 5 pruebas más, contra el plan real.
- `prisma/schema.prisma` — `parentId` con su relación consigo misma y `progressPct` en `WorkItem`;
  migración `add_hierarchy_and_progress`, aplicada en local.

### El error que este módulo existe para evitar

Ponderar el avance de un resumen por su **duración**. La duración de un resumen no es trabajo: es el
lapso de calendario que abarca, desde que empieza su primera hija hasta que termina la última.

Un bloque de tres tareas estirado sobre tres meses tiene una duración de tres meses. Uno de ochenta y
dos tareas concentrado en tres semanas tiene una de tres semanas. Ponderado por duración, el primero
pesa cuatro veces más que el segundo — y el plan reporta un avance que no se parece a nada.

El peso correcto es el trabajo: la suma de los días hábiles de las hojas que cuelgan.

    avance(resumen) = Σ(peso_i × avance_i) / Σ(peso_i)

### La prueba de aceptación

Dos ramas con **el mismo trabajo y distinto lapso**: tres tareas de cuatro días pegadas contra tres
tareas de cuatro días separadas por meses. Doce días de trabajo cada una. Pesan **exactamente
igual**, y con una terminada y la otra sin empezar el plan va al 50 %, no a otra cosa.

### Verificación cruzada contra el plan real

El archivo no trae identificador de padre: trae una **columna de nivel**, como todo plan exportado de
MS Project. `parentsFromLevels` deriva el árbol de esa columna, y el resultado reproduce **exactamente
los 125 resúmenes y las 1 243 hojas** que ya se habían contado por otro camino —tener hijas—. Son dos
formas independientes de responder la misma pregunta, y coinciden.

Las dos raíces del árbol son las dos Etapas del plan. El avance ponderado del plan completo da cero,
que es correcto: el plan de referencia está sin avance capturado.

### Decisiones que quedaron en el código

**Un hito pesa cero.** Marca un momento, no consume trabajo. De ahí sale un caso que hay que resolver
y no dividir entre cero: un bloque que solo agrupa hitos no se puede ponderar. Ahí el avance es el
promedio simple de las hijas — si las tres ocurrieron, el bloque ocurrió.

**Un resumen no tiene avance propio.** Si el archivo declara uno, se ignora: se calcula del contenido.
Es la misma regla que C12 pide para las cifras de la documentación.

**El salto de nivel se rechaza, no se adivina.** Una línea de nivel 3 después de una de nivel 1 no
tiene padre posible; inventarlo sería fabricar estructura que nadie escribió.

**El recorrido es por profundidad descendente, sin recursión.** Una línea se resuelve cuando sus hijas
ya están resueltas, y ordenar por profundidad garantiza eso sin arriesgar la pila en un plan hondo.

### Preguntas abiertas nuevas

1. **El avance ponderado todavía no reemplaza al conteo binario del sistema.** Los cuatro lugares que
   calculan `completadas / totales` siguen intactos, y el índice de salud se alimenta de ese número.
   Cambiarlo reclasifica la salud de todo el portafolio y deja incomparables los snapshots ya
   guardados. Es una migración de datos, no un cambio de fórmula, y merece decidirse aparte.
2. **`progressPct` existe en el esquema pero nada lo llena todavía.** Lo llenará la capa de servicio
   cuando el motor se conecte a la base.

### Siguiente

Fase 3. **C8 · Motor de auditoría permanente**: los 17 controles, cada uno con un caso que pasa y uno
que falla. El plan de referencia da varios casos servidos —27 vínculos que cuelgan de un resumen, 6
desfases negativos, 9 filas cuyas fechas no cuadran con sus enlaces— así que la prueba tiene material
real y no solo sintético.

> **Nota — el 932 sigue sin aparecer, y una casi-coincidencia que no lo es.** El informe del motor
> arroja **933 líneas del plan detenidas por compromisos del cliente**, a una unidad del 932 narrado.
> Se investigó: las variantes cercanas dan 925 (solo prerrequisitos), 933 (todo el cliente), 979
> (incluyendo las propias líneas del cliente) y 915 (aguas abajo de la ruta súper crítica). Ninguna
> da 932, y sobre todo **es otra métrica**: «líneas que dependen del cliente» no es «líneas con
> holgura cero». La cercanía es casualidad de dos fracciones grandes de 1 243. Queda descartada como
> explicación.

> **Nota — inconsistencia menor detectada en el informe.** `classifySuperCritical` con
> `excludeSummaries` excluye por la clase declarada (`RESUMEN`, 121 líneas) y no por la estructura
> (125, porque los 4 Habilitadores son compuertas *y* resúmenes). Por eso el informe dice universo
> 1 247 donde la estructura dice 1 243. No afecta a ninguna cifra acreditada, pero es exactamente el
> tipo de desajuste que el control 1 de la auditoría (C8) debe detectar. Se resuelve ahí.

---

## Tramo 8 — C8 · Motor de auditoría permanente

**Estado:** CERRADO. C8 pasa a HECHO.

### Qué se tocó

- `lib/scheduling/audit.ts` — los 17 controles.
- `lib/scheduling/__tests__/audit.test.ts` — 46 pruebas: cada control con un caso que pasa y uno o
  varios que fallan, sobre un plan base de cuatro líneas que sale limpio de los diecisiete.
- `lib/scheduling/__tests__/plan-referencia.test.ts` — 10 pruebas más, la auditoría sobre el plan real.

### Cómo están planteados

Cada hallazgo se puede **citar**: lleva control, título, línea y un mensaje escrito para que quien lo
lea sepa qué hacer. «Control 8, línea 412» es accionable; «el plan tiene problemas» no lo es.

Se separan **errores** de **avisos**. Un error está mal y hay que arreglarlo; un aviso puede estar
bien y conviene mirarlo. Solo los errores reprueban. El control 17 —solapamientos declarados— es el
único aviso, tal como pide el encargo.

El informe además dice **cuánto revisó cada control**, no solo cuántos hallazgos tuvo. Un control con
cero hallazgos y cero revisiones no probó nada; uno con cero hallazgos sobre 1 665 vínculos sí.

### El resultado sobre el plan real: 13 de 17 limpios

Sobre 1 368 líneas y 1 665 vínculos:

| Salen limpios | Disparan |
|---|---|
| Jerarquía, niveles, fechas presentes, orden de fechas, duración contra el rango, hitos en cero, predecesoras existentes, ninguna apuntando adelante, ninguna línea fuera de su resumen, sin nombres repetidos, todas con responsable, las 1 243 hojas con entregable y criterio, y el plan cerrando en su fecha de compromiso | **C09** 7 vínculos que no concuerdan con las fechas · **C14** 27 hojas de las que nadie depende · **C16** 78 criterios de salida repetidos más de diez veces · **C17** 6 solapamientos (aviso) |

En total **112 errores y 6 avisos**. Que un plan auditado y bien construido saque trece controles
completamente limpios y aun así deje 112 hallazgos dice bastante sobre para qué sirve esto.

El hallazgo con más volumen es el 16: un criterio de salida que aparece **once veces idéntico**
—«las cargas de la ola operan en AWS y el origen quedó apagado»— dejó de decir algo de cada línea.
Es exactamente lo que C10 va a pedir que no pase.

### Lo que se encontró y no se esperaba

**El control 14 necesitaba una excepción, y hacerla explícita fue el trabajo.** «Ninguna hoja queda
sin sucesora» suena absoluto, pero la línea que **cierra el plan** no tiene sucesora por definición, y
exigírsela obligaría a inventar una. Sin la excepción, el control disparaba sobre 138 líneas del plan
de referencia y era ruido; con ella, dispara sobre 27 y cada una es un hallazgo real: una tarea cuyo
atraso nadie acusaría.

La regla quedó escrita en el código, no en la cabeza de nadie: se exceptúan las líneas que terminan
cuando termina el plan, porque su atraso **es** el atraso del plan y no se esconde.

**Dos pruebas mías fallaron por un defecto que sembré sin querer.** Al mover una tarea para probar el
control 9, dejé atrás el hito que colgaba de ella en fin-fin — y el control detectó **ese** vínculo
roto, no el que yo quería medir. El control funcionaba; la prueba estaba mal montada. Quedó un
ayudante que cambia varias líneas a la vez, y una prueba más que fija justo ese caso: si el hito se
queda atrás, el control lo dice.

### Preguntas abiertas nuevas

1. **El umbral del control 16 es una decisión de producto, no técnica.** Diez repeticiones por
   omisión; en el plan de referencia eso da 78 hallazgos. Bajarlo a cinco daría muchos más. Qué tan
   estricto ser con los criterios repetidos lo decide quien revisa planes, no el motor.
2. **La auditoría corre sobre las fechas declaradas, no sobre las calculadas.** Es lo correcto para
   revisar un plan tal como está, pero habrá que decidir si también se corre sobre el resultado de un
   recálculo — donde el control 9 no puede fallar nunca, porque el motor no produce fechas que
   incumplan sus vínculos.

### Siguiente

C9 · Trazabilidad por línea. El importador ya conserva archivo, hoja, fila e identificador de origen
por cada línea; falta persistirlo y respetar la regla de redacción — la trazabilidad la ve el cliente,
así que nada de nombres del equipo interno ni versiones internas.
