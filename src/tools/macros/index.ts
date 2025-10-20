import { z, type ZodRawShape } from 'zod';
import {
  createCacheKey,
  createOscPrefixTag,
  createResourceTag,
  getResourceCache
} from '../../services/cache/index';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const macroNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero de macro (1-9999)');

const timeoutSchema = z.number().int().min(50).optional();

const macroCommandOutputSchema = z.object({
  index: z.number().int().min(1),
  text: z.string()
});

export const macroDetailsOutputSchema = z.object({
  macro_number: macroNumberSchema,
  label: z.string().nullable(),
  mode: z.string().nullable(),
  commands: z.array(macroCommandOutputSchema),
  script_text: z.string()
});

interface MacroCommand {
  index: number;
  text: string;
}

interface MacroDetails {
  macro_number: number;
  label: string | null;
  mode: string | null;
  commands: MacroCommand[];
  script_text: string;
}

const fireInputSchema = {
  macro_number: macroNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const selectInputSchema = {
  macro_number: macroNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  macro_number: macroNumberSchema,
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

function buildJsonArgs(payload: Record<string, unknown>): OscMessageArgument[] {
  return [
    {
      type: 's' as const,
      value: JSON.stringify(payload)
    }
  ];
}

function createSimpleResult(
  action: string,
  text: string,
  macroNumber: number,
  payload: Record<string, unknown>,
  oscAddress: string
): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      {
        type: 'object',
        data: {
          action,
          macro_number: macroNumber,
          request: payload,
          osc: {
            address: oscAddress,
            args: payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const match = value.match(/(-?\d+)/);
    if (match) {
      return Number.parseInt(match[1] ?? '', 10);
    }
  }

  return null;
}

function extractMessageCandidate(data: unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidates = [
      record.message,
      record.error,
      record.reason,
      record.detail,
      record.status
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

function containsMacroNotFound(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) {
    return false;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('macro not found')) {
      return true;
    }
    return lower.includes('not found') && lower.includes('macro');
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsMacroNotFound(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsMacroNotFound(item, depth + 1)
    );
  }

  return false;
}

function extractCommandTexts(source: unknown, depth = 0): string[] {
  if (depth > 5 || source == null) {
    return [];
  }

  if (typeof source === 'string') {
    return source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  if (Array.isArray(source)) {
    return source.flatMap((item) => extractCommandTexts(item, depth + 1));
  }

  if (typeof source === 'object') {
    const record = source as Record<string, unknown>;
    const explicitFields = [
      record.text,
      record.command,
      record.value,
      record.line,
      record.content,
      record.command_text,
      record.script,
      record.script_text
    ];

    const explicit = explicitFields.flatMap((item) => extractCommandTexts(item, depth + 1));
    if (explicit.length > 0) {
      return explicit;
    }

    return Object.values(record).flatMap((item) => extractCommandTexts(item, depth + 1));
  }

  return [];
}

function normaliseMacroDetails(raw: unknown, fallbackNumber: number): MacroDetails {
  let macroNumber = fallbackNumber;
  let label: string | null = null;
  let mode: string | null = null;
  const commandTexts: string[] = [];

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;

    const numberCandidates = [
      data.macro,
      data.number,
      data.id,
      data.index,
      data.macro_number
    ];

    for (const candidate of numberCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        macroNumber = parsed;
        break;
      }
    }

    const labelCandidate = data.label ?? data.name ?? data.title ?? data.description;
    if (typeof labelCandidate === 'string') {
      label = labelCandidate.trim() || null;
    }

    const modeCandidate = data.mode ?? data.type ?? data.kind ?? data.style;
    if (typeof modeCandidate === 'string') {
      mode = modeCandidate.trim() || null;
    }

    const commandSources = [
      data.commands,
      data.command,
      data.lines,
      data.steps,
      data.contents,
      data.entries,
      data.script,
      data.script_text,
      data.text
    ];

    for (const source of commandSources) {
      const extracted = extractCommandTexts(source);
      for (const text of extracted) {
        const trimmed = text.trim();
        if (trimmed.length > 0 && !commandTexts.includes(trimmed)) {
          commandTexts.push(trimmed);
        }
      }
    }
  }

  const commands: MacroCommand[] = commandTexts.map((text, index) => ({
    index: index + 1,
    text
  }));

  return {
    macro_number: macroNumber,
    label,
    mode,
    commands,
    script_text: commands.map((command) => command.text).join('\n')
  };
}

function buildMacroInfoResult(
  response: OscJsonResponse,
  macroNumber: number,
  payload: Record<string, unknown>
): ToolExecutionResult {
  const rawData =
    response.data && typeof response.data === 'object'
      ? ((response.data as Record<string, unknown>).macro ?? response.data)
      : response.data;

  const details = normaliseMacroDetails(rawData, macroNumber);
  const messageCandidate = extractMessageCandidate(response.data);
  const lowerMessage = messageCandidate?.toLowerCase() ?? '';
  const excludedMessages = ['ok', 'success', 'error', 'timeout', 'skipped'];
  const meaningfulMessage =
    messageCandidate && !excludedMessages.includes(lowerMessage.trim())
      ? messageCandidate
      : null;
  const macroNotFound = containsMacroNotFound(response.data);

  let text: string;
  if (macroNotFound) {
    text = `Macro ${details.macro_number} introuvable.`;
  } else if (response.status === 'ok') {
    const labelPart = details.label ? `"${details.label}"` : 'sans label';
    const commandCount = details.commands.length;
    const commandPart = commandCount === 1 ? '1 commande' : `${commandCount} commandes`;
    text = `Macro ${details.macro_number} ${labelPart} (${commandPart}).`;
  } else {
    text = `Lecture du script de la macro ${details.macro_number} terminee avec le statut ${response.status}.`;
    const informativeMessage = meaningfulMessage?.trim().toLowerCase() ?? '';
    if (
      meaningfulMessage &&
      !['error', 'timeout', 'skipped'].includes(informativeMessage)
    ) {
      text += ` (${meaningfulMessage})`;
    }
  }

  return {
    content: [
      { type: 'text', text },
      {
        type: 'object',
        data: {
          action: 'macro_get_info',
          status: response.status,
          request: payload,
          macro: details,
          error: meaningfulMessage,
          osc: {
            address: oscMappings.macros.info,
            response: response.payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

/**
 * @tool eos_macro_fire
 * @summary Declenchement de macro
 * @description Declenche une macro en envoyant son numero a la console.
 * @arguments Voir docs/tools.md#eos-macro-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-macro-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-macro-fire pour un exemple OSC.
 */
export const eosMacroFireTool: ToolDefinition<typeof fireInputSchema> = {
  name: 'eos_macro_fire',
  config: {
    title: 'Declenchement de macro',
    description: 'Declenche une macro en envoyant son numero a la console.',
    inputSchema: fireInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.macros.fire
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(fireInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      macro: options.macro_number
    };

    client.sendMessage(
      oscMappings.macros.fire,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    return createSimpleResult(
      'macro_fire',
      `Macro ${options.macro_number} declenchee`,
      options.macro_number,
      payload,
      oscMappings.macros.fire
    );
  }
};

/**
 * @tool eos_macro_select
 * @summary Selection de macro
 * @description Selectionne une macro sans l'executer.
 * @arguments Voir docs/tools.md#eos-macro-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-macro-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-macro-select pour un exemple OSC.
 */
export const eosMacroSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_macro_select',
  config: {
    title: 'Selection de macro',
    description: 'Selectionne une macro sans l\'executer.',
    inputSchema: selectInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.macros.select
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      macro: options.macro_number
    };

    client.sendMessage(
      oscMappings.macros.select,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    return createSimpleResult(
      'macro_select',
      `Macro ${options.macro_number} selectionnee`,
      options.macro_number,
      payload,
      oscMappings.macros.select
    );
  }
};

/**
 * @tool eos_macro_get_info
 * @summary Informations de macro
 * @description Recupere le libelle et le script d'une macro.
 * @arguments Voir docs/tools.md#eos-macro-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-macro-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-macro-get-info pour un exemple OSC.
 */
export const eosMacroGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_macro_get_info',
  config: {
    title: 'Informations de macro',
    description: 'Recupere le libelle et le script d\'une macro.',
    inputSchema: getInfoInputSchema,
    outputSchema: {
      macro: macroDetailsOutputSchema,
      status: z.enum(['ok', 'timeout', 'error', 'skipped'])
    },
    annotations: {
      mapping: {
        osc: oscMappings.macros.info
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      macro: options.macro_number
    };
    const cacheKey = createCacheKey({
      address: oscMappings.macros.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'macros',
      key: cacheKey,
      tags: [
        createResourceTag('macros'),
        createResourceTag('macros', String(options.macro_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response = await client.requestJson(oscMappings.macros.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        return buildMacroInfoResult(response, options.macro_number, payload);
      }
    });
  }
};

export const macroTools = [
  eosMacroFireTool,
  eosMacroSelectTool,
  eosMacroGetInfoTool
];

export const eosMacroTools = macroTools;

export default macroTools;
