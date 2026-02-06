# Configuration de la journalisation

Cette application s'appuie sur [Pino](https://getpino.io/) pour la journalisation. La configuration est pilotée par des variables d'environnement validées dans `src/config/index.ts`. Les paramètres suivants permettent d'ajuster le niveau, le format et la destination des logs.

## Niveau de log

- `LOG_LEVEL` : niveau Pino parmi `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. Valeur par défaut : `info`.

Le niveau s'applique à l'ensemble des destinations configurées.

## Destinations disponibles

- `LOG_DESTINATIONS` : liste de destinations séparées par des virgules parmi `stdout`, `stderr`, `file`, `transport`. Valeur par défaut : `file`.

En environnement de développement (`NODE_ENV` différent de `production`), la destination `stdout` est automatiquement ajoutée lorsque `LOG_DESTINATIONS` n'est pas définie explicitement. Pour préserver le canal STDOUT réservé au protocole MCP, cette valeur est immédiatement convertie en destination `stderr` par la phase de chargement de la configuration. Les logs restent visibles dans la console sans configuration additionnelle. Pour désactiver cette sortie, définissez `LOG_DESTINATIONS=file`. Vous pouvez aussi combiner plusieurs destinations en les listant, par exemple `LOG_DESTINATIONS=stdout,file` (redirigé vers STDERR + fichier) ou `LOG_DESTINATIONS=file,transport`.

Lorsque `file` est présent :

- `MCP_LOG_FILE` : chemin (relatif ou absolu) du fichier journal. Le répertoire est créé automatiquement et la rotation est assurée par le transport `pino/file`.

Lorsque `stdout` ou `stderr` est présent :

- `LOG_PRETTY` : active (`true`) ou désactive (`false`) le rendu « pretty » via `pino-pretty`. Par défaut, le format pretty est utilisé si `NODE_ENV` n'est pas `production`, sinon le format JSON est conservé. Quel que soit le nom déclaré (`stdout` ou `stderr`), la sortie console effective passe par STDERR.

Lorsque `transport` est présent :

- `LOG_TRANSPORT_TARGET` : module Pino à charger (ex. `pino-syslog`).
- `LOG_TRANSPORT_OPTIONS` : objet JSON passé tel quel au transport (hôte, port, options d'authentification, etc.).

> ℹ️ `LOG_TRANSPORT_TARGET` est obligatoire dès que `transport` figure dans `LOG_DESTINATIONS`. `LOG_TRANSPORT_OPTIONS` est facultative.

Plusieurs destinations peuvent être combinées. Par exemple :

```bash
LOG_DESTINATIONS=stdout,file
LOG_PRETTY=true
MCP_LOG_FILE=/var/log/eos/mcp.log
```

## Changement de configuration

Après modification des variables d'environnement, redémarrez le service pour appliquer la nouvelle configuration. Aucun changement de code n'est nécessaire : le module `src/server/logger.ts` construit automatiquement le logger Pino en fonction des valeurs chargées depuis `src/config`.

Pour vérifier la configuration effective, vous pouvez exécuter les tests unitaires du module de configuration :

```bash
npm test -- src/config/__tests__/config.test.ts
```

## Audit des executions d'outils MCP

Le pipeline d'execution des outils publie maintenant un evenement d'audit unique (`event: "tool_execution_audit"`) a chaque appel, en succes comme en erreur. Les champs minimaux suivants sont toujours presents pour faciliter l'exploitation SOC/ops :

- `toolName` : nom de l'outil MCP execute.
- `args` : arguments **nettoyes** (cles sensibles masquees, valeurs longues tronquees).
- `userId` et `sessionId` : identifiants utilisateur/session quand disponibles.
- `targetConsole` : console cible (`address`, `port`) quand fournie.
- `result` : resultat nettoye (ou erreur normalisee).
- `durationMs` : duree totale d'execution de l'outil.
- `sensitiveAction` : indicateur d'action sensible detectee.
- `safetyMode` : mode de securite applique (`strict`, `standard`, `off`).
- `correlationId` : identifiant de correlation de bout en bout.

### Correlation MCP -> OSC

Le `correlationId` est etabli a l'entree du traitement outil (requete MCP) puis propage vers les sous-commandes OSC. En activant les logs `--verbose`, les traces OSC sortantes incluent le meme identifiant, ce qui permet de relier :

1. l'appel MCP (`tool_execution_audit`),
2. les envois OSC associes (`[OSC][tcp|udp] -> ...`).

### Lire rapidement les logs d'audit

Exemples avec des logs JSON :

```bash
# Toutes les executions d'outils
jq 'select(.event == "tool_execution_audit")' /var/log/eos/mcp.log

# Une transaction de bout en bout
jq 'select(.correlationId == "<id>")' /var/log/eos/mcp.log

# Actions sensibles uniquement
jq 'select(.event == "tool_execution_audit" and .sensitiveAction == true)' /var/log/eos/mcp.log
```

## Raccourcis en ligne de commande

En complément des variables d'environnement, certains indicateurs peuvent être activés directement lors du démarrage du serveur :

- `--json-logs` force l'utilisation du format JSON pour toutes les destinations et remplace toute sortie console par STDERR afin de préserver STDOUT pour le protocole MCP.
- `--verbose` active la journalisation détaillée des messages OSC (entrants et sortants) via `OscService.setLoggingOptions()`.
- `--stats-interval <durée>` publie périodiquement les compteurs RX/TX renvoyés par `OscService.getDiagnostics()` dans les logs (valeurs acceptant `10s`, `5s`, `5000ms`, etc.).

Ces options peuvent être combinées avec `npm start` ou `npm run start:dev` en les ajoutant après `--` (ex. `npm run start:dev -- --verbose --stats-interval 30s`).
