# Documentation des outils

> Ce document est généré automatiquement via `npm run docs:generate`.
> Merci de ne pas le modifier manuellement.

Chaque outil expose son nom MCP, une description, la liste des arguments attendus ainsi qu'un exemple d'appel en CLI et par OSC.

## Options communes de securite (outils critiques)

Les outils critiques des familles **cues**, **patch**, **palettes** et **commandes texte** exposent les options suivantes :

- `dry_run` (`boolean`) : calcule la commande OSC/Eos et la retourne dans `structuredContent.osc` sans envoi vers la console.
- `require_confirmation` (`boolean`) : confirmation explicite requise pour les actions sensibles.
- `safety_level` (`strict` | `standard` | `off`) : niveau de garde-fou applique (par defaut `strict`).

En mode `strict`/`standard`, les actions sensibles (`record`, `update`, `delete`, `live fire`, et declenchements `fire`) sont bloquees sans `require_confirmation=true`.

## Outils mis en avant

| Outil | Résumé | Lien |
| --- | --- | --- |
| `eos_channel_set_level` | Reglage de niveau | [#eos-channel-set-level](#eos-channel-set-level) |
| `eos_cue_go` | GO sur liste de cues | [#eos-cue-go](#eos-cue-go) |
| `eos_cue_stop_back` | Stop ou Back sur liste de cues | [#eos-cue-stop-back](#eos-cue-stop-back) |
| `eos_preset_fire` | Declenchement de preset | [#eos-preset-fire](#eos-preset-fire) |
| `eos_preset_get_info` | Informations de preset | [#eos-preset-get-info](#eos-preset-get-info) |

<a id="eos-address-select"></a>
## Selection d'adresse DMX (`eos_address_select`)

**Description :** Selectionne une adresse DMX specifique sur la console.

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
oscsend 127.0.0.1 8001 /eos/dmx/address/select s:'{"address_number":"exemple"}'
```

<a id="eos-address-set-dmx"></a>
## Reglage DMX brut (`eos_address_set_dmx`)

**Description :** Fixe une valeur DMX brute (0-255) pour une adresse DMX.

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
oscsend 127.0.0.1 8001 /eos/dmx/address/dmx s:'{"address_number":"exemple","dmx_value":1}'
```

<a id="eos-address-set-level"></a>
## Reglage de niveau d'adresse DMX (`eos_address_set_level`)

**Description :** Ajuste le niveau (0-100) pour une adresse DMX donnee.

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
oscsend 127.0.0.1 8001 /eos/dmx/address/level s:'{"address_number":"exemple","level":1}'
```

<a id="eos-beam-palette-fire"></a>
## Declenchement de palette de beam (`eos_beam_palette_fire`)

**Description :** Declenche une palette de beam sur la console Eos.

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
oscsend 127.0.0.1 8001 /eos/cmd s:'Chan 1 + Enter'
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
oscsend 127.0.0.1 8001 /eos/cmd s:'Chan 1 At 1 DMX Enter'
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
oscsend 127.0.0.1 8001 /eos/cmd s:'Chan 1 Sneak 1 Enter'
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
oscsend 127.0.0.1 8001 /eos/chan/param s:'{"channels":1,"parameter":"exemple","value":1}'
```

<a id="eos-color-palette-fire"></a>
## Declenchement de palette de couleur (`eos_color_palette_fire`)

**Description :** Declenche une palette de couleur sur la console Eos.

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

<a id="eos-cue-fire"></a>
## Declenchement de cue (`eos_cue_fire`)

**Description :** Declenche immediatement une cue specifique dans une liste donnee.

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
oscsend 127.0.0.1 8001 /eos/cue/fire s:'{"cuelist_number":1,"cue_number":"exemple"}'
```

<a id="eos-cue-get-info"></a>
## Informations de cue (`eos_cue_get_info`)

**Description :** Recupere les informations detaillees d'une cue (timings, flags, notes...).

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
oscsend 127.0.0.1 8001 /eos/cue/go s:'{"cuelist_number":1}'
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
oscsend 127.0.0.1 8001 /eos/newcmd s:'Cue 1 Record#'
```

<a id="eos-cue-select"></a>
## Selection de cue (`eos_cue_select`)

**Description :** Selectionne une cue dans la liste sans la declencher.

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
oscsend 127.0.0.1 8001 /eos/cue/select s:'{"cuelist_number":1,"cue_number":"exemple"}'
```

<a id="eos-cue-stop-back"></a>
## Stop ou Back sur liste de cues (`eos_cue_stop_back`)

**Description :** Stoppe la lecture de la liste ou effectue un back selon l'option fournie.

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
oscsend 127.0.0.1 8001 /eos/effect/select s:'{"effect_number":1}'
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
oscsend 127.0.0.1 8001 /eos/effect/stop s:'{"effect_number":1}'
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

<a id="eos-focus-palette-fire"></a>
## Declenchement de palette de focus (`eos_focus_palette_fire`)

**Description :** Declenche une palette de focus sur la console Eos.

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

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/setup_defaults s:'{"timeoutMs":1}'
```

<a id="eos-get-show-name"></a>
## Nom du show (`eos_get_show_name`)

**Description :** Recupere le nom du show actuellement charge sur la console.

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

```bash
# Exemple d'envoi OSC via oscsend
oscsend 127.0.0.1 8001 /eos/get/version s:'{"timeoutMs":1}'
```

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
oscsend 127.0.0.1 8001 /eos/macro/select s:'{"macro_number":1}'
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
oscsend 127.0.0.1 8001 /eos/magic_sheet/open s:'{"ms_number":1}'
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
oscsend 127.0.0.1 8001 /eos/magic_sheet/send_string s:'{"osc_command":"exemple"}'
```

<a id="eos-new-command"></a>
## Nouvelle commande EOS (`eos_new_command`)

**Description :** Efface optionnellement la ligne de commande puis envoie le texte fourni. A n'utiliser que lorsqu'aucun outil dedie n'existe. Outil recommande pour appliquer les bonnes pratiques de programmation de cues du manuel EOS.

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
oscsend 127.0.0.1 8001 /eos/pixmap/select s:'{"pixmap_number":1}'
```

<a id="eos-preset-fire"></a>
## Declenchement de preset (`eos_preset_fire`)

**Description :** Declenche un preset sur la console Eos.

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
oscsend 127.0.0.1 8001 /eos/set/cue/receive_string s:'{"format_string":"exemple"}'
```

<a id="eos-set-cue-send-string"></a>
## Format d'envoi des cues (`eos_set_cue_send_string`)

**Description :** Configure le format d'envoi OSC des cues (placeholders %1-%5).

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
oscsend 127.0.0.1 8001 /eos/set/cue/send_string s:'{"format_string":"exemple"}'
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
oscsend 127.0.0.1 8001 /eos/cmd s:'Address 1 At 1 Enter'
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
oscsend 127.0.0.1 8001 /eos/set/user_id s:'{"user_id":1}'
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
oscsend 127.0.0.1 8001 /eos/snapshot/recall s:'{"snapshot_number":1}'
```

<a id="eos-softkey-press"></a>
## Appui sur softkey (`eos_softkey_press`)

**Description :** Simule l'appui ou le relachement d'une softkey (1-12).

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
oscsend 127.0.0.1 8001 /eos/key/softkey{number} s:'{"softkey_number":1}'
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
oscsend 127.0.0.1 8001 /eos/toggle/staging_mode s:'{"targetAddress":"exemple"}'
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

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les matches.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_fixture_search --args '{"query":"ColorSource","mode":"RGBI"}'
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
| `focus_palette` | number | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

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
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_patch_fixture --args '{"channel_number":1,"dmx_address":"exemple","device_type":"exemple","label":"exemple"}'
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
| `precheck_timeout_ms` | number | Non | — |
| `rollback_cue_number` | string \| number | Non | — |
| `rollback_cuelist_number` | number | Non | — |
| `rollback_on_failure` | boolean | Non | — |
| `targetAddress` | string | Non | — |
| `targetPort` | number | Non | — |
| `user` | number | Non | — |

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool eos_workflow_rehearsal_go_safe --args '{"cuelist_number":1}'
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

**Arguments :** Aucun argument.

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_clear_context --args '{}'
```

_OSC_

_Pas de mapping OSC documenté._

<a id="session-get-context"></a>
## Contexte courant (`session_get_context`)

**Description :** Renvoie le contexte courant memorise localement.

**Arguments :** Aucun argument.

**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.

**Exemples :**

_CLI_

```bash
npx @modelcontextprotocol/cli call --tool session_get_context --args '{}'
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
| `context` | object | Oui | — |
| `ttl_ms` | number | Non | — |

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
