-- Reportes que se mandan solos por correo.
--
-- Dos tablas: qué se manda y a quién (`report_subscriptions`), y qué pasó cada día
-- (`report_deliveries`).
--
-- El índice único de `report_deliveries` no es un detalle de higiene: es lo que impide el correo
-- duplicado. La fila se reclama antes de hablar con SES, así que un segundo disparo del mismo día
-- —EventBridge reintentando, o alguien probando el endpoint a mano— choca contra la restricción y
-- se sale sin mandar nada. Sin este índice, cualquier reintento de cualquier capa le llega al
-- director como un correo repetido.
CREATE TABLE `report_subscriptions` (
  `id` CHAR(36) NOT NULL,
  `organization_id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NOT NULL,
  `recipients` JSON NOT NULL,
  `frequency` VARCHAR(20) NOT NULL DEFAULT 'DIARIO',
  `send_hour` INTEGER NOT NULL DEFAULT 8,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'America/Mexico_City',
  `locale` VARCHAR(5) NOT NULL DEFAULT 'es',
  `detail_level` VARCHAR(20) NOT NULL DEFAULT 'EXECUTIVE',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `last_sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `report_subscriptions_active_frequency_idx`(`active`, `frequency`),
  INDEX `report_subscriptions_organization_id_idx`(`organization_id`),
  INDEX `report_subscriptions_project_id_idx`(`project_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `report_deliveries` (
  `id` CHAR(36) NOT NULL,
  `subscription_id` CHAR(36) NOT NULL,
  `scheduled_for` DATE NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'ENVIANDO',
  `message_id` VARCHAR(255) NULL,
  `error` TEXT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `recipients` JSON NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `report_deliveries_subscription_id_scheduled_for_key`(`subscription_id`, `scheduled_for`),
  INDEX `report_deliveries_status_idx`(`status`),
  INDEX `report_deliveries_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `report_subscriptions`
  ADD CONSTRAINT `report_subscriptions_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `report_subscriptions`
  ADD CONSTRAINT `report_subscriptions_project_id_fkey`
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `report_deliveries`
  ADD CONSTRAINT `report_deliveries_subscription_id_fkey`
  FOREIGN KEY (`subscription_id`) REFERENCES `report_subscriptions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
