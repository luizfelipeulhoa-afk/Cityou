-- Beta por convite (decisão do dono 7, 13/11/2026) e limite de tentativas por IP. Ver worker/auth.js.
-- O código do convite e o IP nunca são guardados em texto: só o SHA-256.

CREATE TABLE invites (
  code_hash TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  max_uses INTEGER NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

ALTER TABLE users ADD COLUMN invite_hash TEXT;

-- A limpeza das sessões vencidas (worker/auth.js, cleanUp) apaga por expires_at.
CREATE INDEX sessions_expires ON sessions(expires_at);

CREATE TABLE ip_attempts (
  ip_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, action, window_start)
);
