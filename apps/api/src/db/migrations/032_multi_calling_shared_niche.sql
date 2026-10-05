-- Migration to allow multiple lanes to share the same niche

DROP INDEX IF EXISTS ai_calling_lanes_active_niche_uq;
