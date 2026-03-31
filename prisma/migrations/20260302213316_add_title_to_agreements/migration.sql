/*
  Warnings:

  - Added the required column `title` to the `agreements` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: Add title column with default value for existing rows
ALTER TABLE `agreements` ADD COLUMN `title` VARCHAR(255) NOT NULL DEFAULT 'Acuerdo';

-- Update existing rows to use description as title (first 255 chars)
UPDATE `agreements` SET `title` = LEFT(`description`, 255) WHERE `title` = 'Acuerdo';

-- Remove default value for future inserts
ALTER TABLE `agreements` ALTER COLUMN `title` DROP DEFAULT;
