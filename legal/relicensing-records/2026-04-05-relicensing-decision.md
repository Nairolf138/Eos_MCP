# Décision re-licensing — 2026-04-05

## Décision

Suite à l’audit contributeurs du 2026-04-05 :

- **Aucun contributeur tiers** n’a été identifié dans l’historique Git actuel ;
- par conséquent, **aucune demande d’accord de re-licensing tierce n’est requise à date** ;
- **aucun remplacement/réécriture corrective n’est requis à date**.

## Justificatifs liés

- `legal/relicensing-records/2026-04-05-contributor-audit.md`
- `.github/workflows/ci.yml` (contrôle de phrase d’accord CLA dans le corps des PR)

## Procédure imposée pour tout futur cas tiers

Si une contribution tierce est détectée ultérieurement, appliquer sans exception :

1. **Tentative d’obtention d’accord de re-licensing écrit**
   - preuve archivée dans `legal/relicensing-records/YYYY-MM-DD-third-party-<identifiant>.md` ;
   - inclure identité contributeur, commit(s), fichiers impactés, texte d’accord et canal.
2. **Si accord impossible/incomplet : remplacement ou réécriture**
   - suppression du code concerné ;
   - réimplémentation propre ;
   - traçabilité par commit/PR croisés dans le même enregistrement.

## Statut

- Statut dossier : **Conforme (aucun blocage de titularité identifié)**.
