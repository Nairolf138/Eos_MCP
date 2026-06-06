# Checklist de sécurité live

Cette checklist doit être relue avant toute connexion d'Eos MCP à une console Eos de production ou à un réseau lumière utilisé en répétition, balance, filage ou représentation.

## Avant toute commande live

- [ ] Tester d'abord le scénario avec **Eos Nomad** ou en mode **offline**, sans console de production connectée.
- [ ] Vérifier l'adresse IP de la console et confirmer que `OSC_REMOTE_ADDRESS` pointe vers la bonne machine.
- [ ] Vérifier les ports OSC côté Eos et côté Eos MCP (`OSC_UDP_OUT_PORT`, `OSC_UDP_IN_PORT`) ainsi que les règles firewall UDP associées.
- [ ] Activer le **mode strict** afin de bloquer les commandes ambiguës, incomplètes ou non conformes à la politique d'exploitation.
- [ ] Activer les **confirmations** pour empêcher toute exécution réelle sans validation explicite.
- [ ] Utiliser `dry_run` pour tous les workflows avant exécution, puis comparer la prévisualisation avec l'intention opérateur.
- [ ] Ne pas exposer le serveur MCP publiquement sur Internet ou sur un réseau non maîtrisé.
- [ ] Ne pas créer de bridge entre Wi-Fi et Ethernet, et ne pas activer le partage Internet entre le réseau bureautique et le réseau lumière.
- [ ] Sauvegarder le show avant les tests afin de pouvoir revenir rapidement à l'état précédent.
- [ ] Prévenir l'opérateur console avant toute commande live et attendre son accord explicite.

## Commandes dangereuses

Les commandes suivantes sont considérées comme **dangereuses en live**. Elles doivent toujours respecter le pattern **Plan → dry-run → confirmation → exécution**, avec validation par l'opérateur console :

- **Go** : déclenchement de cue ou d'état scénique visible.
- **Record** : écriture ou remplacement de données du show.
- **Update** : modification de cues, presets, palettes ou états enregistrés.
- **Delete** : suppression d'éléments du show.
- **Patch** : modification du patch, des adresses, des types de projecteurs ou des affectations.
- **Macro Fire** : déclenchement de macro pouvant chaîner plusieurs actions.
- **Submaster** : changement de niveau, flash ou contrôle de submaster.
- **Park** : forçage ou libération d'états parkés.
- **Commande texte libre** : toute commande envoyée sous forme textuelle non spécialisée, car son effet dépend directement de l'interpréteur Eos.

En cas de doute sur l'effet d'une commande, rester en `dry_run`, demander une confirmation humaine et ne jamais exécuter pendant un moment critique du show.

## Matrice centralisée de sécurité des outils

La classification de sécurité est définie dans `src/tools/toolSafety.ts` et recopiée dans les métadonnées MCP de chaque outil lors de l'enregistrement. Elle est ensuite appliquée par le registre d'outils avant l'appel du handler : refus en `EOS_READ_ONLY`, refus en `EOS_STRICT_MODE`, contrôle du profil accordé, confirmation explicite et injection éventuelle de `dry_run` par défaut.

| `riskLevel` | Usage typique | `requiresConfirmation` | `allowedInReadOnly` | `allowedInStrictMode` | `defaultDryRun` |
| --- | --- | --- | --- | --- | --- |
| `read` | Lecture, diagnostic, découverte, état mémorisé ou requête sans modification attendue. | `false` | `true` | `true` si tous les endpoints OSC associés sont autorisés par le mode strict ; sinon `false`. | `false` |
| `preview` | Préparation ou calcul local sans effet direct sur la console. | `false` | `true` | `true` si aucun endpoint non strict n'est nécessaire. | `false` |
| `live` | Déclenchement ou contrôle visible en live, par exemple `Go`, `Fire`, faders, bump ou niveaux temporaires. | `true` | `false` | `true` uniquement si les mappings OSC sont strictement autorisés. | `true` quand l'outil expose `dry_run`. |
| `show-modifying` | Modification du show : record, update, labels, palettes, presets, groupes, submasters, workflows ou programmation. | `true` | `false` | `true` uniquement si les mappings OSC sont strictement autorisés. | `true` quand l'outil expose `dry_run`. |
| `dangerous` | Commande texte libre, reset, import showfile, patch ou opérations administratives à effet large. | `true` | `false` | `true` uniquement si les mappings OSC sont strictement autorisés. | `true` quand l'outil expose `dry_run`. |

Règles d'exécution associées :

1. `EOS_READ_ONLY=true` bloque tout outil dont `allowedInReadOnly=false`, même si le profil client est élevé.
2. `EOS_STRICT_MODE=true` bloque tout outil dont `allowedInStrictMode=false`, avant l'envoi OSC.
3. Les risques `live`, `show-modifying` et `dangerous` exigent une confirmation explicite (`confirm=true`, `require_confirmation=true` ou `safety_level` défini) pour une exécution réelle.
4. Quand `defaultDryRun=true`, que l'outil déclare `dry_run` dans son schéma et qu'aucune confirmation explicite n'est fournie, le registre ajoute `dry_run=true` avant d'appeler le handler afin de produire une prévisualisation au lieu d'une action réelle.
5. Le profil MCP accordé (`read_only`, `programming`, `live_playback`, `admin`) reste requis pour l'exécution réelle ; une prévisualisation `dry_run=true` ne déclenche pas d'envoi OSC.
