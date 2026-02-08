# Conformite OSC : outils MCP ↔ manuel Eos

Ce document mappe chaque outil MCP aux commandes OSC officielles de la documentation Eos. Les references de pages indiquent les numeros imprimes dans le manuel **Famille Eos v3.0.0 Manuel d'exploitation** (fichier `docs/eos_serie.pdf`, section ShowControl > Open Sound Control). Les commandes non documentees dans ce manuel sont marquees comme extensions MCP/Eos.

> **Version de reference :** Eos v3.0.0 (manuel FR, ShowControl p. 594-626).

## Commandes texte & ligne de commande

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_command`, `eos_command_with_substitution`, `eos_channel_select`, `eos_channel_set_level`, `eos_channel_set_dmx`, `eos_set_dmx`, `eos_cue_stop_back` | `/eos/cmd` | `/eos/cmd` | Chaine de commande (optionnellement terminee par `#`, substitutions `%1..%n`) | v3.0.0 | ShowControl > OSC > Ligne de commande (p. 614) | Utilise pour envoyer des commandes type `Chan`, `Address`, `Cue Stop/Back`. |
| `eos_new_command`, `eos_cue_record`, `eos_cue_update`, `eos_cue_label_set`, `eos_palette_record`, `eos_palette_label_set`, `eos_patch_set_channel`, `eos_workflow_create_look`, `eos_workflow_patch_fixture`, `eos_workflow_rehearsal_go_safe` | `/eos/newcmd` | `/eos/newcmd` | Chaine de commande (efface la ligne avant l'envoi) | v3.0.0 | ShowControl > OSC > Ligne de commande (p. 614) | Utilise pour les commandes deterministes avec reset de ligne. |
| `eos_get_command_line`, `eos_get_user_command_line`, `eos_workflow_rehearsal_go_safe` (precheck) | `/eos/get/cmd_line` | _Non documente dans le manuel v3.0.0_ | Requete sans argument, reponse texte ligne de commande | n/a | n/a | Extension MCP pour lecture de ligne de commande. |

## Connexion & ping

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_ping` | `/eos/ping` | `/eos/ping` | Aucun ou echo string (retour via `/eos/out/ping`) | v3.0.0 | ShowControl > OSC > Ping (p. 595 & p. 617) | Utilise pour valider la connectivite OSC. |
| `eos_connect`, `eos_reset`, `eos_subscribe`, `eos_configure` | `/eos/handshake`, `/eos/reset`, `/eos/subscribe` (internes) | _Non documente dans le manuel v3.0.0_ | — | n/a | n/a | Actions de connexion/abonnement propres au serveur MCP. |

## Clavier & softkeys

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_key_press` | `/eos/key/{key}` | `/eos/key/<nom>` | Etat de touche `1.0` (press) / `0.0` (release) | v3.0.0 | ShowControl > OSC > Touche (p. 607) | Exemple manuel: `/eos/key/go`. |
| `eos_softkey_press` | `/eos/key/softkey{number}` | `/eos/softkey/<index>` | Etat de touche `1.0` / `0.0` | v3.0.0 | ShowControl > OSC > Softkey (p. 613) | MCP utilise un alias `/eos/key/softkey{n}`. |
| `eos_get_softkey_labels` | `/eos/get/softkey_labels` | _Non documente dans le manuel v3.0.0_ | Requete JSON | n/a | n/a | Extension MCP pour recuperer les libelles. |

## Canaux & DMX

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_channel_select` | `/eos/cmd` | `/eos/chan` | Numero de circuit (selection) | v3.0.0 | ShowControl > OSC > Circ (p. 596) | MCP traduit en commande `Chan ...`. |
| `eos_channel_set_level` | `/eos/cmd` | `/eos/chan/<num>/level` ou `/eos/at` | Etat touche/valeur d'intensite | v3.0.0 | ShowControl > OSC > Circ/At (p. 596-598) | MCP envoie `Chan ... Sneak <niveau>`. |
| `eos_channel_set_dmx` | `/eos/cmd` | `/eos/chan/<num>/param/.../dmx` | Valeur DMX (0-255) | v3.0.0 | ShowControl > OSC > Circ Param/DMX (p. 597) | MCP envoie `Chan ... At <DMX>`. |
| `eos_set_dmx` | `/eos/cmd` | `/eos/addr/<adresse>/dmx` | Valeur DMX (0-255) | v3.0.0 | ShowControl > OSC > Adresse (p. 607) | MCP envoie `Address ... At <DMX>`. |
| `eos_channel_set_parameter` | `/eos/chan/param` | `/eos/chan/<num>/param/<param>` | Valeurs de parametres (float) | v3.0.0 | ShowControl > OSC > Circ Param (p. 597) | MCP utilise payload JSON. |
| `eos_channel_get_info` | `/eos/get/channels` | _Non documente dans le manuel v3.0.0_ | Requete JSON | n/a | n/a | Extension MCP pour lecture des canaux. |
| `eos_address_select` | `/eos/dmx/address/select` | `/eos/addr` | Adresse a selectionner | v3.0.0 | ShowControl > OSC > Adresse (p. 607) | MCP utilise un alias plus explicite. |
| `eos_address_set_level` | `/eos/dmx/address/level` | `/eos/addr/<adresse>` | Niveau 0-100 | v3.0.0 | ShowControl > OSC > Adresse (p. 607) | MCP utilise un alias plus explicite. |
| `eos_address_set_dmx` | `/eos/dmx/address/dmx` | `/eos/addr/<adresse>/dmx` | Valeur DMX (0-255) | v3.0.0 | ShowControl > OSC > Adresse (p. 607) | MCP utilise un alias plus explicite. |

## Groupes

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_group_select` | `/eos/group` | `/eos/group` | Numero de groupe a selectionner | v3.0.0 | ShowControl > OSC > Groupe (p. 608) | — |
| `eos_group_set_level` | `/eos/group/{group}/level` | `/eos/group/<num>/level` | Etat touche / niveau | v3.0.0 | ShowControl > OSC > Groupe (p. 608) | MCP accepte un niveau en pourcentage. |
| `eos_group_get_info`, `eos_group_list_all` | `/eos/get/group`, `/eos/get/group/list` | `/eos/get/group/...` | Requetes de synchronisation (count/list/index) | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | MCP abstrait les listes. |

## Palettes & presets

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_intensity_palette_fire` | `/eos/ip/fire` | `/eos/ip/fire` | Numero de palette intensite | v3.0.0 | ShowControl > OSC > Palette Intensite (p. 610) | — |
| `eos_focus_palette_fire` | `/eos/fp/fire` | `/eos/fp/fire` | Numero de palette focus | v3.0.0 | ShowControl > OSC > Palette Focus (p. 610) | — |
| `eos_color_palette_fire` | `/eos/cp/fire` | `/eos/cp/fire` | Numero de palette couleur | v3.0.0 | ShowControl > OSC > Palette Couleur (p. 610) | — |
| `eos_beam_palette_fire` | `/eos/bp/fire` | `/eos/bp/fire` | Numero de palette beam | v3.0.0 | ShowControl > OSC > Palette Beam (p. 610) | — |
| `eos_preset_fire`, `eos_preset_select` | `/eos/preset/fire`, `/eos/preset` | `/eos/preset`, `/eos/preset/fire` | Numero de preset (select/fire) | v3.0.0 | ShowControl > OSC > Preset (p. 609) | — |
| `eos_palette_get_info`, `eos_preset_get_info` | `/eos/get/palette`, `/eos/get/preset` | `/eos/get/...` | Requetes de synchronisation (count/list/index) | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | MCP expose un format JSON de lecture. |

## Macros & snapshots

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_macro_select` | `/eos/macro/select` | `/eos/macro` | Numero de macro a selectionner | v3.0.0 | ShowControl > OSC > Macro (p. 608) | MCP scinde select/fire. |
| `eos_macro_fire` | `/eos/macro/fire` | `/eos/macro/fire` | Numero de macro a executer | v3.0.0 | ShowControl > OSC > Macro (p. 608) | — |
| `eos_macro_get_info` | `/eos/get/macro` | `/eos/get/macro/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |
| `eos_snapshot_recall` | `/eos/snapshot/recall` | `/eos/snap` | Numero de snapshot a rappeler | v3.0.0 | ShowControl > OSC > Autres elements (p. 613) | MCP utilise `/eos/snapshot/recall` comme alias. |
| `eos_snapshot_get_info` | `/eos/get/snapshot` | `/eos/get/snap/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |

## Courbes & effets

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_curve_select` | `/eos/curve/select` | `/eos/curve` | Numero de courbe a selectionner | v3.0.0 | ShowControl > OSC > Autres elements (p. 613) | MCP utilise `/eos/curve/select` comme alias. |
| `eos_curve_get_info` | `/eos/get/curve` | `/eos/get/curve/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |
| `eos_effect_select` | `/eos/effect/select` | `/eos/fx` | Numero d'effet a selectionner | v3.0.0 | ShowControl > OSC > Autres elements (p. 613) | MCP utilise `/eos/effect/select` comme alias. |
| `eos_effect_stop` | `/eos/effect/stop` | `/eos/fx` + stop (commande) | Etat touche/stop | v3.0.0 | ShowControl > OSC > Autres elements (p. 613) | MCP encapsule l'action stop. |
| `eos_effect_get_info` | `/eos/get/effect` | `/eos/get/fx/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |

## Parametres, couleurs & roues

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_wheel_tick` | `/eos/param/wheel/tick` | `/eos/wheel/<parameter>` | Increments de roue (+/-) | v3.0.0 | ShowControl > OSC > Roue (p. 600-602) | MCP envoie un alias JSON. |
| `eos_switch_continuous` | `/eos/param/wheel/rate` | `/eos/switch` | Mode switch / vitesse d'increments | v3.0.0 | ShowControl > OSC > Switch (p. 601-602) | MCP expose un controle continu. |
| `eos_set_color_hs` | `/eos/param/color/hs` | `/eos/color/hs` | Hue (0-360) + Saturation (0-100) | v3.0.0 | ShowControl > OSC > Couleur (p. 599) | — |
| `eos_set_color_rgb` | `/eos/param/color/rgb` | `/eos/color/rgb` | RGB (0.0-1.0) | v3.0.0 | ShowControl > OSC > Couleur (p. 599) | — |
| `eos_set_pantilt_xy` | `/eos/param/position/xy` | `/eos/pantilt/xy` | X/Y (0.0-1.0) | v3.0.0 | ShowControl > OSC > Roue (p. 599) | — |
| `eos_set_xyz_position` | `/eos/param/position/xyz` | _Non documente dans le manuel v3.0.0_ | Position XYZ | n/a | n/a | Extension MCP (Augment3d). |
| `eos_get_active_wheels` | `/eos/get/active/wheels` | `/eos/out/active/wheel/<number>` | Sortie implicite active wheel | v3.0.0 | ShowControl > OSC > Sortie OSC implicite (p. 616) | MCP expose une requete explicite. |

## FPE (focus point editing)

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_fpe_get_set_count`, `eos_fpe_get_set_info`, `eos_fpe_get_point_info` | `/eos/get/fpe/set/count`, `/eos/get/fpe/set`, `/eos/get/fpe/point` | _Non documente dans le manuel v3.0.0_ | Requetes JSON | n/a | n/a | Extension MCP pour Augment3d/FPE. |

## Faders & direct selects

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_fader_bank_create` | `/eos/fader/{index}/config/{faders}/{page}` | `/eos/fader/<index>/config/<faders>` | Nombre de faders + page | v3.0.0 | ShowControl > OSC > Banques Fader (p. 605) | — |
| `eos_fader_set_level` | `/eos/fader/{bank}/{page}/{fader}` | `/eos/fader/<index>/<fader>/level` | Niveau (0.0-1.0) | v3.0.0 | ShowControl > OSC > Banques Fader (p. 606) | MCP calcule page courante. |
| `eos_fader_load`, `eos_fader_unload` | `/eos/fader/{index}/{fader}/load`, `/eos/fader/{index}/{fader}/unload` | `/eos/fader/<index>/<fader>/load` | Aucun | v3.0.0 | ShowControl > OSC > Banques Fader (p. 606) | — |
| `eos_fader_page` | `/eos/fader/{index}/page/{delta}` | `/eos/fader/<index>/page/<delta>` | Delta de page | v3.0.0 | ShowControl > OSC > Banques Fader (p. 605) | — |
| `eos_direct_select_bank_create` | `/eos/ds/{index}/config/{target}/{buttons}/{flexi}/{page}` | `/eos/ds/<index>/<type>/<page>/<buttons>` | Type d'element + pagination | v3.0.0 | ShowControl > OSC > Selections directes (p. 603-604) | MCP ajoute parametres flexi/page. |
| `eos_direct_select_press` | `/eos/ds/{index}/button/{page}/{button}` | `/eos/ds/<index>/<button>` | Etat touche 1.0/0.0 | v3.0.0 | ShowControl > OSC > Selections directes (p. 604) | — |
| `eos_direct_select_page` | `/eos/ds/{index}/page/{delta}` | `/eos/ds/<index>/page/<delta>` | Delta de page | v3.0.0 | ShowControl > OSC > Selections directes (p. 604) | — |

## Pixel maps & Magic Sheets

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_pixmap_select` | `/eos/pixmap/select` | `/eos/pixmap` | Numero de pixel map | v3.0.0 | ShowControl > OSC > Autres elements (p. 613) | MCP utilise un alias `/select`. |
| `eos_pixmap_get_info` | `/eos/get/pixmap` | `/eos/get/pixmap/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |
| `eos_magic_sheet_open` | `/eos/magic_sheet/open` | `/eos/ms` | Numero de MagicSheet (option vue) | v3.0.0 | ShowControl > OSC > MagicSheet (p. 607) | MCP utilise `/eos/magic_sheet/open` comme alias. |
| `eos_magic_sheet_send_string` | `/eos/magic_sheet/send_string` | _Non documente dans le manuel v3.0.0_ | Chaine a injecter | n/a | n/a | Extension MCP pour MagicSheet. |
| `eos_magic_sheet_get_info` | `/eos/get/magic_sheet` | `/eos/get/ms/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |

## Requetes (Get Count / List)

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_get_count` | `/eos/get/<type>/count` | `/eos/get/<type>/count` | Aucun | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623) | Types: cue, cuelist, group, macro, sub, preset, ip, fp, cp, bp, fx, curve, snap, pixmap, ms. |
| `eos_get_list_all` | `/eos/get/<type>/list` | `/eos/get/<type>/<id>/list/<index>/<count>` | Pagination list | v3.0.0 | ShowControl > OSC > Synchronisation (p. 624) | MCP abstrait le paging. |

## Patch & submasters

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_patch_get_channel_info` | `/eos/get/patch/chan_info` | `/eos/get/patch/<channel>` | Numero de canal, parts | v3.0.0 | ShowControl > OSC > Synchronisation (p. 624) | MCP utilise un endpoint JSON `chan_info`. |
| `eos_patch_get_augment3d_position` | `/eos/get/patch/chan_pos` | _Non documente dans le manuel v3.0.0_ | Requete JSON | n/a | n/a | Extension MCP pour Augment3d. |
| `eos_patch_get_augment3d_beam` | `/eos/get/patch/chan_beam` | _Non documente dans le manuel v3.0.0_ | Requete JSON | n/a | n/a | Extension MCP pour Augment3d. |
| `eos_submaster_set_level`, `eos_submaster_bump` | `/eos/sub` | `/eos/sub` | Niveau ou bump (1.0/0.0) | v3.0.0 | ShowControl > OSC > Submaster (p. 609) | — |
| `eos_submaster_get_info` | `/eos/get/submaster` | `/eos/get/sub/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |

## Cues & show control

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_cue_fire` | `/eos/cue/fire` | `/eos/cue/<cuelist>/<cue>/fire` | Numero de cue (option cue list/part) | v3.0.0 | ShowControl > OSC > Cue (p. 611) | MCP encapsule en endpoint `/fire`. |
| `eos_cue_go` | `/eos/cue/go` | `/eos/cue/<cuelist>/go` | Numero de cue list | v3.0.0 | ShowControl > OSC > Cue (p. 611) | MCP utilise endpoint dedie. |
| `eos_cue_select` | `/eos/cue/select` | `/eos/cue/<num>` | Numero de cue | v3.0.0 | ShowControl > OSC > Cue (p. 611) | MCP encapsule selection. |
| `eos_cue_get_info`, `eos_cue_list_all` | `/eos/get/cue`, `/eos/get/cuelist` | `/eos/get/cue/...`, `/eos/get/cuelist/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |
| `eos_cuelist_get_info` | `/eos/get/cuelist/info` | `/eos/get/cuelist/...` | Requetes de synchronisation | v3.0.0 | ShowControl > OSC > Synchronisation (p. 623-624) | — |
| `eos_cuelist_bank_create`, `eos_cuelist_bank_page` | `/eos/cuelist/{bank_index}/config/...`, `/eos/cuelist/{bank_index}/page/{delta}` | `/eos/cuelist/<index>/config/...` | Config bank + pagination | v3.0.0 | ShowControl > OSC > Banques Cuelist (p. 612) | — |
| `eos_get_active_cue`, `eos_get_pending_cue` | `/eos/get/active/cue`, `/eos/get/pending/cue` | `/eos/out/active/cue`, `/eos/out/pending/cue` | Sortie implicite | v3.0.0 | ShowControl > OSC > Sortie OSC implicite (p. 616) | MCP transforme en requetes explicites. |
| `eos_get_show_name` | `/eos/get/show/name` | `/eos/out/show/name` | Sortie implicite | v3.0.0 | ShowControl > OSC > Evenements (p. 617) | MCP transforme en requete explicite. |
| `eos_get_live_blind_state` | `/eos/get/live/blind` | `/eos/out/event/state` | Etat Live/Blind (0/1) | v3.0.0 | ShowControl > OSC > Evenements (p. 617) | MCP transforme en requete explicite. |
| `eos_toggle_staging_mode` | `/eos/toggle/staging_mode` | _Non documente dans le manuel v3.0.0_ | Toggle staging | n/a | n/a | Extension MCP. |
| `eos_set_cue_send_string`, `eos_set_cue_receive_string` | `/eos/set/cue/send_string`, `/eos/set/cue/receive_string` | _Non documente dans le manuel v3.0.0_ | Format string | n/a | n/a | Extension MCP pour formatage ShowControl. |

## Systeme & diagnostics

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `eos_get_version` | `/eos/get/version` | `/eos/get/version` | Aucun | v3.0.0 | ShowControl > OSC > Implementer votre application (p. 622) | — |
| `eos_get_setup_defaults` | `/eos/get/setup_defaults` | _Non documente dans le manuel v3.0.0_ | Requete JSON | n/a | n/a | Extension MCP. |
| `eos_set_user_id` | `/eos/set/user_id` | `/eos/user` | Numero d'utilisateur OSC | v3.0.0 | ShowControl > OSC > User (p. 613) | MCP utilise un endpoint explicite. |
| `eos_enable_logging`, `eos_get_diagnostics` | — | _Hors OSC console_ | — | n/a | n/a | Outils serveur MCP. |

## Outils serveur MCP (hors OSC officiel)

| Outils MCP | Adresse OSC utilisee | Commande OSC officielle (manuel) | Arguments OSC (manuel) | Version | Reference (section/page) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `session_set_current_user`, `session_get_current_user`, `session_set_context`, `session_get_context`, `session_clear_context` | — | _Hors OSC console_ | — | n/a | n/a | Gestion locale de session MCP. |
| `eos_capabilities_get` | — | _Hors OSC console_ | — | n/a | n/a | Informations internes MCP. |
| `ping` | — | _Hors OSC console_ | — | n/a | n/a | Ping serveur MCP. |
