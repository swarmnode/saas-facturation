-- Migration 018 — Exercices comptables (clôture annuelle loi anti-fraude TVA)
CREATE TABLE IF NOT EXISTS exercices (
  id              SERIAL PRIMARY KEY,
  annee           INTEGER      NOT NULL,
  entreprise_id   INTEGER      NOT NULL REFERENCES entreprise(id),
  date_ouverture  DATE         NOT NULL DEFAULT CURRENT_DATE,
  date_cloture    DATE,
  statut          TEXT         NOT NULL DEFAULT 'ouvert',
  clos_le         TIMESTAMPTZ,
  nb_ecritures    INTEGER,
  hash_cloture    TEXT,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (annee, entreprise_id)
);
