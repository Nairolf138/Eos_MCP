# Documentation des outils

> Ce document est généré automatiquement via `npm run docs:generate`.
> Merci de ne pas le modifier manuellement.

Chaque outil expose son nom MCP, une description, la liste des arguments attendus ainsi qu'un exemple d'appel en CLI et par OSC.

## Convention commune des resultats

Les handlers LLM-facing doivent construire leurs reponses via `buildToolResult` (ou un helper local qui l appelle) afin de conserver une enveloppe stable dans `content[0].text` et `structuredContent`.

- `content[0].text` : resume humain court, directement lisible par un operateur.
- `structuredContent.status` : statut haut niveau (`ok`, `dry_run`, `partial_failure`, `error` ou statut EOS brut si applicable).
- `structuredContent.summary` : meme information lisible que le texte, disponible pour les clients qui ne lisent que le contenu structure.
- `structuredContent.commandsSent` : tableau des commandes effectivement envoyees; vide si aucune commande texte EOS n a ete envoyee.
- `structuredContent.commands_preview` : tableau des commandes prevues/simulees, notamment en `dry_run`.
- `structuredContent.warnings` : tableau d objets `{ detail, code? }`, vide en absence d avertissement.
- `structuredContent.next_actions` : tableau d actions recommandees pour l assistant ou l operateur; vide si rien n est requis.
- `structuredContent.target_console`, `structuredContent.target_address` et `structuredContent.target_port` : cible console resolue pour l appel courant.

Tous les outils enregistres acceptent aussi l argument global optionnel `targetConsole`, resolu depuis `EOS_CONSOLES`, en complement de `targetAddress`/`targetPort` quand ces champs sont exposes par l outil.

Cette convention est appliquee en priorite aux familles `cues`, `commands`, `patch`, `dmx`, `macros`, `pixelMaps` et `showControl`; les nouveaux handlers doivent suivre la meme forme afin que les snapshots de lisibilite restent stables.

## Comportement dry-run des workflows

Tous les workflows `eos_workflow_*` exposent `dry_run` et `require_confirmation` en option. Quand `dry_run` est absent ou vaut `false`, le workflow refuse l execution reelle tant que `require_confirmation` ne vaut pas explicitement `true`; cette confirmation ne doit etre ajoutee qu apres validation utilisateur explicite de `structuredContent.commands_preview`.

Quand `dry_run=true`, aucune commande EOS n'est envoyee via `sendDeterministicCommand`; la sequence EOS complete est retournee dans `structuredContent.commands_preview`, et `structuredContent.commandsSent` reste vide. Les executions refusees faute de `require_confirmation=true` retournent aussi systematiquement `structuredContent.commands_preview` pour permettre a Claude de relire exactement les commandes avec l operateur.

Tous les workflows retournent aussi une structure stable et lisible par les LLM : `structuredContent.steps` (alias moderne de `executedSteps`), `structuredContent.commands_preview` (toujours present), `structuredContent.applied_defaults` (defaults explicites comme `start_cue_number=1` ou fallback cuelist master) et `structuredContent.warnings` (avertissements non bloquants et erreurs partielles resumées).

## Safety pattern

> **Plan -> dry-run -> confirmation -> execution.** Pour toute modification de show (cue, patch, palette, commande texte ou declenchement live), l’assistant doit annoncer le plan d’action, proposer un dry-run avec preview des commandes, puis executer en reel uniquement apres confirmation explicite de l’operateur.

Exemple concret pour modifier une cue :

1. **Plan annonce** : "Je vais mettre a jour la cue 12 de la liste 1 sur les canaux `1 Thru 10`, appliquer un facteur d’intensite `0.7`, puis preparer l’update sans l’envoyer."
2. **Dry-run propose** : appeler `eos_workflow_update_cue_look` avec `dry_run=true` afin de retourner `structuredContent.commands_preview`, par exemple `Chan 1 Thru 10 At * 0.7` puis `Update Cue 1 / 12`.
3. **Confirmation explicite** : attendre une reponse non ambigue, par exemple "Confirme, execute la mise a jour de la cue 12".
4. **Execution reelle** : relancer le meme workflow avec les memes arguments metier, `dry_run=false` (ou sans `dry_run`) et `require_confirmation=true` seulement apres cette confirmation explicite, puis verifier `structuredContent.command_log` et `structuredContent.commandsSent`.

Les **outils bas niveau sensibles** (`eos_cue_record`, `eos_cue_update`, `eos_patch_*`, `eos_command`, `eos_new_command`, declenchements `fire`, etc.) exposent des garde-fous stricts comme `require_confirmation`, `safety_level` et le rejet des arguments inconnus. Ils sont adaptes aux integrations qui savent exactement quelle commande EOS envoyer. `eos_new_command` refuse aussi les commandes composees de programmation de cues (par exemple `At` + `Record` + `Label`). Pour une serie de cues, Claude doit privilegier `eos_workflow_create_cue_series` avec `looks[].intensity` (ou `looks[].level`) afin que le workflow emette `Chan 1 Thru 10 At Full`, puis `Record Cue 3`, puis `Cue 3 Label "Reggae"` comme commandes separees.

Les **workflows haut niveau guides** (`eos_workflow_*`) orchestrent plusieurs commandes metier, acceptent des metadonnees clientes inconnues sans les executer et fournissent une preview complete via `dry_run=true`. Pour les workflows qui modifient le show (creation de looks/cues/effects, patch/autopatch, groupes/palettes, update de cue et rehearsal/go), l execution reelle est bloquee sans `require_confirmation=true`; Claude doit donc relancer exactement le meme workflow avec ce champ uniquement apres validation utilisateur explicite. Ils sont a privilegier pour les assistants conversationnels, car ils imposent un parcours operateur plus lisible avant toute action destructive ou visible en live.

## Capacites de lecture OSC

Avant de raisonner sur le contenu du show, Claude doit lire `eos_connect.structuredContent` ou `eos_capabilities_get.structuredContent.context.osc_limitations`. Si `can_read_queries=false`, Claude ne doit pas inventer le patch, la cuelist, les cues ou les objets EOS : il doit les presenter comme inconnus et demander une lecture reussie ou une confirmation utilisateur explicite. En `handshake_mode=degraded`, le serveur indique seulement que l’envoi est possible; la lecture reste non garantie tant qu’une requete de lecture ne retourne pas `status=ok`.

### Adresses de reponse OSC acceptees pour les lectures cues/cuelists

Les requetes JSON EOS attendent par defaut une reponse sur l’adresse de requete, et les outils de lecture transmettent explicitement les variantes `/eos/out/...` observees sur EOS quand elles sont supportees. Les adresses actuellement acceptees sont :

| Famille | Requete envoyee | Reponses acceptees | Outils concernes |
| --- | --- | --- | --- |
| `queries.cue.count` | `/eos/get/cue/count` | `/eos/get/cue/count`, `/eos/out/get/cue/count` | `eos_get_count` avec `target_type: "cue"` |
| `queries.cue.list` | `/eos/get/cue/list` | `/eos/get/cue/list`, `/eos/out/get/cue/list` | `eos_get_list_all` avec `target_type: "cue"` |
| `queries.cuelist.list` | `/eos/get/cuelist/list` | `/eos/get/cuelist/list`, `/eos/out/get/cuelist/list` | `eos_get_list_all` avec `target_type: "cuelist"` |
| `cues.list` | `/eos/get/cuelist` | `/eos/get/cuelist`, `/eos/out/get/cuelist` | `eos_cue_list_all` |
| `cues.info` | `/eos/get/cue` | `/eos/get/cue`, `/eos/out/get/cue` | `eos_cue_get_info` |

## Options communes de securite (outils critiques)

Les outils critiques des familles **cues**, **patch**, **palettes** et **commandes texte** exposent les options suivantes :

- `dry_run` (`boolean`) : calcule la commande OSC/Eos et la retourne dans `structuredContent.osc` sans envoi vers la console.
- `require_confirmation` (`boolean`) : confirmation explicite requise pour les actions sensibles.
- `safety_level` (`strict` | `standard` | `off`) : niveau de garde-fou applique (par defaut `strict`).

En mode `strict`/`standard`, les actions sensibles (`record`, `update`, `delete`, `live fire`, et declenchements `fire`) sont bloquees sans `require_confirmation=true`.

## Politique d'arguments inconnus

Les workflows `eos_workflow_*` sont tolerants : leurs schemas Zod utilisent `passthrough()` pour accepter les champs MCP inconnus. Ces champs sont conserves par la validation mais ne sont pas lus par la logique metier, ce qui permet d'ignorer des metadonnees clientes sans modifier les commandes OSC generees.

Les tools bas niveau et sensibles restent stricts (`strict()`) afin de rejeter les arguments non prevus avant toute action directe : GO brut (`eos_cue_go`), patch brut (`eos_patch_*`, `eos_programming_patch_set_channel`), show control (`eos_show_*`), commandes texte et reglages directs.

Workflows tolerants recenses :

- `eos_workflow_autopatch_band`
- `eos_workflow_build_groups_and_palettes`
- `eos_workflow_create_cue_series`
- `eos_workflow_create_effect`
- `eos_workflow_create_look`
- `eos_workflow_patch_fixture`
- `eos_workflow_patch_scan`
- `eos_workflow_rehearsal_go_safe`
- `eos_workflow_update_cue_look`

## Checklist release interne — LLM-friendly workflows

- [ ] Verifier que chaque nouveau workflow `eos_workflow_*` utilise un schema `passthrough()` au niveau racine et sur les objets imbriques pertinents afin d accepter les metadonnees clientes sans les executer.
- [ ] Documenter chaque valeur par defaut observable (`dry_run=false`, `start_cue_number=1`, fallback cuelist master si `cuelist_number` ou `base_cuelist_number` est absent, defaults `direction/speed/size`, defaults `face_trad_*`, position 3D `0/0/0`).
- [ ] Confirmer que `structuredContent.steps`, `commands_preview`, `applied_defaults` et `warnings` sont toujours presents et restent des tableaux lisibles par un LLM.
- [ ] Comparer les noms des tools entre `src/tools/workflows/index.ts`, `manifest.json` (`featured_workflows` et `presentation_order`) et `docs/tools.md`; aucun alias divergent ne doit etre publie.
- [ ] Executer `npm run docs:check`, `npm run lint:manifest` et les tests workflows avant tag/release.

## Exemples rapides par workflow naturel

Les payloads ci-dessous utilisent le format MCP `tools/call` complet. Les exemples gardent `dry_run=true` pour previsualiser les commandes sans modifier la console; passez `dry_run=false` ou omettez le champ pour executer reellement le workflow.

### Workflow autopatch band

**Phrase utilisateur :** "patch moi 10 Mac Aura a partir du 1/1, puis 4 faces trad en univers 2."

**Payload MCP complet :**

```json
{
  "jsonrpc": "2.0",
  "id": "workflow-autopatch-band-1",
  "method": "tools/call",
  "params": {
    "name": "eos_workflow_autopatch_band",
    "arguments": {
      "fixtures": [
        {
          "count": 10,
          "fixture_manufacturer": "Martin",
          "fixture_model": "MAC Aura",
          "fixture_mode": "Extended",
          "universe": 1,
          "start_address": 1,
          "label_prefix": "Mac Aura"
        }
      ],
      "include_face_trad": true,
      "face_trad_count": 4,
      "face_trad_universe": 2,
      "face_trad_start_address": 1,
      "face_trad_label_prefix": "Face Trad",
      "dry_run": true
    }
  }
}
```

**Options et valeurs par defaut :** `fixtures` est obligatoire. Chaque fixture du bloc est espacee automatiquement de 10 adresses DMX estimees. `include_face_trad=false` par defaut; si `include_face_trad=true`, les valeurs par defaut sont `face_trad_count=4`, `face_trad_universe=1`, `face_trad_start_address=1`, `face_trad_label_prefix="Face Trad"` et `fixture_query="trad"`. `dry_run` absent vaut `false`. `targetAddress`, `targetPort` et `user` sont optionnels.

### Workflow cue series

**Phrase utilisateur :** "crée moi 10 cues reggae avec des ambiances rouge, jaune et vert sur les Mac Aura."

**Payload MCP complet :**

```json
{
  "jsonrpc": "2.0",
  "id": "workflow-cue-series-1",
  "method": "tools/call",
  "params": {
    "name": "eos_workflow_create_cue_series",
    "arguments": {
      "base_cuelist_number": 1,
      "start_cue_number": 10,
      "looks": [
        {
          "channels": "1 Thru 10",
          "intensity": "Full",
          "color_palette": 101,
          "focus_palette": 201,
          "beam_palette": 301,
          "cue_label": "Reggae rouge"
        },
        {
          "channels": "1 Thru 10",
          "color_palette": 102,
          "focus_palette": 202,
          "beam_palette": 301,
          "cue_label": "Reggae jaune"
        },
        {
          "channels": "1 Thru 10",
          "color_palette": 103,
          "focus_palette": 203,
          "beam_palette": 302,
          "cue_label": "Reggae vert"
        }
      ],
      "dry_run": true
    }
  }
}
```

**Options et valeurs par defaut :** `looks` est obligatoire et doit contenir au moins un look; chaque look requiert `channels`. Pour regler un niveau, renseignez `intensity` (ou l'alias `level`) avec `Full`, `Out`, une valeur `0` a `100`, ou une valeur EOS textuelle sure (`On`, `Home`, `FL`) : le workflow genere alors une commande separee `Chan <channels> At <intensity>` avant les palettes. Ne concatenez pas `At`, `Record` ou `Label` dans `channels`. `start_cue_number` vaut `1` par defaut et s'auto-incremente si un look ne precise pas `cue_number`. `base_cuelist_number` absent utilise la cuelist master. `color_palette`, `focus_palette`, `beam_palette` et `cue_label` sont optionnels par look. Pour "10 cues", envoyez 10 objets dans `looks` ou ajoutez des `cue_number` explicites pour les positions particulieres.

### Workflow groups/palettes

**Phrase utilisateur :** "prépare les groupes Mac Aura et Trad, puis les palettes rouge, ambre et centre."

**Payload MCP complet :**

```json
{
  "jsonrpc": "2.0",
  "id": "workflow-groups-palettes-1",
  "method": "tools/call",
  "params": {
    "name": "eos_workflow_build_groups_and_palettes",
    "arguments": {
      "groups": [
        {
          "number": 1,
          "label": "Mac Aura",
          "channels": "1 Thru 10"
        },
        {
          "number": 2,
          "label": "Face Trad",
          "channels": "11 Thru 14"
        }
      ],
      "color_palettes": [
        {
          "number": 101,
          "label": "Rouge reggae",
          "channels": "1 Thru 10",
          "hue": "Red",
          "saturation": 100
        },
        {
          "number": 102,
          "label": "Ambre reggae",
          "channels": "1 Thru 14",
          "hue": "Amber",
          "saturation": 80
        }
      ],
      "focus_palettes": [
        {
          "number": 201,
          "label": "Centre scene",
          "channels": "1 Thru 10",
          "description": "Pan 0 Tilt -20"
        }
      ],
      "dry_run": true
    }
  }
}
```

**Options et valeurs par defaut :** `groups`, `color_palettes` et `focus_palettes` sont tous optionnels, ce qui permet d'envoyer seulement les blocs necessaires. Dans un groupe, `number`, `label` et `channels` sont requis. Dans une color palette, `hue` et `saturation` sont optionnels. Dans une focus palette, `description` est optionnel et envoye comme commande libre avant l'enregistrement de la palette. `dry_run` absent vaut `false`.

### Workflow update cue look

**Phrase utilisateur :** "mets a jour la cue 12 en baissant les Mac Aura a 70% et en rechauffant le look."

**Payload MCP complet :**

```json
{
  "jsonrpc": "2.0",
  "id": "workflow-update-cue-look-1",
  "method": "tools/call",
  "params": {
    "name": "eos_workflow_update_cue_look",
    "arguments": {
      "cuelist_number": 1,
      "cue_number": 12,
      "channels": "1 Thru 10",
      "intensity_factor": 0.7,
      "warmify": true,
      "dry_run": true
    }
  }
}
```

**Options et valeurs par defaut :** `channels` est obligatoire. Si `cue_number` est absent, le workflow applique `Update Cue` sur la cue courante. Si `cue_number` est fourni sans `cuelist_number`, la cuelist master est utilisee. `intensity_factor` est optionnel et genere `At * <valeur>`. `warmify` et `desaturate` sont acceptes mais documentes comme transformations artistiques non calculees en v1; aucune commande implicite supplementaire n'est envoyee pour ces deux options. `dry_run` absent vaut `false`.

### Workflow flyout effect

**Phrase utilisateur :** "crée un flyout center-out sur les Mac Aura, effet 21, rapide et assez large."

**Payload MCP complet :**

```json
{
  "jsonrpc": "2.0",
  "id": "workflow-flyout-effect-1",
  "method": "tools/call",
  "params": {
    "name": "eos_workflow_create_effect",
    "arguments": {
      "channels": "1 Thru 10",
      "effect_number": 21,
      "group_number": 1,
      "direction": "center_out",
      "speed": 1.8,
      "size": 140,
      "dry_run": true
    }
  }
}
```

**Options et valeurs par defaut :** `channels` et `effect_number` sont obligatoires. `group_number` est optionnel; s'il est fourni, le workflow enregistre d'abord le groupe correspondant. `direction` vaut `left_to_right` par defaut et accepte aussi `right_to_left` ou `center_out`. `speed` vaut `1` par defaut et `size` vaut `100` par defaut. `dry_run` absent vaut `false`.

## Outils mis en avant

| Outil | Résumé | Lien |
| --- | --- | --- |
| `eos_channel_set_level` | Reglage de niveau | [#eos-channel-set-level](#eos-channel-set-level) |
| `eos_cue_go` | GO sur liste de cues | [#eos-cue-go](#eos-cue-go) |
| `eos_cue_stop_back` | Stop ou Back sur liste de cues | [#eos-cue-stop-back](#eos-cue-stop-back) |
| `eos_preset_fire` | Declenchement de preset | [#eos-preset-fire](#eos-preset-fire) |
| `eos_preset_get_info` | Informations de preset | [#eos-preset-get-info](#eos-preset-get-info) |

## Métadonnées de découverte

Les champs `category`, `synonyms`, `riskLevel`, `requiresConfirmation` et `preferredWorkflow` sont publiés dans `config.annotations` pour les clients MCP et repris ci-dessous pour guider le routage LLM.

Catégories documentées : `commands`, `cues`, `diagnostics`, `dmx`, `keys`, `macros`, `palettes`, `patch`, `presets`, `showControl`, `showfile`.

<a id="eos-address-select"></a>
## Selection d'adresse DMX (`eos_address_select`)

**Description :** Selectionne une adresse DMX specifique sur la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `dmx` |
| Synonymes | `dmx`, `address`, `adresse`, `level`, `sortie directe` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `address_number` | string \| number | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_address_select --args '{"address_number":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/addr s:'{"address_number":"exemple"}'
```

<a id="eos-address-set-dmx"></a>
## Reglage DMX brut (`eos_address_set_dmx`)

**Description :** Fixe une valeur DMX brute (0-255) pour une adresse DMX.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `dmx` |
| Synonymes | `dmx`, `address`, `adresse`, `level`, `sortie directe` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `address_number` | string \| number | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `dmx_value` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_address_set_dmx --args '{"address_number":"exemple","dmx_value":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/addr/{address}/DMX s:'{"address_number":"exemple","dmx_value":1}'
```

<a id="eos-address-set-level"></a>
## Reglage de niveau d'adresse DMX (`eos_address_set_level`)

**Description :** Ajuste le niveau (0-100) pour une adresse DMX donnee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `dmx` |
| Synonymes | `dmx`, `address`, `adresse`, `level`, `sortie directe` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `address_number` | string \| number | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `level` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_address_set_level --args '{"address_number":"exemple","level":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/addr/{address} s:'{"address_number":"exemple","level":1}'
```

<a id="eos-beam-palette-fire"></a>
## Declenchement de palette de beam (`eos_beam_palette_fire`)

**Description :** Declenche une palette de beam sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_beam_palette_fire --args '{"palette_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/bp/fire s:'{"palette_number":1}'
```

<a id="eos-capabilities-get"></a>
## Capacites serveur EOS MCP (`eos_capabilities_get`)

**Description :** Retourne les fonctionnalites disponibles par famille, le contexte de session/connexion et la version serveur.

**Arguments :** Aucun argument.

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_capabilities_get --args '{}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-channel-get-info"></a>
## Informations de canaux (`eos_channel_get_info`)

**Description :** Recupere des informations sur les canaux depuis la console.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `fields` | array<string> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_channel_get_info --args '{"channels":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/channels s:'{"channels":1}'
```

<a id="eos-channel-select"></a>
## Selection de canaux (`eos_channel_select`)

**Description :** Selectionne un ou plusieurs canaux sur la console.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `exclusive` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_channel_select --args '{"channels":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Chan 1'
```

<a id="eos-channel-set-dmx"></a>
## Reglage DMX des canaux (`eos_channel_set_dmx`)

**Description :** Ajuste la valeur DMX brute (0-255) pour des canaux specifiques.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `value` | number \| string | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_channel_set_dmx --args '{"channels":1,"value":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Chan 1 At 1 DMX'
```

<a id="eos-channel-set-level"></a>
## Reglage de niveau (`eos_channel_set_level`)

**Description :** Ajuste le niveau intensite de canaux specifiques (0-100).

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `level` | number \| string | Oui | — |
| `snap` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_channel_set_level --args '{"channels":1,"level":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Chan 1 Sneak 1'
```

<a id="eos-channel-set-parameter"></a>
## Reglage de parametre (`eos_channel_set_parameter`)

**Description :** Ajuste un parametre de canal sur une echelle de 0 a 100.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `parameter` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `value` | number \| string | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_channel_set_parameter --args '{"channels":1,"parameter":"exemple","value":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/chan/1/param/exemple f:1
```

<a id="eos-color-palette-fire"></a>
## Declenchement de palette de couleur (`eos_color_palette_fire`)

**Description :** Declenche une palette de couleur sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_color_palette_fire --args '{"palette_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cp/fire s:'{"palette_number":1}'
```

<a id="eos-command"></a>
## Commande EOS (`eos_command`)

**Description :** Envoie du texte sur la ligne de commande existante de la console. A n'utiliser que lorsqu'aucun outil dedie n'existe. Pour programmer des cues, preferer eos_new_command avec clearLine=true et terminateWithEnter=true.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `command` | string | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `terminateWithEnter` | boolean | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_command --args '{"command":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"command":"exemple"}'
```

<a id="eos-command-with-substitution"></a>
## Commande avec substitution (`eos_command_with_substitution`)

**Description :** Applique des substitutions %1, %2, ... puis envoie la commande.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `template` | string | Oui | — |
| `terminateWithEnter` | boolean | Non | — |
| `user` | number | Non | — |
| `values` | array<string \| number \| boolean> | Non | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_command_with_substitution --args '{"template":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"template":"exemple"}'
```

<a id="eos-configure"></a>
## Reconfiguration OSC EOS (`eos_configure`)

**Description :** Met a jour la configuration reseau OSC (ports, adresse) et recree le client partage.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `localPort` | number | Oui | — |
| `remoteAddress` | string | Oui | — |
| `remotePort` | number | Oui | — |
| `tcpPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_configure --args '{"remoteAddress":"exemple","remotePort":1,"localPort":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-connect"></a>
## Connexion OSC EOS (`eos_connect`)

**Description :** Initie un handshake OSC avec la console EOS, choisit un protocole et retourne la version detectee.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `clientId` | string | Non | — |
| `handshakeTimeoutMs` | number | Non | — |
| `preferredProtocols` | array<string> | Non | — |
| `protocolTimeoutMs` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_connect --args '{"targetAddress":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-console-targets"></a>
## Diagnostics des consoles cible (`eos_console_targets`)

**Description :** Liste les cibles EOS configurees via EOS_CONSOLES et indique leur etat par rapport a la connexion OSC courante.

**Arguments :** Aucun argument.

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_console_targets --args '{}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-cue-fire"></a>
## Declenchement de cue (`eos_cue_fire`)

**Description :** Declenche immediatement une cue specifique dans une liste donnee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | string \| number | Oui | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_fire --args '{"cuelist_number":1,"cue_number":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"cuelist_number":1,"cue_number":"exemple"}'
```

<a id="eos-cue-get-info"></a>
## Informations de cue (`eos_cue_get_info`)

**Description :** Recupere les informations detaillees d'une cue (timings, flags, notes...).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | string \| number | Oui | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `fields` | array<string> | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_get_info --args '{"cuelist_number":1,"cue_number":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/cue s:'{"cuelist_number":1,"cue_number":"exemple"}'
```

<a id="eos-cue-go"></a>
## GO sur liste de cues (`eos_cue_go`)

**Description :** Declenche un GO sur la liste de cues cible, optionnellement vers une cue precise.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | string \| number | Non | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_go --args '{"cuelist_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"cuelist_number":1}'
```

<a id="eos-cue-label-set"></a>
## Label cue (`eos_cue_label_set`)

**Description :** Applique un label a une cue via une commande EOS deterministe.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Non | — |
| `label` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_label_set --args '{"cue_number":1,"label":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Cue 1 Label "exemple"#'
```

<a id="eos-cue-list-all"></a>
## Liste des cues (`eos_cue_list_all`)

**Description :** Recupere toutes les cues d'une liste avec leurs labels.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_list_all --args '{"cuelist_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/cuelist s:'{"cuelist_number":1}'
```

<a id="eos-cue-record"></a>
## Record cue (`eos_cue_record`)

**Description :** Enregistre une cue de maniere deterministe via eos_new_command.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_record --args '{"cue_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Record Cue {cuelist_number}/1#'
```

<a id="eos-cue-select"></a>
## Selection de cue (`eos_cue_select`)

**Description :** Selectionne une cue dans la liste sans la declencher.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | string \| number | Oui | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_select --args '{"cuelist_number":1,"cue_number":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"cuelist_number":1,"cue_number":"exemple"}'
```

<a id="eos-cue-stop-back"></a>
## Stop ou Back sur liste de cues (`eos_cue_stop_back`)

**Description :** Stoppe la lecture de la liste ou effectue un back selon l'option fournie.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `back` | boolean | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_stop_back --args '{"cuelist_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'Cue 1 Stop#'
```

<a id="eos-cue-update"></a>
## Update cue (`eos_cue_update`)

**Description :** Met a jour une cue de maniere deterministe via eos_new_command.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cue_update --args '{"cue_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Update Cue 1#'
```

<a id="eos-cuelist-bank-create"></a>
## Creation de bank de cuelist (`eos_cuelist_bank_create`)

**Description :** Configure un bank OSC pour surveiller une liste de cues.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `num_pending_cues` | number | Oui | — |
| `num_prev_cues` | number | Oui | — |
| `offset` | number | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cuelist_bank_create --args '{"bank_index":1,"cuelist_number":1,"num_prev_cues":1,"num_pending_cues":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cuelist/1/config/1/1/1
```

<a id="eos-cuelist-bank-page"></a>
## Navigation de bank de cuelist (`eos_cuelist_bank_page`)

**Description :** Change de page dans un bank de cues en ajoutant le delta specifie.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | — |
| `delta` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cuelist_bank_page --args '{"bank_index":1,"delta":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cuelist/1/page/1
```

<a id="eos-cuelist-get-info"></a>
## Informations de cuelist (`eos_cuelist_get_info`)

**Description :** Recupere les attributs d'une liste de cues (modes, flags...).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_cuelist_get_info --args '{"cuelist_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/cuelist/info s:'{"cuelist_number":1}'
```

<a id="eos-curve-get-info"></a>
## Lecture des informations de courbe (`eos_curve_get_info`)

**Description :** Recupere les informations d'une courbe, incluant label et points.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `curve_number` | number | Oui | Numero de courbe (1-9999). |
| `fields` | array<string> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_curve_get_info --args '{"curve_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/curve s:'{"curve_number":1}'
```

<a id="eos-curve-select"></a>
## Selection de courbe (`eos_curve_select`)

**Description :** Selectionne une courbe en envoyant son numero a la console.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `curve_number` | number | Oui | Numero de courbe (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_curve_select --args '{"curve_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/curve/select s:'{"curve_number":1}'
```

<a id="eos-direct-select-bank-create"></a>
## Creation de bank de direct selects (`eos_direct_select_bank_create`)

**Description :** Cree un bank de direct selects OSC avec configuration de cible et pagination.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de direct selects (0 pour le premier bank). |
| `button_count` | number | Oui | Nombre de boutons a creer dans le bank (1-100). |
| `flexi_mode` | boolean | Oui | Active ou non le mode Flexi pour le bank. |
| `page_number` | number | Non | Page initiale (0 par defaut). |
| `target_type` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_direct_select_bank_create --args '{"bank_index":1,"target_type":"exemple","button_count":1,"flexi_mode":true}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/ds/{index}/config/{target}/{buttons}/{flexi}/{page} s:'{"bank_index":1,"target_type":"exemple","button_count":1,"flexi_mode":true}'
```

<a id="eos-direct-select-page"></a>
## Navigation de direct select (`eos_direct_select_page`)

**Description :** Change la page active dans un bank de direct selects.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de direct selects (0 pour le premier bank). |
| `delta` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_direct_select_page --args '{"bank_index":1,"delta":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/ds/{index}/page/1 s:'{"bank_index":1,"delta":1}'
```

<a id="eos-direct-select-press"></a>
## Appui de direct select (`eos_direct_select_press`)

**Description :** Simule un appui ou relachement sur un bouton de direct select.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de direct selects (0 pour le premier bank). |
| `button_index` | number | Oui | Position du bouton dans le bank (1-n). |
| `state` | number | Oui | Etat du bouton (1.0 = enfonce, 0.0 = relache). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_direct_select_press --args '{"bank_index":1,"button_index":1,"state":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/ds/{index}/button/{page}/{button} f 1
```

<a id="eos-effect-get-info"></a>
## Informations d'effet (`eos_effect_get_info`)

**Description :** Recupere les informations detaillees d'un effet.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect_number` | number | Oui | Numero d'effet (1-9999) |
| `fields` | array<string> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_effect_get_info --args '{"effect_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/effect s:'{"effect_number":1}'
```

<a id="eos-effect-select"></a>
## Selection d'effet (`eos_effect_select`)

**Description :** Selectionne un effet sans le lancer.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect_number` | number | Oui | Numero d'effet (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_effect_select --args '{"effect_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"effect_number":1}'
```

<a id="eos-effect-stop"></a>
## Arret d'effet (`eos_effect_stop`)

**Description :** Stoppe un effet actif sur la selection.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect_number` | number | Non | Numero d'effet (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_effect_stop --args '{"effect_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/cmd s:'{"effect_number":1}'
```

<a id="eos-enable-logging"></a>
## Basculer le logging OSC (`eos_enable_logging`)

**Description :** Active ou desactive la journalisation des messages OSC entrants et sortants.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `incoming` | boolean | Non | — |
| `outgoing` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_enable_logging --args '{"incoming":true}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-fader-bank-create"></a>
## Creation de bank de faders (`eos_fader_bank_create`)

**Description :** Cree un bank de faders OSC avec pagination optionnelle.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_count` | number | Oui | Nombre de faders a creer dans le bank. |
| `page_number` | number | Non | Numero de page initial (0 par defaut). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fader_bank_create --args '{"bank_index":1,"fader_count":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/fader/{index}/config/{faders}/{page} s:'{"bank_index":1,"fader_count":1}'
```

<a id="eos-fader-load"></a>
## Chargement de fader (`eos_fader_load`)

**Description :** Charge le contenu courant sur le fader specifie.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_index` | number | Oui | Position du fader dans le bank (1-n). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fader_load --args '{"bank_index":1,"fader_index":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/fader/{bank}/{page}/{fader}/load s:'{"bank_index":1,"fader_index":1}'
```

<a id="eos-fader-page"></a>
## Navigation de bank de faders (`eos_fader_page`)

**Description :** Change de page dans le bank en ajoutant le delta specifie.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `delta` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fader_page --args '{"bank_index":1,"delta":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/fader/{index}/page/1 s:'{"bank_index":1,"delta":1}'
```

<a id="eos-fader-set-level"></a>
## Reglage de niveau de fader (`eos_fader_set_level`)

**Description :** Definit le niveau (0-1 ou 0-100%) du fader cible.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_index` | number | Oui | Position du fader dans le bank (1-n). |
| `level` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fader_set_level --args '{"bank_index":1,"fader_index":1,"level":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/fader/{bank}/{page}/{fader} s:'{"bank_index":1,"fader_index":1,"level":1}'
```

<a id="eos-fader-unload"></a>
## Dechargement de fader (`eos_fader_unload`)

**Description :** Decharge le contenu du fader specifie.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_index` | number | Oui | Position du fader dans le bank (1-n). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fader_unload --args '{"bank_index":1,"fader_index":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/fader/{bank}/{page}/{fader}/unload s:'{"bank_index":1,"fader_index":1}'
```

<a id="eos-fixture-search"></a>
## Recherche fixture (`eos_fixture_search`)

**Description :** Recherche dans la bibliotheque de fixtures par nom, marque, modele ou mode.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `limit` | number | Non | — |
| `manufacturer` | string | Non | — |
| `mode` | string | Non | — |
| `model` | string | Non | — |
| `name` | string | Non | — |
| `query` | string | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fixture_search --args '{"query":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-focus-palette-fire"></a>
## Declenchement de palette de focus (`eos_focus_palette_fire`)

**Description :** Declenche une palette de focus sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_focus_palette_fire --args '{"palette_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/fp/fire s:'{"palette_number":1}'
```

<a id="eos-fpe-get-point-info"></a>
## Informations point FPE (`eos_fpe_get_point_info`)

**Description :** Recupere les informations detaillees pour un point Focus Palette Encoder.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `point_number` | number | Oui | Numero de point FPE (1-9999). |
| `set_number` | number | Oui | Numero de set FPE (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fpe_get_point_info --args '{"set_number":1,"point_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/fpe/point s:'{"set_number":1,"point_number":1}'
```

<a id="eos-fpe-get-set-count"></a>
## Compter les sets FPE (`eos_fpe_get_set_count`)

**Description :** Recupere le nombre total de sets Focus Palette Encoder.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fpe_get_set_count --args '{"timeoutMs":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/fpe/set/count s:'{"timeoutMs":1}'
```

<a id="eos-fpe-get-set-info"></a>
## Informations set FPE (`eos_fpe_get_set_info`)

**Description :** Recupere les informations detaillees pour un set Focus Palette Encoder.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `set_number` | number | Oui | Numero de set FPE (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fpe_get_set_info --args '{"set_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/fpe/set s:'{"set_number":1}'
```

<a id="eos-get-active-cue"></a>
## Cue active (`eos_get_active_cue`)

**Description :** Recupere la cue actuellement en lecture sur la liste specifiee (ou principale).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_active_cue --args '{"cuelist_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/active/cue s:'{"cuelist_number":1}'
```

<a id="eos-get-active-wheels"></a>
## Encodeurs actifs (`eos_get_active_wheels`)

**Description :** Recupere et normalise la liste des encodeurs actifs.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_active_wheels --args '{"timeoutMs":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/active/wheels s:'{"timeoutMs":1}'
```

<a id="eos-get-command-line"></a>
## Lecture de la ligne de commande EOS (`eos_get_command_line`)

**Description :** Recupere le contenu courant de la ligne de commande via OSC Get.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_command_line --args '{"user":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/cmd_line s:'{"user":1}'
```

<a id="eos-get-count"></a>
## Compter les elements (`eos_get_count`)

**Description :** Recupere le nombre total d'elements pour un type donne.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `target_type` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_count --args '{"target_type":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-get-diagnostics"></a>
## Diagnostics OSC (`eos_get_diagnostics`)

**Description :** Recupere les informations de diagnostic du service OSC.

**Arguments :** Aucun argument.

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_diagnostics --args '{}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-get-list-all"></a>
## Lister tous les elements (`eos_get_list_all`)

**Description :** Recupere la liste complete des elements pour un type donne.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `target_type` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_list_all --args '{"target_type":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-get-live-blind-state"></a>
## Etat Live/Blind (`eos_get_live_blind_state`)

**Description :** Indique si la console est en mode Live ou Blind.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | Delai maximum d'attente en millisecondes. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_live_blind_state --args '{"timeoutMs":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/live/blind s:'{"timeoutMs":1}'
```

<a id="eos-get-pending-cue"></a>
## Cue en attente (`eos_get_pending_cue`)

**Description :** Recupere la prochaine cue en attente sur la liste specifiee (ou principale).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_pending_cue --args '{"cuelist_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/pending/cue s:'{"cuelist_number":1}'
```

<a id="eos-get-setup-defaults"></a>
## Defaults de setup (`eos_get_setup_defaults`)

**Description :** Recupere les valeurs par defaut de setup exposees par la console EOS.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_setup_defaults --args '{"timeoutMs":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-get-show-name"></a>
## Nom du show (`eos_get_show_name`)

**Description :** Recupere le nom du show actuellement charge sur la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | Delai maximum d'attente en millisecondes. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_show_name --args '{"timeoutMs":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/show/name s:'{"timeoutMs":1}'
```

<a id="eos-get-softkey-labels"></a>
## Libelles des softkeys (`eos_get_softkey_labels`)

**Description :** Recupere les libelles affiches des softkeys 1-12.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `keys` |
| Synonymes | `key`, `button`, `softkey`, `touche`, `facepanel` |
| Niveau de risque | `medium` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_softkey_labels --args '{"timeoutMs":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/softkey_labels s:'{"timeoutMs":1}'
```

<a id="eos-get-user-command-line"></a>
## Lecture de la ligne de commande utilisateur (`eos_get_user_command_line`)

**Description :** Recupere la ligne de commande pour un utilisateur specifique.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `user` | number | Oui | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_user_command_line --args '{"user":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/cmd_line s:'{"user":1}'
```

<a id="eos-get-version"></a>
## Version de la console (`eos_get_version`)

**Description :** Recupere la version logicielle signalee par la console EOS.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_get_version --args '{"timeoutMs":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-group-get-info"></a>
## Informations sur un groupe (`eos_group_get_info`)

**Description :** Recupere les informations detaillees pour un groupe donne.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `group_number` | number | Oui | Numero de groupe (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_group_get_info --args '{"group_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/group s:'{"group_number":1}'
```

<a id="eos-group-list-all"></a>
## Liste des groupes (`eos_group_list_all`)

**Description :** Recupere la liste des groupes disponibles avec leurs membres.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_group_list_all --args '{"timeoutMs":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/group/list s:'{"timeoutMs":1}'
```

<a id="eos-group-select"></a>
## Selection de groupe (`eos_group_select`)

**Description :** Selectionne un groupe sur la console Eos.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `group_number` | number | Oui | Numero de groupe (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_group_select --args '{"group_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/group s:'{"group_number":1}'
```

<a id="eos-group-set-level"></a>
## Reglage de niveau de groupe (`eos_group_set_level`)

**Description :** Ajuste le niveau d'un groupe sur une echelle de 0 a 100.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `group_number` | number | Oui | Numero de groupe (1-99999) |
| `level` | number \| string | Oui | — |
| `snap` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_group_set_level --args '{"group_number":1,"level":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/group/{group}/level s:'{"group_number":1,"level":1}'
```

<a id="eos-intensity-palette-fire"></a>
## Declenchement de palette d'intensite (`eos_intensity_palette_fire`)

**Description :** Declenche une palette d'intensite sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_intensity_palette_fire --args '{"palette_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/ip/fire s:'{"palette_number":1}'
```

<a id="eos-key-press"></a>
## Appui sur touche (`eos_key_press`)

**Description :** Simule l'appui ou le relachement d'une touche du clavier EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `keys` |
| Synonymes | `key`, `button`, `softkey`, `touche`, `facepanel` |
| Niveau de risque | `medium` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `key_name` | string | Oui | — |
| `state` | number \| boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_key_press --args '{"key_name":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/key/{key} s:'{"key_name":"exemple"}'
```

<a id="eos-macro-fire"></a>
## Declenchement de macro (`eos_macro_fire`)

**Description :** Declenche une macro en envoyant son numero a la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `macros` |
| Synonymes | `macro`, `macro fire`, `automation`, `sequence` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro_number` | number | Oui | Numero de macro (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_macro_fire --args '{"macro_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/macro/fire s:'{"macro_number":1}'
```

<a id="eos-macro-get-info"></a>
## Informations de macro (`eos_macro_get_info`)

**Description :** Recupere le libelle et le script d'une macro.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `macros` |
| Synonymes | `macro`, `macro fire`, `automation`, `sequence` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro_number` | number | Oui | Numero de macro (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_macro_get_info --args '{"macro_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/macro s:'{"macro_number":1}'
```

<a id="eos-macro-select"></a>
## Selection de macro (`eos_macro_select`)

**Description :** Selectionne une macro sans l'executer.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `macros` |
| Synonymes | `macro`, `macro fire`, `automation`, `sequence` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro_number` | number | Oui | Numero de macro (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_macro_select --args '{"macro_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/macro s:'{"macro_number":1}'
```

<a id="eos-magic-sheet-get-info"></a>
## Informations de magic sheet (`eos_magic_sheet_get_info`)

**Description :** Recupere le label et l'UID d'un magic sheet.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `ms_number` | number | Oui | Numero du magic sheet (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_magic_sheet_get_info --args '{"ms_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/magic_sheet s:'{"ms_number":1}'
```

<a id="eos-magic-sheet-open"></a>
## Ouverture de magic sheet (`eos_magic_sheet_open`)

**Description :** Ouvre un magic sheet specifique sur la console.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `ms_number` | number | Oui | Numero du magic sheet (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `view_number` | number | Non | Numero de vue (1-99). |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_magic_sheet_open --args '{"ms_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/ms s:'{"ms_number":1}'
```

<a id="eos-magic-sheet-send-string"></a>
## Envoi de commande via magic sheet (`eos_magic_sheet_send_string`)

**Description :** Envoie une commande OSC via la fonctionnalite Magic Sheet.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `osc_command` | string | Oui | Commande OSC a envoyer via le magic sheet. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_magic_sheet_send_string --args '{"osc_command":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'{"osc_command":"exemple"}'
```

<a id="eos-new-command"></a>
## Nouvelle commande EOS (`eos_new_command`)

**Description :** Efface optionnellement la ligne de commande puis envoie le texte fourni. A n'utiliser que lorsqu'aucun outil dedie n'existe. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `clearLine` | boolean | Non | — |
| `command` | string | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `substitutions` | array<string \| number \| boolean> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `terminateWithEnter` | boolean | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_new_command --args '{"command":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'{"command":"exemple"}'
```

<a id="eos-palette-get-info"></a>
## Informations de palette (`eos_palette_get_info`)

**Description :** Recupere les informations detaillees pour une palette donnee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | — |
| `fields` | array<string> | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `palette_type` | enum(ip, fp, cp, bp) | Oui | Type de palette: 'ip' (intensite), 'fp' (focus), 'cp' (couleur), 'bp' (beam) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_palette_get_info --args '{"palette_type":"ip","palette_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/palette s:'{"palette_type":"ip","palette_number":1}'
```

<a id="eos-palette-label-set"></a>
## Label palette (`eos_palette_label_set`)

**Description :** Applique un label sur une palette avec commande deterministe.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `label` | string | Oui | — |
| `palette_number` | number | Oui | — |
| `palette_type` | enum(ip, fp, cp, bp) | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_palette_label_set --args '{"palette_type":"ip","palette_number":1,"label":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'IP 1 Label "exemple"#'
```

<a id="eos-palette-record"></a>
## Record palette (`eos_palette_record`)

**Description :** Enregistre une palette (ip/fp/cp/bp) avec commande deterministe.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `palette_number` | number | Oui | — |
| `palette_type` | enum(ip, fp, cp, bp) | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_palette_record --args '{"palette_type":"ip","palette_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'IP 1 Record#'
```

<a id="eos-patch-get-augment3d-beam"></a>
## Faisceau Augment3d (`eos_patch_get_augment3d_beam`)

**Description :** Recupere les informations de faisceau Augment3d pour une partie de canal.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `patch` |
| Synonymes | `patch`, `fixture`, `channel setup`, `augment3d`, `adressage` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_autopatch_band` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | Numero de canal (1-99999). |
| `dry_run` | boolean | Non | — |
| `part_number` | number | Oui | Numero de partie (1-99). |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_patch_get_augment3d_beam --args '{"channel_number":1,"part_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/patch/chan_beam s:'{"channel_number":1,"part_number":1}'
```

<a id="eos-patch-get-augment3d-position"></a>
## Position Augment3d (`eos_patch_get_augment3d_position`)

**Description :** Recupere la position Augment3d d'une partie de canal.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `patch` |
| Synonymes | `patch`, `fixture`, `channel setup`, `augment3d`, `adressage` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_autopatch_band` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | Numero de canal (1-99999). |
| `dry_run` | boolean | Non | — |
| `part_number` | number | Oui | Numero de partie (1-99). |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_patch_get_augment3d_position --args '{"channel_number":1,"part_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/patch/chan_pos s:'{"channel_number":1,"part_number":1}'
```

<a id="eos-patch-get-channel-info"></a>
## Informations de patch (`eos_patch_get_channel_info`)

**Description :** Recupere les informations de patch pour un canal donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `patch` |
| Synonymes | `patch`, `fixture`, `channel setup`, `augment3d`, `adressage` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_autopatch_band` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | Numero de canal (1-99999). |
| `dry_run` | boolean | Non | — |
| `part_number` | number | Non | Numero de partie (0 = toutes les parties, 1-99). |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_patch_get_channel_info --args '{"channel_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/patch/chan_info s:'{"channel_number":1}'
```

<a id="eos-patch-set-channel"></a>
## Set patch channel (`eos_patch_set_channel`)

**Description :** Configure adresse DMX, type appareil, part et label via commande deterministe.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | — |
| `device_type` | string | Oui | — |
| `dmx_address` | string | Oui | — |
| `label` | string | Non | — |
| `part` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_patch_set_channel --args '{"channel_number":1,"dmx_address":"exemple","device_type":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'Patch Chan 1 Part 1 Address exemple Type "exemple"#'
```

<a id="eos-ping"></a>
## Ping OSC EOS (`eos_ping`)

**Description :** Envoie un ping OSC a la console EOS et retourne le statut.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `message` | string | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_ping --args '{"message":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/ping s:'{"message":"exemple"}'
```

<a id="eos-pixmap-get-info"></a>
## Informations sur un pixel map (`eos_pixmap_get_info`)

**Description :** Recupere les informations detaillees pour un pixel map donne.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `pixmap_number` | number | Oui | Numero du pixel map (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_pixmap_get_info --args '{"pixmap_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/pixmap s:'{"pixmap_number":1}'
```

<a id="eos-pixmap-select"></a>
## Selection de pixel map (`eos_pixmap_select`)

**Description :** Selectionne un pixel map sur la console Eos.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `pixmap_number` | number | Oui | Numero du pixel map (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_pixmap_select --args '{"pixmap_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/pixmap s:'{"pixmap_number":1}'
```

<a id="eos-preset-fire"></a>
## Declenchement de preset (`eos_preset_fire`)

**Description :** Declenche un preset sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `presets` |
| Synonymes | `preset`, `look`, `preset fire`, `preset select` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `preset_number` | number | Oui | Numero de preset (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_preset_fire --args '{"preset_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/preset/fire s:'{"preset_number":1}'
```

<a id="eos-preset-get-info"></a>
## Informations de preset (`eos_preset_get_info`)

**Description :** Recupere les informations detaillees pour un preset donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `presets` |
| Synonymes | `preset`, `look`, `preset fire`, `preset select` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `fields` | array<string> | Non | — |
| `preset_number` | number | Oui | Numero de preset (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_preset_get_info --args '{"preset_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/preset s:'{"preset_number":1}'
```

<a id="eos-preset-select"></a>
## Selection de preset (`eos_preset_select`)

**Description :** Selectionne un preset sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `presets` |
| Synonymes | `preset`, `look`, `preset fire`, `preset select` |
| Niveau de risque | `high` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `preset_number` | number | Oui | Numero de preset (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_preset_select --args '{"preset_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/preset s:'{"preset_number":1}'
```

<a id="eos-readiness-check"></a>
## Verification de readiness EOS (`eos_readiness_check`)

**Description :** Premiere etape obligatoire: controle read-only du transport OSC, du handshake et des lectures JSON EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `diagnostics` |
| Niveau de risque | `low` |
| Workflow préféré | `first_step` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `countTarget` | enum(cue, group, preset) | Non | — |
| `handshakeTimeoutMs` | number | Non | — |
| `patchChannel` | number | Non | — |
| `patchPart` | number | Non | — |
| `protocolTimeoutMs` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_readiness_check --args '{"timeoutMs":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-reset"></a>
## Reset OSC EOS (`eos_reset`)

**Description :** Envoie une commande de reset a la console EOS.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `full` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_reset --args '{"full":true}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-set-color-hs"></a>
## Couleur HS (`eos_set_color_hs`)

**Description :** Definit une couleur via Hue/Saturation.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `hue` | number \| string | Oui | — |
| `saturation` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_color_hs --args '{"hue":1,"saturation":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/param/color/hs s:'{"hue":1,"saturation":1}'
```

<a id="eos-set-color-rgb"></a>
## Couleur RGB (`eos_set_color_rgb`)

**Description :** Definit une couleur via valeurs RGB (0-1).

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `blue` | number \| string | Oui | — |
| `green` | number \| string | Oui | — |
| `red` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_color_rgb --args '{"red":1,"green":1,"blue":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/param/color/rgb s:'{"red":1,"green":1,"blue":1}'
```

<a id="eos-set-cue-receive-string"></a>
## Format de reception des cues (`eos_set_cue_receive_string`)

**Description :** Configure le format de reception OSC des cues (placeholders %1-%2).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `format_string` | string | Oui | Format de reception des cues (placeholders %1-%2 disponibles). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_cue_receive_string --args '{"format_string":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'{"format_string":"exemple"}'
```

<a id="eos-set-cue-send-string"></a>
## Format d'envoi des cues (`eos_set_cue_send_string`)

**Description :** Configure le format d'envoi OSC des cues (placeholders %1-%5).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `format_string` | string | Oui | Format d'envoi des cues (placeholders %1-%5 disponibles). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_cue_send_string --args '{"format_string":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'{"format_string":"exemple"}'
```

<a id="eos-set-dmx"></a>
## Reglage DMX (`eos_set_dmx`)

**Description :** Fixe une valeur DMX (0-255) sur une ou plusieurs adresses.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `addresses` | number \| array<number> \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `value` | number \| string | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_dmx --args '{"addresses":1,"value":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/addr/{address}/DMX s:'{"addresses":1,"value":1}'
```

<a id="eos-set-pantilt-xy"></a>
## Position Pan/Tilt XY (`eos_set_pantilt_xy`)

**Description :** Definit une position normalisee sur le plan XY (0-1).

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `x` | number \| string | Oui | — |
| `y` | number \| string | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_pantilt_xy --args '{"x":1,"y":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/param/position/xy s:'{"x":1,"y":1}'
```

<a id="eos-set-user-id"></a>
## Definir identifiant utilisateur EOS (`eos_set_user_id`)

**Description :** Definit l'identifiant utilisateur actif sur la console EOS via OSC.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user_id` | number | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_user_id --args '{"user_id":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/user i:1
```

<a id="eos-set-xyz-position"></a>
## Position XYZ (`eos_set_xyz_position`)

**Description :** Definit une position XYZ en metres.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `x` | number \| string | Oui | — |
| `y` | number \| string | Oui | — |
| `z` | number \| string | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_set_xyz_position --args '{"x":1,"y":1,"z":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/param/position/xyz s:'{"x":1,"y":1,"z":1}'
```

<a id="eos-showfile-get-patch"></a>
## Lire le patch du showfile importe (`eos_showfile_get_patch`)

**Description :** Retourne les entrees patch extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `low` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_get_patch --args '{"import_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-showfile-import"></a>
## Importer un showfile Eos .esf3d hors live (`eos_showfile_import`)

**Description :** Importe un .esf3d autorise comme archive ZIP dans un repertoire temporaire isole, extrait seulement les metadonnees XML utiles et marque la reponse source=showfile/live=false. Ce fallback exige une autorisation operateur explicite et ne remplace pas la lecture OSC live.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile fallback`, `offline showfile` |
| Niveau de risque | `medium` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `allowedRoot` | string | Non | Repertoire racine autorise pour localPath. |
| `localPath` | string | Non | Chemin local .esf3d a importer, obligatoirement inclus dans allowedRoot. |
| `maxArchiveBytes` | number | Non | Limite de taille de l archive .esf3d en octets. |
| `maxEntryBytes` | number | Non | Limite par fichier interne extrait en octets. |
| `maxUncompressedBytes` | number | Non | Limite totale de taille decompressee en octets. |
| `maxXmlFiles` | number | Non | Nombre maximal de fichiers XML internes analyses. |
| `operator_authorized` | boolean | Oui | Autorisation operateur explicite pour lire ce showfile hors console live. |
| `uploadBase64` | string | Non | Contenu .esf3d encode en base64 pour un upload controle. |
| `uploadFilename` | string | Non | Nom de fichier upload; doit finir par .esf3d. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_import --args '{"operator_authorized":true}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-showfile-list-cues"></a>
## Lister les cues du showfile importe (`eos_showfile_list_cues`)

**Description :** Retourne les cues extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `low` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_list_cues --args '{"import_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-showfile-list-fixtures"></a>
## Lister les fixtures du showfile importe (`eos_showfile_list_fixtures`)

**Description :** Retourne les fixtures extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `low` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_list_fixtures --args '{"import_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-showfile-list-groups"></a>
## Lister les groupes du showfile importe (`eos_showfile_list_groups`)

**Description :** Retourne les groupes extraits des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `low` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_list_groups --args '{"import_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-showfile-list-labels"></a>
## Lister les labels du showfile importe (`eos_showfile_list_labels`)

**Description :** Retourne les labels extraits des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `low` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_list_labels --args '{"import_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-showfile-list-palettes"></a>
## Lister les palettes du showfile importe (`eos_showfile_list_palettes`)

**Description :** Retourne les palettes extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `low` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_showfile_list_palettes --args '{"import_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-snapshot-get-info"></a>
## Lecture des informations de snapshot (`eos_snapshot_get_info`)

**Description :** Recupere les informations d'un snapshot, incluant label et UID.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `fields` | array<string> | Non | — |
| `snapshot_number` | number | Oui | Numero de snapshot (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_snapshot_get_info --args '{"snapshot_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/snapshot s:'{"snapshot_number":1}'
```

<a id="eos-snapshot-recall"></a>
## Rappel de snapshot (`eos_snapshot_recall`)

**Description :** Rappelle un snapshot en envoyant son numero a la console.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `snapshot_number` | number | Oui | Numero de snapshot (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_snapshot_recall --args '{"snapshot_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/snap s:'{"snapshot_number":1}'
```

<a id="eos-softkey-press"></a>
## Appui sur softkey (`eos_softkey_press`)

**Description :** Simule l'appui ou le relachement d'une softkey (1-12).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `keys` |
| Synonymes | `key`, `button`, `softkey`, `touche`, `facepanel` |
| Niveau de risque | `medium` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `softkey_number` | number | Oui | — |
| `state` | number \| boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_softkey_press --args '{"softkey_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/softkey/1 s:'{"softkey_number":1}'
```

<a id="eos-submaster-bump"></a>
## Commande de bump (`eos_submaster_bump`)

**Description :** Active ou desactive le bump d'un submaster.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `state` | number \| boolean \| string | Oui | — |
| `submaster_number` | number | Oui | Numero de submaster (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_submaster_bump --args '{"submaster_number":1,"state":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/sub/1/bump f 1
```

<a id="eos-submaster-get-info"></a>
## Informations sur un submaster (`eos_submaster_get_info`)

**Description :** Recupere et normalise les informations d'un submaster.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `submaster_number` | number | Oui | Numero de submaster (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_submaster_get_info --args '{"submaster_number":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/submaster s:'{"submaster_number":1}'
```

<a id="eos-submaster-set-level"></a>
## Reglage de submaster (`eos_submaster_set_level`)

**Description :** Ajuste le niveau d'un submaster sur une echelle de 0.0 a 1.0.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `level` | number \| string | Oui | — |
| `submaster_number` | number | Oui | Numero de submaster (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_submaster_set_level --args '{"submaster_number":1,"level":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/sub/1 f 1
```

<a id="eos-subscribe"></a>
## Souscription OSC EOS (`eos_subscribe`)

**Description :** Active ou desactive une souscription OSC sur la console EOS.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `enable` | boolean | Non | — |
| `path` | string | Oui | — |
| `rateHz` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_subscribe --args '{"path":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-switch-continuous"></a>
## Mouvement continu (`eos_switch_continuous`)

**Description :** Active un mouvement continu d'encodeur sur un parametre.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `parameter_name` | string | Oui | — |
| `rate` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_switch_continuous --args '{"parameter_name":"exemple","rate":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/param/wheel/rate s:'{"parameter_name":"exemple","rate":1}'
```

<a id="eos-toggle-staging-mode"></a>
## Toggle Staging Mode (`eos_toggle_staging_mode`)

**Description :** Active ou desactive le mode Staging de la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `critical` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_toggle_staging_mode --args '{"targetAddress":"exemple"}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/newcmd s:'{"targetAddress":"exemple"}'
```

<a id="eos-wheel-tick"></a>
## Rotation d'encodeur (`eos_wheel_tick`)

**Description :** Simule une rotation d'encodeur pour un parametre donne.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `mode` | enum(coarse, fine) | Non | — |
| `parameter_name` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `ticks` | number \| string | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_wheel_tick --args '{"parameter_name":"exemple","ticks":1}'
```

_OSC_

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/param/wheel/tick s:'{"parameter_name":"exemple","ticks":1}'
```

<a id="eos-workflow-autopatch-band"></a>
## Patch complet du groupe sur scene (`eos_workflow_autopatch_band`)

**Description :** Point d entree naturel pour patcher tout un patch band: blocs de fixtures, adresses DMX, labels et option face trad en une seule sequence.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `face_trad_count` | number | Non | — |
| `face_trad_label_prefix` | string | Non | — |
| `face_trad_start_address` | number | Non | — |
| `face_trad_universe` | number | Non | — |
| `fixtures` | array<object> | Oui | — |
| `include_face_trad` | boolean | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_autopatch_band --args '{"fixtures":[{"count":1,"universe":1,"start_address":1,"label_prefix":"exemple"}]}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-build-groups-and-palettes"></a>
## Construire groupes et palettes (`eos_workflow_build_groups_and_palettes`)

**Description :** Point d entree naturel pour preparer un show: enregistrer des groupes de canaux puis creer et nommer les color palettes et focus palettes associees.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `color_palettes` | array<object> | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `focus_palettes` | array<object> | Non | — |
| `groups` | array<object> | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_build_groups_and_palettes --args '{"groups":[{"number":1,"label":"exemple","channels":"exemple"}]}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-create-cue-series"></a>
## Programmer une suite de cues reggae (`eos_workflow_create_cue_series`)

**Description :** Point d entree naturel pour generer plusieurs cues musicales ou reggae: looks successifs, palettes couleur/focus/beam et numerotation automatique.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `base_cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `looks` | array<object> | Oui | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `start_cue_number` | string \| number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_create_cue_series --args '{"looks":[{"channels":"exemple"}]}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-create-effect"></a>
## Creer un effet fly-out (`eos_workflow_create_effect`)

**Description :** Point d entree naturel pour creer un fly-out ou effet de mouvement: assignation aux canaux, groupe optionnel, direction center-out/left-right, speed et size.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | string | Oui | — |
| `direction` | enum(left_to_right, right_to_left, center_out) | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `effect_number` | number | Oui | — |
| `group_number` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `size` | number | Non | — |
| `speed` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_create_effect --args '{"channels":"exemple","effect_number":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-create-look"></a>
## Workflow creation de look (`eos_workflow_create_look`)

**Description :** Selectionne des canaux, applique des palettes CP/FP/BP puis enregistre une cue.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `beam_palette` | number | Non | — |
| `channels` | string | Oui | — |
| `color_palette` | number | Non | — |
| `cue_label` | string | Non | — |
| `cue_number` | string \| number | Oui | — |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `focus_palette` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_create_look --args '{"channels":"exemple","cue_number":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-patch-fixture"></a>
## Workflow patch fixture (`eos_workflow_patch_fixture`)

**Description :** Patch un canal, applique un label et une position 3D de base.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | — |
| `device_type` | string | Non | — |
| `dmx_address` | string | Oui | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `fixture_manufacturer` | string | Non | — |
| `fixture_mode` | string | Non | — |
| `fixture_model` | string | Non | — |
| `fixture_name` | string | Non | — |
| `fixture_query` | string | Non | — |
| `label` | string | Oui | — |
| `part` | number | Non | — |
| `position_x` | number | Non | — |
| `position_y` | number | Non | — |
| `position_z` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_patch_fixture --args '{"channel_number":1,"dmx_address":"exemple","label":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-patch-scan"></a>
## Scanner le patch de plusieurs canaux (`eos_workflow_patch_scan`)

**Description :** Lit les informations de patch canal par canal avec concurrence basse, pause entre requetes et arret de securite sur taux d echec configurable.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | array<number> | Non | — |
| `continue_on_error` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `end_channel` | number | Non | — |
| `failure_rate_threshold` | number | Non | — |
| `max_concurrency` | number | Non | — |
| `part_mode` | enum(all, part_1) | Non | — |
| `rate_limit_ms` | number | Non | — |
| `start_channel` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_patch_scan --args '{"start_channel":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-rehearsal-go-safe"></a>
## Workflow rehearsal go safe (`eos_workflow_rehearsal_go_safe`)

**Description :** Verifie la ligne de commande, envoie GO puis rollback optionnel en cas d echec.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `allow_non_empty_command_line` | boolean | Non | — |
| `cue_number` | string \| number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `precheck_timeout_ms` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `rollback_cue_number` | string \| number | Non | — |
| `rollback_cuelist_number` | number | Non | — |
| `rollback_on_failure` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_rehearsal_go_safe --args '{"cuelist_number":1}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="eos-workflow-update-cue-look"></a>
## Mettre a jour le look d une cue (`eos_workflow_update_cue_look`)

**Description :** Point d entree naturel pour modifier une cue existante ou courante: aller a la cue, selectionner les canaux, ajuster l intensite puis lancer Update.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | string | Oui | — |
| `cue_number` | string \| number | Non | — |
| `cuelist_number` | number | Non | — |
| `desaturate` | boolean | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `intensity_factor` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |
| `warmify` | boolean | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_update_cue_look --args '{"channels":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="ping"></a>
## Ping tool (`ping`)

**Description :** Retourne un message de confirmation.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `message` | string | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool ping --args '{"message":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="session-clear-context"></a>
## Effacer contexte courant (`session_clear_context`)

**Description :** Supprime le contexte courant memorise localement.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `agent_id` | string | Non | — |
| `context_id` | string | Non | — |
| `mcp_session_id` | string | Non | — |
| `user_id` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_clear_context --args '{"context_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="session-get-context"></a>
## Contexte courant (`session_get_context`)

**Description :** Renvoie le contexte courant memorise localement.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `agent_id` | string | Non | — |
| `context_id` | string | Non | — |
| `mcp_session_id` | string | Non | — |
| `user_id` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_get_context --args '{"context_id":"exemple"}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="session-get-current-user"></a>
## Utilisateur courant (`session_get_current_user`)

**Description :** Renvoie le numero utilisateur EOS memorise localement.

**Arguments :** Aucun argument.

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_get_current_user --args '{}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="session-set-context"></a>
## Definir contexte courant (`session_set_context`)

**Description :** Stocke le contexte courant (show, cuelist active, selections canaux/groupes, palettes recentes) avec un TTL configurable.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `agent_id` | string | Non | — |
| `context` | object | Oui | — |
| `context_id` | string | Non | — |
| `mcp_session_id` | string | Non | — |
| `ttl_ms` | number | Non | — |
| `user_id` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_set_context --args '{"context":{"show":"exemple"}}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="session-set-current-user"></a>
## Definir utilisateur courant (`session_set_current_user`)

**Description :** Stocke en local le numero utilisateur EOS a utiliser par defaut.

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `user` | number | Oui | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_set_current_user --args '{"user":1}'
```

_OSC_

_Pas de mapping OSC documenté._
