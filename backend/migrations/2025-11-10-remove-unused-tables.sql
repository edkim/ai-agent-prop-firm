-- Migration: Remove unused tables
-- Date: 2025-11-10
-- Description: Remove conversations, pivot_points_cache, and support_resistance_levels tables
--              These tables have no code references and no data.

DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS pivot_points_cache;
DROP TABLE IF EXISTS support_resistance_levels;
