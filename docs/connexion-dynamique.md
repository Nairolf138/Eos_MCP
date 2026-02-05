# Connexion dynamique au serveur MCP

Ce mini tutoriel explique comment piloter dynamiquement le point d'accès du serveur MCP en fonction des variables d'environnement. Il permet d'intégrer rapidement le serveur aussi bien dans une console locale que dans un LLM compatible MCP.

## Variables d'environnement clés

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `MCP_TCP_PORT` | Active la passerelle HTTP/WebSocket et définit le port d'écoute. | Non défini (mode STDIO uniquement) |
| `MCP_TLS_ENABLED` | Force l'utilisation du protocole HTTPS. Les valeurs acceptées sont `1`, `true`, `yes`, `on`, `enable`, `enabled`. | `false` |
| `OSC_REMOTE_ADDRESS` | Adresse du serveur OSC distant à contacter. | `127.0.0.1` |
| `OSC_TCP_PORT` | Port TCP distant utilisé pour la négociation OSC. | `3032` |
| `OSC_UDP_OUT_PORT` | Port UDP distant pour l'envoi des messages OSC. | `8001` |
| `OSC_UDP_IN_PORT` | Port UDP local pour la réception des messages OSC. | `8000` |
| `OSC_LOCAL_ADDRESS` | Adresse locale écoutée pour les messages OSC. | `0.0.0.0` |
| `OSC_TCP_NO_DELAY` | Active `TCP_NODELAY` pour réduire la latence des échanges TCP. | `true` |
| `OSC_TCP_KEEP_ALIVE_MS` | Intervalle du keep-alive TCP en millisecondes. | `5000` |
| `OSC_UDP_RECV_BUFFER_SIZE` | Taille du buffer de réception UDP (octets). | `262144` |
| `OSC_UDP_SEND_BUFFER_SIZE` | Taille du buffer d'émission UDP (octets). | `524288` |
| `MCP_HTTP_API_KEYS` | Clés API supplémentaires exigées côté HTTP (`X-API-Key`). | Vide (aucune clé) |
| `MCP_HTTP_MCP_TOKENS` | Jetons MCP (`X-MCP-Token` / `Authorization: Bearer`) requis pour authentifier les clients. | `change-me` |
| `MCP_HTTP_IP_ALLOWLIST` | Liste d'IP autorisées à consommer la passerelle HTTP/WS (`*` pour tout autoriser). | Vide ⇒ deny all |
| `MCP_HTTP_ALLOWED_ORIGINS` | Origines HTTP/WS autorisées (`*` pour tout autoriser). | Vide ⇒ deny all |
| `MCP_HTTP_RATE_LIMIT_WINDOW` | Fenêtre du rate-limit (en millisecondes). | `60000` |
| `MCP_HTTP_RATE_LIMIT_MAX` | Nombre maximal de requêtes par IP dans la fenêtre. | `60` |

## Exemples de scénarios

### 1. Démarrage local pour développement console

```bash
export MCP_TCP_PORT=5173
export MCP_TLS_ENABLED=0
export OSC_REMOTE_ADDRESS=127.0.0.1
npm run start:dev
```

Le journal de démarrage affichera une URL du type `http://localhost:5173`, directement copiable dans votre console MCP locale.

### 2. Exposition sécurisée pour un LLM hébergé

```bash
export MCP_TCP_PORT=7443
export MCP_TLS_ENABLED=true
export OSC_REMOTE_ADDRESS=mcp-backend.internal
export OSC_TCP_PORT=4000
export OSC_UDP_OUT_PORT=4600
export OSC_UDP_IN_PORT=4601
npm run start:dev
```

Le serveur annoncera `https://mcp-backend.internal:7443`. Vous pouvez transmettre cette URL au LLM pour créer une connexion HTTP ou WebSocket sécurisée.

### 3. Mode STDIO uniquement

```bash
unset MCP_TCP_PORT
npm run start:dev
```

Aucun point d'accès réseau n'est créé ; seuls les clients MCP capables de communiquer via STDIO (par exemple un client CLI intégré) peuvent se connecter.

### 4. Déverrouiller l'accès sur un réseau local

```bash
export MCP_TCP_PORT=3032
export MCP_HTTP_IP_ALLOWLIST=192.168.1.10,192.168.1.15
export MCP_HTTP_ALLOWED_ORIGINS=http://192.168.1.10,http://192.168.1.15
export MCP_HTTP_MCP_TOKENS=remplacez-moi-par-un-jeton-solide
export MCP_HTTP_API_KEYS=lan-key
export MCP_HTTP_RATE_LIMIT_WINDOW=60000
export MCP_HTTP_RATE_LIMIT_MAX=120
npm run start:dev
```

Seules les machines explicitement listées (`192.168.1.10` et `192.168.1.15`) pourront accéder à la passerelle, et elles devront fournir le jeton MCP (et la clé API le cas échéant). Ajustez les origines pour autoriser les navigateurs ou clients WebSocket du LAN.

## Bonnes pratiques

1. **Centralisez les variables** dans un fichier `.env` dédié pour chaque environnement (dev, staging, production).
2. **Synchronisez l'URL affichée par les logs** avec la configuration de vos clients : l'adresse affichée par le serveur est déjà normalisée (`localhost` pour `0.0.0.0` ou `::`, crochets automatiques pour l'IPv6).
3. **Automatisez la découverte** en lisant la clé `accessUrl` des logs structurés si vous consommez les journaux depuis une plateforme d'observabilité.
