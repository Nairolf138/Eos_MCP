# Annexe tarifaire — Pricing Schedule

> Document annexe au contrat de licence commerciale (`Commercial-License-fr.md` / `Commercial-License-en.md`).

## 1) Paramètres économiques

- **Taux de redevance** : [X] % du chiffre d'affaires lié HT.
- **Périodicité** : [mensuelle / trimestrielle].
- **Minimum garanti annuel** (optionnel) : [montant] EUR HT.
- **Devise** : EUR (sauf accord spécifique).

## 2) Définition opérationnelle du chiffre d'affaires lié (CA Lié)

Le CA Lié inclut les revenus HT réellement encaissés, directement liés à l'exploitation du logiciel :

- abonnements,
- ventes de licences,
- frais d'usage / API,
- services packagés indissociables du logiciel.

Sont exclus : taxes, remises justifiées, annulations/avoirs, impayés définitifs.

## 3) Méthodes de ventilation (offres composites)

Choisir une méthode principale et une méthode de secours :

1. **Ventilation par SKU** : attribution directe par référence commerciale.
2. **Ventilation par usage** : prorata volume d'usage (requêtes, utilisateurs actifs, etc.).
3. **Clé de répartition économique** : pondération convenue (% fixe par composant).

La méthode retenue doit être constante sur l'exercice, sauf accord écrit contraire.

## 4) Formule de calcul

- **Redevance variable période N** = `CA Lié N × Taux (%)`.
- **Régularisation minimum garanti** (annuelle) = `max(0, Minimum garanti annuel - somme des redevances variables annuelles)`.
- **Total dû période de régularisation** = `Redevance variable + éventuel complément minimum garanti + pénalités applicables`.

## 5) Exemple chiffré

- Taux : 7 %
- CA Lié T1 : 120 000 EUR HT
- Redevance T1 : 8 400 EUR

Si minimum garanti annuel = 40 000 EUR et total annuel des redevances variables = 35 000 EUR, alors complément dû = 5 000 EUR.

## 6) Échéancier type

- J+15 après fin de période : reporting détaillé + facture.
- J+30 (fin de mois ou date de facture selon contrat) : paiement.
- Clôture annuelle : régularisation du minimum garanti (si applicable).

## 7) Reporting minimal attendu

- Tableau CA Lié brut/net par offre,
- taux appliqué,
- calcul de la redevance,
- ajustements (avoirs, impayés),
- pièces justificatives synthétiques.

## 8) Audit et contrôles

- Droit d'audit selon le contrat principal.
- En cas d'écart > [5] % en défaveur du concédant : correction immédiate + coûts d'audit à la charge du licencié.

## 9) Pénalités de retard

- Intérêts de retard selon clause contractuelle,
- indemnité forfaitaire de recouvrement lorsque applicable,
- suspension possible des droits en cas de non-paiement persistant.

## 10) Validation juridique

Avant utilisation en production/signature, cette annexe doit être revue avec le contrat principal et validée par un(e) juriste spécialisé(e) PI/logiciels en France.
