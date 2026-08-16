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
