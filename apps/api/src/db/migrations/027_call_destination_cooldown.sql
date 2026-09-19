-- Keep the tenant-wide recent-destination check fast as call history grows.
CREATE INDEX IF NOT EXISTS idx_tracked_calls_destination_cooldown
  ON tracked_calls (tenant_id, destination_number, created_at DESC)
  WHERE direction = 'outbound';
