# Dépannage OSC Eos

Ce guide aide l'opérateur et l'assistant à diagnostiquer une liaison OSC entre Eos MCP et une console ETC Eos, Eos Nomad ou une session offline. Il doit être utilisé avant de supposer un problème applicatif : une lecture Eos incomplète indique souvent une configuration OSC, réseau ou firewall à corriger.

## Checklist de diagnostic

Validez chaque point dans l'ordre, puis relancez `eos_readiness_check` avant toute action métier.

- [ ] **Version EOS** : noter la version exacte d'Eos/Nomad et confirmer qu'elle supporte les lectures OSC/JSON attendues par le serveur.
- [ ] **OSC RX/TX** : dans Eos, vérifier que la réception OSC (RX) et l'émission OSC (TX) sont activées. Une configuration uniquement RX permet d'envoyer des commandes mais empêche les lectures fiables.
- [ ] **IP TX** : contrôler que l'adresse IP de destination TX configurée dans Eos pointe vers la machine qui exécute Eos MCP, et non vers une ancienne station, une interface virtuelle ou `127.0.0.1` sauf si tout tourne localement.
- [ ] **Ports UDP/TCP** : confirmer les ports OSC configurés côté Eos et côté Eos MCP. Vérifier séparément le port d'entrée Eos, le port de retour TX et les éventuels ports TCP/HTTP de la passerelle.
- [ ] **Firewall** : autoriser le trafic entrant et sortant sur les ports OSC/UDP et sur les ports TCP utilisés par la passerelle. Tester aussi les règles antivirus/EDR et les profils réseau privés/publics.
- [ ] **Interface réseau** : sélectionner l'interface connectée au réseau régie, désactiver ou prioriser correctement les interfaces VPN, Wi-Fi invité, Docker/VM et adaptateurs virtuels qui pourraient capter la route.
- [ ] **Nomad offline vs console** : distinguer une session Nomad offline d'une console matérielle. En offline, certaines lectures ou retours live peuvent être absents, simulés ou dépendants de la configuration locale.
- [ ] **Mode legacy** : identifier si Eos MCP fonctionne en mode legacy/non confirmé. Dans ce cas, les lectures JSON peuvent être indisponibles; ne pas interpréter un timeout comme une donnée métier vide.
- [ ] **Test ping** : depuis la machine Eos MCP, pinger l'adresse de la console ou de Nomad. Si ICMP est bloqué par politique réseau, documenter cette limitation et tester tout de même les ports applicatifs.
- [ ] **Test show name** : lancer une lecture read-only du nom de show. Un échec indique souvent un problème TX, port de retour, firewall ou mode legacy.
- [ ] **Test count** : lancer une lecture read-only de type count (cues, channels ou patch selon les outils disponibles). Comparer la réponse avec le show ouvert, sans inventer les valeurs manquantes.
- [ ] **Test patch** : lire un canal de patch connu et documenté par l'opérateur. Si le canal n'est pas connu ou si la lecture échoue, marquer le patch comme inconnu.

## Procédure recommandée pour l'assistant

1. Annoncer que le diagnostic reste read-only et qu'aucune modification de show ne sera envoyée.
2. Appeler `eos_readiness_check`, idéalement avec un `patchChannel` fourni par l'opérateur si un canal connu existe.
3. Restituer les statuts techniques (`overall_status`, `transport_status`, `handshake_mode`, `json_read_supported`, `failed_checks`, `operator_actions`) sans les transformer en suppositions métier.
4. Demander à l'opérateur de corriger les points de checklist encore bloquants.
5. Relancer les tests read-only avant de proposer un dry-run ou une action réelle.

## Quand utiliser le fallback showfile

Le fallback showfile consiste à utiliser un fichier de show, un export ou une source documentaire fournie par l'opérateur pour répondre à une question lorsque la lecture live OSC n'est pas disponible ou pas fiable.

Utilisez ce fallback uniquement si toutes les conditions suivantes sont réunies :

- la lecture OSC live a échoué, est incomplète, ou indique `json_read_supported=false` / mode legacy non confirmé;
- l'opérateur fournit explicitement le fichier, l'export ou l'emplacement de la source à analyser;
- l'opérateur autorise explicitement l'usage du fallback showfile pour cette demande précise;
- la réponse indique clairement que la source est non-live, potentiellement obsolète, et distincte de l'état actuel de la console;
- aucune modification live n'est déclenchée à partir de ces données sans nouveau dry-run et confirmation explicite.

Formulation recommandée : « La lecture OSC live n'est pas confirmée. Avec votre autorisation explicite, je peux utiliser le showfile fourni comme source non-live pour répondre, en signalant ses limites. M'autorisez-vous à utiliser ce fallback showfile pour cette demande ? »

## Ce que l'assistant ne doit pas faire

- Ne pas demander ni utiliser de capture écran pour contourner une lecture OSC défaillante, sauf demande explicite de l'opérateur et avec mention que cette source est manuelle, partielle et non-live.
- Ne pas basculer implicitement vers Windows-MCP, un contrôle distant de poste, un export local ou tout autre outil externe sans autorisation explicite.
- Ne pas inventer de patch, de cues, de counts, de labels, d'adresses DMX ou d'état de show lorsque les lectures OSC échouent ou sont incomplètes.
- Ne pas masquer un échec de lecture en présentant des valeurs par défaut, des exemples ou des hypothèses comme des données réelles.
- Ne pas envoyer d'action de programmation, de GO, de patch ou de commande texte pendant le diagnostic, sauf après dry-run et confirmation explicite de l'opérateur.
