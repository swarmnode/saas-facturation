-- Migration 017 — Isolation multi-tenant sur archive_documents
ALTER TABLE archive_documents ADD COLUMN IF NOT EXISTS entreprise_id INTEGER REFERENCES entreprise(id);

-- Backfill depuis le JSON snapshot (les documents contiennent entreprise_id)
UPDATE archive_documents
  SET entreprise_id = (json_snapshot::jsonb->>'entreprise_id')::integer
  WHERE entreprise_id IS NULL
    AND json_snapshot::jsonb ? 'entreprise_id'
    AND (json_snapshot::jsonb->>'entreprise_id') ~ '^\d+$';
