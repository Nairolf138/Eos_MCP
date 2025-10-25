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

## Documentation complémentaire

- [Cookbook d’automatisation](docs/cookbook.md) : scénarios prêts à l’emploi pour déclencher des cues, manipuler les presets et ajuster des niveaux d’intensité.
- [`docs/tools.md`](docs/tools.md) : référence exhaustive générée automatiquement pour chaque outil MCP.

### Outils MCP essentiels

| Outil | Description | Fiche détaillée |
| --- | --- | --- |
| `eos_cue_go` | GO sur la liste de cues active. | [docs/tools.md#eos-cue-go](docs/tools.md#eos-cue-go) |
| `eos_cue_stop_back` | Stop ou retour en arrière sur une liste. | [docs/tools.md#eos-cue-stop-back](docs/tools.md#eos-cue-stop-back) |
| `eos_preset_fire` | Rappel immédiat d’un preset. | [docs/tools.md#eos-preset-fire](docs/tools.md#eos-preset-fire) |
| `eos_channel_set_level` | Réglage d’intensité (0–100 %) d’un canal. | [docs/tools.md#eos-channel-set-level](docs/tools.md#eos-channel-set-level) |

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
   git clone https://github.com/Nairolf138/Eos_MCP.git
   cd Eos_MCP
   npm install
   ```

2. (Facultatif) Le fichier `.env.example` reflète les valeurs par défaut validées par le serveur : copiez-le vers `.env` puis ajustez vos ports/paramètres réseau si nécessaire. Lors de l'exécution, le serveur charge désormais automatiquement le fichier `.env` depuis la racine du projet ; aucune étape supplémentaire n'est requise.

## Scripts npm utiles

- `npm run build` : compile TypeScript vers `dist/`.
- `npm run lint` : vérifie le style de code avec ESLint.
- `npm run lint:manifest` : valide la structure du manifest MCP via Ajv.
- `npm test` : exécute la suite de tests (Jest).
- `npm start` : lance le serveur MCP compilé en mode stdio.
- `npm run start:dev` : lance le serveur MCP directement avec `ts-node`.
- `npm run docs:generate` : régénère la documentation complète des outils MCP et les commentaires JSDoc.
- `npm run docs:check` : vérifie que `docs/tools.md` est synchronisé avec le code source.
- `npm run package` : produit un binaire autonome dans `dist/bin/eos-mcp` (Linux x64 par défaut) via [`pkg`](https://github.com/vercel/pkg).

La description détaillée de chaque outil est disponible dans [`docs/tools.md`](docs/tools.md). Le fichier est généré automatiquement à partir des schémas Zod déclarés dans `src/tools/**`.

Toutes les modifications publiées sont consignées dans [`CHANGELOG.md`](CHANGELOG.md). La procédure de mise à jour de version du serveur est documentée dans [`docs/versioning.md`](docs/versioning.md). Les instructions de déploiement (systemd, NSSM) sont disponibles dans [`docs/deployment.md`](docs/deployment.md).

## Options de ligne de commande

Le module principal (`src/server/index.ts`) expose plusieurs utilitaires accessibles sans démarrer le serveur. Les commandes ci-dessous fonctionnent aussi bien avec `ts-node` qu’avec le build compilé (`dist/server/index.js`).

```bash
# Afficher l'aide intégrée
npx ts-node src/server/index.ts --help

# Afficher la version du serveur MCP
npx ts-node src/server/index.ts --version

# Lister les outils MCP embarqués
npx ts-node src/server/index.ts --list-tools

# Vérifier la configuration (retourne un code de sortie non nul en cas d'erreur)
npx ts-node src/server/index.ts --check-config
```

Ces commandes peuvent également être lancées sur la version compilée avec `node dist/server/index.js <option>`. Utilisez `--list-tools` pour inspecter rapidement les outils disponibles et `--check-config` afin de valider votre fichier `.env` ou les variables d'environnement avant un déploiement.

Lorsque vous démarrez réellement le serveur (sans combiner d'option utilitaire ci-dessus), plusieurs modificateurs sont disponibles :

- `--verbose` active la journalisation détaillée des messages OSC (entrants/sortants).
- `--json-logs` force l'envoi des logs au format JSON vers STDOUT, en ignorant la configuration de destinations déclarée dans l'environnement.
- `--stats-interval <durée>` publie périodiquement les compteurs RX/TX issus d'`OscService.getDiagnostics()` dans les logs (valeurs acceptant `10s`, `5s`, `5000ms`, etc.).

Exemple :

```bash
npx ts-node src/server/index.ts --verbose --json-logs --stats-interval 30s
```

## Configuration réseau et de la console Eos

| Protocole | Port | Description |
|-----------|------|-------------|
| TCP       | 3032 | Passerelle HTTP/WS MCP (GET `/health`, GET `/tools`, POST `/tools/:name`, WebSocket `/ws`) activable via `MCP_TCP_PORT`. |
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

Le serveur écoute sur STDIO pour les clients MCP et initialise un service OSC avec la configuration précédente. Le journal de démarrage vous indique les ports surveillés. Un message dédié confirme désormais le nombre d’outils chargés, l’état de la passerelle HTTP/WS et la disponibilité du transport STDIO :

```text
{"toolCount":5,"httpGateway":{"address":"0.0.0.0","family":"IPv4","port":3032},"stdioTransport":"listening"} Serveur MCP demarre : 5 outil(s) disponibles. Passerelle HTTP/WS active sur le port 3032. Transport STDIO en ecoute.
```

Si la passerelle HTTP/WS n’est pas configurée ou ne peut pas démarrer, le message précise que seule la communication STDIO est active, ce qui permet aux opérateurs d’identifier rapidement la configuration effective au lancement du service.

## Checklist de publication

Avant de publier une nouvelle version :

1. Mettre à jour [`CHANGELOG.md`](CHANGELOG.md) avec les évolutions et corrections apportées.
2. Appliquer `npm version <patch|minor|major>` pour générer le commit et le tag correspondant.
3. Lancer la suite de tests (`npm test`) et les vérifications (`npm run lint`, `npm run build`) si ce n’est pas déjà fait.
4. Pousser la branche et le tag associé :
   ```bash
   git push --follow-tags
   ```
5. Vérifier que la documentation générée reste à jour (`npm run docs:check`).

### Passerelle HTTP/WS optionnelle

Définissez la variable d’environnement `MCP_TCP_PORT` pour exposer une API HTTP REST (`GET /tools`, `POST /tools/:name`) et un WebSocket (`/ws`) au-dessus du registre d’outils MCP. Exemple :

```bash
MCP_TCP_PORT=3032 npm run start:dev
```

#### Vérifier la santé de la passerelle

Expose un court statut JSON utile pour les sondes de monitoring ou les systèmes d'alerte. L'endpoint renvoie le statut, le temps de fonctionnement et le nombre d'outils MCP enregistrés.

```bash
curl -X GET "http://localhost:3032/health"
```

Réponse attendue :

```json
{
  "status": "ok",
  "uptimeMs": 1234,
  "toolCount": 5,
  "transportActive": true,
  "mcp": {
    "http": {
      "status": "listening",
      "startedAt": 1715080000000,
      "uptimeMs": 1234,
      "websocketClients": 0,
      "address": {
        "address": "0.0.0.0",
        "family": "IPv4",
        "port": 3032
      }
    },
    "stdio": {
      "status": "listening",
      "clients": 1,
      "startedAt": 1715079999000,
      "uptimeMs": 1200
    }
  },
  "osc": {
    "status": "online",
    "updatedAt": 1715080000500,
    "transports": {
      "tcp": {
        "type": "tcp",
        "state": "connected",
        "lastHeartbeatSentAt": 1715080000400,
        "lastHeartbeatAckAt": 1715080000400,
        "consecutiveFailures": 0
      },
      "udp": {
        "type": "udp",
        "state": "connected",
        "lastHeartbeatSentAt": null,
        "lastHeartbeatAckAt": null,
        "consecutiveFailures": 0
      }
    },
    "diagnostics": {
      "config": {
        "localAddress": "0.0.0.0",
        "localPort": 8000,
        "remoteAddress": "127.0.0.1",
        "remotePort": 8001
      },
      "logging": { "incoming": false, "outgoing": false },
      "stats": {
        "incoming": { "count": 12, "bytes": 2048, "lastTimestamp": 1715080000300, "lastMessage": null, "addresses": [] },
        "outgoing": { "count": 18, "bytes": 4096, "lastTimestamp": 1715080000350, "lastMessage": null, "addresses": [] }
      },
      "listeners": { "active": 1 },
      "startedAt": 1715079900000,
      "uptimeMs": 100000
    }
  }
}
```

#### Publier la passerelle via un tunnel ou un reverse proxy

L'endpoint `/manifest.json` annonce une URL absolue à destination des clients MCP. Par défaut, cette URL est déduite dynamiquement de la requête entrante (en tenant compte des en-têtes `Host`, `X-Forwarded-Host` et `X-Forwarded-Proto`). Lorsque vous exposez le serveur derrière un tunnel (`ngrok`, `Cloudflare Tunnel`, etc.) ou un reverse proxy (Nginx, Traefik, Caddy), vous pouvez forcer l'URL publiée via la variable d’environnement `MCP_HTTP_PUBLIC_URL` :

```bash
MCP_TCP_PORT=3032 \
MCP_HTTP_PUBLIC_URL="https://eos-mcp.example.com" \
npm run start:dev
```

- Si votre proxy réécrit le chemin (ex. `https://example.com/mcp`), incluez-le dans `MCP_HTTP_PUBLIC_URL` afin que les clients MCP résolvent correctement les endpoints (`/manifest.json`, `/health`, `/tools`, `/ws`).
- Conservez les en-têtes `X-Forwarded-*` lorsque vous terminez TLS en amont : le serveur peut ainsi détecter automatiquement le schéma `https` et générer un manifest cohérent, même sans variable dédiée.
- Pour les tunnels dynamiques (adresse changeante), automatisez la mise à jour de `MCP_HTTP_PUBLIC_URL` ou vérifiez que l’outil propage bien les en-têtes originaux.

Une URL publique correctement configurée garantit que les assistants IA et orchestrateurs MCP peuvent établir des connexions WebSocket et HTTP sans dépendre d’un placeholder statique.

Le bloc `mcp` regroupe désormais l'état du serveur HTTP (adresse liée, clients WebSocket, durée de fonctionnement) et du transport STDIO (nombre de clients et uptime).
`osc.transports` expose le détail des liens TCP/UDP (derniers heartbeats, échecs consécutifs) tandis que `osc.diagnostics` réunit les compteurs RX/TX, la configuration réseau appliquée et l'état de la journalisation.

### Enregistrer le manifest MCP dans Claude

Le serveur expose automatiquement le manifest Claude-compatible sur `GET /manifest.json`. Ce fichier référence la liste des outils (`/tools`), le schéma JSON de chaque outil (`/schemas/tools/{toolName}.json`) ainsi qu’un catalogue (`/schemas/tools/index.json`).

1. Vérifiez la validité du manifest localement :

   ```bash
   npm run lint:manifest
   ```

2. Assurez-vous que votre passerelle HTTP/WS est accessible publiquement (reverse proxy, tunnel, etc.) et notez l’URL complète du manifest (par exemple `https://mcp.example.com/manifest.json`).

3. Enregistrez le service dans Claude via l’outil officiel :

   ```bash
   npx @anthropic-ai/anthropic-cli mcp register --manifest-url https://mcp.example.com/manifest.json
   ```

4. Vous pouvez tester l’intégration MCP en mode local via :

   ```bash
   npx @anthropic-ai/anthropic-cli mcp test --manifest-url http://localhost:3032/manifest.json
   ```

Le manifest est également copié automatiquement dans `dist/manifest.json` lors du `npm run build`, garantissant sa présence dans vos artefacts de déploiement (binaire `pkg`, archives, etc.).

#### Lister les outils disponibles

```bash
curl -X GET "http://localhost:3032/tools"
```

Réponse attendue :

```json
{
  "tools": [
    {
      "name": "ping",
      "config": {
        "title": "Ping tool",
        "description": "Retourne un message de confirmation."
      },
      "metadata": {
        "hasInputSchema": true,
        "inputSchemaResourceUri": "schema://tools/ping",
        "hasOutputSchema": false,
        "hasMiddlewares": true,
        "middlewareCount": 1
      }
    }
  ]
}
```

Les outils munis d’un schéma Zod exposent le pointeur MCP correspondant dans `metadata.inputSchemaResourceUri` (`schema://tools/<nom>`).

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
| `ipAllowlist` | Liste d’adresses IP autorisées (`"*"` pour tout accepter). |
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
    ipAllowlist: ['127.0.0.1'],
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

#### Exemple `.env`

```env
MCP_TCP_PORT=3032
MCP_HTTP_MCP_TOKENS=change-me
MCP_HTTP_IP_ALLOWLIST=
MCP_HTTP_ALLOWED_ORIGINS=
MCP_HTTP_RATE_LIMIT_WINDOW=60000
MCP_HTTP_RATE_LIMIT_MAX=60
```

Cette configuration laisse la passerelle HTTP/WS activée mais verrouillée : aucune adresse IP ni origine n'est autorisée tant que les listes restent vides (deny all), et un jeton MCP est exigé pour toute requête.

| Paramètre | Mode strict (défaut) | Mode LAN (exemple) |
| --- | --- | --- |
| `MCP_HTTP_IP_ALLOWLIST` | Vide ⇒ deny all | `192.168.1.10,192.168.1.15` |
| `MCP_HTTP_ALLOWED_ORIGINS` | Vide ⇒ deny all | `http://192.168.1.10,http://192.168.1.15` |
| `MCP_HTTP_MCP_TOKENS` | `change-me` (à remplacer) | `lan-secret-123` |
| `MCP_HTTP_API_KEYS` | Vide (désactivé) | `lan-key` |
| `MCP_HTTP_RATE_LIMIT_WINDOW` | `60000` ms | `60000` ms |
| `MCP_HTTP_RATE_LIMIT_MAX` | `60` requêtes | `120` requêtes |

Pensez à remplacer les jetons et clés par des valeurs robustes avant d'exposer la passerelle sur votre réseau.

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
   - **Commande** : `npm run start:dev` (développement) ou `node dist/server/index.js` (production).
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

   Pour un build production, remplacez par `"command": "node", "args": ["dist/server/index.js"]`.
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
