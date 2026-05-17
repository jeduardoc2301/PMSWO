-- CreateTable
CREATE TABLE `project_health_configs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `critical_blocker_min` INTEGER NOT NULL DEFAULT 1,
    `high_risk_min` INTEGER NOT NULL DEFAULT 1,
    `spi_min_elapsed_pct` DOUBLE NOT NULL DEFAULT 15.0,
    `critical_spi_threshold` DOUBLE NOT NULL DEFAULT 0.50,
    `at_risk_spi_threshold` DOUBLE NOT NULL DEFAULT 0.80,
    `overdue_task_pct_threshold` DOUBLE NOT NULL DEFAULT 25.0,
    `on_track_spi_min` DOUBLE NOT NULL DEFAULT 0.90,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_health_configs_organization_id_key`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_health_configs` ADD CONSTRAINT `project_health_configs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
