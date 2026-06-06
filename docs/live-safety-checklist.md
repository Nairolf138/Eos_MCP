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
