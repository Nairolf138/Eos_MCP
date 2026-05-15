# Couverture OSC ↔ MCP

Ce document liste tous les outils exportés par `src/tools/index.ts` et relie chaque outil à sa commande OSC déclarée et au test de contrat associé.

Les contrats centralisés sont vérifiés dans `src/tools/__tests__/osc_contracts.test.ts` : adresse OSC, arguments OSC (snapshots), propagation `targetAddress` / `targetPort`, transformation d'erreur OSC en résultat MCP stable et rejet des paramètres inconnus pour les schémas stricts. Les tests de famille sous `src/tools/**/__tests__` conservent les scénarios métier détaillés.

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
| workflows | `eos_workflow_autopatch_band` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_rehearsal_go_safe` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_build_groups_and_palettes` | — | — (outil non OSC ou orchestrateur) |
| workflows | `eos_workflow_update_cue_look` | — | — (outil non OSC ou orchestrateur) |
| commands | `eos_command` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_new_command` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_command_with_substitution` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_get_command_line` | `/eos/get/cmd_line` | `src/tools/__tests__/osc_contracts.test.ts` |
| commands | `eos_get_user_command_line` | `/eos/get/cmd_line` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_select` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_set_level` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_set_dmx` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_dmx` | `/eos/newcmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_set_parameter` | `/eos/chan/param` | `src/tools/__tests__/osc_contracts.test.ts` |
| channels | `eos_channel_get_info` | `/eos/get/channels` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_select` | `/eos/group` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_set_level` | `/eos/group/{group}/level` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_get_info` | `/eos/get/group` | `src/tools/__tests__/osc_contracts.test.ts` |
| groups | `eos_group_list_all` | `/eos/get/group/list` | `src/tools/__tests__/osc_contracts.test.ts` |
| diagnostics | `eos_enable_logging` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_readiness_check` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_get_diagnostics` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_get_version` | — | — (outil non OSC ou orchestrateur) |
| diagnostics | `eos_get_setup_defaults` | — | — (outil non OSC ou orchestrateur) |
| cues | `eos_cue_fire` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_go` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_stop_back` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
| cues | `eos_cue_select` | `/eos/cmd` | `src/tools/__tests__/osc_contracts.test.ts` |
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
| keys | `eos_softkey_press` | `/eos/key/softkey{number}` | `src/tools/__tests__/osc_contracts.test.ts` |
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
| queries | `eos_get_count` | `cue`: `/eos/get/cue/count`<br>`cuelist`: `/eos/get/cuelist/count`<br>`group`: `/eos/get/group/count`<br>`macro`: `/eos/get/macro/count`<br>`ms`: `/eos/get/magic_sheet/count`<br>`ip`: `/eos/get/ip/count`<br>`fp`: `/eos/get/fp/count`<br>`cp`: `/eos/get/cp/count`<br>`bp`: `/eos/get/bp/count`<br>`preset`: `/eos/get/preset/count`<br>`sub`: `/eos/get/submaster/count`<br>`fx`: `/eos/get/effect/count`<br>`curve`: `/eos/get/curve/count`<br>`snap`: `/eos/get/snapshot/count`<br>`pixmap`: `/eos/get/pixmap/count` | `src/tools/__tests__/osc_contracts.test.ts` |
| queries | `eos_get_list_all` | `cue`: `/eos/get/cue/list`<br>`cuelist`: `/eos/get/cuelist/list`<br>`group`: `/eos/get/group/list`<br>`macro`: `/eos/get/macro/list`<br>`ms`: `/eos/get/magic_sheet/list`<br>`ip`: `/eos/get/ip/list`<br>`fp`: `/eos/get/fp/list`<br>`cp`: `/eos/get/cp/list`<br>`bp`: `/eos/get/bp/list`<br>`preset`: `/eos/get/preset/list`<br>`sub`: `/eos/get/submaster/list`<br>`fx`: `/eos/get/effect/list`<br>`curve`: `/eos/get/curve/list`<br>`snap`: `/eos/get/snapshot/list`<br>`pixmap`: `/eos/get/pixmap/list` | `src/tools/__tests__/osc_contracts.test.ts` |
| fpe | `eos_fpe_get_set_count` | `/eos/get/fpe/set/count` | `src/tools/__tests__/osc_contracts.test.ts` |
| fpe | `eos_fpe_get_set_info` | `/eos/get/fpe/set` | `src/tools/__tests__/osc_contracts.test.ts` |
| fpe | `eos_fpe_get_point_info` | `/eos/get/fpe/point` | `src/tools/__tests__/osc_contracts.test.ts` |
| dmx | `eos_address_select` | `/eos/dmx/address/select` | `src/tools/__tests__/osc_contracts.test.ts` |
| dmx | `eos_address_set_level` | `/eos/dmx/address/level` | `src/tools/__tests__/osc_contracts.test.ts` |
| dmx | `eos_address_set_dmx` | `/eos/dmx/address/dmx` | `src/tools/__tests__/osc_contracts.test.ts` |
| programming | `eos_set_user_id` | — | — (outil non OSC ou orchestrateur) |
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
