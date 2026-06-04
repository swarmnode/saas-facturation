-- Migration 023 — Factures fournisseurs
-- Permet la saisie des achats fournisseurs pour alimenter le FEC (compte 401)
-- et calculer automatiquement la TVA déductible (CA3 section B).

CREATE TABLE IF NOT EXISTS factures_fournisseurs (
  id                SERIAL       PRIMARY KEY,
  entreprise_id     INTEGER      NOT NULL REFERENCES entreprise(id),
  numero            TEXT         NOT NULL,
  fournisseur_nom   TEXT         NOT NULL,
  fournisseur_siret TEXT,
  date_facture      DATE         NOT NULL,
  date_echeance     DATE,
  montant_ht        FLOAT8       NOT NULL,
  taux_tva          FLOAT8       NOT NULL DEFAULT 20,
  montant_tva       FLOAT8       NOT NULL,
  montant_ttc       FLOAT8       NOT NULL,
  compte_charge     TEXT         NOT NULL DEFAULT '606',
  description       TEXT,
  statut            TEXT         NOT NULL DEFAULT 'recue',  -- recue | payee
  date_paiement     DATE,
  mode_paiement     TEXT,
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- FK sur fec_ecritures pour lier les écritures fournisseurs
ALTER TABLE fec_ecritures
  ADD COLUMN IF NOT EXISTS facture_fournisseur_id INTEGER REFERENCES factures_fournisseurs(id);
