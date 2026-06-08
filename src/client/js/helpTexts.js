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
};
