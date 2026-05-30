-- ============================================================
-- MIGRATION 002 — Configuration sauvegarde automatique
-- ============================================================
CREATE TABLE IF NOT EXISTS backup_config (
    id              SERIAL PRIMARY KEY,
    actif           INTEGER NOT NULL DEFAULT 0,
    destination     TEXT NOT NULL DEFAULT '',
    periodicite     TEXT NOT NULL DEFAULT 'quotidienne',
    heure           TEXT NOT NULL DEFAULT '02:00',
    jour_semaine    INTEGER NOT NULL DEFAULT 1,
    jour_mois       INTEGER NOT NULL DEFAULT 1,
    taille_max_mo   INTEGER NOT NULL DEFAULT 500,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ligne unique de config (toujours id=1)
INSERT INTO backup_config (id) VALUES (1) ON CONFLICT DO NOTHING;
