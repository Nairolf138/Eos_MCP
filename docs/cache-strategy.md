# Stratégie de cache Eos MCP

Le cache applicatif est un cache mémoire, par processus, utilisé pour amortir les lectures OSC coûteuses et les recherches locales répétées. Il est volontairement court pour les données de conduite (cues, groupes, palettes) et plus long pour les ressources peu volatiles (fixtures).

## Ressources cachées

| Famille | Ressources / outils consommateurs | Clés et tags | TTL par défaut |
| --- | --- | --- | --- |
| `cues` | `eos_cue_get_info` | Identifiant de cue (`liste:cue:part`) + options de cible OSC | `CACHE_TTL_CUES_MS` = 1 s |
| `cuelists` | `eos_cue_list_all`, `eos_cuelist_get_info` | Numéro de liste + options de cible OSC | `CACHE_TTL_CUES_MS` = 1 s |
| `patch` | `eos_patch_get_channel_info`, `eos_patch_get_augment3d_position`, `eos_patch_get_augment3d_beam` | Canal, partie, type de donnée Augment3d | `CACHE_TTL_PATCH_MS` = 5 s |
| `groups` | `eos_group_get_info`, `eos_group_list_all` | Groupe ou liste complète | `CACHE_TTL_GROUPS_MS` = 1,5 s |
| `palettes` | `eos_palette_get_info` | Type de palette (`ip`, `fp`, `cp`, `bp`) et numéro | `CACHE_TTL_PALETTES_MS` = 1,5 s |
| `fixtures` | `eos_fixture_search` | Critères de recherche locaux | `CACHE_TTL_FIXTURES_MS` = 5 min |
| `session` | `session_set_context`, `session_get_context`, `session_clear_context` | Contexte de session MCP courant | `CACHE_TTL_SESSION_MS` = 10 min, sauf `ttl_ms` explicite |
| Autres familles | `channels`, `presets`, `macros`, `snapshots`, `curves`, `effects`, `pixelMaps`, `magicSheets`, `submasters`, `queries` | Lectures OSC spécifiques aux outils existants | `CACHE_TTL_DEFAULT_MS` = 1,5 s sauf configuration dédiée ajoutée ultérieurement |

## Configuration par environnement

Les TTL sont configurables via variables d'environnement, en millisecondes :

```env
CACHE_TTL_DEFAULT_MS=1500
CACHE_TTL_CUES_MS=1000
CACHE_TTL_PATCH_MS=5000
CACHE_TTL_GROUPS_MS=1500
CACHE_TTL_PALETTES_MS=1500
CACHE_TTL_FIXTURES_MS=300000
CACHE_TTL_SESSION_MS=600000
```

Recommandations :

- **Répétition / live** : garder `cues`, `groups` et `palettes` entre 500 ms et 2 s pour limiter les données obsolètes.
- **Préparation hors ligne** : augmenter `fixtures` et `patch` si la charge OSC est plus importante que la fraîcheur instantanée.
- **Tests automatisés** : réduire les TTL ou appeler les invalidations manuelles pour rendre les assertions déterministes.

## Invalidations OSC

Chaque entrée de lecture OSC est indexée par tags de ressource et par préfixe OSC. À la réception d'un message entrant `/eos/out/...`, le cache invalide les entrées dont le préfixe correspond. Ce mécanisme couvre les changements signalés par la console sans attendre la fin du TTL.

Les préfixes OSC sont volontairement larges (`/eos/out/`) pour éviter de conserver des lectures incohérentes lorsque la console publie des mutations dont le chemin exact varie selon la version EOS.

## Invalidations manuelles

Les outils d'écriture ou de commande qui peuvent rendre une ressource cachée obsolète appellent `notifyResourceChange` ou une invalidation équivalente :

- cues / cuelists : `GO`, `Fire`, `Stop/Back`, sélection de cue et navigation/configuration de bank invalident `cues` et `cuelists` ;
- groups : les commandes qui modifient l'état d'un groupe invalident le groupe ciblé ;
- palettes : le déclenchement d'une palette invalide la palette ciblée ;
- session : `session_set_context` et `session_clear_context` invalident l'entrée de contexte ;
- fixtures : les données sont locales et immuables à l'exécution ; l'invalidation manuelle pertinente est `notifyResourceChange('fixtures')` après remplacement de la bibliothèque dans un futur processus long.

## Métriques et diagnostics

Les métriques exposées sont :

- `hits` : lectures servies depuis le cache ;
- `misses` : lectures ayant appelé le fetcher ;
- `entries` : entrées en mémoire par ressource.

Elles sont disponibles :

- dans `/health`, sous `cache.resources` et `cache.totals` ;
- dans `eos_get_diagnostics`, sous `structuredContent.cache` et dans le résumé texte.

## Risques de données obsolètes

Le cache peut servir une donnée périmée si :

1. la console ne publie pas de message `/eos/out/...` pour une mutation ;
2. une mutation est envoyée par un autre client et aucun message OSC entrant n'est reçu par ce serveur ;
3. un TTL trop long est configuré pour des données très dynamiques ;
4. plusieurs instances Eos MCP tournent en parallèle (cache non partagé).

Mesures de réduction :

- préférer des TTL courts pour les données de conduite ;
- déclencher `notifyResourceChange` dans tout nouvel outil d'écriture ;
- surveiller `/health.cache` pour vérifier que les familles critiques n'accumulent pas trop d'entrées ;
- forcer une lecture fraîche en invalidant la famille concernée lors d'une opération critique.
