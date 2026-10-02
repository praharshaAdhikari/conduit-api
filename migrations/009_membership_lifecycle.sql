-- What happened to each membership, in order. reason is the change that was
-- applied ('paid', 'payment_failed', 'grace_ended', ...); source is who or
-- what applied it: 'member', 'webhook', 'reconcile' or 'admin'.
CREATE TABLE IF NOT EXISTS membership_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  membership_id INT UNSIGNED NOT NULL,
  from_status VARCHAR(16) NULL,
  to_status VARCHAR(16) NOT NULL,
  reason VARCHAR(32) NOT NULL,
  source VARCHAR(16) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_membership_events_membership (membership_id, created_at, id),
  CONSTRAINT fk_membership_events_membership FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per run of the reconcile job, with what it found. finished_at is
-- NULL while a run is in progress, or if it was cut off.
CREATE TABLE IF NOT EXISTS reconcile_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  started_by VARCHAR(16) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NULL,
  report JSON NULL,
  PRIMARY KEY (id),
  KEY ix_reconcile_runs_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
