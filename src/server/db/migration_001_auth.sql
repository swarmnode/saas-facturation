-- ============================================================
-- MIGRATION 001 — Authentification & multi-société
-- ============================================================

-- ============================================================
-- UTILISATEURS
-- ============================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
    id              SERIAL PRIMARY KEY,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    nom             TEXT NOT NULL,
    prenom          TEXT NOT NULL DEFAULT '',
    is_super_admin  INTEGER NOT NULL DEFAULT 0,
    actif           INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LIAISON UTILISATEURS <-> ENTREPRISES (avec rôle par société)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_entreprises (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
    entreprise_id   INTEGER NOT NULL REFERENCES entreprise(id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'lecteur',
    UNIQUE(user_id, entreprise_id)
);

-- ============================================================
-- AJOUT entreprise_id sur les tables qui n'en ont pas
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprise(id);
UPDATE clients SET entreprise_id = (SELECT id FROM entreprise ORDER BY id LIMIT 1) WHERE entreprise_id IS NULL;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprise(id);
UPDATE articles SET entreprise_id = (SELECT id FROM entreprise ORDER BY id LIMIT 1) WHERE entreprise_id IS NULL;

ALTER TABLE acomptes ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprise(id);
ALTER TABLE acomptes DISABLE TRIGGER trg_acompte_immutable;
UPDATE acomptes SET entreprise_id = (SELECT id FROM entreprise ORDER BY id LIMIT 1) WHERE entreprise_id IS NULL;
ALTER TABLE acomptes ENABLE TRIGGER trg_acompte_immutable;

-- sequence_numerotation : ajout entreprise_id + nouvelle contrainte unique
ALTER TABLE sequence_numerotation ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprise(id);
-- Supprime les lignes sans entreprise_id (insérées par schema.sql à chaque démarrage)
-- Le service NumerotationService crée les lignes à la demande
DELETE FROM sequence_numerotation WHERE entreprise_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sequence_numerotation_type_document_annee_key'
  ) THEN
    ALTER TABLE sequence_numerotation
      DROP CONSTRAINT sequence_numerotation_type_document_annee_key;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seq_num_type_annee_ent_key'
  ) THEN
    ALTER TABLE sequence_numerotation
      ADD CONSTRAINT seq_num_type_annee_ent_key UNIQUE(type_document, annee, entreprise_id);
  END IF;
END $$;

-- ============================================================
-- INDEX
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_clients_entreprise  ON clients(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_articles_entreprise ON articles(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_acomptes_entreprise ON acomptes(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_user_ent            ON user_entreprises(user_id, entreprise_id);
