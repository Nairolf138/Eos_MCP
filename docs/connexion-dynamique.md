# Connexion dynamique au serveur MCP

Ce mini tutoriel explique comment piloter dynamiquement le point d'accès du serveur MCP en fonction des variables d'environnement. Il permet d'intégrer rapidement le serveur aussi bien dans une console locale que dans un LLM compatible MCP.

## Variables d'environnement clés

| Variable | Description | Valeur par défaut |
| --- | --- | --- |
| `MCP_TCP_PORT` | Active le transport MCP Streamable HTTP et définit le port d'écoute. | Non défini (mode STDIO uniquement) |
| `MCP_HTTP_HOST` | Adresse locale d'écoute HTTP (`0.0.0.0` pour écouter sur le réseau). | `127.0.0.1` |
| `MCP_TLS_ENABLED` | Ancien drapeau ignoré : le serveur ne fournit pas TLS. Utiliser un reverse proxy HTTPS et `MCP_HTTP_PUBLIC_URL` pour annoncer une URL publique. | Sans effet |
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
| `MCP_HTTP_MCP_TOKENS` | Jetons MCP (`X-MCP-Token` / `Authorization: Bearer`) requis pour authentifier les clients ; le serveur refuse de démarrer si aucun jeton secret n'est fourni ou si `change-me` figure encore dans la liste. | `change-me` (à remplacer avant d'activer HTTP) |
| `MCP_HTTP_IP_ALLOWLIST` | Liste d'IP autorisées à consommer HTTP (`*` pour tout autoriser). | Vide ⇒ aucun accès, même local |
| `MCP_HTTP_ALLOWED_ORIGINS` | Origines de navigateur autorisées (`*` pour tout autoriser). Les clients sans en-tête Origin restent soumis au jeton et à la liste IP. | Vide ⇒ aucune origine de navigateur |
| `MCP_HTTP_RATE_LIMIT_WINDOW` | Fenêtre du rate-limit (en millisecondes). | `60000` |
| `MCP_HTTP_RATE_LIMIT_MAX` | Nombre maximal de requêtes par IP dans la fenêtre. | `60` |

## Exemples de scénarios

### 1. Démarrage local pour développement console

```bash
export MCP_TCP_PORT=5173
export MCP_HTTP_HOST=127.0.0.1
export MCP_HTTP_IP_ALLOWLIST=127.0.0.1
export MCP_HTTP_MCP_TOKENS=replace-with-a-random-secret
export OSC_REMOTE_ADDRESS=127.0.0.1
npm run start:dev
```

Le journal de démarrage affichera une URL du type `http://localhost:5173`, directement copiable dans votre console MCP locale.

### 2. Exposition sécurisée pour un LLM hébergé

```bash
export MCP_TCP_PORT=7443
export MCP_HTTP_HOST=0.0.0.0
export MCP_HTTP_PUBLIC_URL=https://mcp-backend.internal:7443
export MCP_HTTP_IP_ALLOWLIST=192.168.1.10
export MCP_HTTP_MCP_TOKENS=replace-with-a-random-secret
export OSC_REMOTE_ADDRESS=mcp-backend.internal
export OSC_TCP_PORT=4000
export OSC_UDP_OUT_PORT=4600
export OSC_UDP_IN_PORT=4601
npm run start:dev
```

Placez un reverse proxy HTTPS devant le service HTTP local : `MCP_HTTP_PUBLIC_URL` annonce son URL publique, sans activer TLS dans Eos MCP. Adaptez l'adresse IP autorisée à celle du proxy et ne transmettez le jeton qu'au client autorisé.

### 3. Mode STDIO uniquement

```bash
unset MCP_TCP_PORT
npm run start:dev
```

Aucun point d'accès réseau n'est créé ; seuls les clients MCP capables de communiquer via STDIO (par exemple un client CLI intégré) peuvent se connecter.

### 4. Déverrouiller l'accès sur un réseau local

```bash
export MCP_TCP_PORT=3032
export MCP_HTTP_HOST=0.0.0.0
export MCP_HTTP_IP_ALLOWLIST=192.168.1.10,192.168.1.15
export MCP_HTTP_ALLOWED_ORIGINS=http://192.168.1.10,http://192.168.1.15
export MCP_HTTP_MCP_TOKENS=remplacez-moi-par-un-jeton-solide
export MCP_HTTP_API_KEYS=lan-key
export MCP_HTTP_RATE_LIMIT_WINDOW=60000
export MCP_HTTP_RATE_LIMIT_MAX=120
npm run start:dev
```

Seules les machines explicitement listées (`192.168.1.10` et `192.168.1.15`) pourront accéder à la passerelle, et elles devront fournir le jeton MCP (et la clé API le cas échéant). Ajustez les origines pour autoriser les navigateurs du LAN.

## Bonnes pratiques

1. **Centralisez les variables** dans un fichier `.env` dédié pour chaque environnement (dev, staging, production).
2. **Synchronisez l'URL affichée par les logs** avec la configuration de vos clients : l'adresse affichée par le serveur est déjà normalisée (`localhost` pour `0.0.0.0` ou `::`, crochets automatiques pour l'IPv6).
3. **Automatisez la découverte** en lisant la clé `accessUrl` des logs structurés si vous consommez les journaux depuis une plateforme d'observabilité.
