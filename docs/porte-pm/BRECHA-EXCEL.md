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
| **E1** · Esquema multinivel expandible en Elementos de Trabajo | NO EXISTE — lista plana agrupada por fase | PENDIENTE | — |
| **E2** · Columna Tipo por línea (Etapa/Fase/Bloque/Actividad/Aprobación…) | PARCIAL — `kind` está en la base, no se muestra | PENDIENTE | — |
| **E3** · % avance por línea, capturable, con acumulado ponderado en resúmenes | PARCIAL — `progressPct` existe; el motor de rollup existe (C7); sin pantalla ni captura | PENDIENTE | — |
| **E4** · Fecha de corte del avance por proyecto | NO EXISTE | PENDIENTE | — |
| **E5** · Estado derivado del corte (No iniciado/En curso/Cerrado) | NO EXISTE — el estado del sistema es de kanban, no de corte | PENDIENTE | — |
| **E6** · Atraso (−) / Ventaja (+) en días por línea | NO EXISTE | PENDIENTE | — |
| **E7** · Responsable real por línea (las dos partes, sin exigir cuenta) | PARCIAL — solo el del cliente (`clientOwner`); el del proveedor quedó en la descripción | PENDIENTE | — |
| **E8** · Predecesoras visibles y editables por línea | PARCIAL — visibles en el Timeline; ni visibles en la lista ni editables en ningún lado | PENDIENTE | — |
| **E9** · Reimportar el plan actualizado sin perder lo capturado en la plataforma | PARCIAL — `--replace` borra y recrea; pisa avance capturado aquí | PENDIENTE | — |

## Nota sobre el avance del archivo

El Excel del usuario muestra avance capturado (53%, 80%, En curso…) pero **el archivo en disco tiene
cero en todas las celdas de avance**: AutoSave está apagado y los cambios viven solo en su sesión.
Verificado leyendo la celda cruda (H9 = 0, dato plano). Cuando guarde, `scripts/import-plan-db.ts
--replace` trae el avance real; E9 existe para que ese refresco no pise lo capturado en el sistema.
