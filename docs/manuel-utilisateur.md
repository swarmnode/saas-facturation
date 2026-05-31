---
title: "FacturPro — Manuel utilisateur"
author: "Équipe FacturPro"
date: "2026"
lang: fr
toc: true
toc-depth: 3
numbersections: true
geometry: margin=2.5cm
fontsize: 11pt
linestretch: 1.3
header-includes:
  - \usepackage{fancyhdr}
  - \pagestyle{fancy}
  - \fancyhead[L]{FacturPro}
  - \fancyhead[R]{Manuel utilisateur}
---

# Présentation

FacturPro est un logiciel de devis et facturation conforme au droit français :

- **Loi anti-fraude TVA 2018** — inaltérabilité des documents fiscaux garantie par des verrous de base de données et une chaîne de scellement SHA-256.
- **Factur-X / EN 16931** — chaque facture émise embarque un fichier XML ZUGFeRD lisible par les systèmes comptables.
- **FEC (Fichier des Écritures Comptables)** — export DGFiP à tout moment, prêt pour un contrôle fiscal.
- **RGPD** — gestion du statut et de la durée de conservation des données clients.
- **SEPA** — génération de fichiers de prélèvements bancaires au format pain.008.001.02.

Le logiciel est accessible depuis un navigateur à l'adresse `http://localhost:3000` (installation locale) ou à l'adresse fournie par votre administrateur.

---

# Première connexion

## Compte administrateur

Lors du premier démarrage, le système crée automatiquement un compte super-administrateur :

| Champ | Valeur par défaut |
|---|---|
| Email | `admin@localhost` |
| Mot de passe | `Admin1234!` |

**Changez ce mot de passe immédiatement** après la première connexion (menu *Mon compte > Modifier le mot de passe*).

## Changer son mot de passe

Toute session ouverte peut modifier son propre mot de passe depuis le menu utilisateur en haut à droite. L'ancien mot de passe est requis pour valider la modification.

---

# Interface

## Navigation

La barre de navigation verticale à gauche donne accès aux rubriques principales : **Tableau de bord**, **Clients**, **Devis**, **Factures**, **Avoirs**, **Acomptes**, **Bons de livraison**, **Articles**, et **Paramètres**. Les icônes et libellés sont dimensionnés pour une lecture facile.

## Onglets de travail

FacturPro fonctionne par **onglets** : chaque document ouvert (devis, facture, client…) s'affiche dans un onglet persistent en haut de l'écran.

- Les onglets sont conservés lors d'un rechargement de page — vous retrouvez exactement votre contexte de travail.
- Un onglet **non encore sauvegardé** (nouveau document) est également restauré après rechargement.
- L'ordre des onglets est fixe : il ne change pas entre les rechargements.
- Pour fermer un onglet, cliquer la croix à droite de son libellé.

## Tableau de bord

La page d'accueil affiche :

- Un résumé des **chiffres du mois** (devis en cours, factures émises, encaissements).
- La liste chronologique de **tous les documents récents** toutes catégories confondues (devis, factures, avoirs, acomptes, BL), avec le statut et le montant, cliquables directement.

---

# Configuration de l'entreprise

Avant de créer le premier document, renseignez les informations de votre société dans **Paramètres > Entreprise**.

## Informations légales obligatoires

| Champ | Remarque |
|---|---|
| Raison sociale | Dénomination exacte (SIRET) |
| Forme juridique | SAS, SARL, EI, etc. |
| SIRET | 14 chiffres, contrôlé à l'enregistrement |
| N° TVA intracommunautaire | FR + 2 chiffres + SIREN |
| Adresse complète | Figurera sur tous les documents |
| Régime TVA | Normal, franchise art. 293 B, ou autoliquidation |

Pour les **entreprises individuelles** (`is_EI = oui`), la mention légale sur les documents est adaptée automatiquement (pas de capital social ni de RCS).

## Logo

Déposez votre logo (PNG, JPEG, WebP, SVG — 2 Mo max) via le bouton **Importer un logo**. Il sera intégré en haut de tous les PDFs et sa couleur dominante sera extraite pour adapter l'habillage graphique automatiquement.

## Email / SMTP

Configurez le serveur SMTP dans l'onglet **Email** pour envoyer les devis et factures directement depuis FacturPro. Sans configuration, le système utilise un compte Ethereal (emails de test visibles dans la console, non délivrés).

| Champ | Exemple |
|---|---|
| Hôte SMTP | `smtp.mondomaine.fr` |
| Port | `587` (STARTTLS) ou `465` (SSL) |
| Utilisateur / Mot de passe | Identifiants du compte d'envoi |
| Adresse expéditeur | `facturation@mondomaine.fr` |

## Coordonnées bancaires et SEPA

Pour pouvoir générer des fichiers de prélèvement SEPA, renseignez les coordonnées bancaires de votre entreprise dans l'onglet **Banque** :

| Champ | Remarque |
|---|---|
| IBAN | IBAN de votre compte créditeur (receveur des prélèvements) |
| BIC | BIC/SWIFT de votre banque |
| ICS | Identifiant Créancier SEPA (obtenu auprès de votre banque) — **obligatoire** pour générer un fichier SEPA |

Sans ICS valide, la génération de fichiers SEPA est bloquée.

---

# Gestion des clients

## Créer un client

Accédez à **Clients > Nouveau client**. Deux types sont disponibles :

- **Professionnel** — renseignez la raison sociale, SIRET et numéro de TVA intracommunautaire si applicable.
- **Particulier** — civilité, prénom, nom.

Les champs adresse, code postal et ville sont obligatoires (ils figurent sur les documents). Un champ **Adresse (complément)** est disponible pour les boîtes postales, bâtiments, étages, etc.

Lorsque vous saisissez un **SIRET** et quittez le champ, FacturPro calcule automatiquement le **numéro de TVA intracommunautaire** français et le remplit dans le champ correspondant — à condition que ce champ soit encore vide. La formule utilisée est :

```
Clé TVA = (12 + 3 × (SIREN mod 97)) mod 97
N° TVA  = "FR" + clé (2 chiffres) + SIREN
```

Ce calcul est purement local, sans appel réseau. Il est valide pour toutes les sociétés françaises soumises à TVA.

## Mode TVA client

Le champ **Mode TVA** permet de forcer un régime particulier pour ce client indépendamment du régime de l'entreprise :

| Valeur | Effet sur les documents |
|---|---|
| Normal | TVA au taux de la ligne |
| Franchise 293 B | Mention légale automatique, montant TVA = 0 |
| Autoliquidation | Mention légale art. 283-2 CGI |

## Mode de règlement par défaut

Le champ **Mode de règlement par défaut** pré-sélectionne automatiquement le mode de paiement lors de la création d'une facture pour ce client (virement, chèque, prélèvement SEPA…). Cela évite de ressaisir le même choix à chaque facture.

## Coordonnées bancaires SEPA

Pour les clients payant par prélèvement SEPA, renseignez l'onglet **SEPA** de la fiche client :

| Champ | Remarque |
|---|---|
| IBAN | IBAN du compte à débiter |
| BIC | BIC/SWIFT de la banque du client |
| Titulaire du compte | Nom du titulaire (peut différer de la raison sociale) |
| Référence mandat (RUM) | Référence unique du mandat de prélèvement |
| Date de signature du mandat | Date à laquelle le client a signé le mandat |
| Type de mandat | CORE (particuliers/entreprises) ou B2B (interentreprises) |

Ces informations sont nécessaires pour inclure le client dans un fichier de prélèvement SEPA.

## RGPD

Chaque client possède un **statut RGPD** :

| Statut | Signification |
|---|---|
| Prospect | Contact initial, aucun document signé |
| Client actif | Au moins un devis accepté ou document envoyé |
| Inactif | Aucune activité récente |
| Anonymisé | Données personnelles effacées (conservation légale 10 ans) |

La date de dernière activité et la date de consentement sont tracées automatiquement. Lorsqu'un devis est **accepté**, le statut du client passe automatiquement de *Prospect* à *Client actif*.

---

# Catalogue d'articles

Le catalogue (**Articles**) vous permet de pré-renseigner vos produits et prestations pour les insérer rapidement dans les lignes de devis et factures.

| Champ | Remarque |
|---|---|
| Référence | Optionnel, libre |
| Désignation | Affiché sur les documents |
| Description | Texte long, imprimé sous la désignation |
| Unité | heure, jour, forfait, pièce… |
| Prix unitaire HT | Valeur par défaut à l'insertion |
| Prix d'achat HT | Optionnel — sert uniquement au calcul de marge, n'apparaît pas sur les documents |
| Taux TVA | Taux pré-sélectionné dans les lignes |
| Stock | Quantité disponible (optionnel) |
| N° de série | Numéro de série ou lot (optionnel, saisi par ligne dans les documents) |

Un article peut être désactivé (**Actif = Non**) pour le masquer des listes de sélection sans le supprimer.

## Calcul de marge

Lorsqu'un **prix d'achat HT** est renseigné, FacturPro affiche en temps réel dans le formulaire :

| Indicateur | Formule |
|---|---|
| Marge brute | Prix vente HT − Prix achat HT |
| Taux de marque | Marge brute ÷ Prix vente HT × 100 |
| Taux de marge | Marge brute ÷ Prix achat HT × 100 |

Le **taux de marque** est l'indicateur le plus courant en commerce et distribution. Le **taux de marge** (ou taux de marge sur coût) est davantage utilisé en industrie.

La liste des articles affiche une colonne **Marge** (montant + taux de marque) en vert si positive, rouge si négative. Le prix d'achat n'est jamais transmis aux clients ni imprimé sur les documents.

---

# Éditeur de documents (WYSIWYG)

Tous les documents (devis, factures, avoirs, bons de livraison) s'ouvrent dans un **éditeur visuel page A4** qui reproduit l'aspect exact du document imprimé.

## Mise en page

- La page A4 est affichée à l'échelle, avec les marges, l'en-tête, le bloc client, les lignes et les totaux positionnés comme sur le PDF final.
- Vous pouvez faire défiler le contenu vers le bas pour atteindre le bas de page (signatures, mentions, totaux).

## Saisie des lignes

| Colonne | Remarque |
|---|---|
| Désignation | Texte de la prestation ou produit |
| Description | Détail optionnel sous la désignation |
| Qté | Quantité (alignée à droite) |
| P.U. HT | Prix unitaire hors taxe (aligné à droite) |
| Remise | Remise en % (alignée à droite) |
| TVA | Taux de TVA applicable (aligné à droite) |
| Montant HT | Calculé automatiquement (aligné à droite) |

Les totaux (HT, TVA ventilée par taux, TTC) sont recalculés en temps réel à chaque modification de ligne.

## Sélection du client

Le champ **Client** est un filtre de recherche : commencez à saisir le nom ou la raison sociale pour filtrer la liste. En bas de la liste déroulante, l'option **+ Nouveau client** permet de créer un client à la volée sans quitter le document.

## Enregistrement

- Le bouton **Enregistrer** (ou **Enregistré** en vert lorsqu'aucune modification n'est en attente) sauvegarde le document.
- Un document nouveau reçoit son numéro (ex. `DEV-2026-0001`) dès le premier enregistrement — le numéro apparaît alors dans l'en-tête de la page et dans l'onglet.
- Sur un document verrouillé (émis, signé), les champs sont en lecture seule et le bouton d'enregistrement est absent.

## Impression

Le bouton **🖨️ Imprimer** génère un aperçu d'impression navigateur de la page A4 actuelle. Utilisez-le pour une impression rapide sans passer par le PDF.

## Sauts de page

L'éditeur affiche des **indicateurs de saut de page** (ligne pointillée grise avec le label **— Page 2 —**, **— Page 3 —**…) positionnés aux mêmes endroits que dans le PDF généré. Ces indicateurs se mettent à jour automatiquement à chaque ajout ou suppression de ligne. Ils sont purement visuels et n'affectent pas le contenu du document.

## Suppression et onglets

Lorsqu'un document est supprimé depuis une liste, son onglet se ferme automatiquement si il était ouvert.

## Barre d'actions

La barre d'outils au-dessus de la page affiche les actions disponibles selon le type et le statut du document (voir les sections par type de document ci-dessous).

---

# Devis

## Cycle de vie

```
brouillon → envoyé → accepté → bon de livraison (optionnel)
                              → facture
                   ↘ refusé
brouillon (signé = verrouillé définitivement)
```

Un devis **accepté** est verrouillé au niveau de la base de données — aucune modification n'est possible. Pour corriger un devis accepté, créez un **avenant**.

## Créer un devis

1. **Devis > Nouveau devis**
2. Sélectionnez le client via le champ de recherche filtrée.
3. Renseignez l'objet, la date de validité et les conditions de paiement.
4. Ajoutez les lignes : désignation, quantité, prix HT, taux TVA, remise (%).
5. Les lignes sont gratuites par défaut (case **Gratuit** cochée) — décochez pour activer la tarification.
6. Cliquez **Enregistrer** — le numéro `DEV-YYYY-NNNN` est attribué automatiquement.

## Envoyer un devis

Bouton **Envoyer** :

- Passe le statut à `envoyé`.
- Si un email client est renseigné, propose l'envoi direct par email avec le PDF en pièce jointe.

## Accepter un devis

Bouton **Accepter** (affiché en blanc sur fond coloré lorsque le devis est `envoyé`) :

- Verrouille le devis (statut `signé`).
- Fait passer le statut RGPD du client de *Prospect* à *Client actif* si ce n'est pas déjà le cas.
- Le bouton passe en vert avec le libellé **Accepté** (non cliquable).
- Les boutons **Créer un BL** et **Créer la facture** apparaissent dans la barre d'actions.

## Refuser

Bouton **Refuser** : archive le devis sans le verrouiller (il reste modifiable pour être dupliqué).

## Dupliquer

Le bouton **Dupliquer** crée un nouveau devis `brouillon` avec les mêmes lignes, ce qui permet de repartir d'un modèle.

## Aperçu PDF

Le bouton **Aperçu PDF** génère un PDF à la volée sans le sauvegarder.

## Convertir en bon de livraison

Depuis un devis accepté, le bouton **Créer un BL** génère un bon de livraison pré-rempli à partir des lignes du devis.

## Convertir en facture

Depuis un devis accepté, le bouton **Créer la facture** génère une facture pré-remplie à partir des lignes du devis.

---

# Avenants

Un avenant modifie un devis accepté sans altérer l'original (exigence d'inaltérabilité).

## Créer un avenant

Depuis la fiche d'un devis accepté : **Nouvel avenant**.

| Champ | Remarque |
|---|---|
| Motif | Obligatoire — justification de la modification |
| Lignes | Modifications / ajouts / suppressions par rapport au devis initial |
| Delta montant | Calculé automatiquement (positif = surcoût, négatif = déduction) |

L'avenant suit le même cycle que le devis : `brouillon → envoyé → signé (verrouillé)`.

Le PDF de l'avenant récapitule le montant initial du devis, les modifications et le nouveau montant total.

---

# Factures

## Cycle de vie

```
brouillon → émise (verrouillée) → payée
```

Une fois **émise**, la facture est verrouillée. La seule transition possible est de la passer à **payée**. Pour annuler une facture émise, créez un **avoir**.

## Types de factures

| Type | Usage |
|---|---|
| Standard | Facture classique |
| Avoir | Note de crédit (voir section dédiée) |
| Acompte | Facture d'acompte (voir section dédiée) |

## Créer une facture

Soit depuis un devis accepté (bouton **Créer la facture**), soit depuis un bon de livraison (bouton **Créer la facture**), soit directement depuis **Factures > Nouvelle facture**.

Les champs suivants sont importants :

| Champ | Remarque |
|---|---|
| Date d'émission | Date légale de la facture |
| Date d'échéance | Délai de paiement convenu (omis sur le PDF si non renseigné) |
| Conditions de paiement | Texte libre (virement, chèque…) |
| Mode de paiement | Pré-rempli si un mode par défaut est défini sur le client |

## Émettre une facture

Le bouton **Émettre** :

1. Verrouille la facture.
2. Génère le PDF Factur-X (PDF + XML ZUGFeRD embarqué) et le sauvegarde dans `storage/pdf/`.
3. Inscrit les écritures comptables dans la table FEC.
4. Inscrit un scellement SHA-256 dans `journal_scellement`.

**Une facture émise ne peut pas être supprimée ni modifiée.** Pour annuler, créez un avoir.

## Marquer comme payée

Bouton **Enregistrer le paiement** : renseignez la date de paiement et le mode. Le statut passe à `payée`.

Lors du paiement, deux opérations comptables sont déclenchées automatiquement :

1. Les **écritures de règlement** sont inscrites au FEC (journal BQ — Banque) : débit du compte d'encaissement (512 Banque, 530 Caisse ou 5112 Chèques selon le mode) et crédit du compte 411 Clients.
2. Les lignes 411 de l'émission et du règlement sont **lettrées** automatiquement (voir section Lettrage).

Sur la facture payée, dans l'éditeur WYSIWYG :
- La **date d'échéance** disparaît (remplacée par la date de paiement en vert)
- Les **conditions de paiement** sont masquées
- Le **mode de règlement** affiche la valeur enregistrée au paiement (non modifiable)

Sur le PDF, un bandeau **✓ ACQUITTÉE** apparaît à gauche des totaux, au même niveau horizontal, avec la date et le mode de paiement.

## Télécharger le PDF Factur-X

Le bouton **Télécharger PDF** livre le fichier PDF avec le fichier XML EN 16931 embarqué, compatible avec les logiciels comptables (Sage, EBP, Cegid…).

## Envoi groupé

Dans la liste des factures, cochez plusieurs factures via les cases à cocher, puis cliquez **Envoyer la sélection** : un email est envoyé à chaque client avec sa facture en pièce jointe. Le bouton n'est disponible que pour les factures au statut `emise`.

## Créer une facture depuis un bon de livraison

Depuis la fiche d'un bon de livraison, le bouton **Créer la facture** génère une facture pré-remplie avec les lignes du BL et le client associé.

---

# Avoirs (Factures d'avoir)

Un avoir (ou note de crédit) annule partiellement ou totalement une facture émise. Il est intitulé **FACTURE D'AVOIR** sur le document.

## Créer un avoir

Deux façons :

1. **Depuis une facture émise** : bouton **Créer un avoir** — le système pré-remplit l'avoir avec les lignes de la facture d'origine et lie les deux documents.
2. **Directement** : **Avoirs > Nouvel avoir** — saisissez manuellement les lignes.

| Champ | Remarque |
|---|---|
| Facture d'origine | Lien vers la facture annulée (recommandé) |
| Type d'avoir | **À valoir** (défaut) ou **Remboursement au client** |
| Mode de règlement | Affiché uniquement si type = Remboursement |
| Lignes | Montants positifs — le PDF les présente comme note de crédit |

## Type d'avoir

| Type | Usage | Mode de règlement |
|---|---|---|
| **À valoir** | Crédit sur prochaine commande | Masqué |
| **Remboursement** | Virement ou chèque vers le client | Obligatoire |

Si le client était configuré en prélèvement SEPA, le mode est automatiquement converti en **Virement SEPA** pour un remboursement (sens inverse d'un prélèvement).

## Plafonnement du montant

Plusieurs avoirs partiels sur la même facture sont autorisés, mais leur **total cumulé ne peut pas dépasser le montant TTC de la facture d'origine**. Un bandeau informatif dans l'éditeur affiche en permanence :

- Montant de la facture d'origine
- Total des avoirs déjà émis
- **Solde disponible** (en vert si positif, en rouge si épuisé)

L'émission est bloquée avec un message d'erreur si le montant dépasserait le solde disponible.

## Émettre un avoir

Bouton **Émettre** : l'avoir est verrouillé, un PDF Factur-X est généré et les écritures comptables sont inscrites en FEC. Les lignes 411 de la facture d'origine et de l'avoir sont **lettrées automatiquement**.

## Supprimer un avoir brouillon

Un avoir en statut **brouillon** peut être supprimé depuis la liste **Avoirs** (bouton 🗑️). Un avoir émis est définitivement verrouillé et ne peut pas être supprimé.

---

# Acomptes

Les acomptes permettent de facturer une partie du montant avant la livraison.

## Cycle de vie

```
en_attente → encaissé (verrouillé définitivement)
```

## Créer un acompte

Depuis un devis accepté ou une facture : **Nouvel acompte**.

| Champ | Remarque |
|---|---|
| Pourcentage | Optionnel — calcule automatiquement le montant |
| Montant HT | Peut être saisi directement |
| Taux TVA | Appliqué à la totalité de l'acompte |
| TVA exigible à l'encaissement | Cocher si vous êtes en TVA sur encaissements |

## Encaisser un acompte

Bouton **Encaisser** : renseignez la date et le mode de paiement. L'acompte est verrouillé et un PDF est généré.

---

# Bons de livraison

Les bons de livraison (BL) documentent la remise physique des biens ou la réalisation des prestations.

## Créer un bon de livraison

**Bons de livraison > Nouveau BL**, ou depuis un devis accepté via le bouton **Créer un BL**. Un BL peut être lié à un devis et/ou une facture.

| Champ | Remarque |
|---|---|
| Lieu de livraison | Adresse si différente de la fiche client |
| Lignes | Désignation + quantité + article (optionnel) + N° de série |

La **date de livraison** n'est pas saisie dans le système — elle est apposée manuellement à la main dans le cadre prévu à cet effet en bas du document imprimé.

## Créer une facture depuis un BL

Depuis un bon de livraison validé, le bouton **Créer la facture** génère une facture pré-remplie avec les lignes du BL.

## Suppression

Un BL peut être supprimé tant qu'il n'est pas lié à une facture émise ou à un chaînage documentaire (devis → BL → facture).

---

# Prélèvements SEPA

FacturPro génère des fichiers de prélèvement bancaire au format **pain.008.001.02** (norme SEPA) directement importables dans votre logiciel bancaire.

## Prérequis

Avant de générer un fichier SEPA, vérifiez que :

1. L'**ICS** (Identifiant Créancier SEPA) est renseigné dans **Paramètres > Entreprise > Banque**.
2. L'**IBAN** et le **BIC** de l'entreprise sont renseignés.
3. Chaque client à prélever possède un **IBAN**, un **BIC**, une **RUM** (référence mandat) et une **date de mandat** dans sa fiche.

## Générer un fichier SEPA

1. Allez dans **Factures** (liste).
2. Cochez les factures à prélever via les cases à cocher (seules les factures `emise` avec mode de règlement SEPA sont sélectionnables).
3. Cliquez **Générer SEPA**.
4. Le système valide chaque facture :
   - Vérifie que le client a un IBAN, BIC, RUM et une date de mandat.
   - Affiche un message d'erreur par facture si une information est manquante.
5. Un fichier XML `sepa_YYYY-MM-DD.xml` est téléchargé. Importez-le dans votre interface bancaire.

## Structure du fichier

Le fichier suit le schéma ISO 20022 pain.008.001.02 (prélèvement CORE ou B2B selon le type de mandat). Chaque transaction correspond à une facture. La date de règlement demandée est le lendemain de la génération (D+1 ouvré à paramétrer dans votre banque).

---

# Lettrage

Le lettrage est le rapprochement comptable des écritures du compte **411 Clients** : chaque débit (émission d'une facture) est mis en regard du crédit correspondant (paiement reçu ou avoir émis). Les deux lignes reçoivent la même **lettre** (A, B, C… Z, AA, AB…) pour signifier qu'elles s'annulent mutuellement.

Les lignes **non lettrées** représentent des créances encore ouvertes (factures impayées sans avoir associé).

## Lettrage automatique

FacturPro letttre automatiquement dans deux situations :

| Événement | Effet |
|---|---|
| Facture marquée **payée** | Les lignes 411 de l'émission et du règlement reçoivent la même lettre |
| Avoir émis sur une facture | Les lignes 411 de la facture et de l'avoir reçoivent la même lettre |

## Page Lettrage

Accessible depuis la barre de navigation **⚖️ Lettrage**.

La page affiche, pour chaque client sélectionné dans le filtre, deux sections :

**Non-lettrées (créances ouvertes)**

- Liste des écritures 411 sans lettre attribuée.
- Le **solde non lettré** (débit – crédit) apparaît en rouge si positif (impayé) ou en vert si soldé.
- Cochez les lignes à rapprocher, puis cliquez **Lettrer la sélection**.
- Le bouton **Tout lettrer** tente de lettrer toutes les lignes non-lettrées du client en une seule fois.

**Lettrées (créances soldées)**

- Regroupées par lettre (A, B…).
- Chaque groupe dispose d'un bouton **Délettrer** pour annuler le rapprochement si une erreur a été commise.

## Lettrage manuel

Le lettrage manuel exige que la **somme des débits** sélectionnés soit **égale à la somme des crédits** (tolérance de 0,01 €). Si ce n'est pas le cas, le système rejette l'opération avec un message indiquant l'écart.

## Impact sur le FEC

Depuis l'introduction du lettrage, chaque paiement de facture génère également des **écritures de règlement** dans le FEC (journal BQ — Banque) :

| Compte | Sens | Libellé |
|---|---|---|
| 512 Banque / 530 Caisse / 5112 Chèques | Débit | Règlement FAC-YYYY-NNNN |
| 411 Clients | Crédit | Règlement FAC-YYYY-NNNN |

Le FEC est ainsi complet : émission + règlement + lettrage, vérifiable lors d'un contrôle fiscal.

---

# Gestion des utilisateurs

## Rôles

| Rôle | Droits |
|---|---|
| `admin` | Toutes les fonctions : clients, devis, factures, acomptes, BL, avoirs, articles, paramètres, utilisateurs, sauvegardes |
| `comptable` | Clients, devis, factures, acomptes, BL, avoirs, articles — pas de gestion des utilisateurs ni des sauvegardes |
| `commercial` | Clients, devis (lecture+écriture), factures et acomptes en lecture seule, BL, articles |
| `lecteur` | Lecture seule sur clients, devis, factures, acomptes, BL, articles |
| `super_admin` | Passe outre toutes les vérifications de permission ; gère plusieurs sociétés |

## Créer un utilisateur

**Paramètres > Utilisateurs > Nouvel utilisateur**.

Un `admin` peut créer des utilisateurs et les affecter à sa propre société. Seul un `super_admin` peut créer des comptes affectés à plusieurs sociétés.

## Multi-société

Le `super_admin` peut gérer plusieurs entreprises depuis une seule interface :

- **Paramètres > Entreprise > Nouvelle société** crée une deuxième entité.
- Un utilisateur peut être affecté à plusieurs sociétés avec des rôles différents par société.
- Le commutateur de société apparaît dans le menu de navigation si l'utilisateur a accès à plusieurs entités.

---

# Installation Windows

## Assistant d'installation

L'installeur Windows (`FacturPro-Setup.exe`) guide la configuration en trois étapes après le choix du répertoire d'installation :

**Page 1 — PostgreSQL**

| Champ | Valeur par défaut |
|---|---|
| Mot de passe superutilisateur (`postgres`) | `postgres` |

Si PostgreSQL n'est pas encore installé sur le poste, l'installeur le télécharge et l'installe automatiquement via `winget`.

**Page 2 — Compte administrateur**

| Champ | Remarque |
|---|---|
| Adresse e-mail | Identifiant de connexion du super-administrateur |
| Mot de passe | Minimum 8 caractères |

**Page 3 — Configuration du serveur**

| Champ | Valeur par défaut | Plage autorisée |
|---|---|---|
| Port TCP | `3000` | 1024 à 65535 |

Changez le port si `3000` est déjà utilisé par un autre logiciel sur le poste. Le port choisi est appliqué automatiquement dans :
- Le fichier de configuration (`.env`)
- La règle pare-feu Windows (entrante, réseau privé)
- Les raccourcis bureau et menu Démarrer

## Après l'installation

- Le service Windows **FacturPro** démarre automatiquement et se relance à chaque redémarrage.
- L'interface est accessible à `http://localhost:<port>` depuis n'importe quel navigateur du poste.
- Les journaux se trouvent dans `<répertoire_installation>\logs\`.

## Désinstallation

Passez par **Ajout/Suppression de programmes** (Paramètres Windows). Le script de désinstallation arrête le service, le supprime et nettoie les règles pare-feu. La base de données PostgreSQL et les données ne sont **pas** supprimées automatiquement.

---

# Sauvegardes

## Configuration

**Paramètres > Sauvegardes** (réservé aux administrateurs).

| Paramètre | Valeur par défaut |
|---|---|
| Répertoire de destination | Chemin local ou réseau |
| Fréquence | Quotidienne, hebdomadaire, mensuelle |
| Heure | Heure locale du serveur |
| Rétention | Nombre de sauvegardes à conserver |

Les sauvegardes sont effectuées via `pg_dump` (chemin des binaires PostgreSQL configuré dans `PG_BIN`, par défaut `C:\Program Files\PostgreSQL\17\bin`).

## Déclencher une sauvegarde manuelle

Bouton **Sauvegarder maintenant** disponible sur la page de configuration.

## Restauration

La restauration n'est pas intégrée à l'interface ; elle se fait manuellement via `pg_restore` ou `psql` en ligne de commande. Contactez votre administrateur système.

---

# Conformité fiscale

## Export FEC

Le **Fichier des Écritures Comptables** (FEC) est généré automatiquement à chaque émission de facture ou d'avoir. Pour l'exporter :

**Factures > Exporter FEC** — télécharge un fichier texte tabulé au format DGFiP, nommé `FEC_YYYY-MM-DD.txt`.

Ce fichier est directement utilisable lors d'un contrôle fiscal (article L. 47 A du Livre des Procédures Fiscales).

## Vérification de la chaîne de scellement

Chaque document fiscal (facture, avoir, acompte, avenant signé) est chaîné par un hash SHA-256 cumulatif. Pour vérifier l'intégrité :

**Factures > Vérifier le scellement** — retourne `{ valide: true }` si la chaîne est intacte, ou identifie le premier document altéré.

Cette vérification peut être demandée par l'administration fiscale pour prouver que les documents n'ont pas été modifiés après émission.

## Pourquoi les documents sont-ils verrouillés ?

La **loi anti-fraude TVA 2018** (article 88 de la loi de finances 2016) impose que les logiciels de facturation garantissent l'**inaltérabilité**, la **sécurisation**, la **conservation** et l'**archivage** des données. FacturPro satisfait à cette obligation via :

1. Des verrous de base de données (triggers `BEFORE UPDATE`) qui bloquent toute modification d'un document émis.
2. Une chaîne de hachage SHA-256 (`journal_scellement`) qui détecte toute altération, même directement dans la base.
3. Un archivage automatique des snapshots JSON des documents avec conservation de 10 ans.

## Format Factur-X

Les PDFs générés par FacturPro sont au format **Factur-X** (profil EN 16931 / ZUGFeRD) : le fichier XML structuré conforme à la norme européenne est embarqué dans le PDF comme pièce jointe. Les logiciels comptables compatibles (Sage, EBP, Cegid, QuadraFact…) peuvent lire ce XML directement pour importer les écritures sans ressaisie.
