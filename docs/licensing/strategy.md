# Stratégie de licensing EOS MCP

## Décision officielle

Ce document **tranche explicitement** le modèle de licensing dual d’EOS MCP :

1. **Canal communautaire (open source)** : **GNU AGPLv3** (identifiant SPDX : `AGPL-3.0-only`).
2. **Canal commercial (payant)** : **licence propriétaire EOS Commercial** (contrat écrit, non open source).

Cette stratégie est adoptée pour protéger la création de valeur (y compris en SaaS), encourager les contributions, et permettre une monétisation B2B prévisible.

---

## 1) Licence communautaire choisie : AGPLv3

### Pourquoi AGPLv3

La GNU AGPLv3 est retenue pour le canal communautaire afin de :

- garantir la réciprocité des modifications et extensions distribuées ;
- couvrir explicitement l’usage réseau/SaaS (obligation de mise à disposition du code modifié aux utilisateurs du service) ;
- éviter l’appropriation propriétaire unilatérale de forks enrichis.

### Ce qui est autorisé (canal communautaire)

- utilisation interne, évaluation, développement, test et production ;
- modification du code source ;
- redistribution du logiciel, sous réserve de respecter AGPLv3 ;
- exploitation en service réseau **si** l’opérateur respecte les obligations AGPLv3 (notamment publication des modifications pertinentes).

### Ce qui est interdit / non couvert (canal communautaire)

- intégration dans une offre propriétaire sans respect des obligations AGPLv3 ;
- distribution d’un dérivé sous licence fermée incompatible ;
- suppression des notices légales et obligations de licence.

---

## 2) Licence commerciale payante : propriétaire

### Nature

Le canal commercial repose sur une **licence propriétaire payante**, contractuelle, accordée par EOS.

### Valeur apportée

La licence commerciale permet notamment (selon contrat) :

- usage dans un produit/service propriétaire sans obligation AGPL de publication de code ;
- droits de redistribution OEM/embedded négociés ;
- cadre de support, SLA, garanties et indemnisation optionnels ;
- gouvernance juridique claire pour intégrateurs et grands comptes.

### Ce qui est autorisé (canal commercial)

- intégration dans offres fermées ;
- commercialisation en SaaS sans ouverture du code dérivé ;
- redistribution encadrée vers clients finaux (droits définis au contrat).

### Ce qui est interdit (canal commercial)

- usage au-delà du périmètre contractuel (territoire, volume, entités non couvertes, etc.) ;
- revente/sous-licence non autorisée ;
- suppression des mentions de propriété exigées au contrat.

---

## 3) Objectif de monétisation

Le modèle économique visé combine trois leviers, afin d’équilibrer simplicité commerciale et partage de valeur :

1. **Redevance fixe annuelle** (socle de licence).
2. **Pourcentage de chiffre d’affaires** attribuable aux offres intégrant EOS MCP.
3. **Minimum garanti annuel** pour sécuriser un revenu plancher.

### Paramétrage cible (politique commerciale)

- Redevance fixe : selon segment (éditeur, ESN, OEM) et périmètre (dev/prod, nombre d’instances/clients).
- Pourcentage CA : appliqué au CA logiciel/service directement lié à EOS MCP.
- Minimum garanti : activé pour les partenaires à distribution large (OEM, éditeurs scale-up, intégrateurs grands comptes).

> Les montants exacts sont définis en grille tarifaire séparée et validés au cas par cas par EOS.

---

## 4) Qui doit prendre une licence commerciale ?

| Profil | Exemple concret | Canal communautaire AGPLv3 suffisant ? | Licence commerciale requise ? | Pourquoi |
|---|---|---:|---:|---|
| **Éditeur SaaS** | Une startup vend une plateforme web multi-tenant basée sur EOS MCP avec modules propriétaires | Généralement **non** | **Oui (dans la majorité des cas)** | Évite l’obligation d’ouverture AGPL des adaptations côté service et sécurise le modèle IP |
| **ESN / cabinet** | Une ESN déploie EOS MCP chez un client et ajoute des connecteurs non publiés | Rarement | **Oui (souvent)** | Les livrables spécifiques et contrats clients imposent souvent un cadre propriétaire |
| **Intégrateur** | Intégrateur sectoriel empaquetant EOS MCP dans une solution métier revendue | Rarement | **Oui** | Revente, packaging et maintenance tierce nécessitent des droits commerciaux explicites |
| **OEM / embarqué** | Un fabricant intègre EOS MCP dans un produit distribué à ses clients | **Non** dans la plupart des cas | **Oui** | Distribution embarquée à grande échelle et contraintes contractuelles/garanties |
| **Utilisateur interne** | Une entreprise utilise EOS MCP uniquement en interne sans redistribution | **Oui** (si conformité AGPLv3) | Non, sauf besoin contractuel | Pas de modèle de revente, obligations AGPL gérables en interne |
| **Projet open source compatible** | Un mainteneur publie ses modifications sous AGPLv3 | **Oui** | Non | Le canal communautaire est conçu pour ce cas |

---

## 5) Règle de décision rapide

Une organisation doit basculer en **licence commerciale** dès qu’un des points suivants est vrai :

- elle souhaite garder propriétaire tout ou partie des adaptations liées à EOS MCP ;
- elle redistribue EOS MCP (directement ou embarqué) dans une offre commerciale ;
- elle opère un service SaaS sans vouloir publier les modifications couvertes par AGPLv3 ;
- elle exige des engagements contractuels (SLA, garantie, indemnisation, audit contractuel) hors cadre open source.

---

## 6) Positionnement final

EOS MCP adopte un **dual licensing clair** :

- **AGPLv3** pour la communauté, la transparence et la contribution ;
- **Licence propriétaire payante** pour les usages commerciaux fermés et la monétisation B2B.

Cette décision devient la référence pour les discussions commerciales, la documentation légale et les contrats partenaires.
