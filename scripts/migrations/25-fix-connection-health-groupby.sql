-- Fix GROUP BY error in update_connection_health function
-- The issue: Using COUNT(*) with ORDER BY created_at causes PostgreSQL to require GROUP BY
-- Solution: Use a subquery to get the last 10 jobs first, then count them

CREATE OR REPLACE FUNCTION update_connection_health(p_connection_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_health_score INTEGER;
  v_recent_jobs_count INTEGER;
  v_failed_jobs_count INTEGER;
  v_success_rate NUMERIC;
  v_consecutive_failures INTEGER;
  v_last_sync_hours_ago NUMERIC;
BEGIN
  -- Get recent job stats (last 10 jobs) - FIXED: Use subquery to avoid GROUP BY issue
  SELECT 
    COUNT(*),
    COUNT(CASE WHEN status = 'failed' THEN 1 END)
  INTO v_recent_jobs_count, v_failed_jobs_count
  FROM (
    SELECT status
    FROM ingestion_jobs
    WHERE connection_id = p_connection_id
    ORDER BY created_at DESC
    LIMIT 10
  ) recent_jobs;
  
  -- Get consecutive failures
  SELECT consecutive_failures
  INTO v_consecutive_failures
  FROM connections
  WHERE id = p_connection_id;
  
  -- Calculate hours since last sync
  SELECT EXTRACT(EPOCH FROM (NOW() - last_sync_at)) / 3600
  INTO v_last_sync_hours_ago
  FROM connections
  WHERE id = p_connection_id;
  
  -- Calculate health score (0-100)
  v_health_score := 100;
  
  -- Deduct points for failures
  IF v_recent_jobs_count > 0 THEN
    v_success_rate := (v_recent_jobs_count - v_failed_jobs_count)::NUMERIC / v_recent_jobs_count;
    v_health_score := v_health_score - ((1 - v_success_rate) * 40)::INTEGER;
  END IF;
  
  -- Deduct points for consecutive failures
  v_health_score := v_health_score - (v_consecutive_failures * 15);
  
  -- Deduct points for stale connections (no sync in 7+ days)
  IF v_last_sync_hours_ago > 168 THEN -- 7 days
    v_health_score := v_health_score - 20;
  ELSIF v_last_sync_hours_ago > 72 THEN -- 3 days
    v_health_score := v_health_score - 10;
  END IF;
  
  -- Ensure health score is between 0-100
  v_health_score := GREATEST(0, LEAST(100, v_health_score));
  
  -- Update connection
  UPDATE connections
  SET health_score = v_health_score,
      updated_at = NOW()
  WHERE id = p_connection_id;
  
  RETURN v_health_score;
END;
$$;

COMMENT ON FUNCTION update_connection_health IS 'Updates connection health score based on recent job performance. Fixed GROUP BY error by using subquery.';

