# Compatibilite EOS par version

Ce document complete la matrice runtime `src/services/osc/compatibilityMatrix.ts` et sert de checklist pour verifier les consoles ETC Eos reelles ou Nomad. La matrice est volontairement conservative : quand une reponse EOS 2.x expose moins de champs qu'EOS 3.x, l'outil reste utilisable uniquement si le mapper MCP sait retourner un resultat degrade explicite.

## Hypotheses de protocole

- **EOS 2.x** : protocole OSC historique, souvent UDP, avec handshake et selection de protocole parfois absents ou partiels. Les outils de commande de base restent utilisables, mais les lectures JSON avancees peuvent retourner moins de champs.
- **EOS 3.x** : protocole ETCOSC attendu, handshake canonique, selection de protocole et reponses JSON plus completes.
- **Fallback speed** : mecanisme cote MCP, pas une capacite console autonome. Si le transport fiable ne repond pas, le client peut basculer vers le mode `speed`/UDP pour les outils qui portent `transportPreference`.

## Matrice fonctionnelle

| Fonctionnalite | EOS 2.x | EOS 3.x | Outils MCP representatifs | Notes de validation |
| --- | --- | --- | --- | --- |
| Handshake | Limite, des EOS 2.0 | Disponible, des EOS 3.0 | `eos_connect`, `eos_ping`, `eos_configure`, `eos_subscribe`, `eos_reset` | En 2.x, accepter un ping/legacy reply si `/eos/handshake/reply` ne revient pas. En 3.x, verifier la version et le protocole ETCOSC. |
| Cues | Disponible, des EOS 2.0 | Disponible, des EOS 3.0 | `eos_cue_go`, `eos_cue_fire`, `eos_cue_get_info`, `eos_cuelist_get_info` | Ne jamais inventer une cuelist : une lecture doit confirmer le contenu quand le workflow depend des donnees. |
| Macros | Disponible, des EOS 2.0 | Disponible, des EOS 3.0 | `eos_macro_fire`, `eos_macro_select`, `eos_macro_get_info` | Les libelles ou champs detaillees peuvent etre absents en 2.x. |
| Patch | Limite, des EOS 2.9 | Disponible, des EOS 3.0 | `eos_patch_set_channel`, `eos_patch_get_channel_info`, `eos_patch_get_augment3d_position`, `eos_patch_get_augment3d_beam` | Les lectures Augment3d sont gates sur EOS 3.x. Les ecritures patch doivent etre confirmees par operateur. |
| Pixel maps | Indisponible dans la matrice MCP 2.x | Disponible, des EOS 3.0 | `eos_pixmap_select`, `eos_pixmap_get_info` | Valider les numeros et segments retournes, surtout en show file migre. |
| DMX | Disponible, des EOS 2.0 | Disponible, des EOS 3.0 | `eos_set_dmx`, `eos_channel_set_dmx`, `eos_address_select`, `eos_address_set_level`, `eos_address_set_dmx` | Action sensible en live : relever univers/adresse, valeur et confirmation operateur. |
| FPE | Indisponible dans la matrice MCP 2.x | Disponible, des EOS 3.0 | `eos_fpe_get_set_count`, `eos_fpe_get_set_info`, `eos_fpe_get_point_info` | Les fixtures attendues sont des reponses EOS 3.x. |
| Magic sheets | Limite, des EOS 2.9 | Disponible, lecture des EOS 3.1 et injection texte EOS 3.2+ Primary | `eos_magic_sheet_open`, `eos_magic_sheet_get_info`, `eos_magic_sheet_send_string` | `eos_magic_sheet_send_string` exige un noeud Primary et EOS 3.2+. |
| Speed fallback | Disponible cote MCP | Disponible cote MCP | `transportPreference: "speed"` sur les outils de connexion et requetes compatibles | Tester avec TCP coupe ou timeout force, puis verifier que l'envoi UDP aboutit. |

## Fixtures et tests automatises

Les fixtures de version sont stockees dans `src/services/osc/__tests__/fixtures/eos-version-responses.json` :

- `eos-2.9.1-nomad-windows` couvre une reponse legacy EOS 2.x et les incompatibilites attendues pour pixel maps, FPE et injection magic sheet.
- `eos-3.2.1-console-macos` couvre une reponse EOS 3.x avec protocole ETCOSC et les fonctionnalites completes.

Les trames de conformance `src/services/osc/__tests__/fixtures/eos-conformance.frames.json` incluent aussi deux scenarios `eos_get_version` pour verifier que les reponses EOS 2.x et 3.x sont parsees sans regression.

Commandes recommandees :

```bash
npm run test:unit -- --runTestsByPath src/services/osc/__tests__/compatibilityMatrix.test.ts
npm run test:conformance
```

## Procedure de test manuel sur console ou Nomad

1. Demarrer EOS ou Nomad avec OSC active et noter l'adresse IP, le port UDP/TCP, le mode Primary/Backup et la version EOS exacte.
2. Lancer le serveur MCP avec la configuration reseau cible.
3. Executer `eos_connect`, puis `eos_capabilities_get` et conserver le `structuredContent.osc_compatibility`.
4. Tester au minimum un outil par famille : ping/handshake, cue, macro, patch, pixel map, DMX, FPE, magic sheet et fallback speed.
5. Reporter les resultats dans le tableau ci-dessous.

| Version EOS | OS | Protocole | Resultat | Anomalies |
| --- | --- | --- | --- | --- |
| 2.9.1 | Windows 10 / Nomad | OSC UDP legacy | A renseigner : OK, partiel ou echec | A renseigner : timeouts, champs manquants, role incorrect, reponse non JSON |
| 3.2.1 | macOS / Nomad ou console physique | ETCOSC UDP/TCP | A renseigner : OK, partiel ou echec | A renseigner : divergence de version, protocol select absent, donnees show incoherentes |
|  |  |  |  |  |

### Criteres d'acceptation manuels

- La version detectee par `eos_get_version` correspond a la version affichee par la console/Nomad.
- `eos_capabilities_get` liste une contrainte `min_eos_version`, `feature`, `required_role` et `functional_availability` pour chaque outil EOS expose.
- Les outils EOS 2.x marques indisponibles par la matrice sont bloques ou documentes comme non executes.
- Les outils sensibles (`eos_set_dmx`, patch, GO cue, injection magic sheet) sont executes uniquement avec confirmation operateur et rollback connu.
- Toute anomalie contient la trame OSC capturee, la version EOS, l'OS, le protocole et le role du noeud.
