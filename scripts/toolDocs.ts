/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition, ToolMetadata as DefinitionToolMetadata } from '../src/tools/types.js';
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

function createZodObject(shape: Record<string, ZodTypeAny>): z.ZodObject<Record<string, ZodTypeAny>> {
  return z.object(shape).strict();
}

function createZodSchema(schemaLike: unknown): z.ZodTypeAny | undefined {
  if (!schemaLike) {
    return undefined;
  }

  if (schemaLike instanceof z.ZodType) {
    return schemaLike;
  }

  if (typeof schemaLike === 'object' && schemaLike != null && !Array.isArray(schemaLike)) {
    const entries = Object.entries(schemaLike as Record<string, unknown>);
    if (entries.length === 0) {
      return createZodObject({});
    }

    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, value] of entries) {
      if (value instanceof z.ZodType) {
        shape[key] = value;
      }
    }

    if (Object.keys(shape).length > 0) {
      return createZodObject(shape);
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

function mappingSummary(tool: ToolDefinition): string {
  const mapping = tool.config.annotations?.mapping as { osc?: unknown } | undefined;
  const paths = typeof mapping?.osc === 'string' ? [mapping.osc]
    : Array.isArray(mapping?.osc) ? mapping.osc.filter((entry): entry is string => typeof entry === 'string') : [];
  const special: Record<string, string> = {
    eos_connect: '`/eos/get/version` (connexion locale et lecture native)',
    eos_get_count: '`/eos/get/{family}/count` ; cues : `/eos/get/cue/{list}/count`',
    eos_get_list_all: 'Get count puis `/eos/get/{family}/index/{index}` ; cues : liste explicite',
    eos_reset: '`/eos/reset` (sans arguments, sans accusé de réception)',
    eos_subscribe: '`/eos/subscribe`, `/eos/subscribe/param/{name}` (entier 0 ou 1)',
    eos_capabilities_get: 'Contexte local et capacités observées ; voir eos_connect',
    eos_workflow_patch_scan: 'Lectures natives `/eos/get/patch/{channel}/{part}`',
    eos_submaster_record: 'Préparation sélective : Get sub, commandes utilisateur et Set label'
  };
  if (special[tool.name]) return special[tool.name];
  if (paths.length) return paths.map((entry) => `\`${entry}\``).join(', ');
  if (tool.name.startsWith('eos_workflow_')) return 'Orchestration de lectures Get, commandes utilisateur et Set natifs ; voir cookbook';
  return 'Pas de mapping direct déclaré ; voir description (outil local ou orchestration)';
}

function buildCoverage(tools: ToolDefinition[]): string {
  const lines = [
    '# Couverture OSC ↔ MCP', '',
    '> Catalogue généré avec `npm run docs:generate -- --skip-jsdoc`.', '',
    'Les chemins ci-dessous sont des modèles de routage, pas des commandes shell. Les arguments MCP sont du JSON ; les paquets OSC contiennent des arguments typés ETC, jamais une sérialisation JSON de ces arguments.', '',
    'Sources : [dictionnaire ETC](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/OSC_Dictionary.htm), [OSC Get](https://www.etcconnect.com/WebDocs/Controls/EosFamilyOnlineHelp/en/Content/23_Show_Control/08_OSC/Using_OSC_with_Eos/OSC_Third-Party_Integration/OSC_Get.htm), [EosSyncLib ETC](https://github.com/ETCLabs/EosSyncLib).', '',
    '## Contrats natifs', '',
    '| Usage | Requête / sortie | Arguments et portée |',
    '| --- | --- | --- |',
    '| Version | `/eos/get/version` → `/eos/out/get/version` | Requête vide ; version et bibliothèque en chaînes, drapeau gel en booléen |',
    '| Objets | `/eos/get/{family}/{number}` | Réponses `/eos/out/get/...` typées ; familles `sub`, `fx`, `snap`, `ms` |',
    '| Énumération | `/eos/get/{family}/count`, puis `/index/{index}` | Les cues nécessitent une liste : `/eos/get/cue/{list}/count` et `/index/{index}` |',
    '| Patch | `/eos/get/patch/{channel}/{part}` | Parties natives à partir de 1 ; toutes les parties sont réunies localement pour une lecture globale |',
    '| Fragments reçus | `/eos/out/get/.../list/{start}/{total}` | Offsets sur les arguments complets, sections obligatoires et UID cohérents ; absence ou délai = erreur |',
    '| Commande texte | `/eos/cmd`, `/eos/newcmd`, `/eos/user/{user}/cmd`, `/eos/user/{user}/newcmd` | Un argument chaîne ; `#` termine la commande ; adresse utilisateur atomique |',
    '| Ligne de commande | `/eos/out/cmd`, `/eos/out/user/{user}/cmd` | Observation passive, texte et drapeau erreur ; aucune requête Get inventée |',
    '| GO / Stop-Back | `/eos/cues/{list}/fire`, `/eos/cues/{list}/stop` | Stop-Back dépend de l’état de lecture ; aucune option back indépendante |',
    '| Cue déterminée | `/eos/cue/{cue}/fire`, `/eos/cue/{list}/{cue}[/part]/fire` | Liste absente conservée ; partie explicite exige une liste explicite |',
    '| Groupe / sub | `/eos/group/{n}`, `/eos/sub/{n}` | Niveau groupe flottant 0–100 ; sub flottant 0–1 |',
    '| Adresse DMX | `/eos/addr`, `/eos/addr/{n}`, `/eos/addr/{n}/DMX` | Adresse absolue entière ; niveau flottant 0–100 ou valeur DMX entière 0–255 |',
    '| Couleur | `/eos/color/hs`, `/eos/color/rgb` | H 0–360, S 0–100 ; RGB 0–1 |',
    '| Étiquettes | `/eos/set/.../label` | Une chaîne native, pas une commande Label construite avec du texte utilisateur |',
    '| État, roues, softkeys | `/eos/out/event/state`, `/eos/out/active/wheel/{index}`, `/eos/out/softkey/{index}` | Cache daté ; données incomplètes ou périmées signalées |', '',
    '## Niveau de preuve', '',
    'Les fixtures de `nativePeer.ts` sont synthétiques, construites à partir des tables ETC. Les tests de conformance utilisent de vraies sockets UDP/TCP en boucle locale. Ce ne sont pas des captures de console ni une certification de versions Eos.', '',
    '`sent_to_transport` prouve un envoi au transport. `accepted_by_eos` repose sur un retour de commande récent, corrélé à la cible et à l’utilisateur. `verified` exige une relecture du résultat annoncé. Un ACK, une existence ou une étiquette relue ne prouvent pas les valeurs enregistrées dans une cue, palette ou un sub.', '',
    'Les métadonnées `validated_cmd_fallback` indiquent un routage par l’entrée de commande ETC ; elles ne certifient pas toute syntaxe de commande fournie par un utilisateur. Aucun endpoint sortant inconnu n’est autorisé, même hors mode strict.', '',
    'Tests : `osc_contracts.test.ts` (catalogue et écritures natives), `native_reads.test.ts` (schémas publiés), `client.test.ts` (décodage, fragmentation, délais, provenance), `native_preparation.test.ts` et `workflows.test.ts` (préconditions, séquences, readbacks), `mcp-e2e.test.ts` (client SDK). Voir [limites natives](native-osc-limitations.md), [validation](validation-work-in-progress.md) et [tests E2E](testing-e2e.md).', '',
    '## Catalogue courant', '',
    '| Outil MCP | Routage / observation |', '| --- | --- |'
  ];
  for (const tool of [...tools].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`| \`${tool.name}\` | ${mappingSummary(tool).replace(/\|/g, '\\|')} |`);
  }
  return `${lines.join('\n')}\n`;
}

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => `\`${String(entry)}\``).join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non';
  }
  if (typeof value === 'string') {
    return `\`${value}\``;
  }
  if (value == null) {
    return '—';
  }
  return `\`${JSON.stringify(value)}\``;
}

function extractToolMetadata(tool: ToolDefinition): DefinitionToolMetadata | undefined {
  const annotations = tool.config.annotations ?? {};
  const metadata = tool.metadata ?? {};
  const merged: DefinitionToolMetadata = {
    ...metadata,
    category: metadata.category ?? (typeof annotations.category === 'string' ? annotations.category : undefined),
    synonyms: metadata.synonyms ?? (Array.isArray(annotations.synonyms) ? annotations.synonyms.filter((entry): entry is string => typeof entry === 'string') : undefined),
    riskLevel: metadata.riskLevel ?? (typeof annotations.riskLevel === 'string' ? metadata.riskLevel ?? annotations.riskLevel as DefinitionToolMetadata['riskLevel'] : undefined),
    requiresConfirmation: metadata.requiresConfirmation ?? (typeof annotations.requiresConfirmation === 'boolean' ? annotations.requiresConfirmation : undefined),
    preferredWorkflow: metadata.preferredWorkflow ?? (
      typeof annotations.preferredWorkflow === 'string' || Array.isArray(annotations.preferredWorkflow)
        ? annotations.preferredWorkflow as string | string[]
        : undefined
    )
  };

  return Object.values(merged).some((value) => value !== undefined) ? merged : undefined;
}

function pushToolMetadata(lines: string[], tool: ToolDefinition): void {
  const metadata = extractToolMetadata(tool);
  if (!metadata) {
    return;
  }

  lines.push('**Métadonnées :**');
  lines.push('');
  lines.push('| Champ | Valeur |');
  lines.push('| --- | --- |');
  if (metadata.category) {
    lines.push(`| Catégorie | ${formatMetadataValue(metadata.category)} |`);
  }
  if (metadata.synonyms && metadata.synonyms.length > 0) {
    lines.push(`| Synonymes | ${formatMetadataValue(metadata.synonyms)} |`);
  }
  if (metadata.riskLevel) {
    lines.push(`| Niveau de risque | ${formatMetadataValue(metadata.riskLevel)} |`);
  }
  if (typeof metadata.requiresConfirmation === 'boolean') {
    lines.push(`| Confirmation requise | ${formatMetadataValue(metadata.requiresConfirmation)} |`);
  }
  if (metadata.preferredWorkflow) {
    lines.push(`| Workflow préféré | ${formatMetadataValue(metadata.preferredWorkflow)} |`);
  }
  lines.push('');
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

function buildDocumentation(tools: ToolDefinition[]): { markdown: string; metadata: Map<string, ToolMetadata> } {
  const metadata = new Map<string, ToolMetadata>();
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  for (const tool of sortedTools) {
    const schema = createZodSchema(tool.config.inputSchema);
    const properties = buildProperties(schema);
    metadata.set(tool.name, { tool, schema, properties });
  }

  const lines: string[] = [
  "# Documentation des outils",
  "",
  "> Générée avec `npm run docs:generate -- --skip-jsdoc`. Ne pas modifier manuellement.",
  "",
  "Le catalogue décrit les arguments métier et les métadonnées des outils exportés. Pour les schémas complets, y compris objets imbriqués et contrôles ajoutés à l’exécution, utiliser MCP `tools/list` ou `/schemas/tools/{toolName}.json`. Le [cookbook](cookbook.md) donne des appels MCP concrets ; le [guide agent](llm-agent-guide.md) précise la démarche de préparation.",
  "",
  "## Appels et résultats",
  "",
  "Les appels MCP utilisent la méthode `tools/call`, avec `params.name` et `params.arguments`. Le serveur traduit ces arguments en messages OSC natifs typés ETC. Le JSON MCP ne doit jamais être envoyé comme chaîne OSC à une adresse Get ou de contrôle.",
  "",
  "- `content[0].text` et `structuredContent.summary` décrivent le résultat ; consulter aussi `isError`, `status`, `warnings` et `next_actions`.",
  "- `commandsSent` contient les commandes texte envoyées, pas l’ensemble des messages OSC. `commands_preview` et `osc_preview` décrivent les simulations quand disponibles.",
  "- `sent_to_transport` signifie envoyé ; `accepted_by_eos` signifie retour corrélé de la ligne de commande ; `verified` ne vaut vrai que pour l’état effectivement relu. Ces preuves ne sont pas interchangeables.",
  "- `source`, `is_complete`, `observed_at`, `limitations` et les champs de vérification indiquent les limites des lectures. Une réponse absente ou incomplète n’est pas un objet vide valide.",
  "",
  "## Contrôles communs",
  "",
  "Le registre ajoute `targetConsole` (alias déclaré dans `EOS_CONSOLES`) et les contrôles applicables à l’outil. `dry_run: true` empêche l’envoi et les mutations locales du handler. Les simulations ne vérifient pas l’état de la console. Une exécution sensible exige `require_confirmation: true` et les droits de programmation configurés côté serveur ; la confirmation ne relève pas le rôle autorisé.",
  "",
  "Établir la cible, le plan et l’accord de l’opérateur pour le périmètre demandé, puis contrôler la prévisualisation avant l’exécution. Ne pas redemander un accord déjà donné pour ce même périmètre. Les écritures modifiant la sortie doivent être annoncées comme telles. Les arguments inconnus sont rejetés, y compris dans les workflows.",
  "",
  "Les workflows de cues exigent la liste explicitement ; les palettes exigent des valeurs ou `use_current_values: true` ; le patch exige le profil exact, son empreinte DMX et un utilisateur explicite pour les écritures. Aucune inférence de footprint, position 3D ou intention artistique ne remplace ces données.",
  "",
  "## Références OSC",
  "",
  "La [matrice OSC](osc-coverage.md) expose les chemins et les unités natifs. Les lectures Get attendent `/eos/out/get/...`, avec des arguments typés et des fragments réassemblés. Les lignes de commande, roues et softkeys sont des observations passives datées. Les [limites](native-osc-limitations.md) distinguent les capacités disponibles des opérations retirées. Les tests simulés ne certifient pas une console réelle.",
  ""
];

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

  const documentedMetadata = sortedTools
    .map((tool) => extractToolMetadata(tool))
    .filter((metadata): metadata is DefinitionToolMetadata => Boolean(metadata));
  const documentedCategories = Array.from(new Set(documentedMetadata.map((metadata) => metadata.category).filter((category): category is string => Boolean(category)))).sort();
  if (documentedCategories.length > 0) {
    lines.push('## Métadonnées de découverte');
    lines.push('');
    lines.push('Les champs `category`, `synonyms`, `riskLevel`, `requiresConfirmation` et `preferredWorkflow` sont publiés dans `config.annotations` pour les clients MCP et repris ci-dessous pour guider le routage LLM.');
    lines.push('');
    lines.push(`Catégories documentées : ${documentedCategories.map((category) => `\`${category}\``).join(', ')}.`);
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
    pushToolMetadata(lines, tool);

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
    lines.push('**Retour :** Résultat MCP structuré ; contrôler le statut et les preuves décrites ci-dessus.');
    lines.push('');
    const outputProperties = buildProperties(createZodSchema(tool.config.outputSchema));
    if (outputProperties.length) {
      lines.push('| Champ de sortie spécifique | Type | Requis | Description |', '| --- | --- | --- | --- |');
      for (const property of outputProperties) {
        lines.push(`| \`${property.name}\` | ${property.type.replace(/\|/g, '\\|')} | ${property.required ? 'Oui' : 'Non'} | ${(property.description ?? '—').replace(/\n/g, ' ').replace(/\|/g, '\\|')} |`);
      }
      lines.push('');
    }
    lines.push(`**Routage OSC :** ${mappingSummary(tool)}.`);
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
          `@example MCP Consultez docs/cookbook.md pour des appels tools/call.`,
          `@example OSC Consultez docs/osc-coverage.md pour les contrats natifs.`
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
  const documents = new Map([
    ['tools.md', markdown],
    ['osc-coverage.md', buildCoverage(definitions)]
  ]);
  if (!shouldSkipJsDoc) ensureJsDoc(metadata);
  for (const [filename, content] of documents) {
    const docsPath = path.resolve(process.cwd(), 'docs', filename);
    if (shouldCheck) {
      if (!fs.existsSync(docsPath) || fs.readFileSync(docsPath, 'utf8').trim() !== content.trim()) {
        console.error(`${filename} doit être régénéré : npm run docs:generate -- --skip-jsdoc`);
        process.exitCode = 1;
      }
    } else {
      fs.mkdirSync(path.dirname(docsPath), { recursive: true });
      fs.writeFileSync(docsPath, content, 'utf8');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
