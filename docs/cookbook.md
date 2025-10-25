# Cookbook d'automatisation Eos MCP

Ce guide rassemble des scénarios prêts à l'emploi pour piloter la console ETC Eos via la passerelle MCP. Chaque section combine un rappel métier, un exemple JSON directement exploitable dans un client MCP et la commande OSC correspondante (commentée) pour vos tests manuels. Les fiches d'outils détaillées sont disponibles dans [docs/tools.md](tools.md) ; les ancres sont rappelées ci-dessous pour passer rapidement de la recette à la référence complète.

## Déclencher et rattraper une cue

### Objectif
Assurer un top lumière depuis un LLM ou un workflow d'automatisation, tout en gardant la main pour annuler/rattraper immédiatement si nécessaire.

### Outils MCP mobilisés
- [`eos_cue_go`](tools.md#eos-cue-go) : lance la prochaine cue d'une liste.
- [`eos_cue_stop_back`](tools.md#eos-cue-stop-back) : stoppe la lecture en cours ou revient à la cue précédente.

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

> 💡 Ajustez `cuelist_number` si vous utilisez plusieurs listes dans le show. Combinez cette requête avec un ID de conversation côté LLM pour tracer vos déclenchements.

### Commandes OSC commentées
```bash
# GO sur la liste 1 (port UDP sortant par défaut : 8001)
oscsend 127.0.0.1 8001 /eos/cue/1/go s:'{"cuelist_number":1}'

# STOP/BACK sur la même liste pour annuler le top
oscsend 127.0.0.1 8001 /eos/cue/1/stop_back s:'{"cuelist_number":1}'
```

### Astuces d'intégration
- Encapsulez `eos_cue_go` dans une commande « safe » côté LLM : demandez une confirmation écrite avant l'appel final.
- Connectez un webhook de monitoring sur le log `ToolExecutionResult` pour tracer qui a déclenché le GO et à quelle heure.

## Orchestrer vos presets

### Objectif
Rappeler, présélectionner ou auditer un preset lumière pour préparer un tableau sans casser la balance actuelle.

### Outils MCP mobilisés
- [`eos_preset_get_info`](tools.md#eos-preset-get-info) : récupère label, niveaux et métadonnées du preset.
- [`eos_preset_select`](tools.md#eos-preset-select) : prépare le preset sur le clavier virtuel Eos.
- [`eos_preset_fire`](tools.md#eos-preset-fire) : applique immédiatement le preset aux canaux concernés.

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

> 💡 Débutez toujours par `eos_preset_get_info` pour vérifier l'état avant rappel. Les champs optionnels permettent de limiter la taille de la réponse si vous intégrez le résultat dans une interface.

### Commandes OSC commentées
```bash
# Inspection du preset 12 (réponse JSON renvoyée sur le port UDP entrant du serveur MCP)
oscsend 127.0.0.1 8001 /eos/preset/info s:'{"preset_number":12}'

# Mise en sélection du preset 12 pour prévisualiser au clavier
oscsend 127.0.0.1 8001 /eos/preset/12/select s:'{"preset_number":12}'

# Rappel immédiat du preset 12 sur scène
oscsend 127.0.0.1 8001 /eos/preset/12/fire s:'{"preset_number":12}'
```

### Astuces d'intégration
- Enchaînez la sélection (`select`) puis le rappel (`fire`) dans un même script MCP si vous souhaitez valider la balance avec un opérateur avant application.
- Enregistrez la réponse de `eos_preset_get_info` pour alimenter vos fiches régie ou générer un rapport de focale.

## Ajuster l'intensité en live

### Objectif
Réaliser un « fade » rapide ou un ajustement ponctuel de niveau depuis un assistant conversationnel sans ouvrir le clavier physique.

### Outil MCP mobilisé
- [`eos_channel_set_level`](tools.md#eos-channel-set-level) : fixe la valeur (0–100 %) d'un canal.

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

> 💡 Vous pouvez fournir un seul canal (`"channels": 101`) ou une plage (`"channels": "101-110"`) selon vos besoins. Le champ `level` accepte une valeur numérique ou des mots-clés (`"FULL"`, `"OUT"`).

### Commande OSC commentée
```bash
# Mise à 65 % des canaux 101 et 102
oscsend 127.0.0.1 8001 /eos/cmd s:"Chan 101 Thru 102 Sneak 65 Enter"
```

### Astuces d'intégration
- Combinez cette recette avec `eos_group_set_level` si vous pilotez des groupes plutôt que des canaux individuels.
- Pour animer un fade, déclenchez plusieurs appels `eos_channel_set_level` espacés dans le temps (par exemple via un workflow n8n) en ajustant la valeur progressivement.

## Aller plus loin
- Les commandes CLI générées automatiquement sont disponibles dans [`docs/tools.md`](tools.md) pour chaque outil.
- Ajoutez des validations côté LLM (ex. : confirmation vocale) avant d'exécuter une commande critique.
- Utilisez les champs `targetAddress` / `targetPort` lorsque le serveur MCP doit router des messages vers une console distante spécifique.
- Pour affiner le choix du transport OSC lors des requêtes JSON, ajoutez `transportPreference` (`"reliability"`, `"speed"` ou `"auto"`) et, si besoin, un `toolId` personnalisé : ces options sont transmises au client OSC pour sélectionner le canal TCP/UDP adéquat.
