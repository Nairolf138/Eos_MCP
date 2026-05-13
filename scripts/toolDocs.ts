/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition } from '../src/tools/types.js';
import { z, type ZodTypeAny, type ZodOptional, type ZodNullable, type ZodDefault, type ZodEffects } from 'zod';
import {
  Project,
  Node,
  type Expression,
  type ObjectLiteralExpression,
  type VariableDeclaration,
  type VariableStatement
} from 'ts-morph';

interface ToolMetadata {
  tool: ToolDefinition;
  schema?: z.ZodTypeAny;
  exampleArgs?: Record<string, unknown> | undefined;
  properties: ToolProperty[];
}

interface ToolProperty {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

type PrivateModule = typeof import('module') & {
  _resolveFilename: (
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options: unknown
  ) => string;
};

function patchModuleResolution(): () => void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Module = require('module') as PrivateModule;
  const originalResolveFilename = Module._resolveFilename.bind(Module);
  Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
    try {
      return originalResolveFilename(request, parent, isMain, options);
    } catch (error) {
      if (typeof request === 'string' && request.endsWith('.js')) {
        const tsRequest = `${request.slice(0, -3)}.ts`;
        return originalResolveFilename(tsRequest, parent, isMain, options);
      }
      throw error;
    }
  };

  return () => {
    Module._resolveFilename = originalResolveFilename;
  };
}

function isWorkflowTool(tool: ToolDefinition): boolean {
  return tool.name.startsWith('eos_workflow_');
}

function createZodObject(shape: Record<string, ZodTypeAny>, tool: ToolDefinition): z.ZodObject<Record<string, ZodTypeAny>> {
  const objectSchema = z.object(shape);
  return isWorkflowTool(tool) ? objectSchema.passthrough() : objectSchema.strict();
}

function createZodSchema(tool: ToolDefinition, schemaLike: unknown): z.ZodTypeAny | undefined {
  if (!schemaLike) {
    return undefined;
  }

  if (schemaLike instanceof z.ZodType) {
    return schemaLike;
  }

  if (typeof schemaLike === 'object' && schemaLike != null && !Array.isArray(schemaLike)) {
    const entries = Object.entries(schemaLike as Record<string, unknown>);
    if (entries.length === 0) {
      return createZodObject({}, tool);
    }

    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, value] of entries) {
      if (value instanceof z.ZodType) {
        shape[key] = value;
      }
    }

    if (Object.keys(shape).length > 0) {
      return createZodObject(shape, tool);
    }
  }

  return undefined;
}

interface UnwrappedType {
  type: ZodTypeAny;
  optional: boolean;
  nullable: boolean;
}

function unwrap(type: ZodTypeAny): UnwrappedType {
  let current: ZodTypeAny = type;
  let optional = false;
  let nullable = false;

  while (true) {
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = (current as ZodOptional<ZodTypeAny>).unwrap();
      continue;
    }

    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = (current as ZodNullable<ZodTypeAny>).unwrap();
      continue;
    }

    if (current instanceof z.ZodDefault) {
      optional = true;
      current = (current as ZodDefault<ZodTypeAny>)._def.innerType as ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodEffects) {
      current = (current as ZodEffects<ZodTypeAny, unknown, unknown>)._def.schema as ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodPipeline) {
      current = current._def.in as ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodBranded) {
      current = current._def.type as ZodTypeAny;
      continue;
    }

    if (current instanceof z.ZodCatch) {
      current = current._def.innerType as ZodTypeAny;
      optional = true;
      continue;
    }

    if (current instanceof z.ZodLazy) {
      current = current._def.getter() as ZodTypeAny;
      continue;
    }

    break;
  }

  return { type: current, optional, nullable };
}

function describeType(type: ZodTypeAny): string {
  const { type: base, nullable } = unwrap(type);

  let description: string;

  if (base instanceof z.ZodString) {
    description = 'string';
  } else if (base instanceof z.ZodNumber) {
    description = 'number';
  } else if (base instanceof z.ZodBoolean) {
    description = 'boolean';
  } else if (base instanceof z.ZodBigInt) {
    description = 'bigint';
  } else if (base instanceof z.ZodDate) {
    description = 'date';
  } else if (base instanceof z.ZodArray) {
    description = `array<${describeType(base.element)}>`;
  } else if (base instanceof z.ZodTuple) {
    const items = base.items as ZodTypeAny[];
    description = `tuple<${items.map((item) => describeType(item)).join(', ')}>`;
  } else if (base instanceof z.ZodRecord) {
    const recordValue = (base._def as { valueType: ZodTypeAny }).valueType;
    description = `record<string, ${describeType(recordValue)}>`;
  } else if (base instanceof z.ZodEnum) {
    description = `enum(${base.options.join(', ')})`;
  } else if (base instanceof z.ZodNativeEnum) {
    const options = Object.values(base.enum).filter((value) => typeof value === 'string' || typeof value === 'number');
    description = `enum(${options.join(', ')})`;
  } else if (base instanceof z.ZodLiteral) {
    description = `literal(${JSON.stringify(base.value)})`;
  } else if (base instanceof z.ZodUnion) {
    const options = base.options as ZodTypeAny[];
    description = options.map((option) => describeType(option)).join(' | ');
  } else if (base instanceof z.ZodDiscriminatedUnion) {
    const options = Array.from(base.options.values()) as ZodTypeAny[];
    description = options.map((option) => describeType(option)).join(' | ');
  } else if (base instanceof z.ZodObject) {
    description = 'object';
  } else if (base instanceof z.ZodAny) {
    description = 'any';
  } else if (base instanceof z.ZodUnknown) {
    description = 'unknown';
  } else if (base instanceof z.ZodMap) {
    const mapTypes = base._def as { keyType: ZodTypeAny; valueType: ZodTypeAny };
    description = `map<${describeType(mapTypes.keyType)}, ${describeType(mapTypes.valueType)}>`;
  } else if (base instanceof z.ZodSet) {
    description = `set<${describeType(base._def.valueType as ZodTypeAny)}>`;
  } else if (base instanceof z.ZodPromise) {
    description = `promise<${describeType(base._def.type as ZodTypeAny)}>`;
  } else {
    description = base._def?.typeName ?? 'unknown';
  }

  if (nullable) {
    return `${description} | null`;
  }

  return description;
}

function buildProperties(schema?: z.ZodTypeAny): ToolProperty[] {
  if (!schema) {
    return [];
  }

  const { type: base } = unwrap(schema);

  if (!(base instanceof z.ZodObject)) {
    return [];
  }

  const shape = base.shape;
  const properties: ToolProperty[] = [];
  for (const key of Object.keys(shape)) {
    const propertyType = shape[key] as ZodTypeAny;
    const { type: unwrapped, optional } = unwrap(propertyType);
    const description = unwrapped.description ?? propertyType.description;
    properties.push({
      name: key,
      type: describeType(propertyType),
      required: !optional,
      description: description ?? undefined
    });
  }

  return properties.sort((a, b) => a.name.localeCompare(b.name));
}

function buildExample(schema?: z.ZodTypeAny): Record<string, unknown> | undefined {
  if (!schema) {
    return undefined;
  }

  const { type: base } = unwrap(schema);
  if (!(base instanceof z.ZodObject)) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  const optionalFallback: Array<{ key: string; type: ZodTypeAny }> = [];

  const shape = base.shape;
  for (const key of Object.keys(shape)) {
    const propertyType = shape[key] as ZodTypeAny;
    const { type: unwrapped, optional } = unwrap(propertyType);
    if (!optional) {
      result[key] = buildSampleValue(unwrapped);
    } else {
      optionalFallback.push({ key, type: unwrapped });
    }
  }

  if (Object.keys(result).length === 0 && optionalFallback.length > 0) {
    const fallback = optionalFallback[0];
    result[fallback.key] = buildSampleValue(fallback.type);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function buildSampleValue(type: ZodTypeAny): unknown {
  const { type: base } = unwrap(type);

  if (base instanceof z.ZodString) {
    return base.description?.includes('UUID') ? '00000000-0000-0000-0000-000000000000' : 'exemple';
  }
  if (base instanceof z.ZodNumber) {
    return 1;
  }
  if (base instanceof z.ZodBoolean) {
    return true;
  }
  if (base instanceof z.ZodArray) {
    return [buildSampleValue(base.element)];
  }
  if (base instanceof z.ZodEnum) {
    return base.options[0];
  }
  if (base instanceof z.ZodNativeEnum) {
    const values = Object.values(base.enum).filter((value) => typeof value === 'string' || typeof value === 'number');
    return values[0];
  }
  if (base instanceof z.ZodLiteral) {
    return base.value;
  }
  if (base instanceof z.ZodRecord) {
    const valueType = (base._def as { valueType: ZodTypeAny }).valueType;
    return { cle: buildSampleValue(valueType) };
  }
  if (base instanceof z.ZodTuple) {
    const items = base.items as ZodTypeAny[];
    return items.map((item) => buildSampleValue(item));
  }
  if (base instanceof z.ZodObject) {
    return buildExample(base) ?? {};
  }
  if (base instanceof z.ZodUnion) {
    return buildSampleValue(base.options[0]);
  }
  if (base instanceof z.ZodDiscriminatedUnion) {
    const first = base.options.values().next();
    if (!first.done) {
      return buildSampleValue(first.value as ZodTypeAny);
    }
  }
  if (base instanceof z.ZodBigInt) {
    return BigInt(1);
  }
  if (base instanceof z.ZodDate) {
    return new Date().toISOString();
  }

  return `<${base._def?.typeName ?? 'valeur'}>`;
}

function formatCliArgs(args?: Record<string, unknown>): string {
  const payload = args ?? {};
  const json = JSON.stringify(payload);
  return json.replace(/'/g, "\\'");
}

function normaliseOscPath(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        return entry;
      }
    }
  }

  return undefined;
}

function applyCommandTemplate(template: string, args?: Record<string, unknown>): string {
  if (!args) {
    return template;
  }

  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    const value = args[key];
    if (value == null) {
      return match;
    }
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).join(',');
    }
    return String(value);
  });
}

function formatOscExample(mappingValue: unknown, args?: Record<string, unknown>): string[] {
  if (!mappingValue) {
    return ['_Pas de mapping OSC documenté._'];
  }

  let targetPath: string | undefined;
  let commandTemplate: string | undefined;
  let argTemplates: string[] | undefined;

  if (typeof mappingValue === 'string' || Array.isArray(mappingValue)) {
    targetPath = normaliseOscPath(mappingValue);
  } else if (typeof mappingValue === 'object') {
    const details = mappingValue as Record<string, unknown>;
    targetPath = normaliseOscPath(details.osc);
    if (typeof details.commandExample === 'string') {
      commandTemplate = details.commandExample;
    }
    if (Array.isArray(details.args)) {
      argTemplates = details.args.filter((item): item is string => typeof item === 'string');
    }
  }

  if (!targetPath) {
    return ['_Pas de mapping OSC documenté._'];
  }

  const resolvedPath = applyCommandTemplate(targetPath, args);
  const isCommandAddress = resolvedPath === '/eos/cmd' || resolvedPath === '/eos/newcmd';

  if (commandTemplate && isCommandAddress) {
    const command = applyCommandTemplate(commandTemplate, args);
    const escapedCommand = command.replace(/'/g, "\\'");
    return [
      '```bash',
      "# Exemple d'envoi OSC via oscsend",
      `oscsend 127.0.0.1 8001 ${resolvedPath} s:'${escapedCommand}'`,
      '```'
    ];
  }

  if (argTemplates) {
    const resolvedArgs = argTemplates.map((template) => applyCommandTemplate(template, args));
    const escapedArgs = resolvedArgs.map((value) => value.replace(/'/g, "\\'"));
    const suffix = escapedArgs.length > 0 ? ` ${escapedArgs.join(' ')}` : '';
    return [
      '```bash',
      "# Exemple d'envoi OSC via oscsend",
      `oscsend 127.0.0.1 8001 ${resolvedPath}${suffix}`,
      '```'
    ];
  }

  const payload = args ?? {};
  const json = JSON.stringify(payload);
  const escaped = json.replace(/'/g, "\\'");
  return [
    '```bash',
    "# Exemple d'envoi OSC via oscsend",
    `oscsend 127.0.0.1 8001 ${resolvedPath} s:'${escaped}'`,
    '```'
  ];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isHighlighted(annotations: Record<string, unknown> | undefined): boolean {
  if (!annotations || typeof annotations !== 'object') {
    return false;
  }

  const value = (annotations as { highlighted?: unknown }).highlighted;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    return ['1', 'true', 'yes', 'on', 'enabled', 'highlighted'].includes(normalised);
  }

  return value === true;
}

const workflowNaturalExamplesLines = [
  "## Exemples rapides par workflow naturel",
  "",
  "Les payloads ci-dessous utilisent le format MCP `tools/call` complet. Les exemples gardent `dry_run=true` pour previsualiser les commandes sans modifier la console; passez `dry_run=false` ou omettez le champ pour executer reellement le workflow.",
  "",
  "### Workflow autopatch band",
  "",
  "**Phrase utilisateur :** \"patch moi 10 Mac Aura a partir du 1/1, puis 4 faces trad en univers 2.\"",
  "",
  "**Payload MCP complet :**",
  "",
  "```json",
  "{",
  "  \"jsonrpc\": \"2.0\",",
  "  \"id\": \"workflow-autopatch-band-1\",",
  "  \"method\": \"tools/call\",",
  "  \"params\": {",
  "    \"name\": \"eos_workflow_autopatch_band\",",
  "    \"arguments\": {",
  "      \"fixtures\": [",
  "        {",
  "          \"count\": 10,",
  "          \"fixture_manufacturer\": \"Martin\",",
  "          \"fixture_model\": \"MAC Aura\",",
  "          \"fixture_mode\": \"Extended\",",
  "          \"universe\": 1,",
  "          \"start_address\": 1,",
  "          \"label_prefix\": \"Mac Aura\"",
  "        }",
  "      ],",
  "      \"include_face_trad\": true,",
  "      \"face_trad_count\": 4,",
  "      \"face_trad_universe\": 2,",
  "      \"face_trad_start_address\": 1,",
  "      \"face_trad_label_prefix\": \"Face Trad\",",
  "      \"dry_run\": true",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "**Options et valeurs par defaut :** `fixtures` est obligatoire. Chaque fixture du bloc est espacee automatiquement de 10 adresses DMX estimees. `include_face_trad=false` par defaut; si `include_face_trad=true`, les valeurs par defaut sont `face_trad_count=4`, `face_trad_universe=1`, `face_trad_start_address=1`, `face_trad_label_prefix=\"Face Trad\"` et `fixture_query=\"trad\"`. `dry_run` absent vaut `false`. `targetAddress`, `targetPort` et `user` sont optionnels.",
  "",
  "### Workflow cue series",
  "",
  "**Phrase utilisateur :** \"crée moi 10 cues reggae avec des ambiances rouge, jaune et vert sur les Mac Aura.\"",
  "",
  "**Payload MCP complet :**",
  "",
  "```json",
  "{",
  "  \"jsonrpc\": \"2.0\",",
  "  \"id\": \"workflow-cue-series-1\",",
  "  \"method\": \"tools/call\",",
  "  \"params\": {",
  "    \"name\": \"eos_workflow_create_cue_series\",",
  "    \"arguments\": {",
  "      \"base_cuelist_number\": 1,",
  "      \"start_cue_number\": 10,",
  "      \"looks\": [",
  "        {",
  "          \"channels\": \"1 Thru 10\",",
  "          \"intensity\": \"Full\",",
  "          \"color_palette\": 101,",
  "          \"focus_palette\": 201,",
  "          \"beam_palette\": 301,",
  "          \"cue_label\": \"Reggae rouge\"",
  "        },",
  "        {",
  "          \"channels\": \"1 Thru 10\",",
  "          \"color_palette\": 102,",
  "          \"focus_palette\": 202,",
  "          \"beam_palette\": 301,",
  "          \"cue_label\": \"Reggae jaune\"",
  "        },",
  "        {",
  "          \"channels\": \"1 Thru 10\",",
  "          \"color_palette\": 103,",
  "          \"focus_palette\": 203,",
  "          \"beam_palette\": 302,",
  "          \"cue_label\": \"Reggae vert\"",
  "        }",
  "      ],",
  "      \"dry_run\": true",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "**Options et valeurs par defaut :** `looks` est obligatoire et doit contenir au moins un look; chaque look requiert `channels`. Pour regler un niveau, renseignez `intensity` (ou l'alias `level`) avec `Full`, `Out`, une valeur `0` a `100`, ou une valeur EOS textuelle sure (`On`, `Home`, `FL`) : le workflow genere alors une commande separee `Chan <channels> At <intensity>` avant les palettes. Ne concatenez pas `At`, `Record` ou `Label` dans `channels`. `start_cue_number` vaut `1` par defaut et s'auto-incremente si un look ne precise pas `cue_number`. `base_cuelist_number` absent utilise la cuelist master. `color_palette`, `focus_palette`, `beam_palette` et `cue_label` sont optionnels par look. Pour \"10 cues\", envoyez 10 objets dans `looks` ou ajoutez des `cue_number` explicites pour les positions particulieres.",
  "",
  "### Workflow groups/palettes",
  "",
  "**Phrase utilisateur :** \"prépare les groupes Mac Aura et Trad, puis les palettes rouge, ambre et centre.\"",
  "",
  "**Payload MCP complet :**",
  "",
  "```json",
  "{",
  "  \"jsonrpc\": \"2.0\",",
  "  \"id\": \"workflow-groups-palettes-1\",",
  "  \"method\": \"tools/call\",",
  "  \"params\": {",
  "    \"name\": \"eos_workflow_build_groups_and_palettes\",",
  "    \"arguments\": {",
  "      \"groups\": [",
  "        {",
  "          \"number\": 1,",
  "          \"label\": \"Mac Aura\",",
  "          \"channels\": \"1 Thru 10\"",
  "        },",
  "        {",
  "          \"number\": 2,",
  "          \"label\": \"Face Trad\",",
  "          \"channels\": \"11 Thru 14\"",
  "        }",
  "      ],",
  "      \"color_palettes\": [",
  "        {",
  "          \"number\": 101,",
  "          \"label\": \"Rouge reggae\",",
  "          \"channels\": \"1 Thru 10\",",
  "          \"hue\": \"Red\",",
  "          \"saturation\": 100",
  "        },",
  "        {",
  "          \"number\": 102,",
  "          \"label\": \"Ambre reggae\",",
  "          \"channels\": \"1 Thru 14\",",
  "          \"hue\": \"Amber\",",
  "          \"saturation\": 80",
  "        }",
  "      ],",
  "      \"focus_palettes\": [",
  "        {",
  "          \"number\": 201,",
  "          \"label\": \"Centre scene\",",
  "          \"channels\": \"1 Thru 10\",",
  "          \"description\": \"Pan 0 Tilt -20\"",
  "        }",
  "      ],",
  "      \"dry_run\": true",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "**Options et valeurs par defaut :** `groups`, `color_palettes` et `focus_palettes` sont tous optionnels, ce qui permet d'envoyer seulement les blocs necessaires. Dans un groupe, `number`, `label` et `channels` sont requis. Dans une color palette, `hue` et `saturation` sont optionnels. Dans une focus palette, `description` est optionnel et envoye comme commande libre avant l'enregistrement de la palette. `dry_run` absent vaut `false`.",
  "",
  "### Workflow update cue look",
  "",
  "**Phrase utilisateur :** \"mets a jour la cue 12 en baissant les Mac Aura a 70% et en rechauffant le look.\"",
  "",
  "**Payload MCP complet :**",
  "",
  "```json",
  "{",
  "  \"jsonrpc\": \"2.0\",",
  "  \"id\": \"workflow-update-cue-look-1\",",
  "  \"method\": \"tools/call\",",
  "  \"params\": {",
  "    \"name\": \"eos_workflow_update_cue_look\",",
  "    \"arguments\": {",
  "      \"cuelist_number\": 1,",
  "      \"cue_number\": 12,",
  "      \"channels\": \"1 Thru 10\",",
  "      \"intensity_factor\": 0.7,",
  "      \"warmify\": true,",
  "      \"dry_run\": true",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "**Options et valeurs par defaut :** `channels` est obligatoire. Si `cue_number` est absent, le workflow applique `Update Cue` sur la cue courante. Si `cue_number` est fourni sans `cuelist_number`, la cuelist master est utilisee. `intensity_factor` est optionnel et genere `At * <valeur>`. `warmify` et `desaturate` sont acceptes mais documentes comme transformations artistiques non calculees en v1; aucune commande implicite supplementaire n'est envoyee pour ces deux options. `dry_run` absent vaut `false`.",
  "",
  "### Workflow flyout effect",
  "",
  "**Phrase utilisateur :** \"crée un flyout center-out sur les Mac Aura, effet 21, rapide et assez large.\"",
  "",
  "**Payload MCP complet :**",
  "",
  "```json",
  "{",
  "  \"jsonrpc\": \"2.0\",",
  "  \"id\": \"workflow-flyout-effect-1\",",
  "  \"method\": \"tools/call\",",
  "  \"params\": {",
  "    \"name\": \"eos_workflow_create_effect\",",
  "    \"arguments\": {",
  "      \"channels\": \"1 Thru 10\",",
  "      \"effect_number\": 21,",
  "      \"group_number\": 1,",
  "      \"direction\": \"center_out\",",
  "      \"speed\": 1.8,",
  "      \"size\": 140,",
  "      \"dry_run\": true",
  "    }",
  "  }",
  "}",
  "```",
  "",
  "**Options et valeurs par defaut :** `channels` et `effect_number` sont obligatoires. `group_number` est optionnel; s'il est fourni, le workflow enregistre d'abord le groupe correspondant. `direction` vaut `left_to_right` par defaut et accepte aussi `right_to_left` ou `center_out`. `speed` vaut `1` par defaut et `size` vaut `100` par defaut. `dry_run` absent vaut `false`."
];

function buildDocumentation(tools: ToolDefinition[]): { markdown: string; metadata: Map<string, ToolMetadata> } {
  const metadata = new Map<string, ToolMetadata>();
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  for (const tool of sortedTools) {
    const schema = createZodSchema(tool, tool.config.inputSchema);
    const properties = buildProperties(schema);
    const exampleArgs = buildExample(schema);
    metadata.set(tool.name, { tool, schema, properties, exampleArgs });
  }

  const lines: string[] = [];
  lines.push('# Documentation des outils');
  lines.push('');
  lines.push('> Ce document est généré automatiquement via `npm run docs:generate`.');
  lines.push('> Merci de ne pas le modifier manuellement.');
  lines.push('');
  lines.push("Chaque outil expose son nom MCP, une description, la liste des arguments attendus ainsi qu'un exemple d'appel en CLI et par OSC.");
  lines.push('');
  lines.push('## Comportement dry-run des workflows');
  lines.push('');
  lines.push('Tous les workflows `eos_workflow_*` exposent `dry_run` en option. Quand `dry_run` est absent ou vaut `false`, le workflow execute reellement la sequence EOS et retourne un journal structure commande par commande dans `structuredContent.command_log` ainsi que les commandes tentees dans `structuredContent.commandsSent`.');
  lines.push('');
  lines.push("Quand `dry_run=true`, aucune commande EOS n'est envoyee via `sendDeterministicCommand`; la sequence EOS complete est retournee dans `structuredContent.commands_preview`, et `structuredContent.commandsSent` reste vide. Les garde-fous sensibles restent portes par les tools bas niveau et ne sont pas exposes dans les schemas workflow.");
  lines.push('');
  lines.push('Tous les workflows retournent aussi une structure stable et lisible par les LLM : `structuredContent.steps` (alias moderne de `executedSteps`), `structuredContent.commands_preview` (toujours present), `structuredContent.applied_defaults` (defaults explicites comme `start_cue_number=1` ou fallback cuelist master) et `structuredContent.warnings` (avertissements non bloquants et erreurs partielles resumées).');
  lines.push('');
  lines.push('## Safety pattern');
  lines.push('');
  lines.push('> **Plan -> dry-run -> confirmation -> execution.** Pour toute modification de show (cue, patch, palette, commande texte ou declenchement live), l’assistant doit annoncer le plan d’action, proposer un dry-run avec preview des commandes, puis executer en reel uniquement apres confirmation explicite de l’operateur.');
  lines.push('');
  lines.push('Exemple concret pour modifier une cue :');
  lines.push('');
  lines.push('1. **Plan annonce** : "Je vais mettre a jour la cue 12 de la liste 1 sur les canaux `1 Thru 10`, appliquer un facteur d’intensite `0.7`, puis preparer l’update sans l’envoyer."');
  lines.push('2. **Dry-run propose** : appeler `eos_workflow_update_cue_look` avec `dry_run=true` afin de retourner `structuredContent.commands_preview`, par exemple `Chan 1 Thru 10 At * 0.7` puis `Update Cue 1 / 12`.');
  lines.push('3. **Confirmation explicite** : attendre une reponse non ambigue, par exemple "Confirme, execute la mise a jour de la cue 12".');
  lines.push('4. **Execution reelle** : relancer le meme workflow avec `dry_run=false` seulement apres cette confirmation, puis verifier `structuredContent.command_log` et `structuredContent.commandsSent`.');
  lines.push('');
  lines.push('Les **outils bas niveau sensibles** (`eos_cue_record`, `eos_cue_update`, `eos_patch_*`, `eos_command`, `eos_new_command`, declenchements `fire`, etc.) exposent des garde-fous stricts comme `require_confirmation`, `safety_level` et le rejet des arguments inconnus. Ils sont adaptes aux integrations qui savent exactement quelle commande EOS envoyer. `eos_new_command` refuse aussi les commandes composees de programmation de cues (par exemple `At` + `Record` + `Label`). Pour une serie de cues, Claude doit privilegier `eos_workflow_create_cue_series` avec `looks[].intensity` (ou `looks[].level`) afin que le workflow emette `Chan 1 Thru 10 At Full`, puis `Record Cue 3`, puis `Cue 3 Label "Reggae"` comme commandes separees.');
  lines.push('');
  lines.push('Les **workflows haut niveau guides** (`eos_workflow_*`) orchestrent plusieurs commandes metier, acceptent des metadonnees clientes inconnues sans les executer et fournissent une preview complete via `dry_run=true`. Ils sont a privilegier pour les assistants conversationnels, car ils imposent un parcours operateur plus lisible avant toute action destructive ou visible en live.');
  lines.push('');
  lines.push('## Capacites de lecture OSC');
  lines.push('');
  lines.push('Avant de raisonner sur le contenu du show, Claude doit lire `eos_connect.structuredContent` ou `eos_capabilities_get.structuredContent.context.osc_limitations`. Si `can_read_queries=false`, Claude ne doit pas inventer le patch, la cuelist, les cues ou les objets EOS : il doit les presenter comme inconnus et demander une lecture reussie ou une confirmation utilisateur explicite. En `handshake_mode=degraded`, le serveur indique seulement que l’envoi est possible; la lecture reste non garantie tant qu’une requete de lecture ne retourne pas `status=ok`.');
  lines.push('');
  lines.push('## Options communes de securite (outils critiques)');
  lines.push('');
  lines.push('Les outils critiques des familles **cues**, **patch**, **palettes** et **commandes texte** exposent les options suivantes :');
  lines.push('');
  lines.push('- `dry_run` (`boolean`) : calcule la commande OSC/Eos et la retourne dans `structuredContent.osc` sans envoi vers la console.');
  lines.push('- `require_confirmation` (`boolean`) : confirmation explicite requise pour les actions sensibles.');
  lines.push("- `safety_level` (`strict` | `standard` | `off`) : niveau de garde-fou applique (par defaut `strict`).");
  lines.push('');
  lines.push('En mode `strict`/`standard`, les actions sensibles (`record`, `update`, `delete`, `live fire`, et declenchements `fire`) sont bloquees sans `require_confirmation=true`.');
  lines.push('');
  lines.push("## Politique d'arguments inconnus");
  lines.push('');
  lines.push("Les workflows `eos_workflow_*` sont tolerants : leurs schemas Zod utilisent `passthrough()` pour accepter les champs MCP inconnus. Ces champs sont conserves par la validation mais ne sont pas lus par la logique metier, ce qui permet d'ignorer des metadonnees clientes sans modifier les commandes OSC generees.");
  lines.push('');
  lines.push("Les tools bas niveau et sensibles restent stricts (`strict()`) afin de rejeter les arguments non prevus avant toute action directe : GO brut (`eos_cue_go`), patch brut (`eos_patch_*`, `eos_programming_patch_set_channel`), show control (`eos_show_*`), commandes texte et reglages directs.");
  lines.push('');
  lines.push('Workflows tolerants recenses :');
  lines.push('');
  for (const tool of sortedTools.filter(isWorkflowTool)) {
    lines.push(`- \`${tool.name}\``);
  }
  lines.push('');
  lines.push('## Checklist release interne — LLM-friendly workflows');
  lines.push('');
  lines.push('- [ ] Verifier que chaque nouveau workflow `eos_workflow_*` utilise un schema `passthrough()` au niveau racine et sur les objets imbriques pertinents afin d accepter les metadonnees clientes sans les executer.');
  lines.push('- [ ] Documenter chaque valeur par defaut observable (`dry_run=false`, `start_cue_number=1`, fallback cuelist master si `cuelist_number` ou `base_cuelist_number` est absent, defaults `direction/speed/size`, defaults `face_trad_*`, position 3D `0/0/0`).');
  lines.push('- [ ] Confirmer que `structuredContent.steps`, `commands_preview`, `applied_defaults` et `warnings` sont toujours presents et restent des tableaux lisibles par un LLM.');
  lines.push('- [ ] Comparer les noms des tools entre `src/tools/workflows/index.ts`, `manifest.json` (`featured_workflows` et `presentation_order`) et `docs/tools.md`; aucun alias divergent ne doit etre publie.');
  lines.push('- [ ] Executer `npm run docs:check`, `npm run lint:manifest` et les tests workflows avant tag/release.');
  lines.push('');
  lines.push(...workflowNaturalExamplesLines);
  lines.push('');

  const highlightedTools = sortedTools.filter((tool) =>
    isHighlighted(tool.config.annotations as Record<string, unknown> | undefined)
  );

  if (highlightedTools.length > 0) {
    lines.push('## Outils mis en avant');
    lines.push('');
    lines.push('| Outil | Résumé | Lien |');
    lines.push('| --- | --- | --- |');
    for (const tool of highlightedTools) {
      const slug = slugify(tool.name);
      const summary = (tool.config.title ?? tool.name).replace(/\|/g, '\\|');
      lines.push(`| \`${tool.name}\` | ${summary} | [#${slug}](#${slug}) |`);
    }
    lines.push('');
  }

  for (const tool of sortedTools) {
    const data = metadata.get(tool.name)!;
    const title = tool.config.title ?? tool.name;
    const description = tool.config.description ?? 'Pas de description fournie.';
    const slug = slugify(tool.name);

    lines.push(`<a id="${slug}"></a>`);
    lines.push(`## ${title} (\`${tool.name}\`)`);
    lines.push('');
    lines.push(`**Description :** ${description}`);
    lines.push('');

    if (data.properties.length === 0) {
      lines.push('**Arguments :** Aucun argument.');
    } else {
      lines.push('**Arguments :**');
      lines.push('');
      lines.push('| Nom | Type | Requis | Description |');
      lines.push('| --- | --- | --- | --- |');
      for (const property of data.properties) {
        const desc = property.description ? property.description.replace(/\n/g, ' ') : '';
        const typeText = property.type.replace(/\|/g, '\\|');
        const descriptionText = (desc || '—').replace(/\|/g, '\\|');
        lines.push(`| \`${property.name}\` | ${typeText} | ${property.required ? 'Oui' : 'Non'} | ${descriptionText} |`);
      }
    }
    lines.push('');
    lines.push('**Retour :** Les handlers renvoient un `ToolExecutionResult` avec un résumé texte et les données renvoyées par la console EOS.');
    lines.push('');
    lines.push('**Exemples :**');
    lines.push('');
    const cliArgs = formatCliArgs(data.exampleArgs);
    lines.push('_CLI_');
    lines.push('');
    lines.push('```bash');
    lines.push(`npx @modelcontextprotocol/cli call --tool ${tool.name} --args '${cliArgs}'`);
    lines.push('```');
    lines.push('');
    lines.push('_OSC_');
    lines.push('');
    const mapping = (tool.config.annotations as Record<string, unknown> | undefined)?.mapping;
    const oscExample = formatOscExample(mapping, data.exampleArgs);
    lines.push(...oscExample);
    lines.push('');
  }

  return { markdown: `${lines.join('\n').trim()}\n`, metadata };
}

interface JsDocData {
  toolName: string;
  title: string;
  description: string;
}

function extractObjectLiteral(expression: Expression): ObjectLiteralExpression | undefined {
  const unwrapped = unwrapExpression(expression);
  if (Node.isObjectLiteralExpression(unwrapped)) {
    return unwrapped;
  }

  if (Node.isCallExpression(unwrapped)) {
    for (const arg of unwrapped.getArguments()) {
      const literal = extractObjectLiteral(arg as Expression);
      if (literal) {
        return literal;
      }
    }
  }

  return undefined;
}

function unwrapExpression(expression: Expression): Expression {
  let current = expression;
  while (true) {
    if (Node.isAsExpression(current) || Node.isSatisfiesExpression(current) || Node.isParenthesizedExpression(current)) {
      current = current.getExpression();
      continue;
    }
    if (Node.isNonNullExpression(current)) {
      current = current.getExpression();
      continue;
    }
    break;
  }
  return current;
}

function extractJsDocData(declaration: VariableDeclaration): JsDocData | undefined {
  const initializer = declaration.getInitializer();
  if (!initializer) {
    return undefined;
  }

  const objectLiteral = extractObjectLiteral(initializer as Expression);
  if (!objectLiteral) {
    return undefined;
  }

  let toolName: string | undefined;
  let title: string | undefined;
  let description: string | undefined;

  for (const property of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }

    const name = property.getNameNode();
    if (name.getText() === 'name') {
      const valueNode = property.getInitializer();
      if (valueNode && Node.isStringLiteral(valueNode)) {
        toolName = valueNode.getLiteralValue();
      }
      continue;
    }

    if (name.getText() === 'config') {
      const valueNode = property.getInitializer();
      const configObject = valueNode ? extractObjectLiteral(valueNode as Expression) : undefined;
      if (configObject) {
        for (const configProperty of configObject.getProperties()) {
          if (!Node.isPropertyAssignment(configProperty)) {
            continue;
          }
          const configName = configProperty.getNameNode().getText();
          const configValue = configProperty.getInitializer();
          if (!configValue || !Node.isStringLiteral(configValue)) {
            continue;
          }
          if (configName === 'title') {
            title = configValue.getLiteralValue();
          } else if (configName === 'description') {
            description = configValue.getLiteralValue();
          }
        }
      }
    }
  }

  if (!toolName) {
    return undefined;
  }

  return {
    toolName,
    title: title ?? toolName,
    description: description ?? 'Voir la documentation des outils.'
  };
}

function ensureJsDoc(metadata: Map<string, ToolMetadata>): boolean {
  const project = new Project({ tsConfigFilePath: path.resolve(process.cwd(), 'tsconfig.json') });
  const sourceFiles = project.getSourceFiles('src/tools/**/*.ts');
  let updated = false;

  for (const sourceFile of sourceFiles) {
    if (sourceFile.getBaseName().endsWith('.test.ts') || sourceFile.getFilePath().includes('__tests__')) {
      continue;
    }

    const variableStatements = sourceFile.getVariableStatements().filter((statement) => statement.isExported());
    for (const statement of variableStatements) {
      for (const declaration of statement.getDeclarations()) {
        const name = declaration.getName();
        if (!name.endsWith('Tool')) {
          continue;
        }

        const jsDocData = extractJsDocData(declaration);
        if (!jsDocData) {
          continue;
        }

        const toolInfo = metadata.get(jsDocData.toolName);
        if (!toolInfo) {
          continue;
        }

        const slug = slugify(jsDocData.toolName);
        const description = toolInfo.tool.config.description ?? jsDocData.description;
        const lines = [
          `@tool ${jsDocData.toolName}`,
          `@summary ${jsDocData.title}`,
          `@description ${description}`,
          `@arguments Voir docs/tools.md#${slug} pour le schema complet.`,
          '@returns ToolExecutionResult avec contenu texte et objet.',
          `@example CLI Consultez docs/tools.md#${slug} pour un exemple CLI.`,
          `@example OSC Consultez docs/tools.md#${slug} pour un exemple OSC.`
        ];

        const jsDocTarget = statement as VariableStatement;
        const existingDocs = jsDocTarget.getJsDocs();
        const currentText = existingDocs.map((doc) => doc.getInnerText().trim()).join('\n');
        const newText = lines.join('\n');
        if (currentText === newText) {
          continue;
        }

        for (const doc of existingDocs) {
          doc.remove();
        }

        jsDocTarget.addJsDoc({ description: newText });
        updated = true;
        break;
      }
    }
  }

  if (updated) {
    project.saveSync();
  }

  return updated;
}

function loadToolDefinitions(): ToolDefinition[] {
  const restore = patchModuleResolution();
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const moduleExports = require('../src/tools');
    const definitions = moduleExports.toolDefinitions as ToolDefinition[];
    if (!Array.isArray(definitions)) {
      throw new Error('Impossible de charger les definitions des outils.');
    }
    return definitions;
  } finally {
    restore();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldCheck = args.includes('--check');
  const shouldSkipJsDoc = args.includes('--skip-jsdoc');

  const definitions = loadToolDefinitions();
  const { markdown, metadata } = buildDocumentation(definitions);
  const docsPath = path.resolve(process.cwd(), 'docs', 'tools.md');

  if (!fs.existsSync(path.dirname(docsPath))) {
    fs.mkdirSync(path.dirname(docsPath), { recursive: true });
  }

  if (!shouldSkipJsDoc) {
    ensureJsDoc(metadata);
  }

  if (shouldCheck) {
    if (!fs.existsSync(docsPath)) {
      console.error('La documentation des outils est manquante.');
      process.exitCode = 1;
      return;
    }
    const current = fs.readFileSync(docsPath, 'utf8');
    if (current.trim() !== markdown.trim()) {
      console.error('La documentation des outils doit etre regeneree (executer `npm run docs:generate`).');
      process.exitCode = 1;
    }
    return;
  }

  fs.writeFileSync(docsPath, markdown, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
