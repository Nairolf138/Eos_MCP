# Contribuer à Eos MCP

Merci pour votre contribution.

## Règles générales

- Respecter les conventions de style et d'architecture du dépôt.
- Ajouter/adapter les tests lorsqu'un comportement est modifié.
- Mettre à jour la documentation impactée (`README.md`, `docs/*.md`) dans la même PR.
- Pour ajouter un outil MCP, suivre le [guide dédié](docs/adding-a-tool.md) avant de modifier les mappings, schémas, tests et la documentation générée.

## Vérifications CI locales

Avant d'ouvrir une PR, lancez `npm run check:agent-ready`. Cette commande enchaîne le lint, la compilation TypeScript, le contrôle de `docs/tools.md`, la validation du manifest MCP et la suite Jest standard.

Si votre changement touche le transport HTTP/OSC, le registre MCP ou un scénario utilisateur complet, lancez aussi `npm run check:agent-ready:e2e` afin d'ajouter la suite e2e dédiée à la vérification de base.

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

Les contributions externes doivent être couvertes par l'[Eos MCP Individual Contributor License Agreement v1.0](CONTRIBUTOR_LICENSE_AGREEMENT.md). Le contributeur conserve la propriété de sa contribution et accorde à Florian Ribes (NairolfConcept) les droits nécessaires pour maintenir Eos MCP sous AGPL et proposer des licences commerciales distinctes.

Pour accepter le CLA, cochez dans la description de votre pull request la case exacte fournie par le template :

`- [x] I have read and agree to the Eos MCP Individual Contributor License Agreement v1.0.`

Le compte GitHub authentifié, la pull request et son horodatage constituent la trace d'acceptation. Le mainteneur peut demander un document signé séparément pour une contribution faite pour le compte d'un employeur ou d'une organisation.

Une contribution non couverte par le CLA peut être refusée. Pour une contribution d'entreprise, contactez **licensing@nairolfconcept.fr** avant de soumettre le code.

## Onboarding contributeurs (checkpoint licence)

Lors de l'onboarding de tout nouveau contributeur :

1. Présenter le cadre de licence du projet (AGPL-3.0-only + stratégie commerciale).
2. Faire accepter le CLA avant la première contribution.
3. Expliquer le checkpoint **License review** exigé dans chaque PR.

### Revue trimestrielle obligatoire

Une revue licence est réalisée **chaque trimestre** avec suivi explicite de :

- nouveaux contributeurs ;
- nouvelles dépendances ;
- nouveaux partenaires commerciaux.

Le résultat de cette revue doit être consigné dans la documentation de release ou un compte-rendu interne traçable.
