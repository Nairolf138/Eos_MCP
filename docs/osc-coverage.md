# Couverture OSC ↔ MCP

> Catalogue généré avec `npm run docs:generate -- --skip-jsdoc`.

Les chemins ci-dessous sont des modèles de routage, pas des commandes shell. Les arguments MCP sont du JSON ; les paquets OSC contiennent des arguments typés ETC, jamais une sérialisation JSON de ces arguments.

Sources : [dictionnaire ETC](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm), [OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm), [EosSyncLib ETC](https://github.com/ETCLabs/EosSyncLib).

## Contrats natifs

| Usage | Requête / sortie | Arguments et portée |
| --- | --- | --- |
| Version | `/eos/get/version` → `/eos/out/get/version` | Requête vide ; version et bibliothèque en chaînes, drapeau gel en booléen |
| Objets | `/eos/get/{family}/{number}` | Réponses `/eos/out/get/...` typées ; familles `sub`, `fx`, `snap`, `ms` |
| Énumération | `/eos/get/{family}/count`, puis `/index/{index}` | Les cues nécessitent une liste : `/eos/get/cue/{list}/count` et `/index/{index}` |
| Patch | `/eos/get/patch/{channel}/{part}` | Parties natives à partir de 1 ; toutes les parties sont réunies localement pour une lecture globale |
| Fragments reçus | `/eos/out/get/.../list/{start}/{total}` | Offsets sur les arguments complets, sections obligatoires et UID cohérents ; absence ou délai = erreur |
| Commande texte | `/eos/cmd`, `/eos/newcmd`, `/eos/user/{user}/cmd`, `/eos/user/{user}/newcmd` | Un argument chaîne ; `#` termine la commande ; adresse utilisateur atomique |
| Ligne de commande | `/eos/out/cmd`, `/eos/out/user/{user}/cmd` | Observation passive, texte et drapeau erreur ; aucune requête Get inventée |
| GO / Stop-Back | `/eos/cues/{list}/fire`, `/eos/cues/{list}/stop` | Stop-Back dépend de l’état de lecture ; aucune option back indépendante |
| Cue déterminée | `/eos/cue/{cue}/fire`, `/eos/cue/{list}/{cue}[/part]/fire` | Liste absente conservée ; partie explicite exige une liste explicite |
| Groupe / sub | `/eos/group/{n}`, `/eos/sub/{n}` | Niveau groupe flottant 0–100 ; sub flottant 0–1 |
| Adresse DMX | `/eos/addr`, `/eos/addr/{n}`, `/eos/addr/{n}/DMX` | Adresse absolue entière ; niveau flottant 0–100 ou valeur DMX entière 0–255 |
| Couleur | `/eos/color/hs`, `/eos/color/rgb` | H 0–360, S 0–100 ; RGB 0–1 |
| Étiquettes | `/eos/set/.../label` | Une chaîne native, pas une commande Label construite avec du texte utilisateur |
| État, roues, softkeys | `/eos/out/event/state`, `/eos/out/active/wheel/{index}`, `/eos/out/softkey/{index}` | Cache daté ; données incomplètes ou périmées signalées |

## Niveau de preuve

Les fixtures de `nativePeer.ts` sont synthétiques, construites à partir des tables ETC. Les tests de conformance utilisent de vraies sockets UDP/TCP en boucle locale. Ce ne sont pas des captures de console ni une certification de versions Eos.

`sent_to_transport` prouve un envoi au transport. `accepted_by_eos` repose sur un retour de commande récent, corrélé à la cible et à l’utilisateur. `verified` exige une relecture du résultat annoncé. Un ACK, une existence ou une étiquette relue ne prouvent pas les valeurs enregistrées dans une cue, palette ou un sub.

Les métadonnées `validated_cmd_fallback` indiquent un routage par l’entrée de commande ETC ; elles ne certifient pas toute syntaxe de commande fournie par un utilisateur. Aucun endpoint sortant inconnu n’est autorisé, même hors mode strict.

Tests : `osc_contracts.test.ts` (catalogue et écritures natives), `native_reads.test.ts` (schémas publiés), `client.test.ts` (décodage, fragmentation, délais, provenance), `native_preparation.test.ts` et `workflows.test.ts` (préconditions, séquences, readbacks), `mcp-e2e.test.ts` (client SDK). Voir [limites natives](native-osc-limitations.md), [validation](validation-work-in-progress.md) et [tests E2E](testing-e2e.md).

## Catalogue courant

| Outil MCP | Routage / observation |
| --- | --- |
| `eos_address_select` | `/eos/addr` |
| `eos_address_set_dmx` | `/eos/addr/{address}/DMX` |
| `eos_address_set_level` | `/eos/addr/{address}` |
| `eos_beam_palette_fire` | `/eos/bp/fire` |
| `eos_capabilities_get` | Contexte local et capacités observées ; voir eos_connect |
| `eos_channel_get_info` | `/eos/get/patch/{channel}/{part}` |
| `eos_channel_select` | `/eos/newcmd` |
| `eos_channel_set_dmx` | `/eos/newcmd` |
| `eos_channel_set_level` | `/eos/newcmd` |
| `eos_channel_set_parameter` | `/eos/chan/{channel}/param/{parameter}` |
| `eos_color_palette_fire` | `/eos/cp/fire` |
| `eos_command` | `/eos/cmd` |
| `eos_command_with_substitution` | `/eos/cmd` |
| `eos_configure` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_connect` | `/eos/get/version` (connexion locale et lecture native) |
| `eos_console_targets` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_cue_fire` | `/eos/cue/{cuelist}/{cue}/fire` |
| `eos_cue_get_info` | `/eos/get/cue/{cuelist}/{cue}/{part}` |
| `eos_cue_go` | `/eos/cues/{cuelist}/fire` |
| `eos_cue_label_set` | `/eos/set/cue/{cuelist}/{number}/label` |
| `eos_cue_list_all` | `/eos/get/cue/{cuelist}/index/{index}` |
| `eos_cue_record` | `/eos/newcmd` |
| `eos_cue_select` | `/eos/cue` |
| `eos_cue_stop_back` | `/eos/cues/{cuelist}/stop` |
| `eos_cue_update` | `/eos/newcmd` |
| `eos_cuelist_bank_create` | `/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}` |
| `eos_cuelist_bank_page` | `/eos/cuelist/{bank_index}/page/{delta}` |
| `eos_cuelist_get_info` | `/eos/get/cuelist/{cuelist}` |
| `eos_curve_get_info` | `/eos/get/curve/{number}` |
| `eos_curve_select` | `/eos/curve` |
| `eos_direct_select_bank_create` | `/eos/ds/{index}/{target}/{buttons}` |
| `eos_direct_select_page` | `/eos/ds/{index}/page/{delta}` |
| `eos_direct_select_press` | `/eos/ds/{index}/{button}` |
| `eos_effect_get_info` | `/eos/get/fx/{number}` |
| `eos_effect_select` | `/eos/fx` |
| `eos_effect_stop` | `/eos/newcmd` |
| `eos_enable_logging` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_fader_bank_create` | `/eos/fader/{index}/config/{faders}` |
| `eos_fader_load` | `/eos/fader/{index}/{fader}/load` |
| `eos_fader_page` | `/eos/fader/{index}/page/{delta}` |
| `eos_fader_set_level` | `/eos/fader/{index}/{fader}` |
| `eos_fader_unload` | `/eos/fader/{index}/{fader}/unload` |
| `eos_fixture_search` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_focus_palette_fire` | `/eos/fp/fire` |
| `eos_fpe_get_point_info` | `/eos/get/fpe/{set}/{point}` |
| `eos_fpe_get_set_count` | `/eos/get/fpe/count` |
| `eos_fpe_get_set_info` | `/eos/get/fpe/{set}` |
| `eos_get_active_cue` | `/eos/out/active/cue` |
| `eos_get_active_wheels` | `/eos/out/active/wheel/{index}` |
| `eos_get_command_line` | `/eos/out/user/{number}/cmd` |
| `eos_get_count` | `/eos/get/{family}/count` ; cues : `/eos/get/cue/{list}/count` |
| `eos_get_diagnostics` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_get_list_all` | Get count puis `/eos/get/{family}/index/{index}` ; cues : liste explicite |
| `eos_get_live_blind_state` | `/eos/out/event/state` |
| `eos_get_pending_cue` | `/eos/out/pending/cue` |
| `eos_get_setup_defaults` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_get_show_name` | `/eos/get/show/path` |
| `eos_get_softkey_labels` | `/eos/out/softkey/{index}` |
| `eos_get_user_command_line` | `/eos/out/user/{number}/cmd` |
| `eos_get_version` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_group_get_info` | `/eos/get/group/{number}` |
| `eos_group_list_all` | `/eos/get/group/index/{index}` |
| `eos_group_select` | `/eos/group` |
| `eos_group_set_level` | `/eos/group/{group}` |
| `eos_intensity_palette_fire` | `/eos/ip/fire` |
| `eos_key_press` | `/eos/key/{key}` |
| `eos_macro_fire` | `/eos/macro/fire` |
| `eos_macro_get_info` | `/eos/get/macro/{number}` |
| `eos_macro_select` | `/eos/macro` |
| `eos_magic_sheet_get_info` | `/eos/get/ms/{number}` |
| `eos_magic_sheet_open` | `/eos/ms` |
| `eos_new_command` | `/eos/newcmd` |
| `eos_palette_get_info` | `/eos/get/{palette_type}/{number}` |
| `eos_palette_label_set` | `/eos/set/{palette_type}/{number}/label` |
| `eos_palette_record` | `/eos/newcmd` |
| `eos_patch_get_augment3d_beam` | `/eos/get/patch/{channel}/{part}/augment3d/beam` |
| `eos_patch_get_augment3d_position` | `/eos/get/patch/{channel}/{part}/augment3d/position` |
| `eos_patch_get_channel_info` | `/eos/get/patch/{channel}/{part}` |
| `eos_patch_set_channel` | `/eos/newcmd` |
| `eos_ping` | `/eos/ping` |
| `eos_pixmap_get_info` | `/eos/get/pixmap/{number}` |
| `eos_pixmap_select` | `/eos/pixmap` |
| `eos_preset_fire` | `/eos/preset/fire` |
| `eos_preset_get_info` | `/eos/get/preset/{number}` |
| `eos_preset_select` | `/eos/preset` |
| `eos_readiness_check` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_reset` | `/eos/reset` (sans arguments, sans accusé de réception) |
| `eos_set_color_hs` | `/eos/color/hs` |
| `eos_set_color_rgb` | `/eos/color/rgb` |
| `eos_set_dmx` | `/eos/addr/{address}/DMX` |
| `eos_set_pantilt_xy` | `/eos/pantilt/xy` |
| `eos_set_user_id` | `/eos/user` |
| `eos_set_xyz_position` | `/eos/xyz` |
| `eos_showfile_get_patch` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_showfile_import` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_showfile_list_cues` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_showfile_list_fixtures` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_showfile_list_groups` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_showfile_list_labels` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_showfile_list_palettes` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `eos_snapshot_get_info` | `/eos/get/snap/{number}` |
| `eos_snapshot_recall` | `/eos/snap/fire` |
| `eos_softkey_press` | `/eos/softkey/{index}` |
| `eos_submaster_bump` | `/eos/sub/{submaster_number}/fire` |
| `eos_submaster_get_info` | `/eos/get/sub/{number}` |
| `eos_submaster_record` | Préparation sélective : Get sub, commandes utilisateur et Set label |
| `eos_submaster_set_level` | `/eos/sub/{submaster_number}` |
| `eos_subscribe` | `/eos/subscribe`, `/eos/subscribe/param/{name}` (entier 0 ou 1) |
| `eos_switch_continuous` | `/eos/switch/{parameter}` |
| `eos_toggle_staging_mode` | `/eos/key/staging_mode` |
| `eos_wheel_tick` | `/eos/wheel/{mode}/{parameter}` |
| `eos_workflow_autopatch_band` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `eos_workflow_build_groups_and_palettes` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `eos_workflow_create_cue_series` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `eos_workflow_create_look` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `eos_workflow_patch_fixture` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `eos_workflow_patch_scan` | Lectures natives `/eos/get/patch/{channel}/{part}` |
| `eos_workflow_rehearsal_go_safe` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `eos_workflow_update_cue_look` | Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook |
| `ping` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `session_clear_context` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `session_get_context` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `session_get_current_user` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `session_set_context` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
| `session_set_current_user` | Pas de mapping direct déclaré ; voir description (outil local ou orchestration) |
