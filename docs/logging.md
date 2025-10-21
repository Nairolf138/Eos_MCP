# Configuration de la journalisation

Cette application s'appuie sur [Pino](https://getpino.io/) pour la journalisation. La configuration est pilotée par des variables d'environnement validées dans `src/config/index.ts`. Les paramètres suivants permettent d'ajuster le niveau, le format et la destination des logs.

## Niveau de log

- `LOG_LEVEL` : niveau Pino parmi `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. Valeur par défaut : `info`.

Le niveau s'applique à l'ensemble des destinations configurées.

## Destinations disponibles

- `LOG_DESTINATIONS` : liste de destinations séparées par des virgules parmi `stdout`, `file`, `transport`. Valeur par défaut : `file`.

Lorsque `file` est présent :

- `MCP_LOG_FILE` : chemin (relatif ou absolu) du fichier journal. Le répertoire est créé automatiquement et la rotation est assurée par le transport `pino/file`.

Lorsque `stdout` est présent :

- `LOG_PRETTY` : active (`true`) ou désactive (`false`) le rendu « pretty » via `pino-pretty`. Par défaut, le format pretty est utilisé si `NODE_ENV` n'est pas `production`, sinon le format JSON est conservé.

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
