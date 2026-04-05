# Inventaire des dépendances tierces et compatibilité de licence

_Date de l'audit : 2026-04-05._

## Contexte de compatibilité

Canaux de distribution à vérifier :

1. **Canal communautaire** : `AGPL-3.0-only` (voir `LICENSE` et `docs/licensing/strategy.md`).
2. **Canal commercial** : licence propriétaire EOS (distribution fermée autorisée contractuellement).

Critères d'acceptation appliqués :

- **Accepté** : licences permissives (MIT, BSD-2-Clause, BSD-3-Clause, ISC, Apache-2.0, Unlicense).
- **Sous condition** : doubles licences contenant un choix permissif (ex. `MIT OR GPL-2.0`) ; il faut **documenter l'élection du volet permissif**.
- **Bloquant** : copyleft fort non maîtrisé, clauses non commerciales, licences source-available incompatibles (SSPL, BUSL sans exception explicite, CC-BY-NC, etc.).

---

## Dépendances directes (runtime)

| Package | Version résolue | Licence | Compatibilité AGPL communautaire | Compatibilité distribution propriétaire | Statut |
|---|---:|---|---|---|---|
| `@modelcontextprotocol/sdk` | `1.20.2` | MIT | ✅ Oui | ✅ Oui | OK |
| `dotenv` | `16.6.1` | BSD-2-Clause | ✅ Oui | ✅ Oui | OK |
| `express` | `5.1.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `osc` | `2.4.5` | MIT OR GPL-2.0 | ✅ Oui | ✅ Oui (si choix MIT) | ⚠️ Contrôle requis |
| `pino` | `10.1.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `pino-pretty` | `11.3.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `ws` | `8.18.3` | MIT | ✅ Oui | ✅ Oui | OK |
| `zod` | `3.25.76` | MIT | ✅ Oui | ✅ Oui | OK |
| `zod-to-json-schema` | `3.24.6` | ISC | ✅ Oui | ✅ Oui | OK |

## Dépendances directes (développement)

| Package | Version résolue | Licence | Compatibilité AGPL communautaire | Compatibilité distribution propriétaire | Statut |
|---|---:|---|---|---|---|
| `@types/express` | `5.0.5` | MIT | ✅ Oui | ✅ Oui | OK |
| `@types/jest` | `30.0.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `@types/node` | `24.9.2` | MIT | ✅ Oui | ✅ Oui | OK |
| `@types/ws` | `8.18.1` | MIT | ✅ Oui | ✅ Oui | OK |
| `@typescript-eslint/eslint-plugin` | `8.46.2` | MIT | ✅ Oui | ✅ Oui | OK |
| `@typescript-eslint/parser` | `8.46.2` | MIT | ✅ Oui | ✅ Oui | OK |
| `ajv` | `8.17.1` | MIT | ✅ Oui | ✅ Oui | OK |
| `eslint` | `9.38.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `globals` | `16.4.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `jest` | `30.2.0` | MIT | ✅ Oui | ✅ Oui | OK |
| `pkg` | `5.8.1` | MIT | ✅ Oui | ✅ Oui | OK |
| `ts-jest` | `29.4.5` | MIT | ✅ Oui | ✅ Oui | OK |
| `ts-morph` | `27.0.2` | MIT | ✅ Oui | ✅ Oui | OK |
| `ts-node` | `10.9.2` | MIT | ✅ Oui | ✅ Oui | OK |
| `typescript` | `5.9.3` | Apache-2.0 | ✅ Oui | ✅ Oui | OK |

---

## Points d'attention et traitement des cas potentiellement problématiques

### 1) Cas `osc` (et transitive `slip`)

- `osc@2.4.5` est annoncé en double licence : `MIT OR GPL-2.0`.
- Sa dépendance transitive `slip@1.0.2` est également `MIT OR GPL-2.0`.
- Ce n'est **pas bloquant** pour nos deux canaux, car le volet **MIT** est explicitement disponible.

**Action de conformité décidée** (pré-lancement) :

1. Documenter noir sur blanc dans ce fichier que le projet consomme `osc`/`slip` sous option MIT.
2. Conserver les notices de licence dans les artefacts de distribution (`NOTICE` + package metadata).
3. Rejeter toute future dépendance ne proposant qu'un copyleft fort ou une clause NC.

### 2) Dépendances réellement bloquantes détectées

Aucune dépendance directe ou transitive n'a été détectée avec :

- clause non commerciale (NC),
- SSPL/BUSL non compatible,
- AGPL/GPL-only imposé sans alternative permissive.

Donc **aucun remplacement technique immédiat n'est requis** avant lancement officiel.

---

## Commandes d'audit exécutées

```bash
npm ci
npx --yes license-checker --json --production > /tmp/licenses-prod.json
node -e "const d=require('/tmp/licenses-prod.json');const by={};for(const v of Object.values(d)){const l=(v.licenses||'UNKNOWN').toString();by[l]=(by[l]||0)+1;}console.log(by)"
node - <<'NODE'
const {execSync}=require('child_process');
const p=require('./package-lock.json');
const root=p.packages[''];
const all={...root.dependencies,...root.devDependencies};
for(const name of Object.keys(all).sort()){
  const version=p.packages[`node_modules/${name}`]?.version;
  const license=execSync(`npm view ${name}@${version} license`,{encoding:'utf8'}).trim().split('\n')[0];
  console.log(`${name}\t${version}\t${license}`);
}
NODE
```

## Décision finale

✅ **Compatible pour lancement** sur les deux canaux (`AGPL-3.0-only` communautaire + licence commerciale propriétaire), sous réserve de maintenir l'élection MIT sur les paquets dual-licenciés (`osc`, `slip`) et de figer ce contrôle dans la revue de dépendances de release.
