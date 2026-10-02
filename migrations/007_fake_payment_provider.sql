-- The state of the built-in fake payment provider (PAYMENT_PROVIDER=fake).
-- These tables stand in for what a real provider keeps on its own servers;
-- the rest of the API never reads them directly.

CREATE TABLE IF NOT EXISTS fake_pay_checkouts (
  id VARCHAR(40) NOT NULL,
  reference CHAR(36) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  description VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  recurring VARCHAR(8) NULL,
  success_url VARCHAR(2048) NOT NULL,
  cancel_url VARCHAR(2048) NOT NULL,
  status VARCHAR(16) NOT NULL,
  subscription_id VARCHAR(40) NULL,
  payment_id VARCHAR(40) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fake_pay_subscriptions (
  id VARCHAR(40) NOT NULL,
  reference CHAR(36) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  recurring VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL,
  current_period_end DATETIME(3) NOT NULL,
  cancel_at_period_end TINYINT(1) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS fake_pay_payments (
  id VARCHAR(40) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  subscription_id VARCHAR(40) NULL,
  refunded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every event the fake provider has produced, whether or not it was delivered.
CREATE TABLE IF NOT EXISTS fake_pay_events (
  id VARCHAR(40) NOT NULL,
  type VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  deliveries INT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_fake_pay_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
