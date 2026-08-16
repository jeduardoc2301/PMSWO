-- CreateTable
CREATE TABLE `project_calendars` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `working_weekdays` JSON NOT NULL,
    `holiday_country` VARCHAR(2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `project_calendars_project_id_key`(`project_id`),
    INDEX `project_calendars_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_holidays` (
    `id` CHAR(36) NOT NULL,
    `calendar_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `project_holidays_calendar_id_idx`(`calendar_id`),
    UNIQUE INDEX `project_holidays_calendar_id_date_key`(`calendar_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `project_calendars` ADD CONSTRAINT `project_calendars_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_calendars` ADD CONSTRAINT `project_calendars_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_holidays` ADD CONSTRAINT `project_holidays_calendar_id_fkey` FOREIGN KEY (`calendar_id`) REFERENCES `project_calendars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
