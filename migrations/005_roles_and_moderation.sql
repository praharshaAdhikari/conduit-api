-- role is one of 'user', 'moderator', 'admin'. Everyone who already has an
-- account becomes an ordinary user.
ALTER TABLE users
  ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER image,
  ADD COLUMN suspended_at DATETIME(3) NULL AFTER role,
  ADD COLUMN suspended_reason VARCHAR(255) NULL AFTER suspended_at;

-- A hidden article keeps its row, tags, favorites and comments; it is only
-- left out of what other people can see.
ALTER TABLE articles
  ADD COLUMN hidden_at DATETIME(3) NULL AFTER author_id,
  ADD COLUMN hidden_by INT UNSIGNED NULL AFTER hidden_at,
  ADD COLUMN hidden_reason VARCHAR(255) NULL AFTER hidden_by,
  ADD CONSTRAINT fk_articles_hidden_by FOREIGN KEY (hidden_by) REFERENCES users (id) ON DELETE SET NULL;

-- The log of what moderators and admins did. target_label is the username or
-- slug at the time, so an entry still reads after its target is renamed or deleted.
CREATE TABLE IF NOT EXISTS moderation_actions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  moderator_id INT UNSIGNED NOT NULL,
  action VARCHAR(16) NOT NULL,
  target_type VARCHAR(16) NOT NULL,
  target_id INT UNSIGNED NOT NULL,
  target_label VARCHAR(255) NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_moderation_actions_created (created_at, id),
  CONSTRAINT fk_moderation_actions_moderator FOREIGN KEY (moderator_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
