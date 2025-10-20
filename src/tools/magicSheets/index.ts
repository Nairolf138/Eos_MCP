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
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const magicSheetNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero du magic sheet (1-9999).');

const viewNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(99)
  .describe('Numero de vue (1-99).');

const timeoutSchema = z.number().int().min(50).optional();

const openInputSchema = {
  ms_number: magicSheetNumberSchema,
  view_number: viewNumberSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const sendStringInputSchema = {
  osc_command: z
    .string()
    .min(1)
    .describe('Commande OSC a envoyer via le magic sheet.'),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  ms_number: magicSheetNumberSchema,
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const magicSheetInfoOutputSchema = z.object({
  ms_number: magicSheetNumberSchema,
  label: z.string().nullable(),
  uid: z.string().nullable()
});

function buildJsonArgs(payload: Record<string, unknown>): OscMessageArgument[] {
  return [
    {
      type: 's' as const,
      value: JSON.stringify(payload)
    }
  ];
}

function extractTargetOptions(options: { targetAddress?: string; targetPort?: number }): {
  targetAddress?: string;
  targetPort?: number;
} {
  const target: { targetAddress?: string; targetPort?: number } = {};
  if (options.targetAddress) {
    target.targetAddress = options.targetAddress;
  }
  if (typeof options.targetPort === 'number') {
    target.targetPort = options.targetPort;
  }
  return target;
}

function createResult(text: string, data: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      { type: 'object', data }
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

function asString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

interface MagicSheetInfo {
  ms_number: number;
  label: string | null;
  uid: string | null;
}

const defaultMagicSheetInfo = (msNumber: number): MagicSheetInfo => ({
  ms_number: msNumber,
  label: null,
  uid: null
});

function mergeMagicSheetInfo(target: MagicSheetInfo, source: MagicSheetInfo): MagicSheetInfo {
  if (source.ms_number !== target.ms_number) {
    target.ms_number = source.ms_number;
  }
  if (source.label && !target.label) {
    target.label = source.label;
  }
  if (source.uid && !target.uid) {
    target.uid = source.uid;
  }
  return target;
}

function extractMagicSheetInfo(data: unknown, requestedNumber: number, depth = 0): MagicSheetInfo {
  const info = defaultMagicSheetInfo(requestedNumber);
  if (depth > 5 || data == null) {
    return info;
  }

  if (Array.isArray(data)) {
    return data.reduce((acc, item) => mergeMagicSheetInfo(acc, extractMagicSheetInfo(item, acc.ms_number, depth + 1)), info);
  }

  if (typeof data !== 'object') {
    if (typeof data === 'string') {
      const parsed = parseInteger(data);
      if (parsed != null) {
        info.ms_number = parsed;
      }
    }
    return info;
  }

  const record = data as Record<string, unknown>;

  const numberCandidate =
    record.ms_number ?? record.number ?? record.ms ?? record.magic_sheet ?? record.sheet ?? record.id;
  const parsedNumber = parseInteger(numberCandidate);
  if (parsedNumber != null) {
    info.ms_number = parsedNumber;
  }

  const labelCandidate = record.label ?? record.name ?? record.title;
  const label = asString(labelCandidate);
  if (label) {
    info.label = label;
  }

  const uidCandidate = record.uid ?? record.UUID ?? record.uuid ?? record.guid;
  const uid = asString(uidCandidate);
  if (uid) {
    info.uid = uid;
  }

  const nestedCandidates = [
    record.magic_sheet,
    record.sheet,
    record.magicSheet,
    record.data,
    record.result,
    record.payload
  ];

  for (const candidate of nestedCandidates) {
    if (candidate && typeof candidate === 'object') {
      mergeMagicSheetInfo(info, extractMagicSheetInfo(candidate, info.ms_number, depth + 1));
    }
  }

  return info;
}

function extractMeaningfulMessage(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractMeaningfulMessage(item, depth + 1);
      if (message) {
        return message;
      }
    }
    return null;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.message,
      record.error,
      record.reason,
      record.detail,
      record.status
    ];

    for (const candidate of candidates) {
      const message = extractMeaningfulMessage(candidate, depth + 1);
      if (message) {
        return message;
      }
    }

    for (const item of Object.values(record)) {
      const message = extractMeaningfulMessage(item, depth + 1);
      if (message) {
        return message;
      }
    }
  }

  return null;
}

function buildMagicSheetInfoResult(
  response: OscJsonResponse,
  requestedNumber: number,
  payload: Record<string, unknown>
): ToolExecutionResult {
  const info = extractMagicSheetInfo(response.data, requestedNumber);
  const meaningfulMessage = extractMeaningfulMessage(response.data) ?? response.error ?? null;

  const success = response.status === 'ok';
  const labelPart = info.label ? ` "${info.label}"` : '';
  const uidPart = info.uid ? ` (UID: ${info.uid})` : '';

  const text = success
    ? `Magic sheet ${info.ms_number}${labelPart}${uidPart}.`
    : `Magic sheet ${info.ms_number} introuvable.`;

  return createResult(text, {
    action: 'magic_sheet_get_info',
    status: response.status,
    request: payload,
    magic_sheet: info,
    error: success ? null : meaningfulMessage,
    osc: {
      address: oscMappings.magicSheets.info,
      response: response.payload
    }
  });
}

function extractRole(extra: unknown): string | null {
  if (!extra || typeof extra !== 'object') {
    return null;
  }

  const record = extra as Record<string, unknown>;
  const directRole = record.role ?? record.connectionRole ?? record.connection_role;
  if (typeof directRole === 'string' && directRole.trim().length > 0) {
    return directRole.trim();
  }

  const nestedKeys = ['connection', 'session', 'context', 'metadata'];
  for (const key of nestedKeys) {
    const nested = record[key];
    if (nested && typeof nested === 'object') {
      const nestedRole = extractRole(nested);
      if (nestedRole) {
        return nestedRole;
      }
    }
  }

  return null;
}

/**
 * @tool eos_magic_sheet_open
 * @summary Ouverture de magic sheet
 * @description Ouvre un magic sheet specifique sur la console.
 * @arguments Voir docs/tools.md#eos-magic-sheet-open pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-magic-sheet-open pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-magic-sheet-open pour un exemple OSC.
 */
export const eosMagicSheetOpenTool: ToolDefinition<typeof openInputSchema> = {
  name: 'eos_magic_sheet_open',
  config: {
    title: 'Ouverture de magic sheet',
    description: 'Ouvre un magic sheet specifique sur la console.',
    inputSchema: openInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.magicSheets.open
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(openInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {
      number: options.ms_number
    };

    if (typeof options.view_number === 'number') {
      payload.view = options.view_number;
    }

    await client.sendMessage(
      oscMappings.magicSheets.open,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    const viewPart = typeof options.view_number === 'number' ? ` (vue ${options.view_number})` : '';

    return createResult(`Magic sheet ${options.ms_number}${viewPart} ouvert.`, {
      action: 'magic_sheet_open',
      request: payload,
      osc: {
        address: oscMappings.magicSheets.open,
        args: payload
      },
      ...extractTargetOptions(options)
    });
  }
};

/**
 * @tool eos_magic_sheet_send_string
 * @summary Envoi de commande via magic sheet
 * @description Envoie une commande OSC via la fonctionnalite Magic Sheet.
 * @arguments Voir docs/tools.md#eos-magic-sheet-send-string pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-magic-sheet-send-string pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-magic-sheet-send-string pour un exemple OSC.
 */
export const eosMagicSheetSendStringTool: ToolDefinition<typeof sendStringInputSchema> = {
  name: 'eos_magic_sheet_send_string',
  config: {
    title: 'Envoi de commande via magic sheet',
    description: 'Envoie une commande OSC via la fonctionnalite Magic Sheet.',
    inputSchema: sendStringInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.magicSheets.sendString
      },
      requirements: {
        role: 'Primary'
      }
    }
  },
  handler: async (args, extra) => {
    const schema = z.object(sendStringInputSchema).strict();
    const options = schema.parse(args ?? {});
    const role = extractRole(extra);

    if ((role ?? '').toLowerCase() !== 'primary') {
      const message = 'La commande magic sheet send string requiert une connexion Primary.';
      return createResult(message, {
        action: 'magic_sheet_send_string',
        error: message,
        required_role: 'Primary',
        provided_role: role ?? null
      });
    }

    const client = getOscClient();

    await client.sendMessage(
      oscMappings.magicSheets.sendString,
      [
        {
          type: 's',
          value: options.osc_command
        }
      ],
      extractTargetOptions(options)
    );

    return createResult('Commande envoyee via magic sheet.', {
      action: 'magic_sheet_send_string',
      osc_command: options.osc_command,
      osc: {
        address: oscMappings.magicSheets.sendString,
        args: [options.osc_command]
      },
      ...extractTargetOptions(options)
    });
  }
};

/**
 * @tool eos_magic_sheet_get_info
 * @summary Informations de magic sheet
 * @description Recupere le label et l'UID d'un magic sheet.
 * @arguments Voir docs/tools.md#eos-magic-sheet-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-magic-sheet-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-magic-sheet-get-info pour un exemple OSC.
 */
export const eosMagicSheetGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_magic_sheet_get_info',
  config: {
    title: 'Informations de magic sheet',
    description: 'Recupere le label et l\'UID d\'un magic sheet.',
    inputSchema: getInfoInputSchema,
    outputSchema: {
      magic_sheet: magicSheetInfoOutputSchema,
      status: z.enum(['ok', 'timeout', 'error', 'skipped'])
    },
    annotations: {
      mapping: {
        osc: oscMappings.magicSheets.info
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {
      number: options.ms_number
    };
    const cacheKey = createCacheKey({
      address: oscMappings.magicSheets.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'magicSheets',
      key: cacheKey,
      tags: [
        createResourceTag('magicSheets'),
        createResourceTag('magicSheets', String(options.ms_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response = await client.requestJson(oscMappings.magicSheets.info, {
          payload,
          timeoutMs: options.timeoutMs,
          ...extractTargetOptions(options)
        });

        return buildMagicSheetInfoResult(response, options.ms_number, payload);
      }
    });
  }
};

export const magicSheetTools = [
  eosMagicSheetOpenTool,
  eosMagicSheetSendStringTool,
  eosMagicSheetGetInfoTool
];

export default magicSheetTools;
