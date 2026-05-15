# Ajouter un outil MCP

Ce guide de contribution décrit le parcours recommandé pour ajouter un nouvel outil MCP dans Eos MCP, depuis le fichier TypeScript de la famille jusqu'aux tests et à la documentation générée.

## 1. Structure attendue dans `src/tools/<family>/index.ts`

Une famille d'outils vit dans `src/tools/<family>/index.ts` et exporte généralement un tableau de `ToolDefinition`. Garder les responsabilités suivantes dans le même fichier, sauf si la famille devient trop grande et mérite des modules dédiés comme `src/tools/cues/` :

1. imports Zod, client OSC, mappings OSC et types d'outils ;
2. schémas Zod réutilisables (`targetOptionsSchema`, identifiants EOS, options `dry_run`, etc.) ;
3. helpers purs de normalisation/construction de payload ;
4. handlers `async` qui valident les arguments, construisent la commande et appellent le client OSC ;
5. définitions `ToolDefinition` avec `name`, `config`, `metadata` et `handler` ;
6. export nommé des outils importants, puis export par défaut du tableau de la famille.

Exemple minimal :

```ts
import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import { buildToolResult, type ToolDefinition } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const exampleInputSchema = {
  item_id: z.coerce.number().int().min(1).describe('Identifiant EOS.'),
  label: z.string().min(1).describe('Libelle a envoyer a EOS.'),
  ...targetOptionsSchema
} satisfies ZodRawShape;

export const eosExampleSetLabelTool: ToolDefinition<typeof exampleInputSchema> = {
  name: 'eos_example_set_label',
  config: {
    title: 'Set example label',
    description: 'Associe un libelle a un objet EOS exemple.',
    inputSchema: exampleInputSchema,
    annotations: {
      mapping: { osc: oscMappings.examples.setLabel }
    }
  },
  metadata: {
    category: 'examples',
    riskLevel: 'medium',
    requiresConfirmation: true
  },
  async handler(args) {
    const parsed = z.object(exampleInputSchema).strict().parse(args);
    const command = `Example ${parsed.item_id} Label "${parsed.label}"`;

    await getOscClient().send(oscMappings.examples.setLabel, [
      { type: 's', value: command }
    ], {
      targetAddress: parsed.targetAddress,
      targetPort: parsed.targetPort
    });

    return buildToolResult({
      text: `Libelle applique a l'exemple ${parsed.item_id}.`,
      commandsSent: [command],
      structuredContent: {
        action: 'example_set_label',
        item_id: parsed.item_id,
        label: parsed.label,
        osc: {
          address: oscMappings.examples.setLabel,
          args: [command]
        }
      }
    });
  }
};

export default [eosExampleSetLabelTool];
```

Après création de la famille, l'ajouter à `src/tools/index.ts` :

```ts
import exampleTools from './examples/index';

const definitions = [
  // ...outils existants,
  ...exampleTools
];
```

## 2. Ajouter un mapping dans `src/services/osc/mappings.ts`

Toutes les adresses OSC doivent être centralisées dans `oscMappings`. Ajouter une entrée sous la famille métier existante, ou créer une nouvelle clé de famille si nécessaire :

```ts
export const oscMappings = {
  // ...
  examples: {
    setLabel: '/eos/newcmd',
    info: '/eos/get/example'
  }
} as const;
```

Bonnes pratiques :

- utiliser un nom de mapping métier stable (`setLabel`, `fire`, `info`) plutôt qu'un nom qui duplique l'adresse OSC ;
- réutiliser les mappings existants (`commands.command`, `commands.newCommand`, etc.) lorsque l'outil envoie une commande texte générique ;
- référencer le mapping dans `config.annotations.mapping.osc` afin que `docs/tools.md` et les tests de contrat puissent retrouver l'adresse ;
- pour les lectures OSC qui peuvent répondre sur `/eos/out/...`, ajouter si besoin une entrée dans `oscResponseMappings` via `withEosOutResponseVariant(...)`.

## 3. Écrire le schéma Zod et éviter les paramètres inconnus

Le dépôt expose les schémas d'entrée sous forme de `ZodRawShape` dans `config.inputSchema`. Le serveur et le générateur de documentation transforment ces shapes en objets Zod : les outils bas niveau sont stricts, tandis que les workflows `eos_workflow_*` sont volontairement tolérants.

Pour un outil classique ou sensible :

```ts
const inputSchema = {
  cue_number: z.coerce.number().min(0).describe('Numero de cue.'),
  list_number: z.coerce.number().min(1).optional(),
  require_confirmation: z.boolean().optional()
} satisfies ZodRawShape;

const parsed = z.object(inputSchema).strict().parse(args);
```

Règles à respecter :

- préférer `z.coerce.number()` pour les valeurs numériques venant de clients MCP qui sérialisent tout en chaînes ;
- borner les valeurs (`min`, `max`, `int`) au plus près de ce qu'EOS accepte ;
- ajouter `.describe(...)` aux champs publics pour alimenter `docs/tools.md` ;
- ne pas lire directement `args` après validation : utiliser uniquement `parsed` ;
- utiliser `.strict()` dans le handler des outils bas niveau pour rejeter les paramètres inconnus avant toute commande OSC ;
- réserver `.passthrough()` aux workflows haut niveau `eos_workflow_*`, lorsque les métadonnées clientes inconnues doivent être conservées mais jamais exécutées.

## 4. Retourner un `ToolExecutionResult` conforme

Un handler doit toujours retourner un objet compatible `ToolExecutionResult` :

- `content` contient au moins un message texte lisible par l'opérateur ;
- `structuredContent.status` reflète l'état (`ok`, `dry_run`, `partial_failure`, `error`) ;
- `structuredContent.summary` reprend le résumé humain ;
- `structuredContent.commandsSent` liste les commandes réellement envoyées ;
- `structuredContent.commands_preview` liste les commandes prévues en dry-run ;
- `structuredContent.warnings` et `structuredContent.next_actions` sont toujours des tableaux ;
- `structuredContent.osc` décrit l'adresse et les arguments OSC utiles au diagnostic.

Utiliser `buildToolResult(...)` dès que possible, car il remplit les champs conventionnels et normalise les tableaux :

```ts
return buildToolResult({
  text: 'Cue 12 envoyee en GO.',
  status: 'ok',
  commandsSent: ['Go Cue 12'],
  structuredContent: {
    action: 'cue_go',
    cue_number: 12,
    osc: {
      address: oscMappings.cues.go,
      args: ['Go Cue 12']
    }
  }
});
```

Pour un dry-run, ne pas appeler `getOscClient().send(...)` et renseigner `status: 'dry_run'`, `commandsSent: []` et `commands_preview`.

## 5. Ajouter les tests unitaires et d'intégration

Ajouter au minimum un fichier `src/tools/<family>/__tests__/<family>.test.ts` pour couvrir :

- validation nominale des arguments et normalisation des types ;
- rejet des paramètres inconnus pour les outils stricts ;
- adresse OSC, payload et options `targetAddress` / `targetPort` envoyés au client mocké ;
- comportement `dry_run` sans envoi OSC, si l'outil l'expose ;
- forme du `ToolExecutionResult` (`content[0].text`, `structuredContent.status`, `commandsSent`, `commands_preview`, `warnings`).

Les tests transverses existants dans `src/tools/__tests__/` complètent la couverture :

- `tool_naming.test.ts` vérifie les conventions de nommage ;
- `tool_result_convention.test.ts` vérifie l'enveloppe de résultat ;
- `osc_contracts.test.ts` et `osc_payloads.test.ts` protègent les mappings et payloads OSC ;
- `src/schemas/__tests__/tool_schemas.test.ts` vérifie la conversion des schémas.

Commandes utiles :

```sh
npm run test:unit -- --runTestsByPath src/tools/<family>/__tests__/<family>.test.ts
npm run test:unit
npm run test:conformance
```

Si l'outil dépend d'une vraie console, isoler le test réseau dans un fichier `*.integration.test.ts` afin qu'il soit exclu de `test:unit` et documenter les prérequis dans le test.

## 6. Régénérer et vérifier `docs/tools.md`

La référence `docs/tools.md` est générée automatiquement depuis les définitions d'outils, les annotations et les schémas Zod.

1. Régénérer la documentation :

   ```sh
   npm run docs:generate
   ```

2. Vérifier que le dépôt est à jour :

   ```sh
   npm run docs:check
   ```

3. Relire la section de l'outil dans `docs/tools.md` : vérifier le titre, la description, les paramètres requis, les descriptions Zod, les annotations OSC et les exemples d'arguments.

4. Committer `docs/tools.md` avec le code si le générateur modifie la référence.

## 7. Checklist avant PR

- [ ] `src/services/osc/mappings.ts` contient le mapping OSC réutilisable.
- [ ] `src/tools/<family>/index.ts` exporte le ou les `ToolDefinition` et la famille est enregistrée dans `src/tools/index.ts`.
- [ ] Les handlers valident avec Zod, rejettent les paramètres inconnus pour les outils stricts et n'utilisent que les arguments validés.
- [ ] Les résultats respectent `ToolExecutionResult` et incluent les commandes envoyées ou prévisualisées.
- [ ] Les tests unitaires et, si nécessaire, les tests d'intégration sont ajoutés.
- [ ] `npm run test:unit`, `npm run docs:generate` et `npm run docs:check` ont été exécutés.
- [ ] `README.md`, `CONTRIBUTING.md` et toute documentation impactée pointent vers ce guide.
