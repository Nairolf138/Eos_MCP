# Checklist release interne — LLM-friendly workflows

Cette checklist doit etre appliquee avant chaque release qui ajoute ou modifie un workflow `eos_workflow_*`.

## 1. Passthrough et compatibilite clients MCP

- [ ] Chaque nouveau workflow utilise un schema Zod `passthrough()` au niveau racine.
- [ ] Les objets imbriques fournis par le client (ex. `looks`, `fixtures`, `groups`, `color_palettes`, `focus_palettes`) acceptent aussi les metadonnees inconnues avec `passthrough()` quand elles ne sont pas sensibles.
- [ ] Les champs inconnus ne sont jamais recopies dans les commandes OSC/Eos generees.
- [ ] Les tools bas niveau sensibles restent stricts et continuent de rejeter les arguments inconnus.

## 2. Defaults documentes et observables

- [ ] `dry_run` absent est documente comme `false`.
- [ ] `start_cue_number` absent est documente comme `1` pour `eos_workflow_create_cue_series`.
- [ ] `base_cuelist_number` / `cuelist_number` absent documente clairement le fallback vers la cuelist master quand le workflow le supporte.
- [ ] Les defaults d'effet (`direction=left_to_right`, `speed=1`, `size=100`) sont documentes.
- [ ] Les defaults `face_trad_*` de `eos_workflow_autopatch_band` sont documentes.
- [ ] Les defaults de patch fixture (`part=1`, position 3D `X=0 Y=0 Z=0`) sont documentes.
- [ ] Chaque default applique apparait dans `structuredContent.applied_defaults` quand il influence le plan retourne.

## 3. Structure de retour stable pour LLM

- [ ] `structuredContent.workflow` contient exactement le nom MCP du tool appele.
- [ ] `structuredContent.status` utilise seulement les statuts stables (`ok`, `partial_failure`, `failed`).
- [ ] `structuredContent.steps` est toujours present et liste les etapes dans l'ordre d'orchestration.
- [ ] `structuredContent.commands_preview` est toujours present et liste les commandes connues du workflow.
- [ ] `structuredContent.applied_defaults` est toujours present, meme vide.
- [ ] `structuredContent.warnings` est toujours present, meme vide.
- [ ] Les champs historiques (`executedSteps`, `command_log`, `commandsSent`, `partialErrors`) restent disponibles pour compatibilite.

## 4. Terminologie et publication

- [ ] Le nom du tool est identique dans le code (`ToolDefinition.name`), les annotations JSDoc, `manifest.json` et `docs/tools.md`.
- [ ] `manifest.json > mcp.capabilities.tools.presentation_order` reference tous les workflows publies.
- [ ] `manifest.json > featured_workflows` ne reference que des workflows existants.
- [ ] Les exemples MCP utilisent le meme nom que le tool publie, sans alias marketing.

## 5. Verifications avant tag

- [ ] Executer `npm run docs:check`.
- [ ] Executer `npm run lint:manifest`.
- [ ] Executer `npx jest --runInBand src/tools/workflows/__tests__/workflows.test.ts`.
- [ ] Si une commande globale comme `npm test` echoue pour des raisons hors scope, consigner les suites impactees dans la note de release interne.
