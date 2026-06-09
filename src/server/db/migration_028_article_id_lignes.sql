ALTER TABLE devis_lignes    ADD COLUMN IF NOT EXISTS article_id INTEGER REFERENCES articles(id);
ALTER TABLE factures_lignes ADD COLUMN IF NOT EXISTS article_id INTEGER REFERENCES articles(id);
