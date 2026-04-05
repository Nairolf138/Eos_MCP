# Contribuer à Eos MCP

Merci pour votre contribution.

## Règles générales

- Respecter les conventions de style et d'architecture du dépôt.
- Ajouter/adapter les tests lorsqu'un comportement est modifié.
- Mettre à jour la documentation impactée (`README.md`, `docs/*.md`) dans la même PR.

## Licence

Le projet est publié sous **GNU AGPLv3** (`AGPL-3.0-only`). Toute contribution doit rester cohérente avec cette licence.

### Licence compliance (mini-checklist)

Avant d'ouvrir une PR, vérifier :

- [ ] Aucune mention de licence conflictuelle (MIT/GPL/BSD/etc.) n'a été introduite dans les fichiers du projet.
- [ ] Les badges de licence dans `README.md` (si présents) pointent vers **AGPL-3.0-only**.
- [ ] Les templates GitHub (issues/PR) et la documentation (`docs/`) ne contiennent aucune information contradictoire sur la licence.
- [ ] Les nouveaux fichiers source incluent un en-tête SPDX valide : `SPDX-License-Identifier: AGPL-3.0-only`.
- [ ] `LICENSE`, `NOTICE` et `package.json` restent alignés sur **AGPL-3.0-only**.
- [ ] Le checkpoint **License review** du template de PR est rempli (dépendances, partenaires commerciaux, impacts de conformité).

## Contributor License Agreement (CLA)

Pour sécuriser juridiquement une stratégie de dual licence/relicence, les contributions externes doivent être couvertes par un accord CLA traçable.

Référence : `CONTRIBUTOR_LICENSE_AGREEMENT.md`.

### Exigence PR (obligatoire)

Ajouter **dans la description de la Pull Request** la mention exacte suivante :

`I agree to CLA`

Une vérification CI bloque la PR si cette mention est absente.

### Signature traçable

Deux mécanismes sont acceptés :

- Bot CLA (recommandé) avec journal d'acceptation horodaté.
- Signature manuelle conservée dans un registre interne traçable (signataire, date, version du CLA, périmètre couvert).

## Onboarding contributeurs (checkpoint licence)

Lors de l'onboarding de tout nouveau contributeur :

1. Présenter le cadre de licence du projet (AGPL-3.0-only + stratégie commerciale).
2. Faire valider le CLA (`CONTRIBUTOR_LICENSE_AGREEMENT.md`) avant première contribution.
3. Expliquer le checkpoint **License review** exigé dans chaque PR.

### Revue trimestrielle obligatoire

Une revue licence est réalisée **chaque trimestre** avec suivi explicite de :

- nouveaux contributeurs ;
- nouvelles dépendances ;
- nouveaux partenaires commerciaux.

Le résultat de cette revue doit être consigné dans la documentation de release ou un compte-rendu interne traçable.
