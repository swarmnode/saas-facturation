-- Migration 013 — Journal d'audit
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  entreprise_id INTEGER REFERENCES entreprise(id),
  user_id       INTEGER REFERENCES utilisateurs(id),
  user_email    TEXT,
  action        TEXT NOT NULL,
  ressource     TEXT,
  ressource_id  INTEGER,
  details       JSONB,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entreprise ON audit_log(entreprise_id, created_at DESC);
