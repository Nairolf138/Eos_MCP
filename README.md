# Eos MCP

**Eos MCP** est une passerelle prête pour la production qui transforme votre console lumière ETC Eos en un service pilotable par les assistants IA et vos outils d’automatisation. Grâce au protocole MCP (Model Context Protocol) et à une intégration réseau Open Sound Control (OSC) robuste, vous orchestrez vos cues, presets et routines depuis des interfaces conversationnelles ou des workflows low-code, en conservant un contrôle fin sur la sécurité et la supervision.

## Pourquoi choisir Eos MCP ?

- **Automatisation fiable** : un serveur résilient capable de fonctionner en continu pour alimenter vos process scéniques et broadcast.
- **Expérience opérateur unifiée** : exposez vos outils Eos à ChatGPT, Claude, n8n ou à toute plateforme compatible MCP sans réécrire vos scripts.
- **Sécurité intégrée** : API keys, jetons MCP et filtrage réseau configurables pour cadrer l’accès à votre console.
- **Documentation générée** : chaque outil MCP dispose d’une fiche détaillée dans [`docs/tools.md`](docs/tools.md) afin d’accélérer l’onboarding de vos équipes.

## Cas d’usage clés

- Déclencher des cues lumières depuis un assistant IA pour fluidifier les répétitions.
- Intégrer Eos dans un workflow n8n afin de synchroniser régie, timecode et automation.
- Superviser et auditer les commandes envoyées à distance via la passerelle HTTP/WS optionnelle.

## Prérequis

- Node.js 20+ (tests effectués avec la LTS actuelle).
- npm 9+.
- Une console ETC Eos (ou le logiciel **Nomad** en mode offline) accessible sur le même réseau.
- L’accès à l’outil ciblé (ChatGPT, Claude, n8n) pour l’intégration MCP.

Vérifiez votre version de Node.js :

```bash
node --version
```

## Installation du serveur MCP

1. Clonez le dépôt puis installez les dépendances :

   ```bash
   git clone <URL_DU_DEPOT>
   cd Eos_MCP
   npm install
   ```

2. (Facultatif) Copiez le fichier `.env.example` vers `.env` et ajustez vos ports/paramètres réseau si nécessaire.

## Scripts npm utiles

- `npm run build` : compile TypeScript vers `dist/`.
- `npm run lint` : vérifie le style de code avec ESLint.
- `npm test` : exécute la suite de tests (Jest).
- `npm start` : lance le serveur MCP compilé en mode stdio.
- `npm run start:dev` : lance le serveur MCP directement avec `ts-node`.
- `npm run docs:generate` : régénère la documentation complète des outils MCP et les commentaires JSDoc.
- `npm run docs:check` : vérifie que `docs/tools.md` est synchronisé avec le code source.

La description détaillée de chaque outil est disponible dans [`docs/tools.md`](docs/tools.md). Le fichier est généré automatiquement à partir des schémas Zod déclarés dans `src/tools/**`.

La procédure de mise à jour de version du serveur est documentée dans [`docs/versioning.md`](docs/versioning.md).

## Configuration réseau et de la console Eos

| Protocole | Port | Description |
|-----------|------|-------------|
| TCP       | 3032 | Passerelle HTTP/WS MCP (POST `/tools/:name`, WebSocket `/ws`) activable via `MCP_TCP_PORT`. |
| UDP       | 8000 | Port d'écoute OSC local (inbound). |
| UDP       | 8001 | Port de sortie OSC par défaut (outbound). |

Variables d’environnement pertinentes :

- `MCP_TCP_PORT` pour activer la passerelle HTTP/WS optionnelle (par exemple `3032`).
- `OSC_UDP_IN_PORT` pour le port d'écoute local.
- `OSC_UDP_OUT_PORT` et `OSC_REMOTE_ADDRESS` pour la cible UDP sortante.

### Étapes côté console Eos

1. Sur la console (ou Nomad), ouvrez **Setup → System → Show Control → OSC**.
2. Activez **OSC RX** et **OSC TX**.
3. Renseignez l’adresse IP du serveur MCP dans **OSC TX IP Address**.
4. Configurez les ports : `OSC RX Port` = `OSC_UDP_OUT_PORT` (par défaut 8001) et `OSC TX Port` = `OSC_UDP_IN_PORT` (par défaut 8000).
5. Validez et redémarrez le show si nécessaire.

## Démarrage du serveur MCP

### Mode développement (TypeScript à la volée)

```bash
npm run start:dev
```

### Mode production (build + exécution Node.js)

```bash
npm run build
npm start
```

Le serveur écoute sur STDIO pour les clients MCP et initialise un service OSC avec la configuration précédente. Le journal de démarrage vous indique les ports surveillés.

### Passerelle HTTP/WS optionnelle

Définissez la variable d’environnement `MCP_TCP_PORT` pour exposer une API HTTP REST (`POST /tools/:name`) et un WebSocket (`/ws`) au-dessus du registre d’outils MCP. Exemple :

```bash
MCP_TCP_PORT=3032 npm run start:dev
```

#### Appel REST

```bash
curl -X POST "http://localhost:3032/tools/ping" \
  -H "Content-Type: application/json" \
  -d '{"args":{"message":"Bonjour"}}'
```

Réponse attendue :

```json
{
  "tool": "ping",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "pong: Bonjour"
      }
    ]
  }
}
```

#### Appel WebSocket

```bash
npx wscat -c ws://localhost:3032/ws
< {"type":"ready"}
> {"tool":"ping","args":{"message":"Depuis WS"}}
< {"type":"result","tool":"ping","result":{"content":[{"type":"text","text":"pong: Depuis WS"}]}}
```

> Le premier message `{"type":"ready"}` confirme l’ouverture de la connexion. Envoyez ensuite vos appels d’outils au format JSON (`tool`, `args`, `id` optionnel).

#### Sécurisation de la passerelle HTTP/WS

La fonction `createHttpGateway` accepte un objet `security` pour appliquer une politique de défense simple côté HTTP et WebSocket.

| Option | Description |
|--------|-------------|
| `apiKeys` | Tableau de clés API autorisées. À transmettre dans l’en-tête `X-API-Key`. |
| `mcpTokens` | Liste de jetons MCP pour l’authentification (en-tête `X-MCP-Token` ou `Authorization: Bearer <token>`). Ces jetons sont également requis pour les requêtes mutantes afin de limiter les attaques CSRF. |
| `ipWhitelist` | Liste d’adresses IP autorisées (`"*"` pour tout accepter). |
| `allowedOrigins` | Origines HTTP/WS autorisées pour CORS/CORS WS (`"*"` pour tout accepter). |
| `rateLimit` | Limiteur de débit en mémoire `{ windowMs, max }` appliqué par adresse IP. |
| `express` | Permet de surcharger les middlewares Express (`authentication`, `csrf`, `cors`, `throttling`). |

Exemple :

```ts
createHttpGateway(registry, {
  port: 3032,
  security: {
    apiKeys: ['test-key'],
    mcpTokens: ['token-123'],
    ipWhitelist: ['127.0.0.1'],
    allowedOrigins: ['http://localhost'],
    rateLimit: { windowMs: 60000, max: 30 }
  }
});
```

Les clients HTTP doivent inclure les en-têtes `X-API-Key`, `X-MCP-Token` et `Origin` cohérents. Pour le WebSocket, fournissez les mêmes en-têtes lors de l’ouverture (`ws`, `wscat`, navigateur) :

```bash
wscat \
  -c ws://localhost:3032/ws \
  -H "Origin: http://localhost" \
  -H "X-API-Key: test-key" \
  -H "X-MCP-Token: token-123"
```

Si les middlewares intégrés ne conviennent pas, vous pouvez injecter vos propres middlewares Express via `security.express` (par exemple pour utiliser `helmet`, `cors` ou un proxy externe).

## Vérification locale avec la CLI MCP

Après démarrage du serveur, utilisez le client officiel pour invoquer un outil :

```bash
npx @modelcontextprotocol/cli call --tool ping --args '{"message":"Bonjour"}'
```

Référez-vous à [`docs/tools.md`](docs/tools.md) pour la liste exhaustive des outils et des charges utiles attendues.

## Intégration avec les assistants IA

Les trois intégrations ci-dessous s’appuient sur le protocole MCP. Chaque outil invoquera le serveur en STDIO ; assurez-vous qu’il s’exécute dans un terminal dédié.

### ChatGPT (plateforme GPTs)

1. Ouvrez [https://chat.openai.com/](https://chat.openai.com/) et créez un GPT personnalisé.
2. Dans l’onglet **Actions**, cliquez sur **Ajouter une action** puis choisissez **Model Context Protocol**.
3. Renseignez :
   - **Nom** : `Eos MCP` (ou similaire).
   - **Type de connexion** : `Commande locale`.
   - **Commande** : `npm run start:dev` (développement) ou `node dist/index.js` (production).
   - **Répertoire de travail** : chemin absolu du dossier `Eos_MCP`.
4. Sauvegardez le GPT. Au premier lancement, ChatGPT vous demandera d’autoriser l’exécution de la commande ; acceptez pour ouvrir le serveur.
5. Dans la conversation, demandez une action (ex. « déclenche la cue 5 »). ChatGPT traduira la requête en appel d’outil MCP ; surveillez le terminal pour vérifier que la commande est déclenchée.

### Claude Desktop / Claude.ai

1. Assurez-vous d’utiliser une version compatible MCP (Claude Desktop ≥ 1.3 ou Claude.ai avec accès MCP).
2. Créez ou modifiez le fichier de configuration :
   - macOS : `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows : `%APPDATA%/Claude/claude_desktop_config.json`
   - Linux : `~/.config/Claude/claude_desktop_config.json`
3. Ajoutez la configuration suivante :

   ```json
   {
     "mcpServers": {
       "eos-mcp": {
         "command": "npm",
         "args": ["run", "start:dev"],
         "workingDirectory": "/chemin/vers/Eos_MCP"
       }
     }
   }
   ```

   Pour un build production, remplacez par `"command": "node", "args": ["dist/index.js"]`.
4. Redémarrez Claude Desktop puis ouvrez un chat. Tapez une instruction liée à Eos ; Claude sélectionnera automatiquement le serveur MCP si pertinent.
5. Vérifiez que les réponses incluent la trace des outils MCP utilisés et que la console Eos reçoit bien les messages OSC.

### n8n (automatisation de workflows)

Deux options s’offrent à vous : appeler directement le serveur via STDIO (nœud **Execute Command**) ou passer par la CLI MCP.

#### Option A – nœud Execute Command

1. Ajoutez un nœud **Execute Command** dans votre workflow.
2. Configurez la commande :

   ```bash
   npx @modelcontextprotocol/cli call --cwd /chemin/vers/Eos_MCP --tool <outil> --args '<json>'
   ```

3. Exemple pour lancer un ping :

   ```bash
   npx @modelcontextprotocol/cli call --cwd /chemin/vers/Eos_MCP --tool ping --args '{"message":"Bonjour"}'
   ```

4. Parsez la sortie JSON du nœud pour enchaîner sur d’autres actions n8n.

#### Option B – Serveur MCP persistant

1. Démarrez le serveur MCP dans un service externe (systemd, PM2…).
2. Utilisez un nœud **HTTP Request** ou **Webhooks** pour réagir à des événements, puis un nœud **Execute Command** minimal qui envoie le message OSC attendu via `oscsend` ou un script Node.js interne se connectant à `OSC_REMOTE_ADDRESS`.
3. Combinez ces deux approches pour déclencher automatiquement les outils MCP en fonction de vos triggers (emails, API externes, calendrier, etc.).

## Appels OSC directs

Chaque outil expose également un chemin OSC. Exemple pour reproduire le `ping` via OSC :

```bash
oscsend 127.0.0.1 8001 /eos/ping s:'{"message":"Bonjour"}'
```

Adaptez le chemin et la charge utile selon la documentation des outils.
