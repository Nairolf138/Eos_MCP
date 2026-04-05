# Workflow interne — qualification, contractualisation, facturation et suivi fiscal

Ce document propose un workflow interne simple et réutilisable couvrant :

1. qualification du besoin,
2. proposition tarifaire,
3. signature du contrat,
4. émission de facture,
5. suivi des déclarations de revenus,
6. relances.

---

## 1) Qualification du besoin

### Objectif
Valider l'adéquation entre la demande client, vos capacités de livraison, le budget et les contraintes légales/fiscales.

### Entrées
- Demande initiale client (mail, appel, formulaire).
- Contexte projet (métier, délais, enjeux).

### Checklist de qualification
- [ ] Problème à résoudre et livrables attendus clarifiés.
- [ ] Parties prenantes identifiées (décideur, opérationnel, finance).
- [ ] Périmètre inclus / exclu défini.
- [ ] Planning estimé (jalons, date de démarrage, date de fin).
- [ ] Hypothèses et dépendances listées.
- [ ] Risques majeurs identifiés.
- [ ] Modalités de validation des livrables définies.

### Sortie
- Fiche de qualification validée.
- Décision Go / No-Go sous 48h.

---

## 2) Proposition tarifaire

### Objectif
Émettre un devis clair, opposable et aligné sur le périmètre réel.

### Méthode
- Chiffrer selon l'un des modèles suivants :
  - forfait,
  - régie (TJM),
  - hybride (setup forfait + run en régie).
- Prévoir explicitement :
  - conditions de paiement,
  - acompte,
  - frais annexes,
  - validité de l'offre.

### Contrôles
- [ ] Cohérence périmètre ↔ prix.
- [ ] Clauses de révision du périmètre (avenant) mentionnées.
- [ ] Mentions légales présentes.

### Sortie
- Devis envoyé au client en PDF avec date d'expiration.

---

## 3) Signature contrat

### Objectif
Sécuriser juridiquement la mission avant démarrage.

### Étapes
1. Envoyer contrat standard + annexes éventuelles.
2. Négocier uniquement les clauses sensibles (propriété intellectuelle, responsabilité, résiliation, confidentialité).
3. Faire signer par les deux parties (signature électronique recommandée).
4. Archiver version finale signée (dossier client + sauvegarde).

### Prérequis de démarrage
- [ ] Contrat signé.
- [ ] Acompte reçu (si prévu).
- [ ] Bon de commande reçu (si exigé côté client).

---

## 4) Émission facture

### Règle
Aucune prestation non couverte contractuellement n'est facturée hors avenant validé.

### Déclencheurs
- Acompte à la signature.
- Jalons de livraison.
- Mensualisation.
- Solde à la recette finale.

### Contrôles qualité facture
- [ ] Numérotation chronologique.
- [ ] Mentions légales complètes.
- [ ] Référence devis/contrat.
- [ ] Échéance de paiement explicite.

### Sortie
- Facture envoyée + preuve d'envoi archivée.

---

## 5) Suivi des déclarations de revenus

### Objectif
Anticiper les obligations fiscales et sociales pour éviter régularisations et pénalités.

### Cadence recommandée
- Hebdomadaire : rapprochement encaissements/dépenses.
- Mensuelle : revue TVA (si applicable), provisions charges/impôts.
- Trimestrielle : reporting financier + préparation déclarative.
- Annuelle : clôture et transmission au comptable/outil fiscal.

### Tableau de pilotage minimal
- Chiffre d'affaires encaissé.
- Factures émises/non encaissées.
- Charges déductibles.
- TVA collectée/déductible (si applicable).
- Provision IR/IS + cotisations sociales.

---

## 6) Relances

### Politique de relance (exemple)
- J+3 après échéance : relance courtoise (mail).
- J+10 : relance ferme (mail + appel).
- J+20 : mise en demeure simple.
- J+30 : transmission contentieux / recouvrement.

### Bonnes pratiques
- Standardiser des modèles de relance.
- Tracer toutes les communications.
- Ne jamais suspendre la forme professionnelle.

---

# Modèles prêts à l'emploi

## Modèle 1 — Devis

```text
DEVIS N° [DV-AAAA-XXX]
Date : [JJ/MM/AAAA]
Validité : [30 jours]

Prestataire :
[Nom / Raison sociale]
[SIREN/SIRET]
[Adresse]
[Email]

Client :
[Nom entreprise]
[Adresse]
[Contact]

Objet : [Titre de la mission]

Périmètre :
- [Lot 1]
- [Lot 2]

Hors périmètre :
- [Exclusion 1]

Planning :
- Démarrage : [date]
- Livraison : [date]

Tarification :
- [Forfait ou TJM]
- Montant HT : [€]
- TVA : [€ / taux]
- Total TTC : [€]

Paiement :
- Acompte : [x%] à la commande
- Solde : [x jours fin de mois/date]

Conditions spécifiques :
- Toute modification de périmètre fera l'objet d'un avenant.

Bon pour accord,
Date + Signature client
```

## Modèle 2 — Contrat standard (structure)

```text
CONTRAT DE PRESTATION DE SERVICES

Entre :
- Le Prestataire : [identité complète]
- Le Client : [identité complète]

Article 1 — Objet
[Description de la mission]

Article 2 — Durée
[Date début] au [Date fin] / reconduction [oui/non]

Article 3 — Livrables et obligations
[Liste livrables, critères d'acceptation]

Article 4 — Conditions financières
[Montant, modalités, pénalités de retard]

Article 5 — Propriété intellectuelle
[cession/licence + conditions]

Article 6 — Confidentialité
[obligations + durée]

Article 7 — Responsabilité
[plafond, exclusions]

Article 8 — Résiliation
[cause, préavis, effets]

Article 9 — Droit applicable et juridiction
[à compléter selon votre cadre légal]

Signatures
```

## Modèle 3 — Avenant

```text
AVENANT N° [AV-AAAA-XXX]
Référence contrat : [CT-AAAA-XXX]
Date : [JJ/MM/AAAA]

Objet de l'avenant :
[Extension/réduction de périmètre]

Modifications apportées :
1. Article concerné : [Article X]
   Ancienne version : [résumé]
   Nouvelle version : [résumé]

Impact planning :
[Nouvelles dates]

Impact financier :
[+/- montant HT, TVA, TTC]

Entrée en vigueur : [date]

Le reste des stipulations du contrat demeure inchangé.

Signatures des parties
```

## Modèle 4 — Facture

```text
FACTURE N° [FA-AAAA-XXX]
Date d'émission : [JJ/MM/AAAA]
Date d'échéance : [JJ/MM/AAAA]

Prestataire :
[Nom, adresse, SIREN/SIRET, TVA intracom si applicable]

Client :
[Nom, adresse]

Référence :
- Devis : [DV-...]
- Contrat : [CT-...]
- Bon de commande : [si applicable]

Lignes de facturation :
- [Prestation 1] — Qté [x] — PU HT [€] — Total HT [€]

Total HT : [€]
TVA [taux] : [€]
Total TTC : [€]
Net à payer : [€]

Modalités de règlement :
[Virement / IBAN]

Pénalités de retard :
[mention légale selon votre régime]
```

## Modèle 5 — Reporting trimestriel

```text
REPORTING TRIMESTRIEL — [T1/T2/T3/T4 AAAA]
Client : [Nom]
Mission : [Nom mission]

1) Avancement
- Jalons prévus : [x]
- Jalons livrés : [x]
- Taux d'avancement : [x%]

2) Finance
- Budget prévu trimestre : [€]
- Facturé trimestre : [€]
- Encaissé trimestre : [€]
- Reste à facturer : [€]

3) Risques / points d'attention
- [Risque 1 + plan de mitigation]

4) Décisions attendues
- [Décision 1]

5) Plan du trimestre suivant
- [Objectif 1]
- [Objectif 2]
```

---

## Recommandation opérationnelle
- Conserver tous les modèles dans un dossier unique (`/ops/templates`) versionné.
- Numéroter tous les documents avec un format homogène (`DV-AAAA-001`, `CT-AAAA-001`, etc.).
- Mettre en place un rappel calendaire automatique pour les échéances de facturation, déclarations et relances.
