-- Migration 024 : lignes de commentaire dans tous les documents
-- Une ligne de type 'commentaire' est du texte libre sans montant (pleine largeur dans le PDF)

ALTER TABLE devis_lignes          ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'ligne';
ALTER TABLE factures_lignes       ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'ligne';
ALTER TABLE avenants_lignes       ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'ligne';
ALTER TABLE bons_livraison_lignes ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'ligne';
