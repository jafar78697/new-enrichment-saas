-- Migration: Add username column to agents table
-- This fixes the "Grant Access" feature which requires unique usernames

ALTER TABLE agents ADD COLUMN username TEXT UNIQUE;
