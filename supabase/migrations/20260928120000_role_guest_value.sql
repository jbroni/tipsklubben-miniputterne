-- Add 'guest' enum value to Role type
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'guest';
