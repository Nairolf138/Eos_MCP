# Cookbook d'automatisation Eos MCP

Ce guide rassemble des scénarios prêts à l'emploi pour piloter la console ETC Eos via la passerelle MCP. Chaque fiche combine un rappel métier, un exemple JSON, la commande OSC correspondante et un encart « Référence Eos » pointant vers la bonne section du manuel (`docs/eos_serie.pdf`). Consultez également [docs/tools.md](tools.md) pour les schémas complets de chaque outil MCP.

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
oscsend 127.0.0.1 8001 /eos/get/channel s:'{"channels":[101,102,201]}'
```

### Astuces d'intégration
- Stockez le résultat `structuredContent.channels` de `eos_channel_get_info` pour garder une trace des niveaux au moment du `Record`.
- Combinez cette étape avec une validation humaine (« OK pour enregistrer ? ») dans votre chatbot afin de respecter les procédures de plateau.

## Capturer et rappeler une palette couleur

### Objectif
Automatiser la préparation ou le rappel d'une palette couleur tout en respectant les prérequis du manuel avant un `Record Palette`.

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

## Ressources complémentaires
- Les commandes CLI générées automatiquement sont disponibles dans [`docs/tools.md`](tools.md) pour chaque outil.
- Ajoutez des validations côté LLM (ex. : confirmation vocale) avant d'exécuter une commande critique.
- Utilisez les champs `targetAddress` / `targetPort` lorsque le serveur MCP doit router des messages vers une console distante spécifique.
- Pour affiner le choix du transport OSC lors des requêtes JSON, ajoutez `transportPreference` (`"reliability"`, `"speed"` ou `"auto"`) et, si besoin, un `toolId` personnalisé : ces options sont transmises au client OSC pour sélectionner le canal TCP/UDP adéquat.
