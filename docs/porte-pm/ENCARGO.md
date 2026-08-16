# Encargo: porte de las 13 capacidades de planeación

Este documento es la fuente de verdad del trabajo. Si el contexto se compacta, se lee esto
primero, y luego `BITACORA.md` para retomar el hilo.

---

## Objetivo

Portar a este sistema las 13 capacidades del plan de referencia.

## Condición de cierre

Son tres cosas, y no se aprueba a medias:

1. Las 13 capacidades están en **Cómo va = HECHO**, con su prueba acreditada, o **DESCARTADA con
   la razón escrita**, en `docs/porte-pm/BRECHA.md`. Ninguna en PENDIENTE ni en EN CURSO.
2. La batería de pruebas del proyecto pasa completa, incluidas las nuevas de cada capacidad.
3. El sistema importa `referencia/PDT BU V7 - Plan Integrado.xlsx` y su motor reproduce, con
   tolerancia cero: la fecha de cierre del plan, la cantidad de tareas con holgura cero, y la
   clasificación de la ruta súper crítica con su reparto entre cliente y proveedor.

Mientras las tres no se cumplan, sigue trabajando.

---

## Los artefactos de referencia

En `referencia/` hay dos archivos:

- `PDT BU V7 - Plan Integrado.xlsx` — un plan de migración a AWS de 1 368 líneas, 7 hojas,
  ~1 660 vínculos de dependencia. Está auditado: pasa 20 controles de consistencia y su fecha de
  cierre se sostiene bajo la semántica estricta de MS Project.
- `Gantt BU V7.html` — un Gantt de una sola página, sin dependencias externas, que lee ese Excel
  directamente en el navegador (descomprime el xlsx con DecompressionStream y parsea el XML a mano).

**Son una implementación de referencia, no un objetivo de clonación.** El trabajo NO es reproducir
un Excel ni copiar HTML. Es extraer las REGLAS que hacen que ese plan sea correcto y llevarlas al
modelo de datos, al motor de cálculo y a la interfaz de este sistema, con la arquitectura que este
sistema ya tiene.

---

## Antes de escribir código

1. Recorrer el repositorio y escribir qué stack usa, cómo modela hoy proyecto, tarea, dependencia y
   calendario, qué motor de cálculo tiene (si tiene), cómo persiste, cómo expone la API y cómo prueba.
2. Abrir el Excel de referencia y recorrer las 7 hojas. Anotar qué columnas y qué objetos existen ahí
   que este sistema hoy NO tiene.
3. Abrir el Gantt de referencia y anotar qué interacciones ofrece.
4. Crear `docs/porte-pm/BRECHA.md` con una fila por capacidad y cuatro columnas:

   | Capacidad | Cómo llegó | Cómo va | Prueba que lo acredita |

   - **Cómo llegó** se llena una sola vez, al inicio, y describe lo que este sistema YA tiene:
     YA EXISTE / PARCIAL / NO EXISTE. Es el diagnóstico de partida y no se vuelve a tocar.
   - **Cómo va** arranca en PENDIENTE para las 13, sin excepción, y se actualiza conforme se avanza:
     PENDIENTE → EN CURSO → HECHO. O DESCARTADA, con la razón escrita en la misma celda.
   - **Prueba que lo acredita** es la ruta del test que demuestra la capacidad. Sin esa ruta llena,
     la capacidad no puede estar en HECHO.

   Regla que no se negocia: **«YA EXISTE» no es «HECHO».** Una capacidad pasa a HECHO solo cuando
   pasa su prueba de aceptación, aunque el diagnóstico dijera que ya existía. Si la base ya modela
   dependencias pero no maneja los cuatro tipos de vínculo, el diagnóstico dice YA EXISTE y el
   avance sigue en PENDIENTE hasta que las maneje.

5. Crear `docs/porte-pm/BITACORA.md` y anotar al cierre de cada bloque de trabajo: qué se tocó, qué
   pruebas se agregaron y si pasan, qué se encontró que no se esperaba, y qué preguntas quedaron
   abiertas. Si el contexto se compacta, esa bitácora es lo que devuelve el hilo: leerla antes de
   retomar.

No se cambia código en este paso. Solo entender, diagnosticar y planear.

---

## Las capacidades

Van en fases. No se empieza una fase sin cerrar la anterior: las últimas dependen de las primeras.

### Fase 1 — El motor de cálculo (sin esto, lo demás es decorativo)

#### C1 · Dependencias con tipo y desfase

Una dependencia no es «A antes que B». Tiene tipo (FS fin-comienzo, SS comienzo-comienzo, FF fin-fin,
SF) y desfase en días hábiles, que puede ser NEGATIVO — un solapamiento declarado a propósito. El
modelo guarda los cuatro tipos y el desfase con signo.

*Prueba*: crear las cuatro combinaciones y un desfase de −5; recalcular; las fechas salen donde
deben. Un ciclo se rechaza con un error que nombra las tareas del ciclo.

#### C2 · Pase adelante, pase atrás y holgura total

Fecha temprana de inicio y fin, fecha tardía, y holgura total en días hábiles por tarea, respetando
el tipo de cada vínculo. Debe correr sobre miles de tareas en tiempo interactivo.

*Regla que casi siempre se implementa mal*: un hito de duración cero que cae el MISMO día en que
termina su predecesora es fin-fin (FF), no fin-comienzo. Modelado como FS, el motor lo empuja al día
hábil siguiente y ese día se propaga por todo el plan. En el plan de referencia ese solo detalle
corría el cierre dos días y afectaba a 619 tareas.

*Prueba*: una cadena con un hito de cierre el mismo día; con FF el plan cierra en su fecha, con FS se
corre un día. Los dos casos verificados.

#### C3 · Calendario laboral con feriados

Días hábiles configurables por proyecto y tabla de feriados por país y año. Los móviles se calculan,
no se capturan: Semana Santa por algoritmo de Pascua, y en varios países de Latinoamérica hay
feriados que se corren al lunes siguiente por ley (en Colombia, la Ley Emiliani). Debe existir una
**simulación**: «recalcula como si estos feriados fueran no laborables y dime a qué fecha se movería
el cierre», SIN modificar el plan.

*Prueba*: Colombia 2026 devuelve 18 feriados con las fechas correctas y la simulación reporta el
corrimiento en días hábiles.

### Fase 2 — Lo que va a distinguir a este sistema

#### C4 · Ruta crítica y Ruta Súper Crítica

La ruta crítica clásica —holgura cero— es necesaria pero insuficiente. En un plan construido desde
una fecha de compromiso hacia atrás casi todo sale crítico: en el de referencia, 932 de 1 243 tareas,
el 74 %. Una ruta crítica que abarca tres cuartas partes del proyecto no le sirve a nadie.

La capacidad diferenciadora es una segunda clasificación sobre las tareas de holgura cero, según una
pregunta: **¿esto se recupera metiendo más recursos?** Tres familias donde la respuesta es no, que el
sistema debe poder marcar a mano y sugerir por regla:

- *Decide un tercero* — firmas, aprobaciones, decisiones del cliente, puntos Go/No-Go.
- *Tiempo transcurrido* — copiar datos, estabilizar, acompañar. Ninguna cantidad de gente acelera
  una transferencia de 2 TB.
- *Fecha pactada* — cortes acordados con usuarios finales, ventanas de cambio.

La intersección «holgura cero» ∩ «no recuperable» es la Ruta Súper Crítica. En la referencia son 276
de 1 243, y 131 dependen del cliente, no del proveedor. Ese dato es el que cambia una conversación
de comité.

*Prueba*: sobre el plan importado, el sistema reproduce las 932 tareas con holgura cero, clasifica la
ruta súper crítica y su reparto cliente/proveedor coincide con el del Excel.

#### C5 · Compuertas (gates) como objeto propio

Una compuerta no es una tarea ni un hito: es un conjunto de condiciones de duración cero que, al
cumplirse todas, habilita a un grupo de tareas a empezar. Necesita condiciones con dueño y fecha
límite, las tareas que desbloquea, un hito de cierre, y un plan alterno obligatorio por si no cierra.

*Prueba*: una tarea bloqueada por una compuerta incumplida se marca bloqueada; al cerrar la última
condición se desbloquea sola.

#### C6 · La responsabilidad del cliente como tipo de primera clase

Debe existir un tipo de tarea que el proveedor NO ejecuta: entregas de información, decisiones y
aprobaciones del cliente, con dueño nombrado, fecha límite y vista propia filtrable. En la referencia
son 178 líneas y la mitad de la ruta súper crítica: si no se modelan aparte, el plan hace responsable
al proveedor de atrasos que no controla.

*Prueba*: existe una vista «lo que debe entregar o decidir el cliente» ordenada por fecha, con alerta
de vencimiento próximo.

#### C7 · Avance ponderado por trabajo real

El % de avance de un resumen se pondera por el trabajo de sus hijas, no por su duración. La duración
de un resumen es el lapso de calendario que abarca: un bloque de 3 tareas estirado sobre tres meses
pesaría más que uno de 82 tareas concentrado en tres semanas. El peso es la suma de los días hábiles
de las hojas que cuelgan.

*Prueba*: dos ramas con el mismo trabajo y distinto lapso pesan igual.

### Fase 3 — Calidad continua

#### C8 · Motor de auditoría permanente

El plan de referencia pasa 20 controles automáticos. Implementar un linter que corra en cada guardado
y muestre los hallazgos en la interfaz. Mínimo:

1. Todo resumen tiene hijas y toda hoja no las tiene.
2. El nivel de una hija es el del padre más uno, sin saltos.
3. Toda tarea tiene inicio y fin.
4. El fin nunca antes que el inicio.
5. La duración coincide con los días hábiles del rango.
6. Los hitos duran cero.
7. Toda predecesora existe.
8. Ninguna predecesora apunta a una tarea posterior en el orden del plan, porque rompe la
   interoperabilidad con MS Project.
9. El tipo de vínculo es coherente con las fechas.
10. Ninguna tarea se sale de la ventana de su resumen padre.
11. Sin nombres duplicados dentro de un bloque.
12. Toda tarea tiene responsable.
13. Toda hoja tiene entregable y criterio de salida.
14. Ninguna hoja queda sin sucesora, porque una tarea de la que nadie depende puede atrasarse sin que
    el plan lo acuse.
15. El plan cierra en la fecha de compromiso o antes.
16. Ningún criterio de salida se repite más veces de las que tiene sentido.
17. Reporte —no falla— de los solapamientos declarados con desfase negativo.

*Prueba*: cada control con un caso que pasa y uno que falla.

#### C9 · Trazabilidad por línea

Cada tarea guarda de dónde salió: archivo, versión, identificador de origen. Cuando un plan integra
varias fuentes es lo único que permite reconciliar después.

*Regla de redacción*: la trazabilidad la ve el cliente. Nada de nombres de personas del equipo,
versiones internas ni notas de edición.

#### C10 · Criterios de salida verificables

Toda tarea hoja necesita un entregable concreto y un criterio que un tercero pueda comprobar sin
preguntarle a nadie. «Queda documentado» no es criterio. «El documento lista las 29 subredes con su
CIDR y el banco lo firmó» sí lo es.

*Prueba*: el linter marca los criterios genéricos y los repetidos en exceso.

### Fase 4 — Presentación

#### C11 · Gantt con estas capacidades

Pinta los vínculos con su tipo, resalta la ruta crítica y permite filtrar «solo ruta súper crítica».
Estudiar `referencia/Gantt BU V7.html` para las decisiones de interacción: agrupamiento por niveles
con botones 1-6, tres modos de visualización de dependencias, panel lateral con el detalle de la
tarea y navegación por predecesoras y sucesoras.

#### C12 · Documentación que se calcula sola

Si el sistema genera un resumen con cifras («este plan tiene N tareas, M hitos, K entregas del
cliente»), esas cifras se calculan del contenido al generar. Nunca se escriben a mano. En la
referencia, las cifras escritas a mano contradijeron al plan en cuanto se agregaron 14 líneas, y un
auditor lo detectó de inmediato.

#### C13 · Vista ejecutiva

Una vista para dirección, en lenguaje de negocio y sin jerga, que responda: en qué fecha cierra,
cuánto margen hay, qué lo puede mover, y qué depende del cliente. La hoja «Ruta Súper Crítica» del
Excel de referencia es el modelo de tono: explica el 74 % sin holgura como consecuencia de haber
construido el plan desde la fecha de compromiso hacia atrás, no como un defecto, y reparte la
responsabilidad entre las dos partes sin acusar a ninguna.

---

## Reglas firmes

1. **No rompas lo que ya funciona.** Antes de tocar un módulo correr las pruebas existentes y
   dejarlas pasando. Si una capacidad choca con el diseño actual, escribirlo y proponer la
   migración; no imponerla.
2. **Nada se da por bueno sin prueba automatizada.** Si no se sabe cómo probar algo, es que no está
   bien definido: aclararlo antes de escribirlo.
3. **No inventes datos.** Si el Excel no dice algo, no suponerlo: anotarlo como pregunta abierta.
4. **Todo lo que ve el cliente se escribe para el cliente.** Nada de nombres del equipo interno,
   versiones internas ni notas de trabajo en campos que el cliente lee.
5. **Español de México en la interfaz y en los mensajes**, sin adjetivos de relleno. Si una sigla
   técnica es inevitable, se expande la primera vez.
6. **Interoperabilidad con MS Project**: identificadores consecutivos y ninguna predecesora apuntando
   hacia adelante. Muchos clientes van a importar y exportar contra Project.
7. **Un commit por capacidad**, con su mensaje explicando qué regla implementa y por qué importa.

Si algo se bloquea porque necesita una decisión humana, se anota en la bitácora, se salta y se sigue
con la siguiente capacidad. No detenerse a esperar.
