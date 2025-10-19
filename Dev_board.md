# Liste complète des outils pour un serveur MCP dédié à ETC Eos via OSC

Voici une liste exhaustive et détaillée des outils à intégrer dans votre serveur MCP (Model Context Protocol) pour contrôler une console ETC Eos via OSC (Open Sound Control) ou ligne de commande.[1][2][3]

## 1. Outils de Configuration et Connexion

### `eos_connect`
Établit la connexion TCP ou UDP avec la console Eos
- **Arguments**: ip_address, port (3032 pour TCP, 8000/8001 pour UDP), protocol (TCP/UDP), osc_mode (1.0/1.1)
- **Retour**: Statut de connexion et version Eos[2][4][1]

### `eos_ping`
Teste la connectivité OSC avec la console
- **Arguments**: timeout, custom_data (pour mesure de latence)
- **Retour**: Confirmation de réception et temps de réponse[5]

### `eos_reset`
Réinitialise toutes les connexions OSC actives
- **Retour**: Confirmation de réinitialisation[6]

### `eos_subscribe`
S'abonne aux notifications de changements de données du show
- **Arguments**: parameter_list (liste des paramètres à surveiller), enable (0/1)
- **Retour**: Confirmation d'abonnement[3][7]

## 2. Outils de Commande et Ligne de Commande

### `eos_command`
Envoie une commande texte directement à la ligne de commande
- **Arguments**: command_text, terminate (booléen pour terminer avec Enter/#)
- **Exemple**: "Chan 1 At 75#"[8][1]

### `eos_new_command`
Envoie une commande après avoir effacé la ligne de commande
- **Arguments**: command_text
- **Retour**: Confirmation d'exécution[1]

### `eos_command_with_substitution`
Envoie une commande avec substitution de variables
- **Arguments**: command_template, *args (valeurs pour %1, %2, etc.)
- **Exemple**: "Chan %1 At %2#", 75, 50[1]

### `eos_get_command_line`
Récupère le contenu actuel de la ligne de commande
- **Arguments**: user_number (optionnel)
- **Retour**: Texte de la ligne de commande[9][1]

## 3. Outils de Contrôle des Canaux

### `eos_channel_select`
Sélectionne un ou plusieurs canaux
- **Arguments**: channel_number (ou liste), thru (pour plages)
- **Retour**: Confirmation de sélection[6]

### `eos_channel_set_level`
Définit l'intensité d'un canal
- **Arguments**: channel_number, level (0-100 ou mots-clés: out/full/home/min/max)
- **Retour**: Niveau appliqué[6]

### `eos_channel_set_dmx`
Définit la valeur DMX brute d'un canal
- **Arguments**: channel_number, dmx_value (0-255)
- **Retour**: Confirmation[6]

### `eos_channel_set_parameter`
Définit un paramètre spécifique d'un canal
- **Arguments**: channel_number, parameter_name, value
- **Exemples**: pan, tilt, red, gobo, iris[10][1]

### `eos_channel_get_info`
Récupère les informations d'un canal via OSC Get
- **Arguments**: channel_number
- **Retour**: Label, fabricant, modèle, adresse DMX, textes, niveau actuel[11]

## 4. Outils de Contrôle des Groupes

### `eos_group_select`
Sélectionne un groupe
- **Arguments**: group_number
- **Retour**: Confirmation[6]

### `eos_group_set_level`
Définit l'intensité d'un groupe
- **Arguments**: group_number, level (0-100)
- **Retour**: Niveau appliqué[6]

### `eos_group_get_info`
Récupère les informations d'un groupe
- **Arguments**: group_number
- **Retour**: Label, liste des canaux membres[11]

### `eos_group_list_all`
Liste tous les groupes existants
- **Retour**: Dictionnaire {numéro: label}[11]

## 5. Outils de Contrôle des Cues

### `eos_cue_fire`
Déclenche une cue
- **Arguments**: cuelist_number, cue_number, cue_part (optionnel)
- **Retour**: Confirmation de déclenchement[7][1]

### `eos_cue_go`
Lance la prochaine cue en séquence
- **Arguments**: cuelist_number (optionnel)
- **Retour**: Numéro de cue lancée[1]

### `eos_cue_stop_back`
Arrête la cue en cours ou retour arrière
- **Arguments**: cuelist_number (optionnel)
- **Retour**: Confirmation[8]

### `eos_cue_select`
Sélectionne une cue
- **Arguments**: cuelist_number, cue_number, cue_part (optionnel)
- **Retour**: Confirmation[1]

### `eos_cue_get_info`
Récupère toutes les informations d'une cue
- **Arguments**: cuelist_number, cue_number, cue_part (0 pour base)
- **Retour**: Label, timings (up/down/focus/color/beam), courbe, mark, block, assert, link, follow, hang, loop, solo, timecode, notes[11]

### `eos_cue_list_all`
Liste toutes les cues d'une liste
- **Arguments**: cuelist_number
- **Retour**: Liste des cues avec leurs numéros et labels[11]

### `eos_cuelist_get_info`
Récupère les informations d'une liste de cues
- **Arguments**: cuelist_number
- **Retour**: Label, mode playback, mode fader, independent, HTP, assert, block, background, solo mode[11]

### `eos_cuelist_bank_create`
Crée un bank OSC pour surveiller une liste de cues
- **Arguments**: bank_index, cuelist_number, num_prev_cues, num_pending_cues, offset (optionnel)
- **Retour**: Confirmation de création[1]

### `eos_cuelist_bank_page`
Change de page dans un bank de cues
- **Arguments**: bank_index, delta (positif ou négatif)
- **Retour**: Nouvelle position[1]

### `eos_get_active_cue`
Récupère les informations de la cue active
- **Arguments**: cuelist_number (optionnel pour la principale)
- **Retour**: Numéro de liste, numéro de cue, label, durée, pourcentage de progression[12][1]

### `eos_get_pending_cue`
Récupère les informations de la cue en attente
- **Arguments**: cuelist_number (optionnel)
- **Retour**: Numéro de liste, numéro de cue, label, durée[12][1]

## 6. Outils de Contrôle des Palettes

### `eos_intensity_palette_fire`
Déclenche une palette d'intensité
- **Arguments**: palette_number
- **Retour**: Confirmation[6]

### `eos_focus_palette_fire`
Déclenche une palette de focus
- **Arguments**: palette_number
- **Retour**: Confirmation[6]

### `eos_color_palette_fire`
Déclenche une palette de couleur
- **Arguments**: palette_number
- **Retour**: Confirmation[6]

### `eos_beam_palette_fire`
Déclenche une palette de beam
- **Arguments**: palette_number
- **Retour**: Confirmation[6]

### `eos_palette_get_info`
Récupère les informations d'une palette
- **Arguments**: palette_type (ip/fp/cp/bp), palette_number
- **Retour**: Label, absolute, locked, liste des canaux, by-type channels[11]

## 7. Outils de Contrôle des Presets

### `eos_preset_fire`
Déclenche un preset
- **Arguments**: preset_number
- **Retour**: Confirmation[6]

### `eos_preset_select`
Sélectionne un preset
- **Arguments**: preset_number
- **Retour**: Confirmation[6]

### `eos_preset_get_info`
Récupère les informations d'un preset
- **Arguments**: preset_number
- **Retour**: Label, absolute, locked, liste des canaux, effects[11]

## 8. Outils de Contrôle des Submasters

### `eos_submaster_set_level`
Définit le niveau d'un submaster
- **Arguments**: sub_number, level (0.0-1.0)
- **Retour**: Niveau appliqué[13][1]

### `eos_submaster_bump`
Active/désactive le bump d'un submaster
- **Arguments**: sub_number, state (1.0=on, 0.0=off)
- **Retour**: Confirmation[8][1]

### `eos_submaster_get_info`
Récupère les informations d'un submaster
- **Arguments**: sub_number
- **Retour**: Label, mode, fader mode, HTP, exclusive, background, restore, priority, timings[11]

## 9. Outils de Contrôle des Faders

### `eos_fader_bank_create`
Crée un bank de faders OSC
- **Arguments**: bank_index, fader_count, page_number (optionnel)
- **Retour**: Confirmation de création[1]

### `eos_fader_set_level`
Définit le niveau d'un fader
- **Arguments**: bank_index, fader_index, level (0.0-1.0)
- **Retour**: Niveau appliqué[1][6]

### `eos_fader_load`
Charge un contenu sur un fader
- **Arguments**: bank_index, fader_index
- **Retour**: Confirmation[1]

### `eos_fader_unload`
Décharge un fader
- **Arguments**: bank_index, fader_index
- **Retour**: Confirmation[1]

### `eos_fader_page`
Change de page dans un bank de faders
- **Arguments**: bank_index, delta
- **Retour**: Nouvelle page[1]

## 10. Outils de Contrôle des Macros

### `eos_macro_fire`
Déclenche une macro
- **Arguments**: macro_number
- **Retour**: Confirmation[8][6]

### `eos_macro_select`
Sélectionne une macro
- **Arguments**: macro_number
- **Retour**: Confirmation[6]

### `eos_macro_get_info`
Récupère les informations d'une macro
- **Arguments**: macro_number
- **Retour**: Label, mode, texte des commandes[11]

## 11. Outils de Contrôle des Effets

### `eos_effect_select`
Sélectionne un effet
- **Arguments**: effect_number
- **Retour**: Confirmation[6]

### `eos_effect_stop`
Arrête un effet sur la sélection
- **Retour**: Confirmation[8]

### `eos_effect_get_info`
Récupère les informations d'un effet
- **Arguments**: effect_number
- **Retour**: Label, type d'effet, entry, exit, duration, scale[11]

## 12. Outils de Contrôle des Paramètres et Encodeurs

### `eos_wheel_tick`
Simule une rotation d'encodeur
- **Arguments**: parameter_name, ticks (positif/négatif), mode (coarse/fine)
- **Retour**: Nouvelle valeur[14][1]

### `eos_switch_continuous`
Active un mouvement continu d'encodeur
- **Arguments**: parameter_name, rate (-1.0 à 1.0)
- **Retour**: Confirmation[6]

### `eos_set_color_hs`
Définit une couleur en Hue/Saturation
- **Arguments**: hue (0-360), saturation (0-100)
- **Retour**: Confirmation[6]

### `eos_set_color_rgb`
Définit une couleur en RGB
- **Arguments**: red (0.0-1.0), green (0.0-1.0), blue (0.0-1.0)
- **Retour**: Confirmation[6]

### `eos_set_pantilt_xy`
Définit une position pan/tilt sur un graphique 2D
- **Arguments**: x (0.0-1.0), y (0.0-1.0)
- **Retour**: Confirmation[6]

### `eos_set_xyz_position`
Définit une position XYZ en mètres
- **Arguments**: x, y, z (en mètres décimaux)
- **Retour**: Confirmation[6]

### `eos_get_active_wheels`
Récupère les informations des encodeurs actifs
- **Retour**: Liste des paramètres actifs avec leurs valeurs[15][11]

## 13. Outils de Contrôle des Touches (Keys)

### `eos_key_press`
Simule l'appui sur une touche de la console
- **Arguments**: key_name (voir liste complète dans la documentation), state (1.0=down, 0.0=up)
- **Exemples**: go, stop_back, record, update, blind, live, home, out, full, group, cue[16][8][1]

### `eos_softkey_press`
Simule l'appui sur une softkey
- **Arguments**: softkey_number (1-12), state (1.0=down, 0.0=up)
- **Retour**: Confirmation[1]

### `eos_get_softkey_labels`
Récupère les labels des softkeys
- **Retour**: Dictionnaire {numéro: label}[8]

## 14. Outils de Direct Selects

### `eos_direct_select_bank_create`
Crée un bank de direct selects
- **Arguments**: bank_index, target_type (Chan/Group/Macro/Sub/Preset/IP/FP/CP/BP/MS/Curve/Snap/FX/Pixmap/Scene), button_count, flexi_mode (booléen), page_number (optionnel)
- **Retour**: Confirmation[17][1]

### `eos_direct_select_press`
Simule l'appui sur un bouton de direct select
- **Arguments**: bank_index, button_index, state (1.0=down, 0.0=up)
- **Retour**: Confirmation[1]

### `eos_direct_select_page`
Change de page dans un bank de direct selects
- **Arguments**: bank_index, delta
- **Retour**: Nouvelle page[1]

## 15. Outils de Magic Sheets

### `eos_magic_sheet_open`
Ouvre un magic sheet
- **Arguments**: ms_number, view_number (optionnel)
- **Retour**: Confirmation[6]

### `eos_magic_sheet_send_string`
Envoie une commande OSC depuis un magic sheet
- **Arguments**: osc_command
- **Note**: Fonctionne uniquement depuis le rôle Primary[18][19]

### `eos_magic_sheet_get_info`
Récupère les informations d'un magic sheet
- **Arguments**: ms_number
- **Retour**: Label, UID[11]

## 16. Outils de Pixel Maps

### `eos_pixmap_select`
Sélectionne un pixel map
- **Arguments**: pixmap_number
- **Retour**: Confirmation[6]

### `eos_pixmap_get_info`
Récupère les informations d'un pixel map
- **Arguments**: pixmap_number
- **Retour**: Label, server channel, interface, width, height, pixel count, fixture count, liste des canaux[11]

## 17. Outils de Snapshots

### `eos_snapshot_recall`
Rappelle un snapshot
- **Arguments**: snapshot_number
- **Retour**: Confirmation[6]

### `eos_snapshot_get_info`
Récupère les informations d'un snapshot
- **Arguments**: snapshot_number
- **Retour**: Label[11]

## 18. Outils de Curves

### `eos_curve_select`
Sélectionne une courbe
- **Arguments**: curve_number
- **Retour**: Confirmation[6]

### `eos_curve_get_info`
Récupère les informations d'une courbe
- **Arguments**: curve_number
- **Retour**: Label[11]

## 19. Outils de Patch

### `eos_patch_get_channel_info`
Récupère les informations de patch d'un canal
- **Arguments**: channel_number, part_number (0 pour toutes les parties)
- **Retour**: Label, fabricant, modèle, adresse DMX, gel, textes 1-10, nombre de parties, notes[11]

### `eos_patch_get_augment3d_position`
Récupère la position Augment3d d'un canal
- **Arguments**: channel_number, part_number
- **Retour**: Position XYZ, orientation XYZ, numéro de set FPE[11]

### `eos_patch_get_augment3d_beam`
Récupère les informations de faisceau Augment3d
- **Arguments**: channel_number, part_number
- **Retour**: Angle de faisceau, couleur gel, shutters, gobo, rotation gobo, hide beam status[11]

## 20. Outils de Show Control et Events

### `eos_get_show_name`
Récupère le nom du show actuel
- **Retour**: Nom du show[8]

### `eos_get_live_blind_state`
Récupère l'état Live/Blind
- **Retour**: 0=Blind, 1=Live[6]

### `eos_toggle_staging_mode`
Active/désactive le mode Staging
- **Retour**: Confirmation[1]

### `eos_set_cue_send_string`
Configure le format d'envoi OSC des cues
- **Arguments**: format_string (avec variables %1-%5)
- **Retour**: Confirmation[20][7]

### `eos_set_cue_receive_string`
Configure le format de réception OSC des cues
- **Arguments**: format_string (avec variables %1-%2)
- **Retour**: Confirmation[7]

## 21. Outils d'Interrogation (Get/Query)

### `eos_get_version`
Récupère la version logicielle Eos
- **Retour**: Version logiciel, version bibliothèque fixtures, mode gel[3][11]

### `eos_get_count`
Récupère le nombre d'éléments d'un type
- **Arguments**: target_type (cue/cuelist/group/macro/ms/ip/fp/cp/bp/preset/sub/fx/curve/snap/pixmap)
- **Retour**: Nombre d'éléments[11]

### `eos_get_list_all`
Liste tous les éléments d'un type
- **Arguments**: target_type
- **Retour**: Liste complète avec numéros, UIDs et labels[11]

### `eos_get_setup_defaults`
Récupère les temps de cue par défaut
- **Retour**: Up time, down time, focus time, color time, beam time par défaut[6]

## 22. Outils FPE (Focus Palette Encoder)

### `eos_fpe_get_set_count`
Récupère le nombre de sets FPE
- **Retour**: Nombre de sets[11]

### `eos_fpe_get_set_info`
Récupère les informations d'un set FPE
- **Arguments**: set_number
- **Retour**: Label, nombre de points[11]

### `eos_fpe_get_point_info`
Récupère les informations d'un point FPE
- **Arguments**: set_number, point_number
- **Retour**: Label, numéro de palette focus, position XYZ[11]

## 23. Outils de Gestion d'Adresses DMX

### `eos_address_select`
Sélectionne une adresse DMX
- **Arguments**: address_number
- **Retour**: Confirmation[6]

### `eos_address_set_level`
Définit le niveau d'une adresse DMX
- **Arguments**: address_number, level (0-100)
- **Retour**: Confirmation[6]

### `eos_address_set_dmx`
Définit la valeur DMX brute d'une adresse
- **Arguments**: address_number, dmx_value (0-255)
- **Retour**: Confirmation[6]

## 24. Outils de Diagnostic et Debug

### `eos_enable_logging`
Active/désactive le logging OSC
- **Arguments**: incoming (booléen), outgoing (booléen)
- **Retour**: Confirmation[5]

### `eos_get_diagnostics`
Récupère les informations de diagnostic
- **Retour**: Statistiques de connexion, messages reçus/envoyés[5]

## 25. Outils de Session Multi-Utilisateur

### `eos_set_user_id`
Définit l'ID utilisateur OSC
- **Arguments**: user_number
- **Retour**: Confirmation[1]

### `eos_get_user_command_line`
Récupère la ligne de commande d'un utilisateur spécifique
- **Arguments**: user_number
- **Retour**: Texte de la ligne de commande[9]

## Bonnes Pratiques d'Implémentation MCP

Pour implémenter ces outils dans votre serveur MCP, suivez ces recommandations:[21][22][23]

### 1. Convention de nommage
Utilisez le snake_case pour tous les noms d'outils (ex: `eos_channel_set_level`) pour une meilleure tokenisation par les LLMs.[22]

### 2. Schémas JSON clairs
Définissez des inputSchema détaillés avec types, descriptions et champs requis pour chaque outil.[21]

### 3. Gestion des erreurs
Retournez toujours des messages d'erreur explicites en cas d'échec (connexion perdue, commande invalide, timeout).[22]

### 4. Logging
Implémentez un système de logging vers fichier (pino pour Node.js) car STDIO ne permet pas console.log.[22]

### 5. Validation des arguments
Validez tous les arguments avant envoi OSC (plages de valeurs, formats, existence des cibles).[22]

### 6. Documentation
Fournissez des descriptions claires pour chaque outil, compréhensibles par les LLMs et les humains.[23]

### 7. Gestion de connexion
Gérez le pool de connexions TCP/UDP, la reconnexion automatique et les timeouts.[24]

### 8. Cache intelligent
Implémentez un cache multi-niveaux pour les données rarement modifiées (patch, groupes, etc.).[24]

### 9. Traitement asynchrone
Utilisez des opérations async pour éviter le blocage lors de requêtes OSC longues.[25][21]

### 10. Transport approprié
Privilégiez TCP (port 3032) pour la fiabilité, UDP pour des commandes rapides non-critiques.[4][2]

Cette liste exhaustive couvre l'ensemble des fonctionnalités OSC d'ETC Eos et suit les meilleures pratiques MCP pour créer un serveur robuste et performant.

Sources
[1] OSC Eos Control https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Eos_Control.htm?TocPath=Show+Control%7COpen+Sound+Control+%28OSC%29%7CUsing+OSC+with+Eos%7C_____3
[2] Eos OSC Setup https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/Eos_OSC_Setup.htm?TocPath=Show+Control%7COpen+Sound+Control+%28OSC%29%7CUsing+OSC+with+Eos%7C_____1
[3] OSC Get https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm
[4] OSC Networks https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/About_OSC/OSC_Networks.htm?TocPath=Show+Control%7COpen+Sound+Control+%28OSC%29%7CAbout+OSC%7C_____3
[5] Using OSC with Eos https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/USING_OSC_WITH_EOS.htm
[6] i'm having trouble controlling a simple fader in etc eos with ... https://www.facebook.com/groups/companion/posts/3335640926654234/
[7] OSC Show Control https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Show_Control.htm?TocPath=Show+Control%7COpen+Sound+Control+%28OSC%29%7CUsing+OSC+with+Eos%7C_____4
[8] Connection - etc-eos https://bitfocus.io/connections/etc-eos
[9] Overlaying the Eos Command Line - Vor Documentation https://docs.getvor.app/even-more-information/examples/custom-osc-examples/etc-eos/overlaying-the-eos-command-line
[10] Eos OSC Conventions https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/Eos_OSC_Conventions.htm?TocPath=Show+Control%7COpen+Sound+Control+%28OSC%29%7CUsing+OSC+with+Eos%7C_____2
[11] OSC messages. Finding wheel info - Eos Family Show ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/57218/osc-messages-finding-wheel-info
[12] TouchOSC - Simply display the current cue ? - Eos Family ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/27760/touchosc---simply-display-the-current-cue
[13] Déclenchez ETC EOS Fader via OSC (Ableton) : r/techtheatre https://www.reddit.com/r/techtheatre/comments/1d9sgtj/trigger_etc_eos_fader_via_osc_ableton/
[14] OSC Encoder to simulate Console Encoders https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/38124/osc-encoder-to-simulate-console-encoders
[15] OSC wheels - Eos Family Show Control Support (MIDI ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/53283/osc-wheels
[16] Hotkeys https://www.etcconnect.com/webdocs/Controls/ElementOnlineHelp/en-us/Content/03_System_Basics/Eos_Family_Hotkeys.htm
[17] OSC Custom Direct Select banks - Eos Family Show ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/28036/osc-custom-direct-select-banks
[18] OSC reactive Magic Sheets - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/58855/osc-reactive-magic-sheets
[19] Eos Magic Sheet Assets - Vor Documentation https://docs.getvor.app/even-more-information/eos-magic-sheet-assets
[20] Triggering QLab from Eos using OSC https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Triggering_QLab_from_Eos_using_OSC
[21] Tools - Model Context Protocol （MCP） https://modelcontextprotocol.info/docs/concepts/tools/
[22] 5 Best Practices for Building MCP Servers https://snyk.io/articles/5-best-practices-for-building-mcp-servers/
[23] Top 5 MCP Server Best Practices https://www.docker.com/blog/mcp-server-best-practices/
[24] MCP Best Practices: Architecture & Implementation Guide https://modelcontextprotocol.info/docs/best-practices/
[25] MCP tools - Agent Development Kit - Google https://google.github.io/adk-docs/tools/mcp-tools/
[26] OSC Third-Party Integration https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Third-Party_Integration.htm?TocPath=Show+Control%7COpen+Sound+Control+%28OSC%29%7CUsing+OSC+with+Eos%7COSC+Third-Party+Integration+%7C_____0
[27] What is "Command Edit Mode"? - Eos Family https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/55623/what-is-command-edit-mode
[28] OSC Commands https://www.etcconnect.com/webdocs/Controls/ColorSourceAV_onlinehelp/en/Content/CommandsOSC.html
[29] EOS 4.34.2F - Command-Line Interface (CLI) https://www.arista.com/en/um-eos/eos-command-line-interface-cli
[30] Configuring the OSC Network - Moving Light Assistant - 1.3.1 https://www.manula.com/manuals/avld/mla/131/en/topic/osc-configuring-network
[31] ETC EOS API : r/techtheatre https://www.reddit.com/r/techtheatre/comments/1e6xq6n/etc_eos_api/
[32] Eos Family Serial Command Syntax https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Eos_Family_Serial_Command_Syntax
[33] Show Control https://community.troikatronix.com/uploads/files/FileUpload/54/22d80e-eosfamily_showcontrol_userguide_revb.pdf
[34] Receiving Osc to Channel - Eos Family Show Control ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/55130/receiving-osc-to-channel
[35] Eos Family Level 3: Advanced Programming https://www.etcconnect.com/uploadedFiles/Main_Site/Documents/Public/Video_Tutorial/EosFamily_L3_Workbook_v2.4.0_revA.pdf
[36] Comprehensive OSC Method/Argument Documentation https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/18601/comprehensive-osc-method-argument-documentation
[37] Triggering Eos from QLab using OSC https://support.etcconnect.com/ETC/Consoles/Eos_Family/Software_and_Programming/Triggering_Eos_from_QLab_using_OSC
[38] Documentation of console event handler strings? https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/20372/documentation-of-console-event-handler-strings
[39] ETC® Console Hotkeys http://www.kansascitystagehands.com/uploads/3/4/5/8/34589274/eos_and_hog_shortcut_keys.pdf
[40] De-Mystifying Eos and Ion Displays https://www.etcconnect.com/uploadedFiles/Main_Site/Content/Support/Articles/Consoles/Eos/Eos-Ion%20Displays%20Conventions.pdf
[41] ETC Eos v1.3 User Manual - Channel syntax structure https://www.manualsdir.com/manuals/559115/etc-eos-v13.html?page=18
[42] ETC Nomad EOS Hotkeys | PDF | Keyboard Shortcut https://fr.scribd.com/doc/254036253/ETC-Nomad-EOS-Hotkeys
[43] Commands in Magic Sheet - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/25496/commands-in-magic-sheet
[44] Eos Family Console Shortcut Keys https://community.etcconnect.com/cfs-file/__key/telligent-evolution-components-attachments/00-15-01-00-00-03-40-86/Eos-Family-Keyboard-Shortcuts-1_5F00_9_5F00_8.pdf
[45] Editing Profiles - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/31948/editing-profiles
[46] Allow Custom Parameter Labels When Building ... https://community.etcconnect.com/control_consoles/eos-family-consoles/i/feature-requests/allow-custom-parameter-labels-when-building-custom-fixtures
[47] Eos Family Console Programming Level 1 https://www.etcconnect.com/uploadedFiles/Main_Site/Documents/Public/Video_Tutorial/Eos_Family_L1_Essentials_v3.1.pdf
[48] ETC Console Shortcut Keys: Eos Family v2.4.0 | PDF https://fr.scribd.com/document/387271798/Eos-Hotkeys
[49] Fixture parameter array via OSC? - Eos Family Show ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/27021/fixture-parameter-array-via-osc
[50] Cheat Sheet https://www.lelycee.org/uploaded/TLF/Ion-IonXe_v2.6.0_CS_revA.pdf
[51] ETC Eos tips! : r/lightingdesign https://www.reddit.com/r/lightingdesign/comments/zgzscv/etc_eos_tips/
[52] Eos Family Video Learning Series: Level 1 Essentials https://www.etcconnect.com/EosFamilyVideos/Level-1/
[53] Famille Eos v3.0.0 Manuel d'exploitation http://www.artdam.asso.fr/pdf/FamilleEos_v3.0.0_UserManual_FR_RevA.pdf
[54] Submaster Properties https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/16_Submasters/Submaster_Properties.htm
[55] Feature Request: Additional OSC Feedback and Encoder ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/20501/feature-request-additional-osc-feedback-and-encoder-control
[56] Retrieving specific data via OSC - Eos Family https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/29832/retrieving-specific-data-via-osc
[57] Encoder wheel numbers in OSC? - Eos Family Show ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/53214/encoder-wheel-numbers-in-osc
[58] ETC - EoS - ON LX Docs https://docs.onlx.ltd/ctrl-suite/ctrl-designer/nodes/modules/etc-eos
[59] osc for encoders and wheels???? - Eos Family https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/35957/osc-for-encoders-and-wheels
[60] Nomad (EOS) OSC syntax for submaster intensity https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/20411/nomad-eos-osc-syntax-for-submaster-intensity
[61] OSCWidgets- the solution for usable encoders on Nomad https://www.mlp-lighting.com/programming/oscwidgets-the-solution-for-usable-encoders-on-nomad/
[62] Fader/submaster change while Channel is Parked? https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/40968/fader-submaster-change-while-channel-is-parked
[63] OSC encoder wheel button - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/23885/osc-encoder-wheel-button
[64] Any way to control submaster intensity fade time in etc-eos? https://www.facebook.com/groups/companion/posts/3454496578102001/
[65] I want to get Active cue label and Number from a Eos ... https://www.facebook.com/groups/488915331311641/posts/2631155167087636/
[66] BlakeGarner/encoders-for-etc-eos https://github.com/BlakeGarner/encoders-for-etc-eos
[67] Controlling ETC ColorSource with OSC commands for ... https://www.reddit.com/r/lightingdesign/comments/1npdout/controlling_etc_colorsource_with_osc_commands_for/
[68] Macro to fire OSC string - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/39683/macro-to-fire-osc-string
[69] Eos Family Show Control Series: Open Sound Control https://www.youtube.com/watch?v=ZW2ZLhF5whs
[70] Osc output from ETC EOS desk to re-label companion https://www.facebook.com/groups/companion/posts/2450120138539655/
[71] OSC paging of PSD cue list - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/41073/osc-paging-of-psd-cue-list
[72] Open Sound Control (OSC) https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OPEN_SOUND_CONTROL.htm
[73] Trying to find out if there is a way to write a macro that will ... https://www.facebook.com/groups/324969381576734/posts/1666301610776831/
[74] Show Control - Reference Notes https://www.soundreferencenotes.com/ref_show_control.html
[75] Cue Triggers https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/12_Cues_and_Cue_Lists/Cue_Triggers.htm
[76] Use manual commands while OSC input is active - Eos ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/57088/use-manual-commands-while-osc-input-is-active
[77] Sub and Cue List Macro https://www.mlp-lighting.com/programming/sub-and-cue-list-macro/
[78] Displaying OSC messages on a magic sheet - Eos Family https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/56997/displaying-osc-messages-on-a-magic-sheet
[79] Direct Selects Tab Configuration https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/04_System_Basics/06_Direct_Selects_%5BTab_4%5D/Direct_Selects_Tab_Configuration.htm
[80] Magic Sheet OSC - Eos Family Consoles https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/22248/magic-sheet-osc
[81] Direct Selects https://www.youtube.com/watch?v=W109erjaCpU
[82] Control effect parameters from OSC encoders - Eos Family ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/19525/control-effect-parameters-from-osc-encoders
[83] Using Direct Selects https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/04_System_Basics/06_Direct_Selects_%5BTab_4%5D/Using_Direct_Selects.htm?TocPath=System+Basics%7CDirect+Selects+%5BTab+4%5D%7C_____1
[84] How to control cue playback rate with osc - Eos Family https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family/35944/how-to-control-cue-playback-rate-with-osc
[85] MILLUMIN / ETC EOS - Display TIME in a magic sheet https://forum.millumin.com/discussion/2395/millumin-etc-eos-display-time-in-a-magic-sheet
[86] DISPLAY incomming OSC message from another ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/60863/display-incomming-osc-message-from-another-application-time-video-running-from-millumin-in-a-magic-sheet
[87] Active console wheels over OSC - Eos Family Show ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/28037/active-console-wheels-over-osc
[88] User Specific OSC - Eos Family Show Control Support ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/32000/user-specific-osc
[89] OSC get channel value - Eos Family Show Control Support ... https://community.etcconnect.com/control_consoles/eos-family-consoles/f/eos-family-show-control-support-midi-smpte-osc-rtc-etc/36226/osc-get-channel-value
[90] Working with the EOS and OSC https://community.troikatronix.com/topic/2924/working-with-the-eos-and-osc
[91] What Is the Model Context Protocol (MCP) and How It Works https://www.descope.com/learn/post/mcp
[92] Model Context Protocol (MCP) Servers For The Absolute ... https://www.cloudnativedeepdive.com/model-context-protocol-mcp-servers-for-the-absolute-beginner/
[93] Model Context Protocol (MCP) Tools https://strandsagents.com/latest/documentation/docs/user-guide/concepts/tools/mcp-tools/
[94] An official Qdrant Model Context Protocol (MCP) server ... https://github.com/qdrant/mcp-server-qdrant
[95] MCP Best Practices https://steipete.me/posts/2025/mcp-best-practices
[96] Tools https://modelcontextprotocol.io/specification/2025-06-18/server/tools
[97] Build an MCP server https://modelcontextprotocol.io/docs/develop/build-server
[98] Building MCP servers for ChatGPT and API integrations https://platform.openai.com/docs/mcp
[99] modelcontextprotocol/servers: Model Context Protocol ... https://github.com/modelcontextprotocol/servers
[100] The Ultimate Guide to MCP Servers: Best Options for ... https://treblle.com/blog/mcp-servers-guide
[101] Connect to Model Context Protocol servers (preview) https://learn.microsoft.com/en-us/azure/ai-foundry/agents/how-to/tools/model-context-protocol
[102] Implémenter un serveur Model Context Protocol en TypeScript https://blog.eleven-labs.com/fr/model-context-protocol/
[103] Building Smarter MCP Servers — From Theory to Practice https://www.clever-cloud.com/blog/engineering/2025/10/01/building-smarter-mcp-servers/
[104] Comprendre le Model Context Protocol (MCP) https://blog.octo.com/comprendre-le-model-context-protocol-(mcp)--connecter-les-llms-a-vos-donnees-et-outils
[105] Example Servers https://modelcontextprotocol.io/examples
