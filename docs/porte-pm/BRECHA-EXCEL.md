# Brecha: paridad con el Excel en la plataforma

Segundo encargo, levantado el 17 de agosto de 2026 sobre la captura del propio Excel abierta por el
usuario. El primero portó el motor y lo dejó visible en el Timeline; este cierra lo que el Excel
sigue haciendo mejor que el sistema **en las pantallas donde se trabaja**.

Mismas reglas que el primero: **«YA EXISTE» no es «HECHO»** — solo la prueba de aceptación mueve la
columna. Cierre: las capacidades E1–E9 en HECHO o DESCARTADA con razón escrita, batería completa en
verde, y la pantalla de elementos reproduciendo contra el plan importado las cifras que el Excel
calcula con sus fórmulas.

## La regla del atraso, deducida y verificada

Estado y Atraso/Ventaja son fórmulas en el Excel. Regla deducida de la hoja y verificada contra
cuatro cifras de la captura del usuario:

    esperado = min(1, días hábiles del inicio al corte / duración hábil)
    atraso   = (avance real − esperado) × duración hábil        [− atraso, + ventaja]
    estado   = avance 0 → No iniciado · 0<avance<1 → En curso · 1 → Cerrado

| Caso de la captura | Cálculo | Excel |
|---|---|---|
| Presentar el plan (5 d, 80%) | (0.80−1.00)×5 | **−1.0** ✓ |
| Aprobar el plan (1 d, 50%) | (0.50−1.00)×1 | **−0.5** ✓ |
| Fase Inicio (6 d, 75%) | (0.75−1.00)×6 | **−1.5** ✓ |
| Gestión del Cambio (17 d, 0%, corte a 14/17) | (0−0.824)×17 | **−14.0** ✓ |

## Tablero

| Capacidad | Cómo llegó | Cómo va | Prueba que lo acredita |
|---|---|---|---|
| **E1** · Esquema multinivel expandible en Elementos de Trabajo | NO EXISTE — lista plana agrupada por fase | **HECHO** | [work-items-outline.test.tsx](components/projects/__tests__/work-items-outline.test.tsx) (21) |
| **E2** · Columna Tipo por línea (Etapa/Fase/Bloque/Actividad/Aprobación…) | PARCIAL — `kind` está en la base, no se muestra | **HECHO** | misma prueba: tipos en palabras, ninguna enumeración cruda |
| **E3** · % avance por línea, capturable, con acumulado ponderado en resúmenes | PARCIAL — `progressPct` existe; el motor de rollup existe (C7); sin pantalla ni captura | **HECHO** | misma prueba + [work-items-view.test.tsx](components/projects/__tests__/work-items-view.test.tsx) (12): captura optimista con reversión avisada |
| **E4** · Fecha de corte del avance por proyecto | NO EXISTE | **HECHO** | `progress_cutoff_date` + barra de corte congelar/descongelar, probada en las dos |
| **E5** · Estado derivado del corte (No iniciado/En curso/Cerrado) | NO EXISTE — el estado del sistema es de kanban, no de corte | **HECHO** | [schedule-variance.test.ts](lib/scheduling/__tests__/schedule-variance.test.ts) (19) |
| **E6** · Atraso (−) / Ventaja (+) en días por línea | NO EXISTE | **HECHO** | misma prueba: la fórmula J del archivo, celda por celda, incluida la rama de hitos |
| **E7** · Responsable real por línea (las dos partes, sin exigir cuenta) | PARCIAL — solo el del cliente (`clientOwner`); el del proveedor quedó en la descripción | **HECHO** | `responsible_name` 1 368/1 368 + prueba del esquema |
| **E8** · Predecesoras visibles y editables por línea | PARCIAL — visibles en el Timeline; ni visibles en la lista ni editables en ningún lado | **HECHO** | [dependency.service.test.ts](services/__tests__/dependency.service.test.ts) (8, incluida la validación de ciclos con el motor real) · [dependency-editor.test.tsx](components/projects/__tests__/dependency-editor.test.tsx) (11) · viaje completo verificado por HTTP: alta 201, el plan lo trae, baja 200, y el ciclo rechazado con 400 nombrando sus líneas |
| **E9** · Reimportar el plan actualizado sin perder lo capturado en la plataforma | PARCIAL — `--replace` borra y recrea; pisa avance capturado aquí | **HECHO** | [plan-merge.test.ts](services/__tests__/plan-merge.test.ts) (10) + verificación e2e contra el proyecto real: capturas conservadas, elemento manual intacto, 1 665 vínculos reconstruidos |

**Avance:** **9 en HECHO · 0 en PENDIENTE. El encargo está cerrado.**

### El cierre de E8, en corto

La columna «Vínculos» del esquema muestra cuántos entran (◂) y salen (▸) de cada línea; en las hojas
abre el editor: lista de predecesoras con su tipo y desfase rotulados, quitar por vínculo, y captura
con buscador que excluye a la propia línea y a las ya vinculadas. La validación que no negocia es la
de ciclos: se arma el grafo con el motor **antes** de escribir, y el rechazo nombra las líneas del
ciclo — verificado contra el plan real intentando cerrar 3→4→3. Las sucesoras se leen pero se
capturan desde la línea que espera, que es donde la pregunta tiene dueño.

### La política del refresco (E9), escrita

El emparejamiento es por `sourceId` —el número de fila del archivo, la misma identidad que el
archivo usa para sus predecesoras—. El avance tiene una sola regla: **el archivo manda cuando dice
algo (avance > 0); cuando calla, lo capturado en la plataforma se conserva.** Consecuencia
deliberada: bajar un avance a cero no se puede por reimportación — se hace en la plataforma, donde
la intención es inequívoca. Lo creado a mano (sin `sourceId`) no se toca: el archivo no sabe de
ello. Uso: `npx tsx scripts/import-plan-db.ts --merge`.

## Nota sobre el avance del archivo

El Excel del usuario muestra avance capturado (53%, 80%, En curso…) pero **el archivo en disco tiene
cero en todas las celdas de avance**: AutoSave está apagado y los cambios viven solo en su sesión.
Verificado leyendo la celda cruda (H9 = 0, dato plano). Cuando guarde, `scripts/import-plan-db.ts
--replace` trae el avance real; E9 existe para que ese refresco no pise lo capturado en el sistema.
