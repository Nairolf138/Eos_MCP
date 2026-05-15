# Tests end-to-end MCP/EOS

Ce projet contient une suite e2e HTTP + OSC dédiée dans `src/server/__tests__/mcp-e2e.test.ts`.
Elle valide le serveur MCP comme un client réel, sans réutiliser directement les handlers d'outils.

## Architecture du test

La suite démarre trois briques isolées :

1. **Simulateur OSC EOS minimal**
   - écoute en UDP sur `127.0.0.1` avec un port dynamique ;
   - décode les paquets OSC en mode `metadata: true` ;
   - répond aux adresses de base :
     - `/eos/handshake` ;
     - `/eos/protocol/select` ;
     - `/eos/ping` ;
     - `/eos/get/cue/list` ;
     - `/eos/dmx/address/select` ;
     - `/eos/get/*` générique pour les lectures JSON ;
   - journalise les messages reçus pour vérifier les commandes finales envoyées à EOS.
2. **Passerelle OSC de test**
   - fournit l'interface `OscGateway` attendue par le client OSC applicatif ;
   - envoie réellement les datagrammes OSC au simulateur UDP ;
   - réémet les réponses du simulateur vers les awaiters du client OSC ;
   - expose un `OscConnectionStateProvider` connecté pour tester `/health` et les capabilities.
3. **Serveur HTTP MCP**
   - démarre avec `createHttpGateway` sur un port dynamique ;
   - enregistre les outils réels du projet ;
   - reçoit des appels JSON-RPC sur `/mcp` et des appels REST sur `/tools`.

## Scénarios couverts

Le test `runs a full MCP flow over HTTP against the EOS OSC simulator` couvre :

- initialisation MCP via `/mcp` (`initialize`) ;
- catalogue REST `/tools` ;
- catalogue MCP `tools/list` ;
- connexion EOS (`eos_connect`) avec handshake + sélection de protocole ;
- capabilities (`eos_capabilities_get`) ;
- record de cue via workflow (`eos_workflow_create_cue_series`) ;
- update de cue via workflow (`eos_workflow_update_cue_look`) ;
- GO (`eos_cue_go`) ;
- patch fixture (`eos_workflow_patch_fixture`) ;
- lecture/sélection DMX (`eos_address_select`) ;
- déclenchement de macro (`eos_macro_fire`) ;
- fermeture propre de session MCP (`DELETE /mcp`).

## Exécuter la suite

```bash
npx jest src/server/__tests__/mcp-e2e.test.ts --runInBand
```

La suite utilise des ports dynamiques et ne nécessite pas de console EOS réelle.

## Ajouter un scénario

Pour ajouter un scénario :

1. Ajoutez au simulateur une réponse réaliste dans `MinimalEosOscSimulator.respond`.
   - Utilisez l'adresse OSC réelle depuis `oscMappings` quand elle existe.
   - Renvoyez un objet JSON contenant au minimum `status: 'ok'` pour les endpoints de lecture.
2. Ajoutez un appel via `callTool(sessionId, '<nom_outil>', args)` dans le test e2e.
3. Vérifiez à deux niveaux :
   - la réponse MCP finale (`structuredContent`, `content[0].text`, statut) ;
   - le flux OSC observé par `simulator.received` quand l'outil doit envoyer une commande.
4. Gardez les timeouts courts (`500 ms` environ) lorsque le scénario attend une réponse du simulateur.
5. Préférez les ports dynamiques et ne dépendez jamais de l'environnement local du développeur.

## Brancher une vraie console EOS en laboratoire

Le simulateur est volontairement minimal. Pour un test de laboratoire avec une vraie console :

1. Créez un fichier de test séparé, par exemple `src/server/__tests__/mcp-lab.integration.test.ts`, afin de ne pas rendre la CI dépendante du matériel.
2. Remplacez `MinimalEosOscSimulator` et `UdpOscTestGateway` par `createOscConnectionGateway` configuré avec :
   - `host` : adresse IP de la console ;
   - `udpPort` : port OSC entrant de la console ;
   - `localPort` : port local autorisé par le réseau labo ;
   - `tcpPort` : port TCP OSC si le labo le valide.
3. Protégez le test avec une variable explicite, par exemple `EOS_MCP_LAB_CONSOLE=1`, et ignorez-le sinon.
4. Dédiez un showfile de laboratoire contenant des cues, macros et adresses DMX non critiques.
5. Ajoutez un nettoyage après test : retour au black-out/état sûr, reset de ligne de commande, et fermeture des sessions MCP.
6. Ne faites jamais tourner ces tests contre une console en production ou en répétition sans validation humaine.

## Bonnes pratiques de données de test

- Utilisez des canaux, cues, macros et adresses réservés au test (`Chan 101`, `Cue 1/1`, `Macro 7`, `1/101`).
- Les réponses JSON doivent ressembler à ce qu'une console EOS renvoie réellement, mais rester compactes.
- Ajoutez seulement les champs dont le mapper ou l'assertion a besoin.
- Lorsqu'un outil envoie une commande destructive ou sensible, gardez `require_confirmation: true` dans le scénario e2e pour tester le chemin d'exécution réel.

## Capturer de nouvelles trames OSC de conformance

Les tests de conformance EOS (`src/services/osc/__tests__/eos-conformance.integration.test.ts`) rejouent des trames enregistrées dans `src/services/osc/__tests__/fixtures/eos-conformance.frames.json`. Utilisez cette procédure pour enrichir le fixture depuis EOS Nomad ou une console physique sans rendre la CI dépendante d'une console live.

### Préparer EOS Nomad ou la console

1. Chargez un showfile de laboratoire, jamais un show de production. Réservez des objets explicites (`Cue 1`, `Group 7`, `Chan 101`, utilisateur OSC de test).
2. Activez OSC RX/TX dans EOS et notez :
   - l'adresse IP de la console/Nomad ;
   - le port UDP entrant EOS ;
   - le port UDP local utilisé par le client de capture ;
   - la version EOS exacte affichée par About/Diagnostics.
3. Isolez le réseau si vous utilisez une console physique : pas de capture pendant une répétition, pas d'envoi de commande destructive, et validation humaine avant tout test sensible.

### Capturer depuis EOS Nomad

1. Démarrez Nomad avec le showfile de laboratoire et OSC activé.
2. Lancez une capture réseau sur l'interface loopback ou l'interface du réseau Nomad, par exemple avec Wireshark/tcpdump en filtrant les ports OSC UDP configurés.
3. Depuis le MCP ou un petit client OSC, envoyez un seul endpoint par capture :
   - `/eos/get/cue/count` pour `get/count` ;
   - `/eos/get/group/list` pour `get/list` ;
   - `/eos/get/patch/chan_info` avec `{ "channel": 101, "part": 1 }` ;
   - `/eos/get/show/name` ;
   - `/eos/get/version` ;
   - `/eos/get/cmd_line` avec `{}` ou `{ "user": 3 }`.
4. Exportez pour chaque paire requête/réponse : adresse OSC, typetags, arguments décodés, payload JSON et octets bruts hexadécimaux.
5. Vérifiez si la réponse arrive sur l'adresse directe (`/eos/get/...`) ou sur une variante `/eos/out/...`; notez cette variante dans `docs/osc-coverage.md`.

### Capturer depuis une console physique

1. Branchez la machine de capture sur le même VLAN que la console et synchronisez l'heure système pour corréler pcap et logs.
2. Utilisez un showfile de test local à la console. Sauvegardez-le avant la session de capture.
3. Démarrez la capture pcap avant l'envoi de la requête et arrêtez-la immédiatement après la réponse pour limiter les données collectées.
4. N'envoyez que des requêtes de lecture pour les fixtures de conformance. Pour les commandes (`cmd_line`), préparez la ligne de commande avec une commande non destructive puis capturez uniquement la lecture `/eos/get/cmd_line`.
5. Anonymisez les noms de show, labels ou notes qui révèlent un client/projet, mais conservez la structure JSON réelle et la version EOS.

### Ajouter la trame au fixture

1. Ajoutez un objet dans `eos-conformance.frames.json` avec :
   - `id` stable incluant la famille, la variante et la version EOS ;
   - `family`, `tool`, `toolArgs` ;
   - `requestFrame.source` et `responseFrame.source` pointant vers le pcap/log de laboratoire ;
   - `hex` et `decoded` pour la requête et la réponse ;
   - `expectedStructuredContent` limité aux champs normalisés que l'outil doit garantir.
2. Rejouez la suite hors ligne :

```bash
npx jest src/services/osc/__tests__/eos-conformance.integration.test.ts --runInBand
```

3. Mettez à jour la matrice `docs/osc-coverage.md` si la version EOS, l'adresse de réponse ou le statut supporté change.
4. Ne committez pas les fichiers `.pcap` bruts sauf décision explicite du mainteneur ; conservez plutôt leurs références stables dans un stockage de laboratoire ou des logs synthétiques approuvés.
