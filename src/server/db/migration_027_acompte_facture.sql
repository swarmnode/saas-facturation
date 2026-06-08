-- Lie une facture à l'acompte encaissé utilisé pour son paiement
ALTER TABLE factures ADD COLUMN IF NOT EXISTS acompte_id INTEGER REFERENCES acomptes(id);
ALTER TABLE factures ADD COLUMN IF NOT EXISTS montant_acompte_applique FLOAT8;

-- Libellé libre sur un acompte (ex: "Reliquat — AC-2025-0001")
ALTER TABLE acomptes ADD COLUMN IF NOT EXISTS notes TEXT;
