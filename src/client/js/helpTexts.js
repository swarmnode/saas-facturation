// ── Aide contextuelle ──────────────────────────────────────────────────────
// Dictionnaire centralisé des textes affichés dans la bulle d'aide au survol des
// boutons/filtres/menus concernés. Chargé avant app.js / editor.js, qui exposent
// la fonction helpAttr() (pose data-tooltip sur l'élément) consommant ce dictionnaire.
const helpTexts = {
  devis_statut:    "Cycle de vie du devis : Brouillon → Envoyé → Signé (ou Accepté/Refusé). Un devis signé est verrouillé : il ne peut plus être modifié (loi anti-fraude TVA).",
  devis_expires:   "N'affiche que les devis envoyés dont la date de validité est dépassée et qui n'ont pas été signés — à relancer ou à renouveler.",
  devis_emettre:   "La signature verrouille définitivement le devis. Au-delà, seule la création d'un avenant est possible.",
  facture_statut:  "Cycle de vie de la facture : Brouillon → Émise → Payée. Une facture émise est numérotée et scellée (chaînage SHA-256) ; seul le passage à « Payée » reste ensuite autorisé.",
  facture_retard:  "N'affiche que les factures émises dont la date d'échéance est dépassée et qui ne sont pas encore payées.",
  facture_fec:     "Génère le Fichier des Écritures Comptables (FEC) au format DGFiP pour la période choisie — à fournir en cas de contrôle fiscal.",
  facture_scellement: "Vérifie l'intégrité de la chaîne de scellement (chaînage SHA-256 du journal de scellement) : détecte toute facture émise qui aurait été altérée après coup.",
  facture_sepa:    "Génère un fichier de prélèvement SEPA (norme pain.008) pour les factures sélectionnées dont le client dispose d'un mandat de prélèvement actif.",
  facture_relancer:"Envoie un e-mail de relance avec la facture jointe au client en retard de paiement, et incrémente son compteur de relances.",
  doc_emettre:     "Émission définitive : le document est numéroté, scellé et verrouillé. Cette action est irréversible — vérifiez son contenu avant de continuer.",
  doc_enregistrer: "Enregistre le document. Tant qu'il reste au statut « Brouillon », il peut être modifié et réenregistré librement.",
  bl_statut:       "Cycle de vie du bon de livraison : Brouillon → Émis → Livré. Le passage à « Livré » peut décrémenter le stock des articles suivis.",
  bl_facture:      "Crée une facture reprenant les lignes de ce bon de livraison — pratique pour facturer après livraison effective.",
  exercice_cloturer: "Clôture définitive de l'exercice : toutes les écritures comptables de l'année sont hachées (SHA-256) et le résultat est figé dans un procès-verbal. Un exercice clôturé ne peut plus être rouvert (loi anti-fraude TVA 2018).",
  lettrage:        "Rapproche les paiements reçus (compte 411 Clients) avec les factures correspondantes : sélectionnez les écritures dont la somme s'équilibre puis lettrez-les pour les marquer comme soldées. Le lettrage automatique se fait déjà à l'encaissement d'une facture.",
  facture_fournisseur_statut: "Cycle de vie d'une facture d'achat : Reçue → Payée. Contrairement aux documents émis, ce circuit n'est pas verrouillé par la loi anti-fraude TVA — une facture reçue peut être supprimée (les écritures FEC et la TVA déductible sont alors recalculées).",
  commande_chainage: "Le lien entre une commande, une facture d'achat et un fournisseur est volontairement non bloquant : aucune obligation légale de chaînage côté achats (contrairement aux documents émis), donc ces liens restent modifiables librement à tout moment.",
  decl_tva:        "Formulaire CA3 généré automatiquement à partir des écritures FEC : section A = TVA collectée sur les ventes, section B = TVA déductible sur les achats (saisie manuelle pour l'instant), section C = solde à payer ou crédit de TVA.",

  // Clients
  client_statut_rgpd: "Indique si ce contact est un simple prospect ou un client effectif — purement informatif, sans impact sur la facturation. Sert de filtre commercial et de repère pour le respect du RGPD (durée de conservation des données).",
  client_tva_mode:    "Régime de TVA applicable à ce client : « Normal » applique la TVA habituelle, « Autoliquidation » la reporte sur le client (opérations intracommunautaires, sous-traitance BTP…), « Exonéré » ne facture aucune TVA. Affecte directement le calcul des lignes sur ses devis et factures.",
  client_mode_reglement: "Mode de règlement pré-rempli automatiquement sur les nouveaux devis et factures de ce client. L'option ★ (Prélèvement SEPA) nécessite un mandat SEPA actif ci-dessous pour pouvoir générer un fichier de prélèvement.",
  client_mandat_sepa: "Mandat de prélèvement SEPA signé par le client — indispensable pour le prélèvement automatique. Type CORE : tous clients (révocable). Type B2B : entreprises uniquement (irrévocable, contrôles bancaires renforcés). La référence (RUM) est générée automatiquement si laissée vide.",

  // Fournisseurs / achats
  ff_compte_charge: "Compte comptable de charge (classe 6) sur lequel cette facture d'achat est imputée — utilisé pour générer les écritures FEC. Exemples : 606 = achats non stockés, 607 = achats de marchandises, 615 = entretien et réparations.",

  // Exercices comptables
  exercice_ouvrir: "Ouvre un nouvel exercice comptable à partir de la date choisie. Un exercice ouvert ne peut être figé qu'à sa clôture définitive — voir l'aide sur le bouton « Clôturer ».",

  // Statistiques
  stats_pipeline:        "Répartition des devis par étape de leur cycle de vie (brouillon, envoyé, signé, refusé) — donne une vue d'ensemble de votre activité commerciale en cours.",
  stats_balance_agee:    "Total des créances clients non réglées, regroupées par ancienneté de retard — permet de repérer en un coup d'œil les impayés les plus critiques.",
  stats_dso:             "DSO (Days Sales Outstanding) : délai moyen, en jours, entre l'émission d'une facture et son encaissement effectif. Un DSO élevé est un signal d'alerte sur votre trésorerie.",
  stats_conversion:      "Proportion de devis envoyés ayant été signés, et délai moyen entre l'envoi et la signature — mesure l'efficacité de votre prospection commerciale.",
  stats_top_clients_risque: "Classement de vos plus gros clients par chiffre d'affaires. L'alerte ⚠ signale une dépendance commerciale à un client représentant 30 % ou plus de votre CA — un risque à anticiper en cas de perte de ce client.",
  stats_marge_catalogue: "Compare, pour chaque article dont le prix d'achat est renseigné, le prix de vente HT et le prix d'achat HT, et calcule le taux de marque (marge ÷ prix de vente). Rouge < 20 %, orange < 40 %, vert ≥ 40 %.",

  // Actions sur documents
  facture_attestation: "Génère une attestation de conformité à la loi anti-fraude TVA 2018 (logiciel de facturation sécurisé, inaltérable et archivé) — à présenter en cas de contrôle fiscal.",
  facture_sepa_select: "Coche automatiquement, dans la liste, toutes les factures émises dont le client a pour mode de règlement par défaut le « Prélèvement SEPA » — pratique avant de générer un lot de prélèvements.",
  doc_avoir:        "Crée un avoir (document rectificatif) lié à cette facture émise, pour en annuler tout ou partie ou la corriger après coup — sans jamais modifier le document d'origine, qui reste verrouillé.",
  acompte_encaisser: "Marque cet acompte comme encaissé : il devient définitivement verrouillé (loi anti-fraude TVA) et son montant viendra automatiquement en déduction du solde de la facture finale.",
  bl_livrer:        "Marque ce bon de livraison comme livré. Si les articles concernés sont suivis en stock, leur quantité disponible est automatiquement décrémentée.",

  // Paramètres — Entreprise / Documents
  entreprise_regime_tva: "Régime de TVA de votre société : « Normal » (déclaration et paiement classiques), « Franchise art. 293B » (TVA non applicable, sous les seuils légaux de chiffre d'affaires), « Autoliquidation » (la TVA est reportée sur vos clients). Détermine les mentions légales imprimées sur vos documents.",
  entreprise_forme_ei:   "À cocher si votre société est une Entreprise Individuelle : la mention « EI » est alors automatiquement ajoutée après la raison sociale sur tous vos documents émis, comme l'exige la réglementation.",
  mentions_legales_paiement: "Pénalités de retard, indemnité forfaitaire de recouvrement (40 € minimum légal) et taux d'escompte : mentions obligatoires sur toute facture B2B (art. L441-10 du Code de commerce). Pré-remplies ici, elles restent ajustables document par document.",

  // Utilisateurs
  user_voir_tout: "Réservé au rôle Commercial : par défaut, un commercial ne voit que les documents qu'il a lui-même créés. Cocher « Accès complet » lui donne une visibilité sur l'ensemble des documents de la société. Le changement ne prend effet qu'à la prochaine connexion de l'utilisateur.",

  // Éditeur de documents (devis/factures/avoirs/acomptes/BL)
  editor_tva_mode:     "Régime de TVA appliqué à ce document : « Normal » applique la TVA habituelle ; « Franchise 293 B » et « Autoliquidation » suppriment la TVA des lignes et ajoutent la mention légale correspondante.",
  editor_type_avoir:   "« À valoir » : l'avoir vient en déduction d'une prochaine facture du client, sans remboursement. « Remboursement » : le montant est restitué au client par un moyen de paiement à préciser ci-dessous.",
  editor_mode_paiement: "Mode de règlement de ce document — imprimé sur le PDF et utilisé pour le suivi des encaissements et le rapprochement comptable (lettrage).",
};
