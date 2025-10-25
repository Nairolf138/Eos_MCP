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
      return z.object({}).strict();
    }

    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, value] of entries) {
      if (value instanceof z.ZodType) {
        shape[key] = value;
      }
    }

    if (Object.keys(shape).length > 0) {
      return z.object(shape).strict();
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

  if (typeof mappingValue === 'string' || Array.isArray(mappingValue)) {
    targetPath = normaliseOscPath(mappingValue);
  } else if (typeof mappingValue === 'object') {
    const details = mappingValue as Record<string, unknown>;
    targetPath = normaliseOscPath(details.osc);
    if (typeof details.commandExample === 'string') {
      commandTemplate = details.commandExample;
    }
  }

  if (!targetPath) {
    return ['_Pas de mapping OSC documenté._'];
  }

  if (commandTemplate) {
    const command = applyCommandTemplate(commandTemplate, args);
    const escapedCommand = command.replace(/'/g, "\\'");
    return [
      '```bash',
      "# Exemple d'envoi OSC via oscsend",
      `oscsend 127.0.0.1 8001 ${targetPath} s:'${escapedCommand}'`,
      '```'
    ];
  }

  const payload = args ?? {};
  const json = JSON.stringify(payload);
  const escaped = json.replace(/'/g, "\\'");
  return [
    '```bash',
    "# Exemple d'envoi OSC via oscsend",
    `oscsend 127.0.0.1 8001 ${targetPath} s:'${escaped}'`,
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

function buildDocumentation(tools: ToolDefinition[]): { markdown: string; metadata: Map<string, ToolMetadata> } {
  const metadata = new Map<string, ToolMetadata>();
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  for (const tool of sortedTools) {
    const schema = createZodSchema(tool.config.inputSchema);
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

