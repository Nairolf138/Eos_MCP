# Couverture OSC ↔ MCP

Ce document recense les familles/commandes OSC EOS prises en charge par les outils MCP. Il est base sur `src/services/osc/mappings.ts` et les outils exposes dans `src/tools`.

> ✅ **Couvert** : une ou plusieurs commandes MCP permettent d'appeler cette adresse OSC.
> ⚠️ **Partiel** : l'adresse sert de base a d'autres outils (construction dynamique).
> ❌ **Non couvert** : aucun outil MCP ne cible directement la commande.

## Commandes & connexion

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| commands | `/eos/cmd` | `eos_command`, `eos_command_with_substitution`, `eos_new_command` (clearLine=false) | ✅ |
| commands | `/eos/newcmd` | `eos_new_command` | ✅ |
| commands | `/eos/get/cmd_line` | `eos_get_command_line` | ✅ |
| connection | `/eos/ping` | `eos_ping` | ✅ |

## Clavier & softkeys

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| keys | `/eos/key/{key}` | `eos_key_press` | ✅ |
| keys | `/eos/key/softkey{number}` | `eos_softkey_press` | ✅ |
| keys | `/eos/get/softkey_labels` | `eos_get_softkey_labels` | ✅ |
| keys | `/eos/key` | — | ⚠️ Base utilisee pour construire les adresses des touches. |

## Channels & DMX

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| channels | `/eos/cmd` | `eos_channel_select`, `eos_channel_set_level` | ✅ |
| channels | `/eos/chan` | — | ❌ Aucun outil direct. |
| channels | `/eos/chan/param` | `eos_channel_set_parameter` | ✅ |
| channels | `/eos/get/channels` | `eos_channel_get_info` | ✅ |
| dmx | `/eos/cmd` | `eos_set_dmx` | ✅ |
| dmx | `/eos/dmx/address/select` | `eos_address_select` | ✅ |
| dmx | `/eos/dmx/address/level` | `eos_address_set_level` | ✅ |
| dmx | `/eos/dmx/address/dmx` | `eos_address_set_dmx` | ✅ |

## Groups

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| groups | `/eos/group` | `eos_group_select` | ✅ |
| groups | `/eos/group/{group}/level` | `eos_group_set_level` | ✅ |
| groups | `/eos/get/group` | `eos_group_get_info` | ✅ |
| groups | `/eos/get/group/list` | `eos_group_list_all` | ✅ |

## Palettes & presets

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| palettes | `/eos/get/palette` | `eos_palette_get_info` | ✅ |
| palettes.intensity | `/eos/ip/fire` | `eos_intensity_palette_fire` | ✅ |
| palettes.intensity | `/eos/get/ip` | `eos_palette_get_info` | ✅ |
| palettes.focus | `/eos/fp/fire` | `eos_focus_palette_fire` | ✅ |
| palettes.focus | `/eos/get/fp` | `eos_palette_get_info` | ✅ |
| palettes.color | `/eos/cp/fire` | `eos_color_palette_fire` | ✅ |
| palettes.color | `/eos/get/cp` | `eos_palette_get_info` | ✅ |
| palettes.beam | `/eos/bp/fire` | `eos_beam_palette_fire` | ✅ |
| palettes.beam | `/eos/get/bp` | `eos_palette_get_info` | ✅ |
| presets | `/eos/preset/fire` | `eos_preset_fire` | ✅ |
| presets | `/eos/preset` | `eos_preset_select` | ✅ |
| presets | `/eos/get/preset` | `eos_preset_get_info` | ✅ |

## Macros & snapshots

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| macros | `/eos/macro/fire` | `eos_macro_fire` | ✅ |
| macros | `/eos/macro/select` | `eos_macro_select` | ✅ |
| macros | `/eos/get/macro` | `eos_macro_get_info` | ✅ |
| snapshots | `/eos/snapshot/recall` | `eos_snapshot_recall` | ✅ |
| snapshots | `/eos/get/snapshot` | `eos_snapshot_get_info` | ✅ |

## Courbes & effets

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| curves | `/eos/curve/select` | `eos_curve_select` | ✅ |
| curves | `/eos/get/curve` | `eos_curve_get_info` | ✅ |
| effects | `/eos/effect/select` | `eos_effect_select` | ✅ |
| effects | `/eos/effect/stop` | `eos_effect_stop` | ✅ |
| effects | `/eos/get/effect` | `eos_effect_get_info` | ✅ |

## Parametres & FPE

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| parameters | `/eos/param/wheel/tick` | `eos_wheel_tick` | ✅ |
| parameters | `/eos/param/wheel/rate` | `eos_switch_continuous` | ✅ |
| parameters | `/eos/param/color/hs` | `eos_set_color_hs` | ✅ |
| parameters | `/eos/param/color/rgb` | `eos_set_color_rgb` | ✅ |
| parameters | `/eos/param/position/xy` | `eos_set_pantilt_xy` | ✅ |
| parameters | `/eos/param/position/xyz` | `eos_set_xyz_position` | ✅ |
| parameters | `/eos/get/active/wheels` | `eos_get_active_wheels` | ✅ |
| fpe | `/eos/get/fpe/set/count` | `eos_fpe_get_set_count` | ✅ |
| fpe | `/eos/get/fpe/set` | `eos_fpe_get_set_info` | ✅ |
| fpe | `/eos/get/fpe/point` | `eos_fpe_get_point_info` | ✅ |

## Faders & direct selects

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| faders | `/eos/fader` | `eos_fader_set_level`, `eos_fader_load`, `eos_fader_unload` | ⚠️ Base utilisee pour composer les adresses des faders. |
| faders | `/eos/fader/{index}/config/{faders}/{page}` | `eos_fader_bank_create` | ✅ |
| faders | `/eos/fader/{index}/page/{delta}` | `eos_fader_page` | ✅ |
| directSelects | `/eos/ds/{index}/button/{page}/{button}` | `eos_direct_select_press` | ✅ |
| directSelects | `/eos/ds/{index}/config/{target}/{buttons}/{flexi}/{page}` | `eos_direct_select_bank_create` | ✅ |
| directSelects | `/eos/ds/{index}/page/{delta}` | `eos_direct_select_page` | ✅ |

## Pixel maps & Magic Sheets

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| pixelMaps | `/eos/pixmap/select` | `eos_pixmap_select` | ✅ |
| pixelMaps | `/eos/get/pixmap` | `eos_pixmap_get_info` | ✅ |
| magicSheets | `/eos/magic_sheet/open` | `eos_magic_sheet_open` | ✅ |
| magicSheets | `/eos/magic_sheet/send_string` | `eos_magic_sheet_send_string` | ✅ |
| magicSheets | `/eos/get/magic_sheet` | `eos_magic_sheet_get_info` | ✅ |

## Queries (Get Count / List)

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| queries.cue | `/eos/get/cue/count` | `eos_get_count` | ✅ `object_type: "cue"` |
| queries.cue | `/eos/get/cue/list` | `eos_get_list_all` | ✅ `object_type: "cue"` |
| queries.cuelist | `/eos/get/cuelist/count` | `eos_get_count` | ✅ `object_type: "cuelist"` |
| queries.cuelist | `/eos/get/cuelist/list` | `eos_get_list_all` | ✅ `object_type: "cuelist"` |
| queries.group | `/eos/get/group/count` | `eos_get_count` | ✅ `object_type: "group"` |
| queries.group | `/eos/get/group/list` | `eos_get_list_all` | ✅ `object_type: "group"` |
| queries.macro | `/eos/get/macro/count` | `eos_get_count` | ✅ `object_type: "macro"` |
| queries.macro | `/eos/get/macro/list` | `eos_get_list_all` | ✅ `object_type: "macro"` |
| queries.ms | `/eos/get/magic_sheet/count` | `eos_get_count` | ✅ `object_type: "magic_sheet"` |
| queries.ms | `/eos/get/magic_sheet/list` | `eos_get_list_all` | ✅ `object_type: "magic_sheet"` |
| queries.ip | `/eos/get/ip/count` | `eos_get_count` | ✅ `object_type: "ip"` |
| queries.ip | `/eos/get/ip/list` | `eos_get_list_all` | ✅ `object_type: "ip"` |
| queries.fp | `/eos/get/fp/count` | `eos_get_count` | ✅ `object_type: "fp"` |
| queries.fp | `/eos/get/fp/list` | `eos_get_list_all` | ✅ `object_type: "fp"` |
| queries.cp | `/eos/get/cp/count` | `eos_get_count` | ✅ `object_type: "cp"` |
| queries.cp | `/eos/get/cp/list` | `eos_get_list_all` | ✅ `object_type: "cp"` |
| queries.bp | `/eos/get/bp/count` | `eos_get_count` | ✅ `object_type: "bp"` |
| queries.bp | `/eos/get/bp/list` | `eos_get_list_all` | ✅ `object_type: "bp"` |
| queries.preset | `/eos/get/preset/count` | `eos_get_count` | ✅ `object_type: "preset"` |
| queries.preset | `/eos/get/preset/list` | `eos_get_list_all` | ✅ `object_type: "preset"` |
| queries.sub | `/eos/get/submaster/count` | `eos_get_count` | ✅ `object_type: "sub"` |
| queries.sub | `/eos/get/submaster/list` | `eos_get_list_all` | ✅ `object_type: "sub"` |
| queries.fx | `/eos/get/effect/count` | `eos_get_count` | ✅ `object_type: "fx"` |
| queries.fx | `/eos/get/effect/list` | `eos_get_list_all` | ✅ `object_type: "fx"` |
| queries.curve | `/eos/get/curve/count` | `eos_get_count` | ✅ `object_type: "curve"` |
| queries.curve | `/eos/get/curve/list` | `eos_get_list_all` | ✅ `object_type: "curve"` |
| queries.snap | `/eos/get/snapshot/count` | `eos_get_count` | ✅ `object_type: "snap"` |
| queries.snap | `/eos/get/snapshot/list` | `eos_get_list_all` | ✅ `object_type: "snap"` |
| queries.pixmap | `/eos/get/pixmap/count` | `eos_get_count` | ✅ `object_type: "pixmap"` |
| queries.pixmap | `/eos/get/pixmap/list` | `eos_get_list_all` | ✅ `object_type: "pixmap"` |

## Patch & submasters

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| patch | `/eos/get/patch/chan_info` | `eos_patch_get_channel_info` | ✅ |
| patch | `/eos/get/patch/chan_pos` | `eos_patch_get_augment3d_position` | ✅ |
| patch | `/eos/get/patch/chan_beam` | `eos_patch_get_augment3d_beam` | ✅ |
| submasters | `/eos/sub` | `eos_submaster_set_level`, `eos_submaster_bump` | ⚠️ Base utilisee pour composer les adresses de submasters. |
| submasters | `/eos/get/submaster` | `eos_submaster_get_info` | ✅ |

## Cues & show control

| Famille | Commande OSC | Outil MCP | Statut/Notes |
| --- | --- | --- | --- |
| cues | `/eos/cue/fire` | `eos_cue_fire` | ✅ |
| cues | `/eos/cue/go` | `eos_cue_go` | ✅ |
| cues | `/eos/cmd` | `eos_cue_stop_back` | ✅ |
| cues | `/eos/cue/select` | `eos_cue_select` | ✅ |
| cues | `/eos/get/cue` | `eos_cue_get_info` | ✅ |
| cues | `/eos/get/cuelist` | `eos_cue_list_all` | ✅ |
| cues | `/eos/get/cuelist/info` | `eos_cuelist_get_info` | ✅ |
| cues | `/eos/cuelist/{bank_index}/config/{cuelist_number}/{num_prev_cues}/{num_pending_cues}` | `eos_cuelist_bank_create` | ✅ |
| cues | `/eos/cuelist/{bank_index}/page/{delta}` | `eos_cuelist_bank_page` | ✅ |
| cues | `/eos/get/active/cue` | `eos_get_active_cue` | ✅ |
| cues | `/eos/get/pending/cue` | `eos_get_pending_cue` | ✅ |
| showControl | `/eos/get/show/name` | `eos_get_show_name` | ✅ |
| showControl | `/eos/get/live/blind` | `eos_get_live_blind_state` | ✅ |
| showControl | `/eos/toggle/staging_mode` | `eos_toggle_staging_mode` | ✅ |
| showControl | `/eos/set/cue/send_string` | `eos_set_cue_send_string` | ✅ |
| showControl | `/eos/set/cue/receive_string` | `eos_set_cue_receive_string` | ✅ |
