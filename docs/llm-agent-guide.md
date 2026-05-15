# Guide agent LLM pour Eos MCP

Ce guide décrit le comportement attendu d'un assistant LLM qui pilote une console ETC Eos via Eos MCP. Il complète le [cookbook](cookbook.md) et la [référence des outils](tools.md) avec des règles opérationnelles, des exemples complets et une grille de choix d'outils.

## Règles générales obligatoires

1. **Toujours commencer par `eos_readiness_check`.**
   - C'est la première étape obligatoire de toute session LLM, avant `eos_capabilities_get`, les lectures métier, les dry-runs et toute action réelle.
   - Lire `structuredContent.overall_status`, `transport_status`, `handshake_mode`, `json_read_supported`, `failed_checks` et `operator_actions`.
   - Ne poursuivre que si `overall_status=ok` ou si l'opérateur accepte explicitement les limitations signalées. Si `json_read_supported=false`, ne jamais inventer le patch, la cuelist, les cues ou l'état du show : les présenter comme inconnus et demander une reconfiguration OSC, une lecture réussie ou une source showfile explicite.
   - Fournir `patchChannel` uniquement lorsqu'un canal connu doit valider aussi la lecture patch; sinon cette sous-vérification optionnelle reste `skipped`.
2. **Enchaîner avec `eos_capabilities_get` pour le contexte métier.**
   - Lire `structuredContent.context` avant de proposer une action métier.
   - Vérifier l'état OSC, l'utilisateur Eos, le mode Live/Blind, les limitations de lecture et les garde-fous de sécurité disponibles.
   - En mode legacy/non confirmé, les outils de lecture peuvent retourner `unsupported_transport_mode` ou `read_capability_unconfirmed` au lieu d'attendre un timeout. Dans ce cas, demander explicitement une reconfiguration OSC qui confirme les requêtes JSON, ou une source showfile fournie par l'opérateur; ne pas reconstruire ou deviner le patch depuis des suppositions.
3. **Privilégier les workflows `eos_workflow_*`.**
   - Utiliser un workflow haut niveau dès qu'il existe pour l'intention utilisateur : cue series, update cue, look, patch fixture, autopatch, rehearsal GO, groupes/palettes, effet.
   - Réserver les outils bas niveau (`eos_cue_*`, `eos_patch_*`, `eos_command`, `eos_new_command`, `*_fire`) aux cas où aucun workflow ne couvre l'action ou lorsque l'intégration sait exactement quelle commande Eos envoyer.
4. **Utiliser `dry_run=true` avant toute action sensible.**
   - Sont sensibles : modification de show, patch, record/update/label, commande texte, action live visible, rappel de cue/palette/preset, GO, macro, show control.
   - Lire `structuredContent.commands_preview` à l'utilisateur et attendre une confirmation explicite.
   - Relancer ensuite le même outil avec les mêmes arguments métier, `dry_run=false` ou sans `dry_run`, et `require_confirmation=true` si l'outil l'expose.
5. **Ne pas concaténer des commandes de programmation complexes dans une seule chaîne libre.**
   - Pour une série de cues, utiliser `eos_workflow_create_cue_series` plutôt qu'une commande texte qui mélange `At`, `Record`, `Label` et d'autres actions.
   - Si `eos_new_command` est nécessaire, utiliser `clearLine=true`, `terminateWithEnter=true`, `dry_run=true`, puis confirmation.
6. **Restituer le plan avant l'appel.**
   - Annoncer la cible, les canaux, les numéros de cues/palettes/fixtures, les valeurs d'intensité ou DMX, et le rollback prévu.
   - Ne jamais envoyer une action réelle si l'utilisateur valide seulement une intention vague (« fais-le » après plusieurs propositions ambiguës, par exemple).

## Convention de lecture des résultats d'outils

Les familles prioritaires `cues`, `commands`, `patch`, `dmx`, `macros`, `pixelMaps` et `showControl` retournent une enveloppe commune générée par `buildToolResult` ou un helper équivalent. Pour un agent LLM, la lecture recommandée est :

1. Lire `content[0].text` pour restituer un résumé court à l'opérateur.
2. Lire `structuredContent.status` pour décider si l'action est réussie (`ok`), simulée (`dry_run`), partiellement vérifiée (`partial_failure`) ou en erreur.
3. Relire `structuredContent.summary` quand le client MCP affiche seulement les données structurées.
4. Distinguer `structuredContent.commandsSent` (commandes effectivement envoyées) de `structuredContent.commands_preview` (commandes simulées ou à confirmer).
5. Toujours afficher ou résoudre `structuredContent.warnings` avant de poursuivre une action sensible.
6. Suivre `structuredContent.next_actions` lorsqu'il propose une vérification, une confirmation ou une relance ciblée.

Ces champs sont toujours présents sous forme de tableaux pour `commandsSent`, `commands_preview`, `warnings` et `next_actions`, même lorsqu'ils sont vides. Les autres champs métier (`cue`, `channel`, `macro`, `osc`, etc.) restent disponibles pour les détails techniques.

## Exemples complets

Les exemples ci-dessous suivent le même cycle : readiness obligatoire, audit des capacités, dry-run, lecture de la preview, puis exécution réelle uniquement après confirmation explicite.

### 1. Programmer une cue

**Intention utilisateur :** « Programme trois cues reggae sur la liste 3 : intro ambre, couplet bleu, refrain blanc full. »

**Étape A — readiness obligatoire**

```json
{
  "type": "call_tool",
  "tool": "eos_readiness_check",
  "arguments": {}
}
```

**Étape B — audit des capacités**

```json
{
  "type": "call_tool",
  "tool": "eos_capabilities_get",
  "arguments": {}
}
```

**Étape C — dry-run du workflow recommandé**

```json
{
  "type": "call_tool",
  "tool": "eos_workflow_create_cue_series",
  "arguments": {
    "base_cuelist_number": 3,
    "start_cue_number": 1,
    "dry_run": true,
    "looks": [
      {
        "cue_label": "Intro ambre",
        "channels": "1 Thru 12",
        "intensity": 45,
        "color_palette": 21
      },
      {
        "cue_label": "Couplet bleu",
        "channels": "1 Thru 12",
        "intensity": 60,
        "color_palette": 22
      },
      {
        "cue_label": "Refrain blanc full",
        "channels": "1 Thru 24",
        "intensity": "Full",
        "color_palette": 1
      }
    ]
  }
}
```

**À lire à l'opérateur avant exécution :**

- `structuredContent.commands_preview` : vérifier les commandes `Chan ... At ...`, `Record Cue 3 / ...`, labels et palettes.
- `structuredContent.applied_defaults` : signaler les valeurs par défaut appliquées.
- `structuredContent.warnings` : résoudre tout avertissement avant de poursuivre.

**Étape D — exécution après confirmation explicite**

```json
{
  "type": "call_tool",
  "tool": "eos_workflow_create_cue_series",
  "arguments": {
    "base_cuelist_number": 3,
    "start_cue_number": 1,
    "require_confirmation": true,
    "looks": [
      {
        "cue_label": "Intro ambre",
        "channels": "1 Thru 12",
        "intensity": 45,
        "color_palette": 21
      },
      {
        "cue_label": "Couplet bleu",
        "channels": "1 Thru 12",
        "intensity": 60,
        "color_palette": 22
      },
      {
        "cue_label": "Refrain blanc full",
        "channels": "1 Thru 24",
        "intensity": "Full",
        "color_palette": 1
      }
    ]
  }
}
```

### 2. Lancer un GO sécurisé

**Intention utilisateur :** « Top GO sur la liste 1, avec rattrapage si problème. »

**Étape A — readiness obligatoire**

```json
{
  "type": "call_tool",
  "tool": "eos_readiness_check",
  "arguments": {}
}
```

**Étape B — audit des capacités**

```json
{
  "type": "call_tool",
  "tool": "eos_capabilities_get",
  "arguments": {}
}
```

**Étape C — lecture de contexte utile**

```json
{
  "type": "call_tool",
  "tool": "eos_get_command_line",
  "arguments": {}
}
```

```json
{
  "type": "call_tool",
  "tool": "eos_get_pending_cue",
  "arguments": {}
}
```

**Étape D — dry-run du GO sécurisé**

```json
{
  "type": "call_tool",
  "tool": "eos_workflow_rehearsal_go_safe",
  "arguments": {
    "cuelist_number": 1,
    "cue_number": 12,
    "rollback_on_failure": true,
    "rollback_cuelist_number": 1,
    "rollback_cue_number": 11,
    "allow_non_empty_command_line": false,
    "dry_run": true
  }
}
```

**Étape E — exécution après confirmation de régie**

```json
{
  "type": "call_tool",
  "tool": "eos_workflow_rehearsal_go_safe",
  "arguments": {
    "cuelist_number": 1,
    "cue_number": 12,
    "rollback_on_failure": true,
    "rollback_cuelist_number": 1,
    "rollback_cue_number": 11,
    "allow_non_empty_command_line": false,
    "require_confirmation": true
  }
}
```

**Rattrapage manuel si l'opérateur signale un incident après le GO :**

```json
{
  "type": "call_tool",
  "tool": "eos_cue_stop_back",
  "arguments": {
    "cuelist_number": 1,
    "back": true,
    "require_confirmation": true,
    "safety_level": "strict"
  }
}
```

### 3. Patcher une fixture

**Intention utilisateur :** « Patche le canal 305 en Lustr3 à l'adresse 2/145, label Face Jardin. »

**Étape A — readiness obligatoire**

```json
{
  "type": "call_tool",
  "tool": "eos_readiness_check",
  "arguments": {}
}
```

**Étape B — audit des capacités**

```json
{
  "type": "call_tool",
  "tool": "eos_capabilities_get",
  "arguments": {}
}
```

**Étape C — lire l'état actuel pour éviter d'écraser un patch critique**

```json
{
  "type": "call_tool",
  "tool": "eos_patch_get_channel_info",
  "arguments": {
    "channel_number": 305
  }
}
```

**Étape D — dry-run du patch fixture**

```json
{
  "type": "call_tool",
  "tool": "eos_workflow_patch_fixture",
  "arguments": {
    "channel_number": 305,
    "dmx_address": "2/145",
    "device_type": "Lustr3",
    "label": "Face Jardin",
    "part": 1,
    "position_x": -3.5,
    "position_y": 6,
    "position_z": 4.2,
    "dry_run": true
  }
}
```

**Étape E — exécution après validation du patch précédent et de la preview**

```json
{
  "type": "call_tool",
  "tool": "eos_workflow_patch_fixture",
  "arguments": {
    "channel_number": 305,
    "dmx_address": "2/145",
    "device_type": "Lustr3",
    "label": "Face Jardin",
    "part": 1,
    "position_x": -3.5,
    "position_y": 6,
    "position_z": 4.2,
    "require_confirmation": true
  }
}
```

**Étape F — vérification post-patch**

```json
{
  "type": "call_tool",
  "tool": "eos_patch_get_channel_info",
  "arguments": {
    "channel_number": 305
  }
}
```

### 4. Sauvegarder ou vérifier un show

**Intention utilisateur :** « Vérifie le show chargé puis sauvegarde si tout est bon. »

**Étape A — readiness obligatoire**

```json
{
  "type": "call_tool",
  "tool": "eos_readiness_check",
  "arguments": {}
}
```

**Étape B — audit des capacités**

```json
{
  "type": "call_tool",
  "tool": "eos_capabilities_get",
  "arguments": {}
}
```

**Étape C — vérifications non destructives**

```json
{
  "type": "call_tool",
  "tool": "eos_get_show_name",
  "arguments": {}
}
```

```json
{
  "type": "call_tool",
  "tool": "eos_get_version",
  "arguments": {}
}
```

```json
{
  "type": "call_tool",
  "tool": "eos_get_live_blind_state",
  "arguments": {}
}
```

**Étape D — dry-run de la sauvegarde par commande texte, seulement si aucun outil dédié n'est disponible**

```json
{
  "type": "call_tool",
  "tool": "eos_new_command",
  "arguments": {
    "command": "Save Show",
    "clearLine": true,
    "terminateWithEnter": true,
    "dry_run": true,
    "safety_level": "strict"
  }
}
```

**Étape E — exécution après confirmation explicite de l'opérateur**

```json
{
  "type": "call_tool",
  "tool": "eos_new_command",
  "arguments": {
    "command": "Save Show",
    "clearLine": true,
    "terminateWithEnter": true,
    "require_confirmation": true,
    "safety_level": "strict",
    "verify_after_send": true,
    "verification_timeout_ms": 2000
  }
}
```

**À annoncer :** une sauvegarde peut modifier le fichier show courant. Si l'utilisateur voulait seulement vérifier, s'arrêter après les lectures non destructives.

### 5. Lire des infos de patch et DMX

**Intention utilisateur :** « Dis-moi où est patché le canal 42 et vérifie l'adresse DMX 1/42. »

**Étape A — readiness obligatoire**

```json
{
  "type": "call_tool",
  "tool": "eos_readiness_check",
  "arguments": {}
}
```

**Étape B — audit des capacités**

```json
{
  "type": "call_tool",
  "tool": "eos_capabilities_get",
  "arguments": {}
}
```

**Étape C — lire le patch du canal**

```json
{
  "type": "call_tool",
  "tool": "eos_patch_get_channel_info",
  "arguments": {
    "channel_number": 42
  }
}
```

**Étape D — lire les informations de canal utiles au diagnostic**

```json
{
  "type": "call_tool",
  "tool": "eos_channel_get_info",
  "arguments": {
    "channels": [42]
  }
}
```

**Étape E — sélectionner ou tester une adresse DMX sans changer le show**

```json
{
  "type": "call_tool",
  "tool": "eos_address_select",
  "arguments": {
    "address_number": "1/42"
  }
}
```

**Action DMX brute uniquement sur demande explicite :** les outils DMX directs règlent immédiatement une valeur. Pour respecter le pattern dry-run/confirmation, prévisualiser d'abord la commande via `eos_new_command`.

```json
{
  "type": "call_tool",
  "tool": "eos_new_command",
  "arguments": {
    "command": "Address 1/42 At 128",
    "clearLine": true,
    "terminateWithEnter": true,
    "dry_run": true,
    "safety_level": "strict"
  }
}
```

Après confirmation :

```json
{
  "type": "call_tool",
  "tool": "eos_new_command",
  "arguments": {
    "command": "Address 1/42 At 128",
    "clearLine": true,
    "terminateWithEnter": true,
    "require_confirmation": true,
    "safety_level": "strict"
  }
}
```

## Intention utilisateur → outil recommandé

| Famille | Intention utilisateur | Outil recommandé | Notes de sécurité |
| --- | --- | --- | --- |
| Cues | Créer une suite de cues | `eos_workflow_create_cue_series` | Toujours `dry_run=true`, puis confirmation. |
| Cues | Modifier le look d'une cue existante | `eos_workflow_update_cue_look` | Vérifier la cue avec `eos_cue_get_info` si la lecture est disponible. |
| Cues | Déclencher un GO en répétition | `eos_workflow_rehearsal_go_safe` | Préférer ce workflow à `eos_cue_go`; prévoir rollback. |
| Cues | Lister ou inspecter les cues | `eos_cue_list_all`, `eos_cue_get_info`, `eos_get_pending_cue`, `eos_get_active_cue` | Lecture non destructive, mais respecter les limitations OSC. |
| Patch | Patcher une fixture isolée | `eos_workflow_patch_fixture` | Lire `eos_patch_get_channel_info` avant, `dry_run=true`, puis confirmation. |
| Patch | Patcher un groupe ou un band | `eos_workflow_autopatch_band` | Valider les blocs, adresses DMX et labels avant exécution. |
| Patch | Lire patch/Augment3d | `eos_patch_get_channel_info`, `eos_patch_get_augment3d_position`, `eos_patch_get_augment3d_beam` | Ne pas inventer les valeurs si la console ne répond pas. |
| Palettes | Créer groupes et palettes de préparation | `eos_workflow_build_groups_and_palettes` | Workflow recommandé pour préparation de show. |
| Palettes | Enregistrer ou labelliser une palette ponctuelle | `eos_palette_record`, `eos_palette_label_set` | Bas niveau sensible : dry-run si disponible et confirmation. |
| Palettes | Rappeler une palette | `eos_color_palette_fire`, `eos_focus_palette_fire`, `eos_beam_palette_fire`, `eos_intensity_palette_fire` | Action visible en live : confirmation opérateur. |
| Macros | Inspecter une macro | `eos_macro_get_info` | Lecture non destructive. |
| Macros | Déclencher une macro | `eos_macro_fire` | Action potentiellement large : confirmation stricte. |
| Macros | Préparer la sélection d'une macro | `eos_macro_select` | Vérifier la ligne de commande avant envoi. |
| Pixel maps | Lire une pixel map | `eos_pixmap_get_info` | Lecture non destructive. |
| Pixel maps | Sélectionner une pixel map | `eos_pixmap_select` | Peut affecter le contexte opérateur : annoncer l'action. |
| DMX | Lire/diagnostiquer une adresse | `eos_address_select`, `eos_channel_get_info`, `eos_patch_get_channel_info` | Préférer la lecture au réglage brut. |
| DMX | Régler une valeur DMX brute | `eos_new_command` pour prévisualiser, puis outil DMX dédié (`eos_address_set_dmx`, `eos_set_dmx`, `eos_channel_set_dmx`) seulement dans une intégration contrôlée | Action sensible : dry-run/confirmation via commande texte ou confirmation stricte si outil direct sans dry-run. |
| Show control | Vérifier show, version, Live/Blind | `eos_get_show_name`, `eos_get_version`, `eos_get_live_blind_state` | Lecture utile avant sauvegarde ou conduite. |
| Show control | Sauvegarder ou envoyer une commande show | `eos_new_command` | Uniquement si aucun outil dédié ; `dry_run=true`, `clearLine=true`, `terminateWithEnter=true`. |
| Show control | Configurer les chaînes cue send/receive | `eos_set_cue_send_string`, `eos_set_cue_receive_string` | Configuration sensible : confirmation stricte. |
| Session | Auditer capacités et sécurité | `eos_capabilities_get` | Premier appel obligatoire. |
| Session | Connexion, ping, diagnostics | `eos_connect`, `eos_ping`, `eos_get_diagnostics` | À utiliser pour diagnostiquer avant action métier. |
| Session | Changer utilisateur ou config OSC | `eos_set_user_id`, `eos_configure`, `eos_reset` | Peut changer le contexte global : confirmation et journalisation. |

## Comment lire les réponses

Les outils MCP renvoient généralement un résumé texte et des données structurées. L'agent doit privilégier les champs structurés lorsqu'ils existent.

### `content`

- Contient le message textuel destiné à l'humain ou au client MCP.
- Utile pour résumer rapidement l'action ou l'erreur.
- Ne suffit pas pour valider une action sensible : toujours inspecter `structuredContent` quand il est présent.

### `structuredContent`

- Source principale pour le raisonnement de l'agent.
- Peut contenir `context`, `steps`, `applied_defaults`, `command_log`, données métier lues depuis Eos, et champs de sécurité.
- Pour `eos_capabilities_get`, lire notamment `structuredContent.context`, `structuredContent.context.osc_limitations.canReadJsonQueries`, `read_json_queries_status` et les limitations OSC avant d'inférer l'état du show.

### `commands_preview`

- Liste des commandes Eos qui seraient envoyées lors d'un `dry_run=true` ou lors d'un refus faute de confirmation.
- À relire explicitement à l'utilisateur avant toute exécution réelle.
- Si la preview ne correspond pas à l'intention, ne pas exécuter : corriger les arguments et refaire un dry-run.

### `commandsSent`

- Liste des commandes réellement envoyées à Eos.
- En dry-run, ce champ doit rester vide ou indiquer qu'aucune commande n'a été envoyée.
- Après exécution, comparer avec la preview validée et signaler toute divergence.

### `warnings`

- Avertissements non bloquants, defaults appliqués, lecture partielle, limitations OSC ou incohérences détectées.
- Ne pas les ignorer : les résumer à l'utilisateur si l'action concerne le show ou la scène live.
- Si un warning remet en cause la sécurité ou la cible, arrêter et demander clarification.

### `error`

- Indique que l'appel n'a pas abouti ou que l'outil a refusé l'action.
- Ne jamais « compenser » par une commande plus dangereuse sans expliquer l'échec et demander confirmation.
- Si l'erreur vient de l'absence de `require_confirmation=true`, c'est normal avant validation : lire `commands_preview`, demander confirmation, puis relancer avec les mêmes arguments métier.

## Checklist agent avant réponse finale

- [ ] `eos_capabilities_get` a été appelé au début de la session d'action.
- [ ] Un workflow `eos_workflow_*` a été privilégié lorsqu'il existe.
- [ ] Toute action sensible a été prévisualisée avec `dry_run=true`.
- [ ] La preview a été lue et confirmée explicitement par l'opérateur.
- [ ] L'appel réel utilise les mêmes arguments métier et `require_confirmation=true` si disponible.
- [ ] Les champs `commandsSent`, `warnings` et `error` ont été inspectés avant de déclarer le succès.
