-- A tip is a single payment from anyone, with or without an account, to an
-- author. reference is the id used in addresses, so tips cannot be found by
-- counting. status is one of 'pending_verification', 'pending_payment',
-- 'paid', 'expired', 'refunded'.
CREATE TABLE IF NOT EXISTS tips (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference CHAR(36) NOT NULL,
  author_id INT UNSIGNED NOT NULL,
  article_id INT UNSIGNED NULL,
  tipper_user_id INT UNSIGNED NULL,
  tipper_email VARCHAR(255) NOT NULL,
  tipper_name VARCHAR(64) NULL,
  message VARCHAR(280) NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(24) NOT NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tips_reference (reference),
  KEY ix_tips_author (author_id, created_at),
  KEY ix_tips_tipper (tipper_user_id, created_at),
  KEY ix_tips_status (status, created_at),
  CONSTRAINT fk_tips_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE,
  -- A tip outlives the article it was left on and the account that sent it.
  CONSTRAINT fk_tips_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE SET NULL,
  CONSTRAINT fk_tips_tipper FOREIGN KEY (tipper_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE payments
  ADD COLUMN tip_id INT UNSIGNED NULL AFTER membership_id,
  ADD KEY ix_payments_tip (tip_id),
  ADD CONSTRAINT fk_payments_tip FOREIGN KEY (tip_id) REFERENCES tips (id) ON DELETE SET NULL;

-- The codes emailed to guests to prove an address is theirs. Only a hash of
-- the code is kept. The newest row for a tip is the one that counts.
CREATE TABLE IF NOT EXISTS email_verifications (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tip_id INT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts INT UNSIGNED NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_email_verifications_tip (tip_id, created_at),
  KEY ix_email_verifications_email (email, created_at),
  CONSTRAINT fk_email_verifications_tip FOREIGN KEY (tip_id) REFERENCES tips (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
