# Couverture OSC ↔ MCP

Ce document liste tous les outils exportés par `src/tools/index.ts` et relie chaque outil à sa commande OSC déclarée et au test de contrat associé.

## Matrice de conformité EOS par version

Cette matrice synthétise les trames rejouées hors ligne par `src/services/osc/__tests__/eos-conformance.integration.test.ts` depuis `src/services/osc/__tests__/fixtures/eos-conformance.frames.json`. Elle distingue l'adresse de requête envoyée par l'outil MCP, la forme de réponse attendue et la variante `/eos/out` acceptée par le client quand elle est supportée.

| Version EOS | Endpoint | Outil MCP | Requête OSC | Réponse attendue | Variante `/eos/out` | Statut supporté |
| --- | --- | --- | --- | --- | --- | --- |
| 2.9.1 | `version` | `eos_get_version` | `/eos/get/version` sans argument | Objet JSON contenant `status: "ok"` et `version` | Acceptée : `/eos/out/get/version` | Supporté, réponse directe capturée |
| 3.2.1 | `version` | `eos_get_version` | `/eos/get/version` sans argument | Objet JSON contenant `status: "ok"` et `version` | Acceptée et rejouée : `/eos/out/get/version` | Supporté |
| 3.2.1 | `get/count` (`cue`) | `eos_get_count` | `/eos/get/cue/count` sans argument | Objet JSON contenant `status: "ok"` et `count` numérique | Acceptée et rejouée : `/eos/out/get/cue/count` | Supporté |
| 3.2.1 | `get/list` (`group`) | `eos_get_list_all` | `/eos/get/group/list` sans argument | Objet JSON contenant `status: "ok"` et une liste `groups`/`items` | Acceptée et rejouée : `/eos/out/get/group/list` | Supporté |
| 3.2.1 | `patch/chan_info` | `eos_patch_get_channel_info` | `/eos/get/patch/chan_info` avec JSON `{ "channel": <n>, "part": <n> }` | Objet JSON contenant `status: "ok"` et les champs normalisés de canal/part | Acceptée et rejouée : `/eos/out/get/patch/chan_info` | Supporté |
| 3.2.1 | `show/name` | `eos_get_show_name` | `/eos/get/show/name` sans argument | Objet JSON contenant `status: "ok"` et `show_name`/`name`/`text` | Documentée côté EOS comme `/eos/out/show/name`, non rejouée par l'outil actuel | Supporté en réponse directe |
| 3.2.1 | `cmd_line` | `eos_get_command_line` | `/eos/get/cmd_line` avec JSON `{}` ou `{ "user": <id> }` | Objet JSON contenant `status: "ok"`, `text` et `user` | Non acceptée par l'awaiter actuel ; réponse directe `/eos/get/cmd_line` requise | Supporté en réponse directe |

Notes de lecture :

- Les endpoints de requête JSON génériques (`get/count`, `get/list`, `patch/chan_info`) utilisent les variantes directes et `/eos/out/get/...` déclarées dans `oscResponseMappings`.
- `version` accepte désormais la réponse directe `/eos/get/version` et la variante `/eos/out/get/version`, ce qui aligne l'outil avec le probe de capabilities.
- `show/name` et `cmd_line` restent volontairement indiqués comme direct-only dans les tests de conformance tant qu'aucune capture rejouée ne prouve une variante `/eos/out` compatible avec les awaiters actuels.

## Couverture officielle/non officielle des endpoints `/eos/get/`

Toutes les adresses `/eos/get/` declarees par les services OSC, les outils MCP, la documentation et les tests de contrat ont une entree dans `OSC_ADDRESS_OFFICIALITY`. Le tableau ci-dessous indique aussi l'effet du mode strict pour chaque endpoint couvert.

| Endpoint | Outil/usage MCP | Statut | Alternative officielle | Strict |
| --- | --- | --- | --- | --- |
| `/eos/get/cmd_line` | eos_get_command_line, eos_get_user_command_line; precheck de workflow | Non officiel (MCP extension) | /eos/out/cmd et /eos/out/user/{number}/cmd memorises | Bloque |
| `/eos/get/softkey_labels` | eos_get_softkey_labels | Non officiel (non confirme dans le manuel v3.0.0) | Aucune alternative de lecture confirmee; /eos/softkey/{index} couvre seulement l'appui | Bloque |
| `/eos/get/channels` | eos_channel_get_info | Non officiel (non confirme dans le manuel v3.0.0) | /eos/chan et /eos/chan/{channel}/param/{parameter} pour piloter; pas de lecture globale confirmee | Bloque |
| `/eos/get/group` | eos_group_get_info | Officiel | Famille officielle /eos/get/group/... | Autorise |
| `/eos/get/group/count` | eos_get_count(type=group) | Officiel | n/a | Autorise |
| `/eos/get/group/list` | eos_group_list_all, eos_get_list_all(type=group) | Officiel | n/a | Autorise |
| `/eos/get/palette` | eos_palette_get_info (type palette generique) | Officiel | Familles IP/FP/CP/BP selon le type | Autorise |
| `/eos/get/ip` | eos_intensity_palette_get_info | Officiel | n/a | Autorise |
| `/eos/get/fp` | eos_focus_palette_get_info | Officiel | n/a | Autorise |
| `/eos/get/cp` | eos_color_palette_get_info | Officiel | n/a | Autorise |
| `/eos/get/bp` | eos_beam_palette_get_info | Officiel | n/a | Autorise |
| `/eos/get/ip/count` | eos_get_count(type=ip) | Officiel | n/a | Autorise |
| `/eos/get/fp/count` | eos_get_count(type=fp) | Officiel | n/a | Autorise |
| `/eos/get/cp/count` | eos_get_count(type=cp) | Officiel | n/a | Autorise |
| `/eos/get/bp/count` | eos_get_count(type=bp) | Officiel | n/a | Autorise |
| `/eos/get/ip/list` | eos_get_list_all(type=ip) | Officiel | n/a | Autorise |
| `/eos/get/fp/list` | eos_get_list_all(type=fp) | Officiel | n/a | Autorise |
| `/eos/get/cp/list` | eos_get_list_all(type=cp) | Officiel | n/a | Autorise |
| `/eos/get/bp/list` | eos_get_list_all(type=bp) | Officiel | n/a | Autorise |
| `/eos/get/preset` | eos_preset_get_info | Officiel | n/a | Autorise |
| `/eos/get/preset/count` | eos_get_count(type=preset) | Officiel | n/a | Autorise |
| `/eos/get/preset/list` | eos_get_list_all(type=preset) | Officiel | n/a | Autorise |
| `/eos/get/macro` | eos_macro_get_info | Officiel | n/a | Autorise |
| `/eos/get/macro/count` | eos_get_count(type=macro) | Officiel | n/a | Autorise |
| `/eos/get/macro/list` | eos_get_list_all(type=macro) | Officiel | n/a | Autorise |
| `/eos/get/snapshot` | eos_snapshot_get_info | Officiel | /eos/get/snap/... est la forme abregee citee dans le tableau de conformite | Autorise |
| `/eos/get/snapshot/count` | eos_get_count(type=snap) | Officiel | n/a | Autorise |
| `/eos/get/snapshot/list` | eos_get_list_all(type=snap) | Officiel | n/a | Autorise |
| `/eos/get/curve` | eos_curve_get_info | Officiel | n/a | Autorise |
| `/eos/get/curve/count` | eos_get_count(type=curve) | Officiel | n/a | Autorise |
| `/eos/get/curve/list` | eos_get_list_all(type=curve) | Officiel | n/a | Autorise |
| `/eos/get/effect` | eos_effect_get_info | Officiel | /eos/get/fx/... est l alias manuel pour la famille effet | Autorise |
| `/eos/get/effect/count` | eos_get_count(type=fx) | Officiel | n/a | Autorise |
| `/eos/get/effect/list` | eos_get_list_all(type=fx) | Officiel | n/a | Autorise |
| `/eos/get/active/wheels` | eos_get_active_wheels | Officiel | /eos/out/active/wheel/{number} comme sortie implicite observee/documentee | Autorise |
| `/eos/get/fpe/set/count` | eos_fpe_get_set_count | Non officiel (endpoint FPE non confirme) | Aucune alternative OSC officielle confirmee | Bloque |
| `/eos/get/fpe/set` | eos_fpe_get_set_info | Non officiel (endpoint FPE non confirme) | Aucune alternative OSC officielle confirmee | Bloque |
| `/eos/get/fpe/point` | eos_fpe_get_point_info | Non officiel (endpoint FPE non confirme) | Aucune alternative OSC officielle confirmee | Bloque |
| `/eos/get/pixmap` | eos_pixmap_get_info | Officiel | n/a | Autorise |
| `/eos/get/pixmap/count` | eos_get_count(type=pixmap) | Officiel | n/a | Autorise |
| `/eos/get/pixmap/list` | eos_get_list_all(type=pixmap) | Officiel | n/a | Autorise |
| `/eos/get/magic_sheet` | eos_magic_sheet_get_info | Officiel | /eos/get/ms/... est la forme abregee citee dans le tableau de conformite | Autorise |
| `/eos/get/magic_sheet/count` | eos_get_count(type=ms) | Officiel | n/a | Autorise |
| `/eos/get/magic_sheet/list` | eos_get_list_all(type=ms) | Officiel | n/a | Autorise |
| `/eos/get/submaster` | eos_submaster_get_info | Officiel | /eos/get/sub/... est la forme abregee citee dans le tableau de conformite | Autorise |
| `/eos/get/submaster/count` | eos_get_count(type=sub) | Officiel | n/a | Autorise |
| `/eos/get/submaster/list` | eos_get_list_all(type=sub) | Officiel | n/a | Autorise |
| `/eos/get/cue` | eos_cue_get_info | Officiel | n/a | Autorise |
| `/eos/get/cue/count` | eos_get_count(type=cue) | Officiel | n/a | Autorise |
| `/eos/get/cue/list` | eos_get_list_all(type=cue) | Officiel | n/a | Autorise |
| `/eos/get/cuelist` | eos_cue_list_all | Officiel | n/a | Autorise |
| `/eos/get/cuelist/count` | eos_get_count(type=cuelist) | Officiel | n/a | Autorise |
| `/eos/get/cuelist/list` | eos_get_list_all(type=cuelist) | Officiel | n/a | Autorise |
| `/eos/get/cuelist/info` | eos_cuelist_get_info | Non officiel (endpoint info dedie non confirme) | /eos/get/cuelist, /eos/get/cuelist/count et /eos/get/cuelist/list | Bloque |
| `/eos/get/active/cue` | eos_get_active_cue | Non officiel (requete explicite MCP) | /eos/out/active/cue en sortie implicite | Bloque |
| `/eos/get/pending/cue` | eos_get_pending_cue | Non officiel (requete explicite MCP) | /eos/out/pending/cue en sortie implicite | Bloque |
| `/eos/get/show/name` | eos_get_show_name | Non officiel (requete explicite MCP) | /eos/out/show/name en sortie implicite | Bloque |
| `/eos/get/live/blind` | eos_get_live_blind_state | Non officiel (requete explicite MCP) | /eos/out/event/state | Bloque |
| `/eos/get/patch/chan_info` | eos_patch_get_channel_info | Non officiel (endpoint JSON non confirme) | /eos/get/patch/{channel} | Bloque |
| `/eos/get/patch/chan_pos` | eos_patch_get_augment3d_position | Non officiel (extension Augment3d non confirmee) | Aucune alternative OSC officielle confirmee | Bloque |
| `/eos/get/patch/chan_beam` | eos_patch_get_augment3d_beam | Non officiel (extension Augment3d non confirmee) | Aucune alternative OSC officielle confirmee | Bloque |
| `/eos/get/version` | eos_get_version | Officiel | n/a | Autorise |
| `/eos/get/setup_defaults` | eos_get_setup_defaults | Non officiel (diagnostic/setup non confirme) | Aucune alternative OSC officielle confirmee | Bloque |

Les contrats centralisés sont vérifiés dans `src/tools/__tests__/osc_contracts.test.ts` : adresse OSC, arguments OSC (snapshots), propagation `targetAddress` / `targetPort`, transformation d'erreur OSC en résultat MCP stable et rejet des paramètres inconnus pour les schémas stricts. Les tests de famille sous `src/tools/**/__tests__` conservent les scénarios métier détaillés.


## Suite OSC prioritaire (ajout 2026-06-06)

La suite dédiée `src/tools/__tests__/osc_priority_tools.test.ts` couvre maintenant les outils demandés en priorité avec des assertions explicites sur :

- l'adresse OSC générée et les arguments envoyés ;
- le comportement strict déclaré (`native_official_required` ou blocage de l'extension `/eos/get/cmd_line`) ;
- le comportement de compatibilité des cues `fire`, `go` et `select` via le repli `/eos/cmd` ;
- le rejet des entrées invalides et des paramètres inconnus ;
- le comportement `dry_run`, sans émission OSC, pour les outils prioritaires.

| Outil prioritaire | Couverture additionnelle obtenue |
| --- | --- |
| `eos_channel_set_parameter` | Frames natives par canal, tri/dédoublonnage des canaux, argument float, politique stricte native, rejet des canaux invalides, `dry_run` sans envoi. |
| `eos_address_select` | Adresse `/eos/addr`, argument adresse normalisée, politique stricte native, rejet des adresses libres dangereuses, `dry_run` sans envoi. |
| `eos_address_set_level` | Adresse `/eos/addr/{address}`, argument float de niveau, politique stricte native, rejet niveau hors plage, `dry_run` sans envoi. |
| `eos_address_set_dmx` | Adresse `/eos/addr/{address}/DMX`, argument entier DMX, politique stricte native, rejet DMX hors plage, `dry_run` sans envoi. |
| `eos_softkey_press` | Adresse `/eos/softkey/{index}`, argument d'état, politique stricte native, rejet index hors plage, `dry_run` sans envoi. |
| `eos_set_user_id` | Adresse `/eos/user`, argument entier utilisateur, politique stricte native, rejet utilisateur invalide, `dry_run` sans mutation de session ni envoi. |
| `eos_get_command_line` | Payload utilisateur sur `/eos/get/cmd_line`, blocage strict documenté de l'extension non officielle, rejet utilisateur invalide, `dry_run` sans lecture. |
| `eos_cue_fire` | Mode strict natif `/eos/cue/{cue}/fire`, mode compatibilité `/eos/cmd`, rejet cue invalide, `dry_run` sans envoi. |
| `eos_cue_go` | Mode strict natif `/eos/cue/{cuelist}/go`, mode compatibilité `/eos/cmd`, rejet paire cue/part invalide, `dry_run` sans envoi. |
| `eos_cue_select` | Mode strict natif `/eos/cue/{cue}`, mode compatibilité `/eos/cmd`, rejet paramètres inconnus, `dry_run` sans envoi. |

| Famille | Outil MCP exporté | Commande OSC | Test associé |
| --- | --- | --- | --- |
| capabilities | `eos_capabilities_get` | — | — (outil non OSC ou orchestrateur) |
| connection | `ping` | — | — (outil non OSC ou orchestrateur) |
| connection | `eos_connect` | — | — (outil non OSC ou orchestrateur) |
| connection | `eos_configure` | — | — (outil non OSC ou orchestrateur) |
| connection | `eos_ping` | `/eos/ping` | `src/tools/__tests__/osc_contracts.test.ts` |
| connection | `eos_reset` | — | — (outil non OSC ou orchestrateur) |
| connection | `eos_subscribe` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_create_look` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_create_effect` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_create_cue_series` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_patch_fixture` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_patch_scan` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_autopatch_band` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_rehearsal_go_safe` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_build_groups_and_palettes` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_update_cue_look` | — | — (outil non OSC ou orchestrateur) |
| commands | `eos_command` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_new_command` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_command_with_substitution` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_get_command_line` | `/eos/get/cmd_line` | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| commands | `eos_get_user_command_line` | `/eos/get/cmd_line` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_select` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_set_level` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_set_dmx` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_dmx` | `/eos/addr/{address}/DMX` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_set_parameter` | `/eos/chan/{channel}/param/{parameter}` | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| channels | `eos_channel_get_info` | `/eos/get/channels` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_select` | `/eos/group` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_set_level` | `/eos/group/{group}/level` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_get_info` | `/eos/get/group` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_list_all` | `/eos/get/group/list` | `src/tools/__tests__/osc_contracts.test.ts` |
| diagnostics | `eos_enable_logging` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_readiness_check` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_get_diagnostics` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_console_targets` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_get_version` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_get_setup_defaults` | — | — (outil non OSC ou orchestrateur) |
| cues | `eos_cue_fire` | `/eos/cue/{cuelist}/{cue}/fire` (fallback `/eos/cmd`) | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| cues | `eos_cue_go` | `/eos/cue/{cuelist}/go` (fallback `/eos/cmd`) | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| cues | `eos_cue_stop_back` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_select` | `/eos/cue/{cue}` (fallback `/eos/cmd`) | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| cues | `eos_cue_get_info` | `/eos/get/cue` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_list_all` | `/eos/get/cuelist` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cuelist_get_info` | `/eos/get/cuelist/info` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cuelist_bank_create` | `/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cuelist_bank_page` | `/eos/cuelist/{bank_index}/page/{delta}` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_get_active_cue` | `/eos/get/active/cue` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_get_pending_cue` | `/eos/get/pending/cue` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_intensity_palette_fire` | `/eos/ip/fire` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_focus_palette_fire` | `/eos/fp/fire` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_color_palette_fire` | `/eos/cp/fire` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_beam_palette_fire` | `/eos/bp/fire` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_palette_get_info` | `/eos/get/palette` | `src/tools/__tests__/osc_contracts.test.ts` |
| presets | `eos_preset_fire` | `/eos/preset/fire` | `src/tools/__tests__/osc_contracts.test.ts` |
| presets | `eos_preset_select` | `/eos/preset` | `src/tools/__tests__/osc_contracts.test.ts` |
| presets | `eos_preset_get_info` | `/eos/get/preset` | `src/tools/__tests__/osc_contracts.test.ts` |
| submasters | `eos_submaster_set_level` | `/eos/sub/{submaster_number}` | `src/tools/__tests__/osc_contracts.test.ts` |
| submasters | `eos_submaster_bump` | `/eos/sub/{submaster_number}/bump` | `src/tools/__tests__/osc_contracts.test.ts` |
| submasters | `eos_submaster_get_info` | `/eos/get/submaster` | `src/tools/__tests__/osc_contracts.test.ts` |
| faders | `eos_fader_bank_create` | `/eos/fader/{index}/config/{faders}/{page}` | `src/tools/__tests__/osc_contracts.test.ts` |
| faders | `eos_fader_set_level` | `/eos/fader/{bank}/{page}/{fader}` | `src/tools/__tests__/osc_contracts.test.ts` |
| faders | `eos_fader_load` | `/eos/fader/{bank}/{page}/{fader}/load` | `src/tools/__tests__/osc_contracts.test.ts` |
| faders | `eos_fader_unload` | `/eos/fader/{bank}/{page}/{fader}/unload` | `src/tools/__tests__/osc_contracts.test.ts` |
| faders | `eos_fader_page` | `/eos/fader/{index}/page/{delta}` | `src/tools/__tests__/osc_contracts.test.ts` |
| macros | `eos_macro_fire` | `/eos/macro/fire` | `src/tools/__tests__/osc_contracts.test.ts` |
| macros | `eos_macro_select` | `/eos/macro` | `src/tools/__tests__/osc_contracts.test.ts` |
| macros | `eos_macro_get_info` | `/eos/get/macro` | `src/tools/__tests__/osc_contracts.test.ts` |
| effects | `eos_effect_select` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| effects | `eos_effect_stop` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| effects | `eos_effect_get_info` | `/eos/get/effect` | `src/tools/__tests__/osc_contracts.test.ts` |
| wheel | `eos_wheel_tick` | `/eos/param/wheel/tick` | `src/tools/__tests__/osc_contracts.test.ts` |
| switch | `eos_switch_continuous` | `/eos/param/wheel/rate` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_color_hs` | `/eos/param/color/hs` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_color_rgb` | `/eos/param/color/rgb` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_pantilt_xy` | `/eos/param/position/xy` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_xyz_position` | `/eos/param/position/xyz` | `src/tools/__tests__/osc_contracts.test.ts` |
| queries | `eos_get_active_wheels` | `/eos/get/active/wheels` | `src/tools/__tests__/osc_contracts.test.ts` |
| keys | `eos_key_press` | `/eos/key/{key}` | `src/tools/__tests__/osc_contracts.test.ts` |
| keys | `eos_softkey_press` | `/eos/softkey/{index}` | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| keys | `eos_get_softkey_labels` | `/eos/get/softkey_labels` | `src/tools/__tests__/osc_contracts.test.ts` |
| directSelects | `eos_direct_select_bank_create` | `/eos/ds/{index}/config/{target}/{buttons}/{flexi}/{page}` | `src/tools/__tests__/osc_contracts.test.ts` |
| directSelects | `eos_direct_select_press` | `/eos/ds/{index}/button/{page}/{button}` | `src/tools/__tests__/osc_contracts.test.ts` |
| directSelects | `eos_direct_select_page` | `/eos/ds/{index}/page/{delta}` | `src/tools/__tests__/osc_contracts.test.ts` |
| magicSheets | `eos_magic_sheet_open` | `/eos/ms` | `src/tools/__tests__/osc_contracts.test.ts` |
| magicSheets | `eos_magic_sheet_send_string` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| magicSheets | `eos_magic_sheet_get_info` | `/eos/get/magic_sheet` | `src/tools/__tests__/osc_contracts.test.ts` |
| pixelMaps | `eos_pixmap_select` | `/eos/pixmap` | `src/tools/__tests__/osc_contracts.test.ts` |
| pixelMaps | `eos_pixmap_get_info` | `/eos/get/pixmap` | `src/tools/__tests__/osc_contracts.test.ts` |
| curves | `eos_curve_select` | `/eos/curve/select` | `src/tools/__tests__/osc_contracts.test.ts` |
| curves | `eos_curve_get_info` | `/eos/get/curve` | `src/tools/__tests__/osc_contracts.test.ts` |
| fixture | `eos_fixture_search` | — | — (outil non OSC ou orchestrateur) |
| patch | `eos_patch_get_channel_info` | `/eos/get/patch/chan_info` | `src/tools/__tests__/osc_contracts.test.ts` |
| patch | `eos_patch_get_augment3d_position` | `/eos/get/patch/chan_pos` | `src/tools/__tests__/osc_contracts.test.ts` |
| patch | `eos_patch_get_augment3d_beam` | `/eos/get/patch/chan_beam` | `src/tools/__tests__/osc_contracts.test.ts` |
| snapshots | `eos_snapshot_recall` | `/eos/snap` | `src/tools/__tests__/osc_contracts.test.ts` |
| snapshots | `eos_snapshot_get_info` | `/eos/get/snapshot` | `src/tools/__tests__/osc_contracts.test.ts` |
| queries | `eos_get_show_name` | `/eos/get/show/name` | `src/tools/__tests__/osc_contracts.test.ts` |
| queries | `eos_get_live_blind_state` | `/eos/get/live/blind` | `src/tools/__tests__/osc_contracts.test.ts` |
| toggle | `eos_toggle_staging_mode` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_set_cue_send_string` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_set_cue_receive_string` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| showfile | `eos_showfile_import` | — | — (outil non OSC ou orchestrateur) |
| showfile | `eos_showfile_get_patch` | — | — (outil non OSC ou orchestrateur) |
| showfile | `eos_showfile_list_groups` | — | — (outil non OSC ou orchestrateur) |
| showfile | `eos_showfile_list_labels` | — | — (outil non OSC ou orchestrateur) |
| showfile | `eos_showfile_list_cues` | — | — (outil non OSC ou orchestrateur) |
| showfile | `eos_showfile_list_palettes` | — | — (outil non OSC ou orchestrateur) |
| showfile | `eos_showfile_list_fixtures` | — | — (outil non OSC ou orchestrateur) |
| queries | `eos_get_count` | `cue`: `/eos/get/cue/count`<br>`cuelist`: `/eos/get/cuelist/count`<br>`group`: `/eos/get/group/count`<br>`macro`: `/eos/get/macro/count`<br>`ms`: `/eos/get/magic_sheet/count`<br>`ip`: `/eos/get/ip/count`<br>`fp`: `/eos/get/fp/count`<br>`cp`: `/eos/get/cp/count`<br>`bp`: `/eos/get/bp/count`<br>`preset`: `/eos/get/preset/count`<br>`sub`: `/eos/get/submaster/count`<br>`fx`: `/eos/get/effect/count`<br>`curve`: `/eos/get/curve/count`<br>`snap`: `/eos/get/snapshot/count`<br>`pixmap`: `/eos/get/pixmap/count` | `src/tools/__tests__/osc_contracts.test.ts` |
| queries | `eos_get_list_all` | `cue`: `/eos/get/cue/list`<br>`cuelist`: `/eos/get/cuelist/list`<br>`group`: `/eos/get/group/list`<br>`macro`: `/eos/get/macro/list`<br>`ms`: `/eos/get/magic_sheet/list`<br>`ip`: `/eos/get/ip/list`<br>`fp`: `/eos/get/fp/list`<br>`cp`: `/eos/get/cp/list`<br>`bp`: `/eos/get/bp/list`<br>`preset`: `/eos/get/preset/list`<br>`sub`: `/eos/get/submaster/list`<br>`fx`: `/eos/get/effect/list`<br>`curve`: `/eos/get/curve/list`<br>`snap`: `/eos/get/snapshot/list`<br>`pixmap`: `/eos/get/pixmap/list` | `src/tools/__tests__/osc_contracts.test.ts` |
| fpe | `eos_fpe_get_set_count` | `/eos/get/fpe/set/count` | `src/tools/__tests__/osc_contracts.test.ts` |
| fpe | `eos_fpe_get_set_info` | `/eos/get/fpe/set` | `src/tools/__tests__/osc_contracts.test.ts` |
| fpe | `eos_fpe_get_point_info` | `/eos/get/fpe/point` | `src/tools/__tests__/osc_contracts.test.ts` |
| dmx | `eos_address_select` | `/eos/addr` | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| dmx | `eos_address_set_level` | `/eos/addr/{address}` | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| dmx | `eos_address_set_dmx` | `/eos/addr/{address}/DMX` | `src/tools/__tests__/osc_contracts.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| programming | `eos_set_user_id` | `/eos/user` | `src/tools/session/__tests__/session.test.ts`; `src/tools/__tests__/osc_priority_tools.test.ts` |
| session | `session_set_current_user` | — | — (outil non OSC ou orchestrateur) |
| session | `session_get_current_user` | — | — (outil non OSC ou orchestrateur) |
| session | `session_set_context` | — | — (outil non OSC ou orchestrateur) |
| session | `session_get_context` | — | — (outil non OSC ou orchestrateur) |
| session | `session_clear_context` | — | — (outil non OSC ou orchestrateur) |
| cues | `eos_cue_record` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_update` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_label_set` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_palette_record` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| palettes | `eos_palette_label_set` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| patch | `eos_patch_set_channel` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
