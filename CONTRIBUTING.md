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
