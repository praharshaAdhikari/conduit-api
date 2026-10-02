-- A members-only article shows its body only to members, its author and moderators.
ALTER TABLE articles
  ADD COLUMN members_only TINYINT(1) NOT NULL DEFAULT 0 AFTER body;

-- One row per user who has ever started a membership; it is reused when they
-- join again. status is one of 'pending', 'active', 'past_due', 'cancelled', 'lapsed'.
CREATE TABLE IF NOT EXISTS memberships (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  plan VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  provider_subscription_id VARCHAR(255) NULL,
  current_period_end DATETIME(3) NULL,
  cancel_at_period_end TINYINT(1) NOT NULL,
  started_at DATETIME(3) NULL,
  ended_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_memberships_user (user_id),
  UNIQUE KEY uq_memberships_subscription (provider, provider_subscription_id),
  KEY ix_memberships_status (status),
  CONSTRAINT fk_memberships_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Money is stored in the smallest unit of the currency (cents), never as a
-- decimal. reference is the id handed to the payment provider at checkout; it
-- comes back in the webhook. status is one of 'pending', 'succeeded',
-- 'expired', 'refunded'.
CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference CHAR(36) NOT NULL,
  kind VARCHAR(16) NOT NULL,
  user_id INT UNSIGNED NULL,
  membership_id INT UNSIGNED NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  description VARCHAR(255) NOT NULL,
  status VARCHAR(16) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  provider_checkout_id VARCHAR(255) NULL,
  provider_payment_id VARCHAR(255) NULL,
  paid_at DATETIME(3) NULL,
  refunded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_reference (reference),
  UNIQUE KEY uq_payments_provider_payment (provider, provider_payment_id),
  KEY ix_payments_user (user_id, created_at),
  KEY ix_payments_membership (membership_id, paid_at),
  -- A payment record outlives the account and the membership it was for.
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_membership FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Every webhook event received, once. The unique key is what makes a repeated
-- delivery of the same event harmless.
CREATE TABLE IF NOT EXISTS payment_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(16) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  outcome VARCHAR(255) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_events_event (provider, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
