-- Add phase column to work_items table
-- Phase is optional (nullable) since work items can be created manually without a template
ALTER TABLE `work_items` ADD COLUMN `phase` VARCHAR(255) NULL AFTER `description`;

-- Add index for efficient phase-based queries
CREATE INDEX `idx_work_items_phase` ON `work_items`(`phase`);
