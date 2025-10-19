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
