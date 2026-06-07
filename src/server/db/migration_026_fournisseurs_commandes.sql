-- Migration 026 : entité Fournisseurs + Commandes fournisseurs
-- Côté achats, aucune loi n'impose le scellement/verrouillage (contrairement aux
-- documents émis par l'entreprise) : commandes et chaînage commande↔facture sont
-- donc volontairement non bloquants (FK nullable, modifiable à tout moment).

CREATE TABLE IF NOT EXISTS fournisseurs (
    id                  SERIAL PRIMARY KEY,
    entreprise_id       INTEGER NOT NULL REFERENCES entreprise(id),
    raison_sociale      TEXT    NOT NULL,
    adresse             TEXT,
    adresse2            TEXT,
    code_postal         TEXT,
    ville               TEXT,
    pays                TEXT    NOT NULL DEFAULT 'France',
    email               TEXT,
    telephone           TEXT,
    siret               TEXT,
    tva_intracom        TEXT,
    iban                TEXT,
    bic                 TEXT,
    conditions_paiement TEXT,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fournisseurs_entreprise ON fournisseurs(entreprise_id);

-- Lien optionnel entre une facture d'achat et la fiche fournisseur correspondante
-- (les factures existantes restent en texte libre via fournisseur_nom/fournisseur_siret).
ALTER TABLE factures_fournisseurs ADD COLUMN IF NOT EXISTS fournisseur_id INTEGER REFERENCES fournisseurs(id);

CREATE TABLE IF NOT EXISTS commandes_fournisseurs (
    id                      SERIAL PRIMARY KEY,
    entreprise_id           INTEGER NOT NULL REFERENCES entreprise(id),
    numero                  TEXT    NOT NULL,
    fournisseur_id          INTEGER REFERENCES fournisseurs(id),
    fournisseur_nom         TEXT    NOT NULL,
    date_commande           TEXT    NOT NULL,
    date_livraison_prevue   TEXT,
    description             TEXT,
    montant_ht              NUMERIC(12,2) NOT NULL DEFAULT 0,
    statut                  TEXT    NOT NULL DEFAULT 'en_cours',
    -- Chaînage non bloquant : référence facultative vers la facture d'achat associée.
    -- Aucun verrou : modifiable/supprimable à tout moment, dans les deux sens.
    facture_fournisseur_id  INTEGER REFERENCES factures_fournisseurs(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commandes_fournisseurs_entreprise ON commandes_fournisseurs(entreprise_id);
