# Matrice d’éligibilité licensing (AGPLv3 vs Commercial)

Ce document définit des règles **opérationnelles et explicites** pour décider si un usage d’EOS MCP est :

- **Autorisé sans contrat** (canal AGPLv3),
- **Autorisé avec contrat** (licence commerciale EOS signée),
- **Interdit** (hors cadre AGPLv3 et hors contrat commercial).

> En cas de conflit entre ce document et un contrat commercial signé, le contrat signé prévaut.

## 1) Règles explicites par scénario

### A. Redistribution binaire fermée

- **Sans contrat** : **Interdit**.
- **Avec contrat commercial** : **Autorisé** (droits de redistribution définis par le contrat : périmètre, territoires, entités, support).
- **Toujours interdit** : redistribution au-delà du périmètre contractuel, suppression des mentions légales, sous-licence non autorisée.

### B. Intégration dans un produit vendu

- **Produit vendu avec composants/prolongements propriétaires non publiés** :
  - **Sans contrat** : **Interdit**.
  - **Avec contrat** : **Autorisé**.
- **Produit vendu en conformité AGPLv3 complète** (obligations de copyleft respectées et publication des sources requises) :
  - **Sans contrat** : **Autorisé**.

### C. Offre SaaS payante

- **SaaS payant avec modifications/extensions non publiées** :
  - **Sans contrat** : **Interdit**.
  - **Avec contrat** : **Autorisé**.
- **SaaS payant avec conformité AGPLv3 complète** (publication des modifications couvertes pour les utilisateurs du service) :
  - **Sans contrat** : **Autorisé**.

### D. OEM / white-label

- **OEM / white-label (embarqué, rebrandé, revendu)** :
  - **Sans contrat** : **Interdit**.
  - **Avec contrat** : **Autorisé** (droits OEM/white-label explicitement mentionnés).
- **Toujours interdit** : OEM/white-label implicite ou rebranding sans clause contractuelle dédiée.

### E. Volume d’utilisateurs / chiffre d’affaires (seuils)

Par défaut (en l’absence de seuils spécifiques négociés), les seuils de bascule sont :

- **Utilisateurs actifs mensuels (MAU) > 10 000** sur un service intégrant EOS MCP → **Contrat commercial requis**.
- **Chiffre d’affaires annuel > 1 000 000 €** attribuable au produit/service intégrant EOS MCP → **Contrat commercial requis**.
- **Distribution à plus de 25 clients finaux** (modèle OEM/intégrateur) → **Contrat commercial requis**.

Si les seuils ne sont pas dépassés :

- l’usage reste possible **sans contrat** uniquement si l’organisation respecte intégralement AGPLv3 ;
- sinon, l’usage est **interdit** sans contrat.

## 2) Matrice de décision

| Cas d’usage | Autorisé sans contrat | Autorisé avec contrat | Interdit |
|---|---:|---:|---:|
| Redistribution binaire fermée | Non | Oui | Oui (si pas de contrat) |
| Intégration dans produit vendu (propriétaire) | Non | Oui | Oui (si pas de contrat) |
| Intégration dans produit vendu (conforme AGPLv3) | Oui | Oui | Non |
| Offre SaaS payante (modifs non publiées) | Non | Oui | Oui (si pas de contrat) |
| Offre SaaS payante (conforme AGPLv3) | Oui | Oui | Non |
| OEM / white-label | Non | Oui | Oui (si pas de contrat) |
| MAU > 10 000 | Non (contrat requis) | Oui | Oui (si pas de contrat) |
| CA annuel attribuable > 1 000 000 € | Non (contrat requis) | Oui | Oui (si pas de contrat) |
| > 25 clients finaux distribués | Non (contrat requis) | Oui | Oui (si pas de contrat) |

## 3) Règle de qualification rapide

Une opportunité doit être qualifiée en **commerciale (contrat obligatoire)** dès qu’au moins un point est vrai :

1. distribution binaire fermée ;
2. packaging OEM/white-label ;
3. SaaS payant avec code non publié au titre AGPLv3 ;
4. intégration dans produit vendu avec composants propriétaires non publiés ;
5. dépassement d’un seuil (MAU, CA attribuable, nombre de clients distribués).

À défaut, l’usage n’est recevable **sans contrat** que sous conformité AGPLv3 stricte.
