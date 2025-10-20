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

const effectNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe("Numero d'effet (1-9999)");

const timeoutSchema = z.number().int().min(50).optional();

const selectInputSchema = {
  effect_number: effectNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const stopInputSchema = {
  effect_number: effectNumberSchema.optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  effect_number: effectNumberSchema,
  fields: z.array(z.string().min(1)).optional(),
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

type EffectTypeCategory =
  | 'absolute'
  | 'relative'
  | 'step'
  | 'absolute_dynamic'
  | 'relative_dynamic'
  | 'linear'
  | 'unknown';

type EffectTypeBase = 'absolute' | 'relative' | 'step' | 'linear' | 'unknown';

type EffectTransitionMode = 'immediate' | 'fade' | 'manual' | 'stop' | 'unknown';

type EffectScaleUnit = 'percent' | 'ratio' | 'unknown';

export interface EffectTypeInfo {
  raw: string | null;
  normalized: string | null;
  category: EffectTypeCategory;
  base: EffectTypeBase;
  isDynamic: boolean;
}

export interface EffectTransitionInfo {
  raw: string | null;
  normalized: string | null;
  mode: EffectTransitionMode;
}

export interface EffectScaleInfo {
  raw: string | null;
  normalized: string | null;
  percentage: number | null;
  ratio: number | null;
  unit: EffectScaleUnit;
  description: string | null;
}

export interface EffectDetails {
  effect_number: number;
  label: string | null;
  type: EffectTypeInfo;
  entry: EffectTransitionInfo;
  exit: EffectTransitionInfo;
  scale: EffectScaleInfo;
  rate: number | null;
  duration: number | null;
  raw: Record<string, unknown>;
}

const effectTypeOutputSchema = z.object({
  raw: z.string().nullable(),
  normalized: z.string().nullable(),
  category: z.enum(['absolute', 'relative', 'step', 'absolute_dynamic', 'relative_dynamic', 'linear', 'unknown']),
  base: z.enum(['absolute', 'relative', 'step', 'linear', 'unknown']),
  isDynamic: z.boolean()
});

const effectTransitionOutputSchema = z.object({
  raw: z.string().nullable(),
  normalized: z.string().nullable(),
  mode: z.enum(['immediate', 'fade', 'manual', 'stop', 'unknown'])
});

const effectScaleOutputSchema = z.object({
  raw: z.string().nullable(),
  normalized: z.string().nullable(),
  percentage: z.number().nullable(),
  ratio: z.number().nullable(),
  unit: z.enum(['percent', 'ratio', 'unknown']),
  description: z.string().nullable()
});

export const effectDetailsOutputSchema = z.object({
  effect_number: effectNumberSchema,
  label: z.string().nullable(),
  type: effectTypeOutputSchema,
  entry: effectTransitionOutputSchema,
  exit: effectTransitionOutputSchema,
  scale: effectScaleOutputSchema,
  rate: z.number().nullable(),
  duration: z.number().nullable(),
  raw: z.record(z.string(), z.unknown())
});

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
  effectNumber: number | null,
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
          effect_number: effectNumber,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normaliseToken(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.length > 0 ? normalized : null;
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const normalised = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalised.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseFiniteInteger(value: unknown): number | null {
  const numeric = parseFiniteNumber(value);
  if (numeric == null) {
    return null;
  }
  const integer = Math.trunc(numeric);
  return Number.isFinite(integer) ? integer : null;
}

function parseDurationSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const numeric = Number.parseFloat(trimmed);
      return Number.isFinite(numeric) ? numeric : null;
    }
    const parts = trimmed.split(':');
    if (parts.every((part) => /^\d+(\.\d+)?$/.test(part))) {
      let total = 0;
      for (const part of parts) {
        total = total * 60 + Number.parseFloat(part);
      }
      return Number.isFinite(total) ? total : null;
    }
  }
  return null;
}

function mapEffectType(value: unknown): EffectTypeInfo {
  const raw = asTrimmedString(value);
  const normalized = normaliseToken(raw);
  let category: EffectTypeCategory = 'unknown';
  let base: EffectTypeBase = 'unknown';
  const token = normalized ?? '';

  const includes = (needle: string): boolean => token.includes(needle);

  if (includes('absolute') && includes('dynamic')) {
    category = 'absolute_dynamic';
    base = 'absolute';
  } else if (includes('relative') && includes('dynamic')) {
    category = 'relative_dynamic';
    base = 'relative';
  } else if (includes('relative')) {
    category = 'relative';
    base = 'relative';
  } else if (includes('step')) {
    category = 'step';
    base = 'step';
  } else if (includes('absolute')) {
    category = 'absolute';
    base = 'absolute';
  } else if (includes('linear')) {
    category = 'linear';
    base = 'linear';
  }

  return {
    raw,
    normalized,
    category,
    base,
    isDynamic: includes('dynamic')
  };
}

function mapEffectTransition(value: unknown): EffectTransitionInfo {
  const raw = asTrimmedString(value);
  const normalized = normaliseToken(raw);
  const token = normalized ?? '';
  let mode: EffectTransitionMode = 'unknown';

  if (token.includes('immed') || token.includes('instant')) {
    mode = 'immediate';
  } else if (token.includes('ramp') || token.includes('fade') || token.includes('linear')) {
    mode = 'fade';
  } else if (token.includes('manual') || token.includes('hold')) {
    mode = 'manual';
  } else if (token.includes('stop')) {
    mode = 'stop';
  }

  return {
    raw,
    normalized,
    mode
  };
}

function mapEffectScale(value: unknown): EffectScaleInfo {
  const raw = asTrimmedString(value);
  const normalized = normaliseToken(raw);
  let unit: EffectScaleUnit = 'unknown';
  let percentage: number | null = null;
  let ratio: number | null = null;

  const numeric = parseFiniteNumber(value);
  if (raw) {
    if (raw.includes('%')) {
      unit = 'percent';
      if (numeric != null) {
        percentage = numeric;
        ratio = numeric / 100;
      }
    } else if (/[x×]/i.test(raw)) {
      unit = 'ratio';
      if (numeric != null) {
        ratio = numeric;
        percentage = numeric * 100;
      }
    } else if (numeric != null) {
      if (numeric > 10) {
        unit = 'percent';
        percentage = numeric;
        ratio = numeric / 100;
      } else {
        unit = 'ratio';
        ratio = numeric;
        percentage = numeric * 100;
      }
    }
  } else if (numeric != null) {
    if (numeric > 10) {
      unit = 'percent';
      percentage = numeric;
      ratio = numeric / 100;
    } else {
      unit = 'ratio';
      ratio = numeric;
      percentage = numeric * 100;
    }
  }

  let description: string | null = raw;
  if (unit === 'percent' && percentage != null) {
    description = `${Number(percentage.toFixed(2)).toString().replace(/\.00$/, '')}%`;
  } else if (unit === 'ratio' && ratio != null) {
    description = `${Number(ratio.toFixed(2)).toString().replace(/\.00$/, '')}x`;
  }

  return {
    raw,
    normalized,
    percentage,
    ratio,
    unit,
    description: description ?? null
  };
}

function extractMeaningfulMessage(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
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
    const keys = ['message', 'error', 'reason', 'detail', 'status'];
    for (const key of keys) {
      const message = extractMeaningfulMessage(record[key], depth + 1);
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

function containsEffectNotFound(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) {
    return false;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('effect not found')) {
      return true;
    }
    return lower.includes('not found') && lower.includes('effect');
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsEffectNotFound(item, depth + 1));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsEffectNotFound(item, depth + 1)
    );
  }
  return false;
}

function parseEffectNumber(record: Record<string, unknown>, fallback: number): number {
  const candidates = [
    record.effect_number,
    record.number,
    record.effect,
    record.id,
    record.index
  ];
  for (const candidate of candidates) {
    const numeric = parseFiniteInteger(candidate);
    if (numeric != null) {
      return numeric;
    }
  }
  return fallback;
}

function normaliseEffectDetails(data: unknown, fallbackNumber: number): EffectDetails {
  let root: unknown = data;
  if (isRecord(data)) {
    const recordData = data as Record<string, unknown>;
    if (isRecord(recordData.effect)) {
      root = recordData.effect;
    }
  }
  const record = isRecord(root) ? (root as Record<string, unknown>) : {};

  const effectNumber = parseEffectNumber(record, fallbackNumber);
  const label = asTrimmedString(record.label ?? record.name ?? record.title ?? null);
  const type = mapEffectType(record.type ?? record.effect_type ?? record.mode ?? null);
  const entry = mapEffectTransition(record.entry ?? record.effect_entry ?? record.start ?? null);
  const exit = mapEffectTransition(record.exit ?? record.effect_exit ?? record.stop ?? null);
  const scale = mapEffectScale(record.scale ?? record.effect_scale ?? record.intensity ?? null);
  const rate = parseFiniteNumber(record.rate ?? record.speed ?? record.tempo ?? null);
  const duration = parseDurationSeconds(record.duration ?? record.time ?? record.length ?? null);

  return {
    effect_number: effectNumber,
    label,
    type,
    entry,
    exit,
    scale,
    rate,
    duration,
    raw: { ...record }
  };
}

function formatEffectInfoText(
  details: EffectDetails,
  status: 'ok' | 'timeout' | 'error' | 'skipped',
  errorMessage: string | null
): string {
  if (status === 'timeout') {
    return `Lecture de l'effet ${details.effect_number} terminee avec le statut timeout.`;
  }
  if (status === 'error' || errorMessage) {
    const reason = errorMessage ? ` (${errorMessage})` : '';
    return `Effet ${details.effect_number} introuvable${reason}.`;
  }
  const labelPart = details.label ? ` "${details.label}"` : '';
  const parts: string[] = [];
  if (details.type.raw) {
    parts.push(details.type.raw);
  }
  if (details.rate != null) {
    parts.push(`rate ${details.rate}`);
  }
  const scaleDescription = details.scale.description;
  if (scaleDescription) {
    parts.push(`scale ${scaleDescription}`);
  }
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `Effet ${details.effect_number}${labelPart}${suffix}.`;
}

function buildEffectInfoResult(
  response: OscJsonResponse,
  effectNumber: number,
  payload: Record<string, unknown>
): ToolExecutionResult {
  const details = normaliseEffectDetails(response.data, effectNumber);
  const notFound = containsEffectNotFound(response.data);
  const meaningfulMessage = extractMeaningfulMessage(response.data) ?? response.error ?? null;
  const errorMessage = notFound || response.status === 'error' ? meaningfulMessage : null;
  const text = formatEffectInfoText(details, response.status, errorMessage);

  return {
    content: [
      { type: 'text', text },
      {
        type: 'object',
        data: {
          action: 'effect_get_info',
          status: response.status,
          request: payload,
          effect: details,
          error: errorMessage,
          osc: {
            address: oscMappings.effects.info,
            response: response.payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

/**
 * @tool eos_effect_select
 * @summary Selection d'effet
 * @description Selectionne un effet sans le lancer.
 * @arguments Voir docs/tools.md#eos-effect-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-effect-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-effect-select pour un exemple OSC.
 */
export const eosEffectSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_effect_select',
  config: {
    title: "Selection d'effet",
    description: "Selectionne un effet sans le lancer.",
    inputSchema: selectInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.effects.select
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      effect: options.effect_number
    };

    client.sendMessage(
      oscMappings.effects.select,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    return createSimpleResult(
      'effect_select',
      `Effet ${options.effect_number} selectionne`,
      options.effect_number,
      payload,
      oscMappings.effects.select
    );
  }
};

/**
 * @tool eos_effect_stop
 * @summary Arret d'effet
 * @description Stoppe un effet actif sur la selection.
 * @arguments Voir docs/tools.md#eos-effect-stop pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-effect-stop pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-effect-stop pour un exemple OSC.
 */
export const eosEffectStopTool: ToolDefinition<typeof stopInputSchema> = {
  name: 'eos_effect_stop',
  config: {
    title: "Arret d'effet",
    description: 'Stoppe un effet actif sur la selection.',
    inputSchema: stopInputSchema,
    annotations: {
      mapping: {
        osc: oscMappings.effects.stop
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(stopInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {};
    if (typeof options.effect_number === 'number') {
      payload.effect = options.effect_number;
    }

    client.sendMessage(
      oscMappings.effects.stop,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    const text = typeof options.effect_number === 'number'
      ? `Effet ${options.effect_number} stoppe`
      : 'Effets actifs stoppes';

    return createSimpleResult(
      'effect_stop',
      text,
      options.effect_number ?? null,
      payload,
      oscMappings.effects.stop
    );
  }
};

/**
 * @tool eos_effect_get_info
 * @summary Informations d'effet
 * @description Recupere les informations detaillees d'un effet.
 * @arguments Voir docs/tools.md#eos-effect-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-effect-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-effect-get-info pour un exemple OSC.
 */
export const eosEffectGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_effect_get_info',
  config: {
    title: "Informations d'effet",
    description: "Recupere les informations detaillees d'un effet.",
    inputSchema: getInfoInputSchema,
    outputSchema: {
      effect: effectDetailsOutputSchema,
      status: z.enum(['ok', 'timeout', 'error', 'skipped'])
    },
    annotations: {
      mapping: {
        osc: oscMappings.effects.info
      }
    }
  },
  handler: async (args) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {
      effect: options.effect_number
    };

    if (options.fields?.length) {
      payload.fields = options.fields;
    }

    const cacheKey = createCacheKey({
      address: oscMappings.effects.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'effects',
      key: cacheKey,
      tags: [
        createResourceTag('effects'),
        createResourceTag('effects', String(options.effect_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response = await client.requestJson(oscMappings.effects.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        return buildEffectInfoResult(response, options.effect_number, payload);
      }
    });
  }
};

export const effectTools = [
  eosEffectSelectTool,
  eosEffectStopTool,
  eosEffectGetInfoTool
];

export default effectTools;
