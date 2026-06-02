-- Migration 017 — Isolation multi-tenant sur archive_documents
-- NOTE : archive_documents est immuable (trigger BEFORE UPDATE), pas de backfill possible.
-- Les archives existantes (entreprise_id NULL) restent visibles uniquement via super_admin.
-- Les nouvelles archives sont créées avec entreprise_id renseigné.
ALTER TABLE archive_documents ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprise(id);
