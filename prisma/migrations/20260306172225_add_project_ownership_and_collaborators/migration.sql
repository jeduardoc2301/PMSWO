/*
  Warnings:

  - Added the required column `owner_id` to the `projects` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Add owner_id column as nullable first
ALTER TABLE `projects` ADD COLUMN `owner_id` CHAR(36) NULL;

-- Step 2: Set owner_id for existing projects
-- Assign the first PROJECT_MANAGER or ADMIN user from the organization as owner
UPDATE `projects` p
SET p.`owner_id` = (
  SELECT u.`id`
  FROM `users` u
  WHERE u.`organization_id` = p.`organization_id`
    AND (
      JSON_CONTAINS(u.`roles`, '"PROJECT_MANAGER"')
      OR JSON_CONTAINS(u.`roles`, '"ADMIN"')
    )
  ORDER BY 
    CASE 
      WHEN JSON_CONTAINS(u.`roles`, '"PROJECT_MANAGER"') THEN 1
      WHEN JSON_CONTAINS(u.`roles`, '"ADMIN"') THEN 2
      ELSE 3
    END,
    u.`created_at` ASC
  LIMIT 1
)
WHERE p.`owner_id` IS NULL;

-- Step 3: Make owner_id NOT NULL
ALTER TABLE `projects` MODIFY COLUMN `owner_id` CHAR(36) NOT NULL;

-- CreateTable
CREATE TABLE `project_collaborators` (
    `id` CHAR(36) NOT NULL,
    `project_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'COLLABORATOR',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `project_collaborators_project_id_idx`(`project_id`),
    INDEX `project_collaborators_user_id_idx`(`user_id`),
    UNIQUE INDEX `project_collaborators_project_id_user_id_key`(`project_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `projects_owner_id_idx` ON `projects`(`owner_id`);

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_collaborators` ADD CONSTRAINT `project_collaborators_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_collaborators` ADD CONSTRAINT `project_collaborators_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
