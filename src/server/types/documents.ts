// Types des documents commerciaux (devis, factures, acomptes, bons de livraison)
// tels que retournés par les services `obtenir()` : colonnes de la table de base
// + champs ajoutés par les jointures + lignes le cas échéant.

export interface DevisLigne {
  id: number;
  devis_id: number;
  position: number;
  type: 'ligne' | 'commentaire';
  designation: string;
  description: string | null;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number;
  taux_tva_id: number;
  taux_tva_valeur: number;
  remise_pct: number;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  article_id: number | null;
}

export interface Devis {
  id: number;
  numero: string;
  client_id: number;
  entreprise_id: number;
  statut: string;
  date_creation: string;
  date_envoi: string | null;
  date_signature: string | null;
  date_validite: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  is_free: number;
  objet: string | null;
  conditions_paiement: string | null;
  notes: string | null;
  locked: number;
  hash_scellement: string | null;
  pdf_path: string | null;
  created_at: string;
  updated_at: string;
  created_by: number | null;
  signature_token: string | null;
  signature_ip: string | null;
  signature_date: string | null;
  signature_nom: string | null;
  // Champs ajoutés par la jointure dans obtenir()/lister()
  client_nom: string | null;
  client_nom_part: string | null;
  // Lignes du devis
  lignes: DevisLigne[];
}

export interface FactureLigne {
  id: number;
  facture_id: number;
  position: number;
  type: 'ligne' | 'commentaire';
  designation: string;
  description: string | null;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number;
  taux_tva_id: number;
  taux_tva_valeur: number;
  remise_pct: number;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  numero_serie: string | null;
  article_id: number | null;
}

export interface Facture {
  id: number;
  numero: string;
  devis_id: number | null;
  client_id: number;
  entreprise_id: number;
  type_facture: string;
  statut: string;
  date_emission: string;
  date_echeance: string | null;
  date_paiement: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  tva_mode: string;
  conditions_paiement: string | null;
  mode_paiement: string | null;
  notes: string | null;
  locked: number;
  hash_scellement: string;
  hash_precedent: string | null;
  pdf_path: string | null;
  facturx_xml_path: string | null;
  created_at: string;
  updated_at: string;
  facture_origine_id: number | null;
  type_avoir: string | null;
  numero_commande: string | null;
  escompte_taux: number | null;
  penalites_taux: string | null;
  indemnite_recouvrement: number | null;
  chorus_pro_id: string | null;
  chorus_pro_statut: string | null;
  derniere_relance: string | null;
  nb_relances: number | null;
  notif_echeance_envoyee: string | null;
  acompte_id: number | null;
  montant_acompte_applique: number | null;
  // Champs ajoutés par la jointure dans obtenir()/lister()
  client_nom: string | null;
  client_nom_part: string | null;
  mode_reglement_defaut: string | null;
  facture_origine_numero: string | null;
  acompte_numero: string | null;
  // Lignes de la facture
  lignes: FactureLigne[];
}

export interface Acompte {
  id: number;
  numero: string;
  facture_id: number | null;
  devis_id: number | null;
  client_id: number;
  entreprise_id: number;
  pourcentage: number | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  taux_tva_valeur: number;
  tva_exigible_encaissement: number;
  date_encaissement: string | null;
  mode_paiement: string | null;
  statut: string;
  locked: number;
  hash_scellement: string | null;
  pdf_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Champs ajoutés par la jointure dans obtenir()/lister()
  client_nom: string | null;
  client_nom_part: string | null;
  facture_utilisee_numero: string | null;
}

export interface BonLivraisonLigne {
  id: number;
  bl_id: number;
  position: number;
  type: 'ligne' | 'commentaire';
  designation: string;
  description: string | null;
  quantite: number;
  unite: string | null;
  article_id: number | null;
  numero_serie: string | null;
}

export interface BonLivraison {
  id: number;
  numero: string;
  client_id: number;
  entreprise_id: number;
  devis_id: number | null;
  facture_id: number | null;
  statut: string;
  date_emission: string;
  date_livraison: string | null;
  lieu_livraison: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Champs ajoutés par la jointure dans obtenir()/lister()
  client_nom: string | null;
  client_nom_part: string | null;
  // Lignes du bon de livraison
  lignes: BonLivraisonLigne[];
}
