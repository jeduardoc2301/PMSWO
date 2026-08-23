-- Las tres columnas de minutos que el esquema declaraba y ninguna migración creaba.
--
-- `prisma/schema.prisma` las tiene desde que el motor sabe programar en minutos (§3.5), pero la base
-- local se construyó con `db push`, que sincroniza el esquema sin dejar rastro en `migrations/`. Con
-- `prisma migrate deploy` —que es lo que corre `npm run db:deploy`— las tablas salían SIN ellas, y
-- los `select: { lagMinutes: true }` de `services/dependency.service.ts` y `schedule.service.ts`
-- reventaban contra una base recién construida.
--
-- No es un fallo de cálculo: es un despliegue que no arranca. Y no se nota en local justamente
-- porque en local nadie despliega por migraciones.
--
-- Sin `IF NOT EXISTS`: eso es de MariaDB y MySQL 8 no lo admite en `ADD COLUMN` — lo probé y el
-- despliegue se cayó en la primera sentencia. Sobre una base ya sincronizada con `db push` esta
-- migración fallaría, y ahí es donde sirve `prisma migrate resolve --applied`, que es justamente
-- para marcar como aplicado lo que ya está puesto.

ALTER TABLE `work_items`        ADD COLUMN `duration_minutes` INT NULL;
ALTER TABLE `task_dependencies` ADD COLUMN `lag_minutes`      INT NULL;
ALTER TABLE `baseline_items`    ADD COLUMN `duration_minutes` INT NULL;
