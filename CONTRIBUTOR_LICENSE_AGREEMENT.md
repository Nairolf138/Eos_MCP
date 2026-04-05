# Contributor License Agreement (CLA)

Ce document définit le processus de cession/licence des contributions pour le projet **Eos MCP** afin de permettre une stratégie de licence durable (incluant la dual licence).

## Pourquoi ce CLA

Dès qu'il y a des contributeurs externes, la relicence du code devient juridiquement fragile sans autorisation explicite et traçable de chaque auteur.

Le CLA permet donc de confirmer que chaque contribution :

- est fournie légitimement par son auteur ;
- peut être distribuée sous la licence open source du projet ;
- peut être relicenciée par les mainteneurs selon la politique du projet.

## Portée

Le CLA s'applique à toute contribution non triviale soumise au dépôt (code, documentation, tests, scripts, exemples, etc.).

## Consentement minimum requis dans les Pull Requests

Chaque PR doit contenir explicitement la mention suivante dans sa description :

`I agree to CLA`

Cette mention est vérifiée automatiquement par le workflow CI.

## Processus de signature traçable

Deux options de traçabilité sont acceptées.

### Option A (recommandée) — CLA Bot

- Utiliser un outil de gestion CLA (ex. CLA Assistant ou équivalent) connecté au dépôt.
- Conserver l'historique des signatures dans l'outil (horodatage + compte GitHub + version du texte signé).
- En cas de mise à jour substantielle du CLA, une nouvelle acceptation peut être demandée.

### Option B — Signature manuelle stockée

Si aucun bot n'est disponible :

1. Le contributeur signe le texte CLA (signature électronique ou document signé).
2. Le mainteneur archive la preuve de signature dans un stockage durable et traçable
   (ex. dossier privé `legal/cla-records/` hors dépôt public, ou coffre documentaire de l'organisation).
3. Le registre doit permettre de relier :
   - identité du signataire (ou compte GitHub),
   - date de signature,
   - version du texte CLA,
   - PRs ou commits couverts.

## Politique de conservation

Les preuves de signature CLA doivent être conservées tant que les contributions sont exploitées par le projet, ou selon les obligations légales applicables.

## Absence de CLA

Les contributions sans accord CLA traçable peuvent être refusées ou retirées de l'historique exploitable pour les distributions sous double licence.
