# Audit contributeurs — 2026-04-05

## Périmètre

Audit des contributions existantes dans le dépôt `Eos_MCP` via :

- historique Git global ;
- répartition par auteurs sur fichiers majeurs ;
- contrôles d’indices de code tiers non cédé.

## Méthodologie (commandes exécutées)

```bash
git shortlog -sne --all
git log --pretty=format: --name-only | sed '/^$/d' | sort | uniq -c | sort -nr | head -n 25
for f in docs/tools.md src/server/index.ts src/server/httpGateway.ts \
  src/server/__tests__/bootstrapHandshake.test.ts src/tools/commands/command_tools.ts README.md; do
  echo "## $f"
  git log --follow --format='%an <%ae>' -- "$f" | sort | uniq -c | sort -nr
done
rg -n "Copyright|SPDX|Licensed under|MIT|Apache|GNU" src docs README.md LICENSE NOTICE .github/workflows/ci.yml
```

## Résultats

### 1) Contributeurs détectés

Sortie `git shortlog -sne --all` :

- `193  Nairolf138 <71496832+Nairolf138@users.noreply.github.com>`

➡️ **Un seul contributeur Git identifié dans l’historique actuel.**

### 2) Fichiers majeurs (fréquence de modifications)

Top fichiers les plus touchés :

1. `docs/tools.md` (23)
2. `src/server/index.ts` (18)
3. `src/server/httpGateway.ts` (16)
4. `src/server/__tests__/bootstrapHandshake.test.ts` (15)
5. `src/tools/commands/command_tools.ts` (14)
6. `README.md` (13)

Pour chacun de ces fichiers, l’auteur des modifications historisées est uniquement :

- `Nairolf138 <71496832+Nairolf138@users.noreply.github.com>`

### 3) Indices de code tiers sans cession/CLA

Constats issus du scan texte :

- en-têtes SPDX/copyright homogènes,
- mention récurrente du titulaire `Florian Ribes (NairolfConcept)`,
- absence d’indices explicites de blobs tiers ajoutés sans attribution/cession dans les fichiers majeurs audités.

Le workflow CI vérifie aussi la présence d’un engagement CLA dans les PR (`I agree to CLA`).

## Conclusion d’audit

- **Aucune contribution tierce active n’a été identifiée** dans l’historique Git actuel.
- **Aucun cas de re-licensing bloquant par absence de cession/CLA** n’est ressorti sur le périmètre audité.
- La décision opérationnelle associée est documentée dans :
  - `legal/relicensing-records/2026-04-05-relicensing-decision.md`.
