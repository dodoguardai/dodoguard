-- Migration: add detailed exposure surface description for Agent assets.

ALTER TABLE `agent_assets`
  ADD COLUMN `exposure_surface` TEXT NULL AFTER `exposure_level`;
