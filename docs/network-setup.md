# Configuration réseau recommandée pour Eos MCP

Ce guide décrit une configuration simple et robuste pour relier Eos MCP à une console ETC Eos tout en gardant Internet disponible sur le poste opérateur. Le principe est de séparer strictement le réseau Internet du réseau lumière : le Wi-Fi reste dédié à Internet, l'Ethernet reste dédié à la console Eos.

## Scénario cible

- **Wi-Fi pour Internet** : le poste Eos MCP utilise son interface Wi-Fi pour accéder à Internet, aux services cloud, aux mises à jour et aux clients MCP distants si nécessaire.
- **Ethernet pour la console Eos** : le câble Ethernet relie le poste Eos MCP au réseau lumière ou directement à la console Eos.
- **Pas de bridge** : ne créez pas de pont réseau entre Wi-Fi et Ethernet. Le trafic lumière ne doit pas transiter vers le Wi-Fi.
- **Pas de partage Internet** : désactivez le partage de connexion Internet/ICS/NAT entre Wi-Fi et Ethernet.
- **Pas de passerelle par défaut sur le réseau lumière** : l'interface Ethernet doit avoir une adresse IP et un masque, mais le champ passerelle doit rester vide.
- **Sous-réseaux séparés** : le réseau Wi-Fi et le réseau lumière doivent utiliser des plages IP différentes afin d'éviter toute ambiguïté de routage.

## Exemple d'adressage

| Équipement | Interface | Adresse IP | Masque | Passerelle |
| --- | --- | --- | --- | --- |
| PC Eos MCP | Ethernet | `192.168.50.10` | `255.255.255.0` | vide |
| Console Eos | Ethernet | `192.168.50.20` | `255.255.255.0` | vide ou selon politique locale, mais pas nécessaire pour ce lien direct |
| PC Eos MCP | Wi-Fi | fournie par le routeur Wi-Fi | fournie par le routeur Wi-Fi | fournie par le routeur Wi-Fi |

Dans cet exemple, Eos MCP contacte la console à l'adresse `192.168.50.20`. Le Wi-Fi garde sa passerelle par défaut vers Internet, tandis que l'Ethernet ne publie aucune route par défaut.

## Configuration réseau du PC

### Windows

1. Ouvrez les paramètres de l'adaptateur Ethernet.
2. Configurez IPv4 en manuel :
   - adresse IP : `192.168.50.10` ;
   - masque : `255.255.255.0` ;
   - passerelle par défaut : laissez le champ vide ;
   - DNS : laissez vide sauf besoin explicite sur le réseau lumière.
3. Vérifiez que le partage de connexion Internet est désactivé sur l'interface Wi-Fi.
4. Ne créez pas de pont entre les interfaces Wi-Fi et Ethernet.

### macOS / Linux

1. Configurez l'interface Ethernet avec une adresse statique :
   - adresse IP : `192.168.50.10` ;
   - masque ou préfixe : `255.255.255.0` ou `/24` ;
   - routeur/passerelle : laissez vide.
2. Laissez le Wi-Fi en DHCP pour Internet.
3. Vérifiez qu'aucune route par défaut ne pointe vers l'interface Ethernet.
4. N'activez ni partage Internet, ni NAT, ni bridge entre Wi-Fi et Ethernet.

## Variables OSC Eos MCP

Déclarez les variables suivantes dans votre `.env`, votre service systemd/NSSM ou l'environnement de lancement d'Eos MCP :

| Variable | Exemple | Rôle |
| --- | --- | --- |
| `OSC_REMOTE_ADDRESS` | `192.168.50.20` | Adresse IP de la console Eos ou d'Eos Nomad à joindre sur le réseau lumière. |
| `OSC_UDP_OUT_PORT` | `8001` | Port UDP distant vers lequel Eos MCP envoie les messages OSC. Il doit correspondre au port OSC RX configuré côté Eos. |
| `OSC_UDP_IN_PORT` | `8000` | Port UDP local sur lequel Eos MCP écoute les réponses OSC. Il doit correspondre à la destination TX configurée côté Eos. |

Exemple `.env` pour le scénario ci-dessus :

```dotenv
OSC_REMOTE_ADDRESS=192.168.50.20
OSC_UDP_OUT_PORT=8001
OSC_UDP_IN_PORT=8000
```

Assurez-vous également que la console Eos envoie ses retours OSC vers l'adresse Ethernet du PC (`192.168.50.10` dans l'exemple) et vers le port `OSC_UDP_IN_PORT` choisi.

## Diagnostic

### 1. Ping de la console

Depuis le PC Eos MCP, testez l'accès IP à la console :

```bash
ping 192.168.50.20
```

Si le ping échoue, vérifiez le câble, l'adresse IP de la console, le masque, le firewall local et l'interface réellement utilisée. Si l'ICMP est volontairement bloqué, documentez cette limite puis continuez avec les tests OSC.

### 2. Vérification de la route par défaut

L'objectif est que la route par défaut reste sur le Wi-Fi, pas sur l'Ethernet lumière.

Windows :

```powershell
route print 0.0.0.0
```

Linux :

```bash
ip route show default
```

macOS :

```bash
route -n get default
```

La passerelle par défaut doit correspondre au réseau Wi-Fi/Internet. Si une passerelle par défaut apparaît sur l'interface Ethernet `192.168.50.0/24`, retirez-la de la configuration Ethernet.

### 3. Vérification des ports OSC côté Eos

Dans les paramètres OSC d'Eos ou d'Eos Nomad, contrôlez au minimum :

- OSC RX activé côté Eos pour recevoir les commandes envoyées par Eos MCP ;
- OSC TX activé côté Eos pour renvoyer les réponses et notifications vers le PC ;
- port RX Eos égal à `OSC_UDP_OUT_PORT` côté Eos MCP ;
- adresse TX Eos égale à l'adresse Ethernet du PC, par exemple `192.168.50.10` ;
- port TX Eos égal à `OSC_UDP_IN_PORT` côté Eos MCP ;
- règles firewall autorisant l'UDP entrant et sortant sur ces ports.

### 4. Test avec Eos Nomad avant console réelle

Avant de connecter une console matérielle, validez la configuration avec Eos Nomad lorsque c'est possible :

1. Lancez Eos Nomad sur le même poste ou sur un second poste du réseau lumière.
2. Configurez Nomad avec les mêmes ports OSC que la future console.
3. Testez `OSC_REMOTE_ADDRESS` sur l'adresse Nomad appropriée (`127.0.0.1` si tout tourne localement, ou l'IP Ethernet du poste Nomad si Nomad est sur une autre machine).
4. Lancez les diagnostics read-only d'Eos MCP, puis corrigez les ports, adresses et règles firewall avant de passer à la console réelle.

Ce test ne remplace pas une validation finale avec la console de production, mais il permet d'isoler les erreurs d'adressage, de routage et de firewall sans perturber une régie réelle.

## À éviter

- Ajouter une passerelle Ethernet « pour essayer » : cela peut faire sortir Internet par le réseau lumière ou rendre la console inaccessible selon la métrique de route.
- Mettre Wi-Fi et Ethernet dans le même sous-réseau : le système peut choisir la mauvaise interface pour joindre la console.
- Activer un bridge ou le partage Internet : cela mélange les domaines réseau et complique fortement le dépannage.
- Laisser une ancienne adresse TX dans Eos : la console peut recevoir les commandes mais envoyer les réponses vers un autre poste.
