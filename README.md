# Eos MCP

Projet de démonstration pour démarrer un serveur MCP (Model Context Protocol) avec une intégration réseau Open Sound Control (OSC).

## Installation

```bash
npm install
```

## Scripts npm

- `npm run build` : compile TypeScript vers `dist/`.
- `npm run lint` : vérifie le style de code avec ESLint.
- `npm test` : exécute la suite de tests (Jest).
- `npm start` : lance le serveur MCP compilé en mode stdio.
- `npm run start:dev` : lance le serveur MCP directement avec `ts-node`.
- `npm run docs:generate` : régénère la documentation complète des outils MCP et les commentaires JSDoc.
- `npm run docs:check` : vérifie que `docs/tools.md` est synchronisé avec le code source.

## Documentation des outils

La description détaillée de chaque outil MCP est disponible dans [`docs/tools.md`](docs/tools.md). Le fichier est généré automatiquement à partir des schémas Zod déclarés dans `src/tools/**`. Utilisez :

```bash
npm run docs:generate
```

pour mettre à jour la documentation et les commentaires JSDoc, puis :

```bash
npm run docs:check
```

dans votre CI pour garantir que la documentation est à jour.

## Configuration réseau

| Protocole | Port | Description |
|-----------|------|-------------|
| TCP       | 3032 | Réservé pour une future passerelle HTTP ou WebSocket MCP. |
| UDP       | 8000 | Port d'écoute OSC local (inbound). |
| UDP       | 8001 | Port de sortie OSC par défaut (outbound). |

Ces ports peuvent être redéfinis via les variables d'environnement :

- `MCP_TCP_PORT` pour un transport TCP ultérieur (non utilisé par défaut).
- `OSC_UDP_IN_PORT` pour le port d'écoute local.
- `OSC_UDP_OUT_PORT` et `OSC_REMOTE_ADDRESS` pour la cible UDP sortante.

## Lancement

### Mode développement

```bash
npm run start:dev
```

### Mode production

```bash
npm run build
npm start
```

Le serveur démarre sur le transport stdio du SDK MCP et initialisera un service OSC écoutant sur les ports configurés.

## Utilisation

### Appel via la CLI MCP

Après avoir démarré le serveur (`npm run start:dev`), vous pouvez déclencher un outil directement avec le client officiel :

```bash
npx @modelcontextprotocol/cli call --tool ping --args '{"message":"Bonjour"}'
```

Les arguments attendus et d'autres exemples sont listés dans [`docs/tools.md`](docs/tools.md).

### Appel via OSC

Chaque outil documente également le chemin OSC correspondant. Par exemple, pour reproduire le `ping` via OSC :

```bash
oscsend 127.0.0.1 8001 /eos/ping s:'{"message":"Bonjour"}'
```

Adaptez le chemin et la charge utile selon la section dédiée dans la documentation des outils.
