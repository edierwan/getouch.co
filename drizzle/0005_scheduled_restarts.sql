CREATE TYPE scheduled_restart_type AS ENUM ('one-time', 'daily', 'weekly');

CREATE TABLE scheduled_restarts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_host VARCHAR(160) NOT NULL,
  target_label VARCHAR(160) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_type scheduled_restart_type NOT NULL DEFAULT 'daily',
  timezone VARCHAR(80) NOT NULL,
  one_time_at TIMESTAMPTZ,
  daily_time VARCHAR(5),
  weekly_day INTEGER,
  weekly_time VARCHAR(5),
  note TEXT,
  next_run_at TIMESTAMPTZ,
  last_applied_at TIMESTAMPTZ,
  last_applied_by VARCHAR(255),
  last_remote_status VARCHAR(40),
  last_remote_message TEXT,
  last_remote_sync_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX scheduled_restarts_target_host_idx
  ON scheduled_restarts (target_host);

CREATE TABLE scheduled_restart_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restart_id UUID REFERENCES scheduled_restarts(id) ON DELETE CASCADE,
  target_host VARCHAR(160) NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL,
  summary VARCHAR(255) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_email VARCHAR(255),
  source VARCHAR(40) NOT NULL DEFAULT 'portal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scheduled_restart_logs_target_host_idx
  ON scheduled_restart_logs (target_host);

CREATE INDEX scheduled_restart_logs_created_at_idx
  ON scheduled_restart_logs (created_at);