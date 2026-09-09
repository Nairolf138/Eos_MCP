# Documentation des outils

> Générée avec `npm run docs:generate -- --skip-jsdoc`. Ne pas modifier manuellement.

Le catalogue décrit les arguments métier et les métadonnées des outils exportés. Pour les schémas complets, y compris objets imbriqués et contrôles ajoutés à l’exécution, utiliser MCP `tools/list` ou `/schemas/tools/{toolName}.json`. Le [cookbook](cookbook.md) donne des appels MCP concrets ; le [guide agent](llm-agent-guide.md) précise la démarche de préparation.

## Appels et résultats

Les appels MCP utilisent la méthode `tools/call`, avec `params.name` et `params.arguments`. Le serveur traduit ces arguments en messages OSC natifs typés ETC. Le JSON MCP ne doit jamais être envoyé comme chaîne OSC à une adresse Get ou de contrôle.

- `content[0].text` et `structuredContent.summary` décrivent le résultat ; consulter aussi `isError`, `status`, `warnings` et `next_actions`.
- `commandsSent` contient les commandes texte envoyées, pas l’ensemble des messages OSC. `commands_preview` et `osc_preview` décrivent les simulations quand disponibles.
- `sent_to_transport` signifie envoyé ; `accepted_by_eos` signifie retour corrélé de la ligne de commande ; `verified` ne vaut vrai que pour l’état effectivement relu. Ces preuves ne sont pas interchangeables.
- `source`, `is_complete`, `observed_at`, `limitations` et les champs de vérification indiquent les limites des lectures. Une réponse absente ou incomplète n’est pas un objet vide valide.

## Contrôles communs

Le registre ajoute `targetConsole` (alias déclaré dans `EOS_CONSOLES`) et les contrôles applicables à l’outil. `dry_run: true` empêche l’envoi et les mutations locales du handler. Les simulations ne vérifient pas l’état de la console. Une exécution sensible exige `require_confirmation: true` et les droits de programmation configurés côté serveur ; la confirmation ne relève pas le rôle autorisé.

Établir la cible, le plan et l’accord de l’opérateur pour le périmètre demandé, puis contrôler la prévisualisation avant l’exécution. Ne pas redemander un accord déjà donné pour ce même périmètre. Les écritures modifiant la sortie doivent être annoncées comme telles. Les arguments inconnus sont rejetés, y compris dans les workflows.

Les workflows de cues exigent la liste explicitement ; les palettes exigent des valeurs ou `use_current_values: true` ; le patch exige le profil exact, son empreinte DMX et un utilisateur explicite pour les écritures. Aucune inférence de footprint, position 3D ou intention artistique ne remplace ces données.

## Références OSC

La [matrice OSC](osc-coverage.md) expose les chemins et les unités natifs. Les lectures Get attendent `/eos/out/get/...`, avec des arguments typés et des fragments réassemblés. Les lignes de commande, roues et softkeys sont des observations passives datées. Les [limites](native-osc-limitations.md) distinguent les capacités disponibles des opérations retirées. Les tests simulés ne certifient pas une console réelle.

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

Catégories documentées : `commands`, `cues`, `diagnostics`, `dmx`, `keys`, `macros`, `palettes`, `patch`, `presets`, `showControl`, `showfile`, `submasters`.

<a id="eos-address-select"></a>
## Selection d'adresse DMX (`eos_address_select`)

**Description :** Selectionne une adresse DMX specifique sur la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `dmx` |
| Synonymes | `dmx`, `address`, `adresse`, `level`, `sortie directe` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `address_number` | number \| string | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/addr`.

<a id="eos-address-set-dmx"></a>
## Reglage DMX brut (`eos_address_set_dmx`)

**Description :** Fixe une valeur DMX brute (0-255) pour une adresse DMX.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `dmx` |
| Synonymes | `dmx`, `address`, `adresse`, `level`, `sortie directe` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `address_number` | number \| string | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `confirm` | boolean | Non | — |
| `dmx_value` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/addr/{address}/DMX`.

<a id="eos-address-set-level"></a>
## Reglage de niveau d'adresse DMX (`eos_address_set_level`)

**Description :** Ajuste le niveau (0-100) pour une adresse DMX donnee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `dmx` |
| Synonymes | `dmx`, `address`, `adresse`, `level`, `sortie directe` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `address_number` | number \| string | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `level` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/addr/{address}`.

<a id="eos-beam-palette-fire"></a>
## Declenchement de palette de beam (`eos_beam_palette_fire`)

**Description :** Declenche une palette de beam sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/bp/fire`.

<a id="eos-capabilities-get"></a>
## Capacites serveur EOS MCP (`eos_capabilities_get`)

**Description :** Retourne les fonctionnalites disponibles par famille, le contexte de session/connexion et la version serveur.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :** Aucun argument.

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Contexte local et capacités observées ; voir eos_connect.

<a id="eos-channel-get-info"></a>
## Informations de canaux (`eos_channel_get_info`)

**Description :** Recupere des informations sur les canaux depuis la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `fields` | array<string> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/patch/{channel}/{part}`.

<a id="eos-channel-select"></a>
## Selection de canaux (`eos_channel_select`)

**Description :** Selectionne un ou plusieurs canaux sur la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `exclusive` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-channel-set-dmx"></a>
## Reglage DMX des canaux (`eos_channel_set_dmx`)

**Description :** Ajuste la valeur DMX brute (0-255) pour des canaux specifiques.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `value` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-channel-set-level"></a>
## Reglage de niveau (`eos_channel_set_level`)

**Description :** Ajuste le niveau intensite de canaux specifiques (0-100).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `level` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |
| `snap` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-channel-set-parameter"></a>
## Reglage de parametre (`eos_channel_set_parameter`)

**Description :** Regle un parametre dans ses unites natives Eos (Pan/Tilt en degres signes, intensite en pourcent). Verifier les limites du profil.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | number \| array<number> \| string | Oui | Un numero de canal ou une liste de canaux |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `parameter` | string | Oui | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `value` | number \| string | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/chan/{channel}/param/{parameter}`.

<a id="eos-color-palette-fire"></a>
## Declenchement de palette de couleur (`eos_color_palette_fire`)

**Description :** Declenche une palette de couleur sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cp/fire`.

<a id="eos-command"></a>
## Commande EOS (`eos_command`)

**Description :** Envoie du texte sur la ligne de commande existante de la console. A n'utiliser que lorsqu'aucun outil dedie n'existe. Pour programmer des cues, preferer eos_new_command avec clearLine=true et terminateWithEnter=true.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `dangerous` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `command` | string | Oui | — |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `terminateWithEnter` | boolean | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cmd`.

<a id="eos-command-with-substitution"></a>
## Commande avec substitution (`eos_command_with_substitution`)

**Description :** Applique des substitutions %1, %2, ... puis envoie la commande.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `dangerous` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cmd`.

<a id="eos-configure"></a>
## Reconfiguration OSC EOS (`eos_configure`)

**Description :** Met a jour la configuration reseau OSC (ports, adresse) et recree le client partage.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `localPort` | number | Oui | — |
| `remoteAddress` | string | Oui | — |
| `remotePort` | number | Oui | — |
| `tcpPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-connect"></a>
## Connexion OSC EOS (`eos_connect`)

**Description :** Initie un handshake OSC avec la console EOS, choisit un protocole et retourne la version detectee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/version` (connexion locale et lecture native).

<a id="eos-console-targets"></a>
## Diagnostics des consoles cible (`eos_console_targets`)

**Description :** Liste les cibles EOS configurees via EOS_CONSOLES et indique leur etat par rapport a la connexion OSC courante.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :** Aucun argument.

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-cue-fire"></a>
## Declenchement de cue (`eos_cue_fire`)

**Description :** Declenche immediatement une cue specifique dans une liste donnee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cue_number` | number \| string | Oui | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cue/{cuelist}/{cue}/fire`.

<a id="eos-cue-get-info"></a>
## Informations de cue (`eos_cue_get_info`)

**Description :** Recupere les informations detaillees d'une cue (timings, flags, notes...).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cue_number` | number \| string | Oui | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `fields` | array<string> | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/cue/{cuelist}/{cue}/{part}`.

<a id="eos-cue-go"></a>
## GO sur liste de cues (`eos_cue_go`)

**Description :** Declenche un GO sur la liste de cues cible, optionnellement vers une cue precise.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cue_number` | number \| string | Non | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cues/{cuelist}/fire`.

<a id="eos-cue-label-set"></a>
## Label cue (`eos_cue_label_set`)

**Description :** Applique un label a une cue via une commande EOS deterministe.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Oui | Liste explicite requise pour adresser le label sans modifier la selection courante. |
| `label` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/set/cue/{cuelist}/{number}/label`.

<a id="eos-cue-list-all"></a>
## Liste des cues (`eos_cue_list_all`)

**Description :** Recupere toutes les cues d'une liste avec leurs labels.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/cue/{cuelist}/index/{index}`.

<a id="eos-cue-record"></a>
## Record cue (`eos_cue_record`)

**Description :** Enregistre une cue de maniere deterministe via eos_new_command.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-cue-select"></a>
## Selection de cue (`eos_cue_select`)

**Description :** Selectionne une cue dans la liste sans la declencher.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cue_number` | number \| string | Oui | — |
| `cue_part` | number | Non | — |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cue`.

<a id="eos-cue-stop-back"></a>
## Stop ou Back sur liste de cues (`eos_cue_stop_back`)

**Description :** Appuie une fois sur Stop/Back pour la liste indiquee. Eos arrete un fondu en cours; sinon recule d’une cue. Le protocole ne fournit pas ici de commande Stop-seulement ou Back-seulement.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cues/{cuelist}/stop`.

<a id="eos-cue-update"></a>
## Update cue (`eos_cue_update`)

**Description :** Met a jour une cue de maniere deterministe via eos_new_command.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-cuelist-bank-create"></a>
## Creation de bank de cuelist (`eos_cuelist_bank_create`)

**Description :** Configure un bank OSC pour surveiller une liste de cues.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | — |
| `confirm` | boolean | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `num_pending_cues` | number | Oui | — |
| `num_prev_cues` | number | Oui | — |
| `offset` | number | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}`.

<a id="eos-cuelist-bank-page"></a>
## Navigation de bank de cuelist (`eos_cuelist_bank_page`)

**Description :** Change de page dans un bank de cues en ajoutant le delta specifie.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | — |
| `confirm` | boolean | Non | — |
| `delta` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/cuelist/{bank_index}/page/{delta}`.

<a id="eos-cuelist-get-info"></a>
## Informations de cuelist (`eos_cuelist_get_info`)

**Description :** Recupere les attributs d'une liste de cues (modes, flags...).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/cuelist/{cuelist}`.

<a id="eos-curve-get-info"></a>
## Lecture des informations de courbe (`eos_curve_get_info`)

**Description :** Recupere les informations d'une courbe, incluant label et points.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `curve_number` | number | Oui | Numero de courbe (1-9999). |
| `fields` | array<string> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `curve` | object | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |

**Routage OSC :** `/eos/get/curve/{number}`.

<a id="eos-curve-select"></a>
## Selection de courbe (`eos_curve_select`)

**Description :** Selectionne une courbe en envoyant son numero a la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `curve_number` | number | Oui | Numero de courbe (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/curve`.

<a id="eos-direct-select-bank-create"></a>
## Creation de bank de direct selects (`eos_direct_select_bank_create`)

**Description :** Cree un bank de direct selects OSC avec configuration de cible et pagination.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/ds/{index}/{target}/{buttons}`.

<a id="eos-direct-select-page"></a>
## Navigation de direct select (`eos_direct_select_page`)

**Description :** Change la page active dans un bank de direct selects.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de direct selects (0 pour le premier bank). |
| `delta` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/ds/{index}/page/{delta}`.

<a id="eos-direct-select-press"></a>
## Appui de direct select (`eos_direct_select_press`)

**Description :** Simule un appui ou relachement sur un bouton de direct select.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de direct selects (0 pour le premier bank). |
| `button_index` | number | Oui | Position du bouton dans le bank (1-n). |
| `state` | number | Oui | Etat du bouton (1.0 = enfonce, 0.0 = relache). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/ds/{index}/{button}`.

<a id="eos-effect-get-info"></a>
## Informations d'effet (`eos_effect_get_info`)

**Description :** Recupere les informations detaillees d'un effet.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect_number` | number | Oui | Numero d'effet (1-9999) |
| `fields` | array<string> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect` | object | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |

**Routage OSC :** `/eos/get/fx/{number}`.

<a id="eos-effect-select"></a>
## Selection d'effet (`eos_effect_select`)

**Description :** Selectionne un effet sans le lancer.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect_number` | number | Oui | Numero d'effet (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fx`.

<a id="eos-effect-stop"></a>
## Arret d'effet (`eos_effect_stop`)

**Description :** Stoppe le numero d’effet indique, ou tous les effets actifs si le numero est absent (Effect n At Enter / Stop_Effect Enter).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `effect_number` | number | Non | Numero d'effet (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-enable-logging"></a>
## Basculer le logging OSC (`eos_enable_logging`)

**Description :** Active ou desactive la journalisation des messages OSC entrants et sortants.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `incoming` | boolean | Non | — |
| `outgoing` | boolean | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-fader-bank-create"></a>
## Creation de bank de faders (`eos_fader_bank_create`)

**Description :** Cree un bank de faders OSC avec pagination optionnelle.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_count` | number | Oui | Nombre de faders a creer dans le bank. |
| `page_number` | number | Non | Numero de page initial (0 par defaut). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fader/{index}/config/{faders}`.

<a id="eos-fader-load"></a>
## Chargement de fader (`eos_fader_load`)

**Description :** Charge le contenu courant sur le fader specifie.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_index` | number | Oui | Position du fader dans le bank (1-n). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fader/{index}/{fader}/load`.

<a id="eos-fader-page"></a>
## Navigation de bank de faders (`eos_fader_page`)

**Description :** Change de page dans le bank en ajoutant le delta specifie.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `delta` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fader/{index}/page/{delta}`.

<a id="eos-fader-set-level"></a>
## Reglage de niveau de fader (`eos_fader_set_level`)

**Description :** Definit le niveau (0-1 ou 0-100%) du fader cible.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_index` | number | Oui | Position du fader dans le bank (1-n). |
| `level` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fader/{index}/{fader}`.

<a id="eos-fader-unload"></a>
## Dechargement de fader (`eos_fader_unload`)

**Description :** Decharge le contenu du fader specifie.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `bank_index` | number | Oui | Index du bank de faders (0 = Main, 1 = Mains, etc.). |
| `fader_index` | number | Oui | Position du fader dans le bank (1-n). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fader/{index}/{fader}/unload`.

<a id="eos-fixture-search"></a>
## Recherche fixture (`eos_fixture_search`)

**Description :** Recherche dans la bibliotheque de fixtures par nom, marque, modele ou mode.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `limit` | number | Non | — |
| `manufacturer` | string | Non | — |
| `mode` | string | Non | — |
| `model` | string | Non | — |
| `name` | string | Non | — |
| `query` | string | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-focus-palette-fire"></a>
## Declenchement de palette de focus (`eos_focus_palette_fire`)

**Description :** Declenche une palette de focus sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/fp/fire`.

<a id="eos-fpe-get-point-info"></a>
## Informations point FPE (`eos_fpe_get_point_info`)

**Description :** Recupere les informations detaillees pour un point Focus Palette Encoder.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `point_number` | number | Oui | Numero de point FPE (0-9999, index OSC). |
| `set_number` | number | Oui | Numero de set FPE (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/fpe/{set}/{point}`.

<a id="eos-fpe-get-set-count"></a>
## Compter les sets FPE (`eos_fpe_get_set_count`)

**Description :** Recupere le nombre total de sets Focus Palette Encoder.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/fpe/count`.

<a id="eos-fpe-get-set-info"></a>
## Informations set FPE (`eos_fpe_get_set_info`)

**Description :** Recupere les informations detaillees pour un set Focus Palette Encoder.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `set_number` | number | Oui | Numero de set FPE (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/fpe/{set}`.

<a id="eos-get-active-cue"></a>
## Cue active (`eos_get_active_cue`)

**Description :** Recupere la cue actuellement en lecture sur la liste specifiee (ou principale).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/active/cue`.

<a id="eos-get-active-wheels"></a>
## Encodeurs actifs (`eos_get_active_wheels`)

**Description :** Recupere et normalise la liste des encodeurs actifs.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/active/wheel/{index}`.

<a id="eos-get-command-line"></a>
## Lecture de la ligne de commande EOS (`eos_get_command_line`)

**Description :** Recupere le contenu courant depuis les messages officiels /eos/out/... memorises, avec repli extension MCP /eos/get/cmd_line.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/user/{number}/cmd`.

<a id="eos-get-count"></a>
## Compter les elements (`eos_get_count`)

**Description :** Recupere le nombre total d'elements pour un type donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cuelist_number` | number | Non | Pour target_type=cue, liste a lire (1 par defaut). |
| `target_type` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `action` | literal("get_count") | Oui | — |
| `confidence` | enum(high, medium, low, none) | Oui | — |
| `count` | number | Non | — |
| `data` | unknown | Oui | — |
| `error` | string \| null | Oui | — |
| `is_complete` | boolean | Oui | — |
| `limitations` | array<string> | Oui | — |
| `next_operator_actions` | array<string> | Oui | — |
| `osc` | object | Oui | — |
| `source` | record<string, unknown> | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |
| `target_type` | string | Oui | — |

**Routage OSC :** `/eos/get/{family}/count` ; cues : `/eos/get/cue/{list}/count`.

<a id="eos-get-diagnostics"></a>
## Diagnostics OSC (`eos_get_diagnostics`)

**Description :** Recupere les informations de diagnostic du service OSC.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :** Aucun argument.

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-get-list-all"></a>
## Lister tous les elements (`eos_get_list_all`)

**Description :** Recupere la liste complete des elements pour un type donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `cuelist_number` | number | Non | Pour target_type=cue, liste a lire (1 par defaut). |
| `target_type` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `action` | literal("list_all") | Oui | — |
| `confidence` | enum(high, medium, low, none) | Oui | — |
| `data` | unknown | Oui | — |
| `error` | string \| null | Oui | — |
| `is_complete` | boolean | Oui | — |
| `items` | array<object> | Non | — |
| `limitations` | array<string> | Oui | — |
| `next_operator_actions` | array<string> | Oui | — |
| `osc` | object | Oui | — |
| `source` | record<string, unknown> | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |
| `target_type` | string | Oui | — |

**Routage OSC :** Get count puis `/eos/get/{family}/index/{index}` ; cues : liste explicite.

<a id="eos-get-live-blind-state"></a>
## Etat Live/Blind (`eos_get_live_blind_state`)

**Description :** Indique si la console est en mode Live ou Blind.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | Delai maximum d'attente en millisecondes. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/event/state`.

<a id="eos-get-pending-cue"></a>
## Cue en attente (`eos_get_pending_cue`)

**Description :** Recupere la prochaine cue en attente sur la liste specifiee (ou principale).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `cues` |
| Synonymes | `cue`, `cuelist`, `playback`, `go`, `record cue` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_cue_series`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `cuelist_number` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/pending/cue`.

<a id="eos-get-setup-defaults"></a>
## Defaults de setup (`eos_get_setup_defaults`)

**Description :** Recupere les valeurs par defaut de setup exposees par la console EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-get-show-name"></a>
## Nom du show (`eos_get_show_name`)

**Description :** Recupere le nom du show actuellement charge sur la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | Delai maximum d'attente en millisecondes. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/show/path`.

<a id="eos-get-softkey-labels"></a>
## Libelles des softkeys (`eos_get_softkey_labels`)

**Description :** Recupere les libelles affiches des softkeys 1-12.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `keys` |
| Synonymes | `key`, `button`, `softkey`, `touche`, `facepanel` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/softkey/{index}`.

<a id="eos-get-user-command-line"></a>
## Lecture de la ligne de commande utilisateur (`eos_get_user_command_line`)

**Description :** Recupere la ligne de commande utilisateur depuis /eos/out/user/<number>/cmd memorise, avec repli extension MCP /eos/get/cmd_line.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `user` | number | Oui | — |
| `verification_timeout_ms` | number | Non | — |
| `verify_after_send` | boolean | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/out/user/{number}/cmd`.

<a id="eos-get-version"></a>
## Version de la console (`eos_get_version`)

**Description :** Recupere la version logicielle signalee par la console EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-group-get-info"></a>
## Informations sur un groupe (`eos_group_get_info`)

**Description :** Recupere les informations detaillees pour un groupe donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `group_number` | number | Oui | Numero de groupe (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `group` | object \| null | Non | — |

**Routage OSC :** `/eos/get/group/{number}`.

<a id="eos-group-list-all"></a>
## Liste des groupes (`eos_group_list_all`)

**Description :** Recupere la liste des groupes disponibles avec leurs membres.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `groups` | array<object> | Oui | — |

**Routage OSC :** `/eos/get/group/index/{index}`.

<a id="eos-group-select"></a>
## Selection de groupe (`eos_group_select`)

**Description :** Selectionne un groupe sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `group_number` | number | Oui | Numero de groupe (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/group`.

<a id="eos-group-set-level"></a>
## Reglage de niveau de groupe (`eos_group_set_level`)

**Description :** Ajuste le niveau d'un groupe sur une echelle de 0 a 100.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `group_number` | number | Oui | Numero de groupe (1-99999) |
| `level` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |
| `snap` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/group/{group}`.

<a id="eos-intensity-palette-fire"></a>
## Declenchement de palette d'intensite (`eos_intensity_palette_fire`)

**Description :** Declenche une palette d'intensite sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/ip/fire`.

<a id="eos-key-press"></a>
## Appui sur touche (`eos_key_press`)

**Description :** Simule l'appui ou le relachement d'une touche du clavier EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `keys` |
| Synonymes | `key`, `button`, `softkey`, `touche`, `facepanel` |
| Niveau de risque | `live` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `key_name` | string | Oui | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `state` | number \| boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/key/{key}`.

<a id="eos-macro-fire"></a>
## Declenchement de macro (`eos_macro_fire`)

**Description :** Declenche une macro en envoyant son numero a la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `macros` |
| Synonymes | `macro`, `macro fire`, `automation`, `sequence` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro_number` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/macro/fire`.

<a id="eos-macro-get-info"></a>
## Informations de macro (`eos_macro_get_info`)

**Description :** Recupere le libelle et le script d'une macro.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `macros` |
| Synonymes | `macro`, `macro fire`, `automation`, `sequence` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro_number` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro` | object | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |

**Routage OSC :** `/eos/get/macro/{number}`.

<a id="eos-macro-select"></a>
## Selection de macro (`eos_macro_select`)

**Description :** Selectionne une macro sans l'executer.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `macros` |
| Synonymes | `macro`, `macro fire`, `automation`, `sequence` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `macro_number` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/macro`.

<a id="eos-magic-sheet-get-info"></a>
## Informations de magic sheet (`eos_magic_sheet_get_info`)

**Description :** Recupere le label et l'UID d'un magic sheet.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `ms_number` | number | Oui | Numero du magic sheet (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `magic_sheet` | object | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |

**Routage OSC :** `/eos/get/ms/{number}`.

<a id="eos-magic-sheet-open"></a>
## Ouverture de magic sheet (`eos_magic_sheet_open`)

**Description :** Ouvre un magic sheet specifique sur la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `ms_number` | number | Oui | Numero du magic sheet (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `view_number` | number | Non | Numero de vue (1-99). |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/ms`.

<a id="eos-new-command"></a>
## Nouvelle commande EOS (`eos_new_command`)

**Description :** Efface optionnellement la ligne de commande puis envoie le texte fourni. A n'utiliser que lorsqu'aucun outil dedie n'existe. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `commands` |
| Synonymes | `command line`, `cmd`, `newcmd`, `texte eos`, `ligne de commande` |
| Niveau de risque | `dangerous` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_update_cue_look` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `clearLine` | boolean | Non | — |
| `command` | string | Oui | — |
| `confirm` | boolean | Non | — |
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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-palette-get-info"></a>
## Informations de palette (`eos_palette_get_info`)

**Description :** Recupere les informations detaillees pour une palette donnee.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `palettes` |
| Synonymes | `palette`, `ip`, `fp`, `cp`, `bp`, `look building` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `fields` | array<string> | Non | — |
| `palette_number` | number | Oui | Numero de palette (1-99999) |
| `palette_type` | enum(ip, fp, cp, bp) | Oui | Type de palette: 'ip' (intensite), 'fp' (focus), 'cp' (couleur), 'bp' (beam) |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/{palette_type}/{number}`.

<a id="eos-palette-label-set"></a>
## Label palette (`eos_palette_label_set`)

**Description :** Applique un label sur une palette avec commande deterministe.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `label` | string | Oui | — |
| `palette_number` | number | Oui | — |
| `palette_type` | enum(ip, fp, cp, bp) | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/set/{palette_type}/{number}/label`.

<a id="eos-palette-record"></a>
## Record palette (`eos_palette_record`)

**Description :** Enregistre une palette (ip/fp/cp/bp) avec commande deterministe.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `palette_number` | number | Oui | — |
| `palette_type` | enum(ip, fp, cp, bp) | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-patch-get-augment3d-beam"></a>
## Faisceau Augment3d (`eos_patch_get_augment3d_beam`)

**Description :** Recupere les informations de faisceau Augment3d pour une partie de canal.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `patch` |
| Synonymes | `patch`, `fixture`, `channel setup`, `augment3d`, `adressage` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_autopatch_band` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | Numero de canal (1-99999). |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `part_number` | number | Oui | Numero de partie (1-99). |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `augment3d` | object | Non | — |

**Routage OSC :** `/eos/get/patch/{channel}/{part}/augment3d/beam`.

<a id="eos-patch-get-augment3d-position"></a>
## Position Augment3d (`eos_patch_get_augment3d_position`)

**Description :** Recupere la position Augment3d d'une partie de canal.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `patch` |
| Synonymes | `patch`, `fixture`, `channel setup`, `augment3d`, `adressage` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_autopatch_band` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | Numero de canal (1-99999). |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `part_number` | number | Oui | Numero de partie (1-99). |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `augment3d` | object | Non | — |

**Routage OSC :** `/eos/get/patch/{channel}/{part}/augment3d/position`.

<a id="eos-patch-get-channel-info"></a>
## Informations de patch (`eos_patch_get_channel_info`)

**Description :** Recupere les informations de patch pour un canal donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `patch` |
| Synonymes | `patch`, `fixture`, `channel setup`, `augment3d`, `adressage` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_autopatch_band` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel_number` | number | Oui | Numero de canal (1-99999). |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `part_number` | number | Non | Numero de partie (0 = toutes les parties, 1-99). |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `channel` | object | Non | — |

**Routage OSC :** `/eos/get/patch/{channel}/{part}`.

<a id="eos-patch-set-channel"></a>
## Set patch channel (`eos_patch_set_channel`)

**Description :** Controle et applique le patch avec relecture. Le profil complexe doit deja exister sur le canal; aucun nom OFL n’est transforme en commande Type.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `dangerous` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `allow_readdress` | boolean | Non | — |
| `channel_number` | number | Oui | — |
| `device_type` | string | Oui | — |
| `dmx_address` | number \| string | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `dmx_footprint` | number | Non | — |
| `dry_run` | boolean | Non | — |
| `eos_profile` | string | Non | — |
| `label` | string | Non | — |
| `part` | number | Non | — |
| `require_confirmation` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/newcmd`.

<a id="eos-ping"></a>
## Ping OSC EOS (`eos_ping`)

**Description :** Envoie un ping OSC a la console EOS et retourne le statut.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `message` | string | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/ping`.

<a id="eos-pixmap-get-info"></a>
## Informations sur un pixel map (`eos_pixmap_get_info`)

**Description :** Recupere les informations detaillees pour un pixel map donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `pixmap_number` | number | Oui | Numero du pixel map (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `pixmap` | object | Non | — |

**Routage OSC :** `/eos/get/pixmap/{number}`.

<a id="eos-pixmap-select"></a>
## Selection de pixel map (`eos_pixmap_select`)

**Description :** Selectionne un pixel map sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `pixmap_number` | number | Oui | Numero du pixel map (1-9999). |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/pixmap`.

<a id="eos-preset-fire"></a>
## Declenchement de preset (`eos_preset_fire`)

**Description :** Declenche un preset sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `presets` |
| Synonymes | `preset`, `look`, `preset fire`, `preset select` |
| Niveau de risque | `live` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `preset_number` | number | Oui | Numero de preset (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/preset/fire`.

<a id="eos-preset-get-info"></a>
## Informations de preset (`eos_preset_get_info`)

**Description :** Recupere les informations detaillees pour un preset donne.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `presets` |
| Synonymes | `preset`, `look`, `preset fire`, `preset select` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `fields` | array<string> | Non | — |
| `preset_number` | number | Oui | Numero de preset (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/get/preset/{number}`.

<a id="eos-preset-select"></a>
## Selection de preset (`eos_preset_select`)

**Description :** Selectionne un preset sur la console Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `presets` |
| Synonymes | `preset`, `look`, `preset fire`, `preset select` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_create_look`, `eos_workflow_create_cue_series` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `preset_number` | number | Oui | Numero de preset (1-99999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/preset`.

<a id="eos-readiness-check"></a>
## Verification de readiness EOS (`eos_readiness_check`)

**Description :** Premiere etape obligatoire: controle read-only du transport OSC, du handshake et des lectures JSON EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `diagnostics` |
| Niveau de risque | `read` |
| Confirmation requise | Non |
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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-reset"></a>
## Reset OSC EOS (`eos_reset`)

**Description :** Envoie une commande de reset a la console EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `dangerous` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `full` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |
| `transportPreference` | enum(reliability, speed, auto) | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/reset` (sans arguments, sans accusé de réception).

<a id="eos-set-color-hs"></a>
## Couleur HS (`eos_set_color_hs`)

**Description :** Definit une couleur via Hue/Saturation.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `hue` | number \| string | Oui | — |
| `saturation` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/color/hs`.

<a id="eos-set-color-rgb"></a>
## Couleur RGB (`eos_set_color_rgb`)

**Description :** Definit une couleur via valeurs RGB (0-1).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `blue` | number \| string | Oui | — |
| `green` | number \| string | Oui | — |
| `red` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/color/rgb`.

<a id="eos-set-dmx"></a>
## Reglage DMX (`eos_set_dmx`)

**Description :** Fixe une valeur DMX (0-255) sur une ou plusieurs adresses.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `addresses` | number \| array<number> \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `value` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/addr/{address}/DMX`.

<a id="eos-set-pantilt-xy"></a>
## Position Pan/Tilt XY (`eos_set_pantilt_xy`)

**Description :** Definit une position normalisee sur le plan XY (0-1).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `x` | number \| string | Oui | — |
| `y` | number \| string | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/pantilt/xy`.

<a id="eos-set-user-id"></a>
## Definir identifiant utilisateur EOS (`eos_set_user_id`)

**Description :** Definit l'identifiant utilisateur actif sur la console EOS via OSC.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user_id` | number | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/user`.

<a id="eos-set-xyz-position"></a>
## Position XYZ (`eos_set_xyz_position`)

**Description :** Definit une position XYZ en metres.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `x` | number \| string | Oui | — |
| `y` | number \| string | Oui | — |
| `z` | number \| string | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/xyz`.

<a id="eos-showfile-get-patch"></a>
## Lire le patch du showfile importe (`eos_showfile_get_patch`)

**Description :** Retourne les entrees patch extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-showfile-import"></a>
## Importer un showfile Eos .esf3d hors live (`eos_showfile_import`)

**Description :** Importe un .esf3d autorise comme archive ZIP dans un repertoire temporaire isole, extrait seulement les metadonnees XML utiles et marque la reponse source=showfile/live=false. Ce fallback exige une autorisation operateur explicite et ne remplace pas la lecture OSC live.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile fallback`, `offline showfile` |
| Niveau de risque | `dangerous` |
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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-showfile-list-cues"></a>
## Lister les cues du showfile importe (`eos_showfile_list_cues`)

**Description :** Retourne les cues extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-showfile-list-fixtures"></a>
## Lister les fixtures du showfile importe (`eos_showfile_list_fixtures`)

**Description :** Retourne les fixtures extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-showfile-list-groups"></a>
## Lister les groupes du showfile importe (`eos_showfile_list_groups`)

**Description :** Retourne les groupes extraits des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-showfile-list-labels"></a>
## Lister les labels du showfile importe (`eos_showfile_list_labels`)

**Description :** Retourne les labels extraits des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-showfile-list-palettes"></a>
## Lister les palettes du showfile importe (`eos_showfile_list_palettes`)

**Description :** Retourne les palettes extraites des XML internes disponibles. Donnees issues du fallback showfile uniquement: source=showfile, live=false.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showfile` |
| Synonymes | `esf3d`, `showfile offline` |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `import_id` | string | Non | Identifiant retourne par eos_showfile_import; omis, utilise le dernier import. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="eos-snapshot-get-info"></a>
## Lecture des informations de snapshot (`eos_snapshot_get_info`)

**Description :** Recupere les informations d'un snapshot, incluant label et UID.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `fields` | array<string> | Non | — |
| `snapshot_number` | number | Oui | Numero de snapshot (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `snapshot` | object | Oui | — |
| `status` | enum(ok, timeout, error, skipped, unsupported_transport_mode, read_capability_unconfirmed) | Oui | — |

**Routage OSC :** `/eos/get/snap/{number}`.

<a id="eos-snapshot-recall"></a>
## Rappel de snapshot (`eos_snapshot_recall`)

**Description :** Rappelle un snapshot en envoyant son numero a la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `snapshot_number` | number | Oui | Numero de snapshot (1-9999) |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/snap/fire`.

<a id="eos-softkey-press"></a>
## Appui sur softkey (`eos_softkey_press`)

**Description :** Simule l'appui ou le relachement d'une softkey (1-12).

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `keys` |
| Synonymes | `key`, `button`, `softkey`, `touche`, `facepanel` |
| Niveau de risque | `live` |
| Confirmation requise | Non |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `confirm` | boolean | Non | — |
| `dry_run` | boolean | Non | — |
| `require_confirmation` | boolean | Non | — |
| `safety_level` | enum(strict, standard, off) | Non | — |
| `softkey_number` | number | Oui | — |
| `state` | number \| boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/softkey/{index}`.

<a id="eos-submaster-bump"></a>
## Commande de bump (`eos_submaster_bump`)

**Description :** Active ou desactive le bump d'un submaster.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `state` | number \| boolean \| string | Oui | — |
| `submaster_number` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/sub/{submaster_number}/fire`.

<a id="eos-submaster-get-info"></a>
## Informations sur un submaster (`eos_submaster_get_info`)

**Description :** Recupere et normalise les informations d'un submaster.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `submaster_number` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `timeoutMs` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

| Champ de sortie spécifique | Type | Requis | Description |
| --- | --- | --- | --- |
| `found` | boolean | Oui | — |
| `submaster` | object | Oui | — |

**Routage OSC :** `/eos/get/sub/{number}`.

<a id="eos-submaster-record"></a>
## Enregistrer un submaster selectif (`eos_submaster_record`)

**Description :** Enregistre sur un numero libre les canaux explicites. Intensite seule par defaut. level applique des niveaux Live; absent, conserve les niveaux courants. Preview puis confirmation; contenu final a verifier dans Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `submasters` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | string | Oui | — |
| `dry_run` | boolean | Non | — |
| `intensity_only` | boolean | Non | Enregistre uniquement l’intensite par defaut; false inclut les autres parametres courants. |
| `label` | string | Oui | — |
| `level` | number | Non | Si fourni, applique ce niveau aux canaux en Live avant enregistrement. Sinon conserve les valeurs courantes. |
| `number` | number | Oui | — |
| `require_confirmation` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Préparation sélective : Get sub, commandes utilisateur et Set label.

<a id="eos-submaster-set-level"></a>
## Reglage de submaster (`eos_submaster_set_level`)

**Description :** Ajuste le niveau d'un submaster sur une echelle de 0.0 a 1.0.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `level` | number \| enum(full, Full, FULL, out, Out, OUT) \| string | Oui | — |
| `submaster_number` | number | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/sub/{submaster_number}`.

<a id="eos-subscribe"></a>
## Souscription OSC EOS (`eos_subscribe`)

**Description :** Active ou desactive une souscription OSC sur la console EOS.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/subscribe`, `/eos/subscribe/param/{name}` (entier 0 ou 1).

<a id="eos-switch-continuous"></a>
## Mouvement continu (`eos_switch_continuous`)

**Description :** Mouvement continu de la selection courante. rate est une vitesse native signee; envoyer 0 pour arreter.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `parameter_name` | string | Oui | — |
| `rate` | number \| string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/switch/{parameter}`.

<a id="eos-toggle-staging-mode"></a>
## Toggle Staging Mode (`eos_toggle_staging_mode`)

**Description :** Active ou desactive le mode Staging de la console.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Catégorie | `showControl` |
| Synonymes | `show control`, `show name`, `live blind`, `cue string`, `staging mode` |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |
| Workflow préféré | `eos_workflow_rehearsal_go` |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/key/staging_mode`.

<a id="eos-wheel-tick"></a>
## Rotation d'encodeur (`eos_wheel_tick`)

**Description :** Rotation relative de l’encodeur de la selection courante; ticks natifs signes, mode coarse ou fine.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `mode` | enum(coarse, fine) | Non | — |
| `parameter_name` | string | Oui | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `ticks` | number \| string | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** `/eos/wheel/{mode}/{parameter}`.

<a id="eos-workflow-autopatch-band"></a>
## Patch complet du groupe sur scene (`eos_workflow_autopatch_band`)

**Description :** Prepare un plan par empreinte DMX exacte puis verifie collisions et profils Eos avant toute ecriture. start_channel preserve la numerotation; pas de changement de profil implicite.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `allow_readdress` | boolean | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `face_trad_count` | number | Non | — |
| `face_trad_label_prefix` | string | Non | — |
| `face_trad_start_address` | number | Non | — |
| `face_trad_universe` | number | Non | — |
| `fixtures` | array<object> | Oui | — |
| `include_face_trad` | boolean | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `start_channel` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `universe_rollover` | boolean | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="eos-workflow-build-groups-and-palettes"></a>
## Construire groupes et palettes (`eos_workflow_build_groups_and_palettes`)

**Description :** Prepare groupes, palettes et submasters sur des numeros libres. Preview complete, valeurs explicites, arret au premier echec et relecture des champs OSC disponibles.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `color_palettes` | array<object> | Non | — |
| `dry_run` | boolean | Non | — |
| `focus_palettes` | array<object> | Non | — |
| `groups` | array<object> | Non | — |
| `require_confirmation` | boolean | Non | — |
| `submasters` | array<object> | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="eos-workflow-create-cue-series"></a>
## Programmer une suite de cues reggae (`eos_workflow_create_cue_series`)

**Description :** Point d entree naturel pour generer plusieurs cues musicales ou reggae: looks successifs, palettes couleur/focus/beam et numerotation automatique.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `base_cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `looks` | array<object> | Oui | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `start_cue_number` | number \| string | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="eos-workflow-create-look"></a>
## Workflow creation de look (`eos_workflow_create_look`)

**Description :** Selectionne des canaux, applique des palettes CP/FP/BP puis enregistre une cue.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `beam_palette` | number | Non | — |
| `channels` | string | Oui | — |
| `color_palette` | number | Non | — |
| `cue_label` | string | Non | — |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `focus_palette` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="eos-workflow-patch-fixture"></a>
## Workflow patch fixture (`eos_workflow_patch_fixture`)

**Description :** Controle puis applique adresse, label et XYZ optionnel. Profils complexes a preparer dans Eos; user 1..99 requis.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `allow_readdress` | boolean | Non | — |
| `channel_number` | number | Oui | — |
| `device_type` | string | Non | — |
| `dmx_address` | number \| string | Oui | Adresse DMX au format 'univers/adresse' ou numero absolu. |
| `dmx_footprint` | number | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `eos_profile` | string | Non | — |
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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="eos-workflow-patch-scan"></a>
## Scanner le patch de plusieurs canaux (`eos_workflow_patch_scan`)

**Description :** Lit les informations de patch canal par canal avec concurrence basse, pause entre requetes et arret de securite sur taux d echec configurable.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

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

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Lectures natives `/eos/get/patch/{channel}/{part}`.

<a id="eos-workflow-rehearsal-go-safe"></a>
## Workflow rehearsal go safe (`eos_workflow_rehearsal_go_safe`)

**Description :** Verifie la ligne de commande, envoie GO puis rollback optionnel en cas d echec.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `live` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `allow_non_empty_command_line` | boolean | Non | — |
| `cue_number` | number \| string | Non | — |
| `cuelist_number` | number | Oui | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `precheck_timeout_ms` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `rollback_cue_number` | number \| string | Non | — |
| `rollback_cuelist_number` | number | Non | — |
| `rollback_on_failure` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="eos-workflow-update-cue-look"></a>
## Mettre a jour le look d une cue (`eos_workflow_update_cue_look`)

**Description :** Rappelle une cue explicite, applique une intensite absolue aux canaux puis Update. Modifie la sortie live; les valeurs enregistrees restent a verifier dans Eos.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `show-modifying` |
| Confirmation requise | Oui |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `channels` | string | Oui | — |
| `cue_number` | number \| string | Oui | — |
| `cuelist_number` | number | Oui | — |
| `desaturate` | boolean | Non | — |
| `dry_run` | boolean | Non | Si true, aucune commande EOS n'est envoyee; la sequence complete est retournee dans structuredContent.commands_preview. Si absent ou false, le workflow execute reellement les commandes uniquement si require_confirmation vaut true. |
| `intensity` | number | Oui | — |
| `intensity_factor` | number | Non | — |
| `require_confirmation` | boolean | Non | Obligatoire a true pour toute execution reelle (dry_run absent ou false). Ne doit etre fourni par un assistant qu'apres validation utilisateur explicite de commands_preview. |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |
| `verification_timeout_ms` | number | Non | Timeout en millisecondes pour verifier apres envoi les commandes EOS sensibles. |
| `warmify` | boolean | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook.

<a id="ping"></a>
## Ping tool (`ping`)

**Description :** Retourne un message de confirmation.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `message` | string | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="session-clear-context"></a>
## Effacer contexte courant (`session_clear_context`)

**Description :** Supprime le contexte courant memorise localement.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `agent_id` | string | Non | — |
| `context_id` | string | Non | — |
| `mcp_session_id` | string | Non | — |
| `user_id` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="session-get-context"></a>
## Contexte courant (`session_get_context`)

**Description :** Renvoie le contexte courant memorise localement.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `agent_id` | string | Non | — |
| `context_id` | string | Non | — |
| `mcp_session_id` | string | Non | — |
| `user_id` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="session-get-current-user"></a>
## Utilisateur courant (`session_get_current_user`)

**Description :** Renvoie le numero utilisateur EOS memorise localement.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :** Aucun argument.

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="session-set-context"></a>
## Definir contexte courant (`session_set_context`)

**Description :** Stocke le contexte courant (show, cuelist active, selections canaux/groupes, palettes recentes) avec un TTL configurable.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `agent_id` | string | Non | — |
| `context` | object | Oui | — |
| `context_id` | string | Non | — |
| `mcp_session_id` | string | Non | — |
| `ttl_ms` | number | Non | — |
| `user_id` | number | Non | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).

<a id="session-set-current-user"></a>
## Definir utilisateur courant (`session_set_current_user`)

**Description :** Stocke en local le numero utilisateur EOS a utiliser par defaut.

**Métadonnées :**

| Champ | Valeur |
| --- | --- |
| Niveau de risque | `read` |
| Confirmation requise | Non |

**Arguments :**

| Nom | Type | Requis | Description |
| --- | --- | --- | --- |
| `user` | number | Oui | — |

**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.

**Routage OSC :** Pas de mapping direct déclaré ; voir description (outil local ou orchestration).
