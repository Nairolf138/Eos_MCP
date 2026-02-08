# Cookbook d'automatisation Eos MCP

Ce guide rassemble des scénarios prêts à l'emploi pour piloter la console ETC Eos via la passerelle MCP. Chaque fiche combine un rappel métier, un exemple JSON, la commande OSC correspondante et un encart « Référence Eos » vers des lectures complémentaires du manuel (`docs/eos_serie.pdf`). Consultez également [docs/tools.md](tools.md) pour les schémas complets de chaque outil MCP.


## Vérifier les capacités avant toute action métier

### Objectif
Imposer une étape de découverte pour que l'agent connaisse l'état de la session avant d'exécuter une action (cue, patch, palettes, etc.).

### Règle agent
- Appeler **toujours** `eos_capabilities_get` en premier.
- Lire `structuredContent.context` pour vérifier la connexion OSC, l'utilisateur courant, le mode Live/Blind et les restrictions safety.
- Ne poursuivre vers un outil métier (`eos_cue_*`, `eos_patch_*`, `eos_palette_*`, etc.) que si ces informations sont cohérentes avec l'intention utilisateur.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_capabilities_get",
  "arguments": {}
}
```

### Contrat minimum attendu
- `capabilities.families` : familles disponibles et outils associés.
- `context.osc_connection` : santé de la connexion OSC.
- `context.current_user` : utilisateur mémorisé par la session.
- `context.mode.live_blind` : état courant Live/Blind.
- `context.safety` : restrictions de sécurité actives.
- `server.version` + `server.compatibility` : version serveur et compatibilité runtime/protocole.

## Playbooks opérationnels (explicites)

Ces playbooks normalisent les exécutions sensibles avec des garde-fous exploitables par un orchestrateur (LLM, bot, runbook CI, etc.). Les noms d'outils et ancres ci-dessous sont alignés avec [`docs/tools.md`](tools.md).

### Playbook A — Création / mise à jour de cue

#### Préconditions vérifiables
- La découverte initiale retourne `context.osc_connection.connected=true` via `eos_capabilities_get`.
- La console est en mode attendu (Live ou Blind) et l'utilisateur est identifié (`context.current_user`).
- La cue cible est identifiée dans la bonne liste (vérifier avec [`eos_cue_get_info`](tools.md#eos-cue-get-info) ou [`eos_cue_list_all`](tools.md#eos-cue-list-all)).

#### Appels MCP séquencés (JSON)
1. Vérification session
```json
{"type":"call_tool","tool":"eos_capabilities_get","arguments":{}}
```
2. Audit de la cue cible (si elle existe déjà)
```json
{"type":"call_tool","tool":"eos_cue_get_info","arguments":{"cuelist_number":1,"cue_number":"12"}}
```
3. Création de cue
```json
{"type":"call_tool","tool":"eos_cue_record","arguments":{"cuelist_number":1,"cue_number":"12","user":1}}
```
4. Mise à jour de cue (alternative à l'étape 3)
```json
{"type":"call_tool","tool":"eos_cue_update","arguments":{"cuelist_number":1,"cue_number":"12","user":1}}
```
5. Contrôle post-action
```json
{"type":"call_tool","tool":"eos_cue_get_info","arguments":{"cuelist_number":1,"cue_number":"12"}}
```

#### Conditions d’arrêt / rollback
- **Stop immédiat** si `osc_connection` est dégradée, si l'utilisateur session ne correspond pas à l'attendu, ou si la cuelist ciblée n'est pas la bonne.
- **Rollback recommandé** : réappliquer l'état précédent (cue de référence) via [`eos_cue_fire`](tools.md#eos-cue-fire) puis corriger la cue en Blind avant nouvelle tentative.

#### Erreurs attendues + remédiation
- `cue not found` sur update → créer d'abord avec [`eos_cue_record`](tools.md#eos-cue-record).
- blocage sécurité (action sensible) → rejouer avec confirmation opérateur et paramètres safety adaptés sur les outils qui l'exposent.
- conflit de numérotation cue → lister la cuelist avec [`eos_cue_list_all`](tools.md#eos-cue-list-all), choisir un numéro libre puis rejouer.

### Playbook B — Création / usage palettes couleur, focus (position) et beam

> Sur Eos, la "palette de position" est opérée via les **Focus Palettes** (`palette_type: "fp"`) et le rappel par [`eos_focus_palette_fire`](tools.md#eos-focus-palette-fire).

#### Préconditions vérifiables
- Les canaux concernés sont sélectionnés et contrôlés (via [`eos_channel_select`](tools.md#eos-channel-select) + [`eos_channel_get_info`](tools.md#eos-channel-get-info)).
- Le type de palette est explicitement défini : `cp` (couleur), `fp` (focus/position), `bp` (beam).
- La plage de numéros palette est validée et non conflictuelle (audit via [`eos_palette_get_info`](tools.md#eos-palette-get-info)).

#### Appels MCP séquencés (JSON)
1. Vérification session
```json
{"type":"call_tool","tool":"eos_capabilities_get","arguments":{}}
```
2. Préparer la sélection canaux
```json
{"type":"call_tool","tool":"eos_channel_select","arguments":{"channels":[201,202],"exclusive":true}}
```
3. Créer/mettre à jour palette couleur 21
```json
{"type":"call_tool","tool":"eos_palette_record","arguments":{"palette_type":"cp","palette_number":21,"user":1}}
```
4. Créer/mettre à jour palette focus(position) 31
```json
{"type":"call_tool","tool":"eos_palette_record","arguments":{"palette_type":"fp","palette_number":31,"user":1}}
```
5. Créer/mettre à jour palette beam 41
```json
{"type":"call_tool","tool":"eos_palette_record","arguments":{"palette_type":"bp","palette_number":41,"user":1}}
```
6. Usage immédiat (rappel)
```json
{"type":"call_tool","tool":"eos_color_palette_fire","arguments":{"palette_number":21,"require_confirmation":true}}
```
```json
{"type":"call_tool","tool":"eos_focus_palette_fire","arguments":{"palette_number":31,"require_confirmation":true}}
```
```json
{"type":"call_tool","tool":"eos_beam_palette_fire","arguments":{"palette_number":41,"require_confirmation":true}}
```

#### Conditions d’arrêt / rollback
- **Stop** si la sélection canaux est vide ou incohérente avant `eos_palette_record`.
- **Rollback** : rappeler une palette de secours connue (look neutre) avec les outils `*_palette_fire` correspondants.

#### Erreurs attendues + remédiation
- `palette_type` invalide → limiter aux valeurs documentées `ip|fp|cp|bp` de [`eos_palette_record`](tools.md#eos-palette-record).
- palette inexistante au rappel → créer d'abord via [`eos_palette_record`](tools.md#eos-palette-record), puis rejouer `*_palette_fire`.
- rendu inattendu sur certains projecteurs → vérifier les attributs actifs via [`eos_channel_get_info`](tools.md#eos-channel-get-info) et corriger la sélection.

### Playbook C — Patch rapide d’un projecteur

#### Préconditions vérifiables
- Canal cible libre ou identifié pour remplacement contrôlé.
- Adresse DMX de destination et `device_type` validés avec l'équipe plateau.
- État réseau/console sain via `eos_capabilities_get`.

#### Appels MCP séquencés (JSON)
1. Contrôle patch actuel
```json
{"type":"call_tool","tool":"eos_patch_get_channel_info","arguments":{"channel_number":305}}
```
2. Patch express du canal
```json
{"type":"call_tool","tool":"eos_patch_set_channel","arguments":{"channel_number":305,"dmx_address":"2/145","device_type":"Lustr3","part":1,"label":"Face Jardin"}}
```
3. Vérification post-patch
```json
{"type":"call_tool","tool":"eos_patch_get_channel_info","arguments":{"channel_number":305}}
```

#### Conditions d’arrêt / rollback
- **Stop** si `channel_number` est occupé par un usage critique non documenté.
- **Rollback** : rejouer [`eos_patch_set_channel`](tools.md#eos-patch-set-channel) avec les anciennes valeurs (`dmx_address`, `device_type`, `part`, `label`) capturées à l'étape 1.

#### Erreurs attendues + remédiation
- collision DMX / adresse invalide → corriger le format `univers/adresse` puis rejouer.
- `device_type` non reconnu → utiliser une librairie/type existant sur la console puis mettre à jour ultérieurement.
- part incorrecte → lire la config réelle avec [`eos_patch_get_channel_info`](tools.md#eos-patch-get-channel-info), ajuster `part` et recommencer.

### Playbook D — Conduite GO en répétition

#### Préconditions vérifiables
- Cuelist répétition confirmée et opérateur présent en validation finale.
- Cues en attente connues (via [`eos_cue_list_all`](tools.md#eos-cue-list-all) et/ou [`eos_cue_get_info`](tools.md#eos-cue-get-info)).
- Politique safety explicite (`strict` conseillé + `require_confirmation=true` sur actions feu).

#### Appels MCP séquencés (JSON)
1. Audit session
```json
{"type":"call_tool","tool":"eos_capabilities_get","arguments":{}}
```
2. GO sécurisé
```json
{"type":"call_tool","tool":"eos_cue_go","arguments":{"cuelist_number":1,"require_confirmation":true,"safety_level":"strict"}}
```
3. Arrêt / rattrapage si incident
```json
{"type":"call_tool","tool":"eos_cue_stop_back","arguments":{"cuelist_number":1,"back":true,"require_confirmation":true,"safety_level":"strict"}}
```

#### Conditions d’arrêt / rollback
- **Stop immédiat** si top erroné, désynchronisation son/vidéo ou ambiguïté de consigne régie.
- **Rollback** : [`eos_cue_stop_back`](tools.md#eos-cue-stop-back) avec `back=true`, puis relance contrôlée avec [`eos_cue_go`](tools.md#eos-cue-go).

#### Erreurs attendues + remédiation
- refus safety (`require_confirmation` absent) → rejouer avec confirmation explicite.
- cuelist invalide/non chargée → vérifier le numéro, auditer via [`eos_cue_list_all`](tools.md#eos-cue-list-all), puis corriger l'appel.
- GO exécuté sur mauvaise cible → arrêter immédiatement (`stop_back`), annoncer rollback en régie, puis rejouer sur la bonne cuelist.

## Préparer les circuits avant `Record`

### Objectif
Valider une sélection de canaux depuis un workflow automatisé avant toute commande `Record` manuelle sur la console.

### Check-list
- [ ] S'assurer que la sélection courante correspond aux circuits visés (p. 172–174).
- [ ] Vérifier les niveaux d'intensité affichés avant enregistrement (p. 177).
- [ ] Utiliser `Home` si nécessaire pour repartir d'un état neutre (p. 193).

> 📘 **Référence Eos** : [Sélection de circuits & intensité (p. 172–178)](manual://eos#selection-circuits)

### Outils MCP mobilisés
- [`eos_channel_select`](tools.md#eos-channel-select) : prépare la sélection de circuits côté console.
- [`eos_channel_get_info`](tools.md#eos-channel-get-info) : audite les niveaux en cours avant `Record`.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_channel_select",
  "arguments": {
    "channels": [101, 102, 201],
    "exclusive": true
  }
}
```

> 💡 Chaînez immédiatement `eos_channel_get_info` pour journaliser les niveaux retournés dans votre orchestrateur.

### Commandes OSC commentées
```bash
# Sélection exclusive des canaux 101, 102 et 201
oscsend 127.0.0.1 8001 /eos/cmd s:'Chan 101 Thru 102 + 201 Enter'

# Lecture des informations de niveau sur les mêmes canaux
oscsend 127.0.0.1 8001 /eos/get/channels s:'{"channels":[101,102,201]}'
```

### Astuces d'intégration
- Stockez le résultat `structuredContent.channels` de `eos_channel_get_info` pour garder une trace des niveaux au moment du `Record`.
- Combinez cette étape avec une validation humaine (« OK pour enregistrer ? ») dans votre chatbot afin de respecter les procédures de plateau.

## Capturer et rappeler une palette couleur

### Objectif
Automatiser la préparation ou le rappel d'une palette couleur avant un `Record Palette`.

### Check-list
- [ ] Sélectionner les circuits et attributs concernés (p. 172–174).
- [ ] Confirmer le type de palette (`Color`, `Focus`, etc.) et les options associées (p. 228–229).
- [ ] Vérifier les valeurs capturées en Live avant l'enregistrement (p. 230–233).

> 📘 **Référence Eos** : [Palettes : enregistrement et rappel (p. 228–235)](manual://eos#palettes-live)

### Outils MCP mobilisés
- [`eos_palette_get_info`](tools.md#eos-palette-get-info) : audit d'une palette existante.
- [`eos_color_palette_fire`](tools.md#eos-color-palette-fire) : rappel immédiat d'une palette couleur.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_palette_get_info",
  "arguments": {
    "palette_type": "cp",
    "palette_number": 21
  }
}
```

> 💡 Vérifiez le champ `absolute` dans la réponse pour confirmer si la palette référence encore des presets (p. 229).

### Commandes OSC commentées
```bash
# Audit de la palette couleur 21
oscsend 127.0.0.1 8001 /eos/get/palette s:'{"palette_type":"cp","palette_number":21}'

# Rappel immédiat de la palette couleur 21
oscsend 127.0.0.1 8001 /eos/cp/fire s:'{"palette_number":21}'
```

### Astuces d'intégration
- Ajoutez une étape automatique pour vérifier que les circuits LED sont bien sélectionnés avant d'afficher la fenêtre `Record Palette`.
- Exploitez la réponse JSON pour générer une fiche rappelant les canaux et le mode (absolu/relatif) avant de déclencher un `Record` manuel.

## Enregistrer et vérifier un preset

### Objectif
Préparer un preset à enregistrer ou à rappeler en orchestrant les vérifications recommandées par le manuel.

### Check-list
- [ ] Relire les options de preset (mode absolu/relatif, attributs inclus) avant enregistrement (p. 242–243).
- [ ] Confirmer la sélection de canaux et les niveaux prévus (p. 244–246).
- [ ] Nettoyer les circuits superflus via `Delete` ou `Record Only` si besoin (p. 250).

> 📘 **Référence Eos** : [Presets : enregistrement et rappel (p. 242–247)](manual://eos#presets-live)

### Outils MCP mobilisés
- [`eos_preset_get_info`](tools.md#eos-preset-get-info) : contrôle des contenus avant modification.
- [`eos_preset_select`](tools.md#eos-preset-select) : préparation du preset sur le clavier virtuel.
- [`eos_preset_fire`](tools.md#eos-preset-fire) : rappel immédiat une fois validé.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_preset_get_info",
  "arguments": {
    "preset_number": 12,
    "fields": ["label", "channels", "effects"]
  }
}
```

> 💡 Utilisez `fields` pour limiter la taille de la réponse si vous affichez le résultat dans une interface de supervision.

### Commandes OSC commentées
```bash
# Inspection du preset 12
oscsend 127.0.0.1 8001 /eos/get/preset s:'{"preset_number":12}'

# Préparation du preset 12 sur le clavier virtuel
oscsend 127.0.0.1 8001 /eos/preset s:'{"preset_number":12}'

# Rappel immédiat du preset 12
oscsend 127.0.0.1 8001 /eos/preset/fire s:'{"preset_number":12}'
```

### Astuces d'intégration
- Programmez un résumé automatique (label, canaux, effets) à afficher au pupitreur avant l'enregistrement.
- Archivez la réponse `structuredContent` pour retracer l'historique de vos presets et faciliter les retours arrière.

## Déclencher et rattraper une cue

### Objectif
Assurer un top lumière depuis un LLM ou un workflow d'automatisation, tout en gardant la main pour annuler/rattraper immédiatement si nécessaire.

### Check-list
- [ ] Identifier la cuelist active et son mode d'enregistrement (p. 255–258).
- [ ] Vérifier les temps, follows et attributs associés à la cue cible (p. 261–264, p. 269).
- [ ] Contrôler le Playback Status Display ou les faders assignés avant de lancer le GO (p. 323–326).

> 📘 **Référence Eos** :
> - [Temps & attributs de cue (p. 261–269)](manual://eos#cue-timing)
> - [Restitution des cues (p. 315–328)](manual://eos#cue-playback)

### Outils MCP mobilisés
- [`eos_cue_go`](tools.md#eos-cue-go) : lance la prochaine cue d'une liste.
- [`eos_cue_stop_back`](tools.md#eos-cue-stop-back) : stoppe ou recule la lecture en cours.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_cue_go",
  "arguments": {
    "cuelist_number": 1
  }
}
```

> 💡 Ajustez `cuelist_number` pour cibler la liste pertinente et tracez l'appel via un identifiant de conversation dans votre orchestrateur.

### Commandes OSC commentées
```bash
# GO sur la liste 1 (port UDP sortant par défaut : 8001)
oscsend 127.0.0.1 8001 /eos/cue/1/go s:'{"cuelist_number":1}'

# STOP/BACK sur la même liste pour annuler le top
oscsend 127.0.0.1 8001 /eos/cue/1/stop_back s:'{"cuelist_number":1}'
```

### Astuces d'intégration
- Encapsulez `eos_cue_go` dans une commande « safe » (double confirmation, timer de sécurité) pour éviter tout déclenchement intempestif.
- Connectez un webhook de monitoring sur le log `ToolExecutionResult` pour tracer qui a déclenché le GO et à quelle heure.

## Ajuster l'intensité en live

### Objectif
Réaliser un « fade » rapide ou un ajustement ponctuel de niveau depuis un assistant conversationnel sans ouvrir le clavier physique.

### Check-list
- [ ] Sélectionner les circuits visés avant l'ajustement (p. 172–174).
- [ ] Confirmer la valeur cible ou utiliser `Sneak` pour un retour progressif (p. 177, p. 201).
- [ ] Vérifier que les circuits ne sont pas capturés ou exclus d'un Master (p. 310, p. 376).

> 📘 **Référence Eos** : [Sélection de circuits & intensité (p. 172–178)](manual://eos#selection-circuits)

### Outil MCP mobilisé
- [`eos_channel_set_level`](tools.md#eos-channel-set-level) : fixe la valeur (0–100 %) d'un canal.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_channel_set_level",
  "arguments": {
    "channels": [101, 102],
    "level": 65
  }
}
```

> 💡 Fournissez une plage (`"101-110"`) pour piloter une rampe complète ou utilisez `"FULL"`/`"OUT"` pour appliquer les raccourcis mentionnés dans le manuel (p. 197).

### Commande OSC commentée
```bash
# Mise à 65 % des canaux 101 et 102
oscsend 127.0.0.1 8001 /eos/cmd s:"Chan 101 Thru 102 Sneak 65 Enter"
```

### Astuces d'intégration
- Combinez cette recette avec `eos_group_set_level` si vous pilotez des groupes plutôt que des canaux individuels.
- Pour animer un fade, déclenchez plusieurs appels `eos_channel_set_level` espacés dans le temps (par exemple via un workflow n8n) en ajustant la valeur progressivement.

## Piloter la ligne de commande EOS

### Objectif
Envoyer rapidement une commande texte (ex. `Record`, `Update`) ou reconstituer un gabarit avec substitutions.

### Check-list
- [ ] Vérifier que l'utilisateur cible est correct (User 1/2/3…).
- [ ] Ajouter `#` si la commande doit être validée immédiatement.
- [ ] Nettoyer la ligne si besoin via `eos_new_command` (dernier recours si aucun outil dédié n'existe).

> 📘 **Référence Eos** : [Ligne de commande (p. 150–156)](manual://eos#command-line)

### Outils MCP mobilisés
- [`eos_command`](tools.md#eos-command) : envoie un texte sur la ligne de commande.
- [`eos_new_command`](tools.md#eos-new-command) : efface puis envoie un texte sur la ligne de commande.
- [`eos_command_with_substitution`](tools.md#eos-command-with-substitution) : applique un gabarit `Chan %1 At %2`.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_command_with_substitution",
  "arguments": {
    "template": "Chan %1 At %2#",
    "values": [101, 75]
  }
}
```

### Commande OSC commentée
```bash
# Envoi d'une commande directe
oscsend 127.0.0.1 8001 /eos/cmd s:"Record Cue 2/12#"
```

### Astuces d'intégration
- Utilisez `terminateWithEnter: true` pour automatiser la validation sans ajouter `#` dans la chaîne.
- Enregistrez l'utilisateur courant via `session_set_current_user` pour éviter de répéter `user`.

## Simuler une touche ou une softkey

### Objectif
Déclencher un appui virtuel sur une touche matérielle ou une softkey avec retour d'état.

### Check-list
- [ ] Identifier la touche exacte (`go`, `stop`, `record`, etc.).
- [ ] En cas de softkey, récupérer d'abord les libellés affichés.

> 📘 **Référence Eos** : [Clavier & softkeys (p. 130–138)](manual://eos#keyboard-softkeys)

### Outils MCP mobilisés
- [`eos_get_softkey_labels`](tools.md#eos-get-softkey-labels) : lit les libellés softkey.
- [`eos_key_press`](tools.md#eos-key-press) : simule l'appui d'une touche.
- [`eos_softkey_press`](tools.md#eos-softkey-press) : simule l'appui d'une softkey.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_key_press",
  "arguments": {
    "key_name": "go",
    "state": 1
  }
}
```

### Commande OSC commentée
```bash
# Appui sur la softkey 5
oscsend 127.0.0.1 8001 /eos/key/softkey5 f:1
```

### Astuces d'intégration
- Envoyez `state: 0` pour simuler un relâchement si votre surface nécessite un comportement "momentary".
- Exploitez les libellés softkey pour afficher un menu contextuel dans votre UI.

## Diagnostiquer la liaison OSC

### Objectif
Valider que la console répond et mesurer la latence avant un scénario critique.

### Check-list
- [ ] S'assurer que l'adresse IP/port cible est correct.
- [ ] Inspecter le délai aller-retour et l'echo retourné.

### Outil MCP mobilisé
- [`eos_ping`](tools.md#eos-ping) : envoie un ping OSC et retourne un statut.

### Requête MCP (JSON)
```json
{
  "type": "call_tool",
  "tool": "eos_ping",
  "arguments": {
    "message": "healthcheck"
  }
}
```

### Commande OSC commentée
```bash
oscsend 127.0.0.1 8001 /eos/ping s:"healthcheck"
```

### Astuces d'intégration
- Utilisez `transportPreference` pour forcer UDP/TCP selon le réseau (ex. `"speed"` pour UDP).
- Ajoutez un ping avant tout enchaînement automatisé sensible (top lumière, blackout).

## Ressources complémentaires
- Les commandes CLI générées automatiquement sont disponibles dans [`docs/tools.md`](tools.md) pour chaque outil.
- Ajoutez des validations côté LLM (ex. : confirmation vocale) avant d'exécuter une commande critique.
- Utilisez les champs `targetAddress` / `targetPort` lorsque le serveur MCP doit router des messages vers une console distante spécifique.
- Pour affiner le choix du transport OSC lors des requêtes JSON, ajoutez `transportPreference` (`"reliability"`, `"speed"` ou `"auto"`) et, si besoin, un `toolId` personnalisé : ces options sont transmises au client OSC pour sélectionner le canal TCP/UDP adéquat.
