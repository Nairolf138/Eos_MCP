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

const curveNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero de courbe (1-9999).');

const timeoutSchema = z.number().int().min(50).optional();

const selectInputSchema = {
  curve_number: curveNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  curve_number: curveNumberSchema,
  fields: z.array(z.string().min(1)).optional(),
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

interface CurvePoint {
  input: number | null;
  output: number | null;
}

interface CurveInfo {
  curve_number: number;
  label: string | null;
  kind: string | null;
  points: CurvePoint[];
}

function buildJsonArgs(payload: Record<string, unknown>): OscMessageArgument[] {
  return [
    {
      type: 's' as const,
      value: JSON.stringify(payload)
    }
  ];
}

function annotate(osc: string): Record<string, unknown> {
  return {
    mapping: {
      osc
    }
  };
}

function createSelectResult(
  curveNumber: number,
  payload: Record<string, unknown>,
  oscAddress: string
): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text: `Courbe ${curveNumber} selectionnee.` },
      {
        type: 'object',
        data: {
          action: 'curve_select',
          curve_number: curveNumber,
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

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalised = value.trim().replace(',', '.');
    if (normalised.length === 0) {
      return null;
    }
    const parsed = Number.parseFloat(normalised);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalisePoint(raw: unknown): CurvePoint | null {
  if (raw == null) {
    return null;
  }

  if (Array.isArray(raw)) {
    const input = asFiniteNumber(raw[0]);
    const output = asFiniteNumber(raw[1] ?? raw[0]);
    if (input == null && output == null) {
      return null;
    }
    return { input, output };
  }

  if (typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const inputCandidates = [data.input, data.in, data.x, data.source, data.position, data.time];
    const outputCandidates = [data.output, data.out, data.y, data.value, data.target];

    let input: number | null = null;
    for (const candidate of inputCandidates) {
      const parsed = asFiniteNumber(candidate);
      if (parsed != null) {
        input = parsed;
        break;
      }
    }

    let output: number | null = null;
    for (const candidate of outputCandidates) {
      const parsed = asFiniteNumber(candidate);
      if (parsed != null) {
        output = parsed;
        break;
      }
    }

    if (input == null && output == null) {
      return null;
    }

    return { input, output };
  }

  const numberValue = asFiniteNumber(raw);
  if (numberValue != null) {
    return { input: numberValue, output: numberValue };
  }

  return null;
}

function normalisePointCollection(raw: unknown): CurvePoint[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalisePoint(item))
      .filter((item): item is CurvePoint => item != null);
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const candidates = [data.points, data.data, data.entries, data.values, data.curve_points, data.curve];
    for (const candidate of candidates) {
      const points = normalisePointCollection(candidate);
      if (points.length > 0) {
        return points;
      }
    }
  }

  return [];
}

function normaliseCurveInfo(raw: unknown, fallbackNumber: number): CurveInfo {
  let curveNumber = fallbackNumber;
  let label: string | null = null;
  let kind: string | null = null;
  let points: CurvePoint[] = [];

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;

    const numberCandidates = [data.curve_number, data.number, data.id, data.index, data.curve];
    for (const candidate of numberCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        curveNumber = parsed;
        break;
      }
    }

    const labelCandidate = data.label ?? data.name ?? data.title ?? data.description ?? data.curve_label;
    label = asString(labelCandidate);

    const kindCandidate = data.kind ?? data.type ?? data.mode ?? data.category ?? data.curve_type;
    kind = asString(kindCandidate);

    points = normalisePointCollection(
      data.points ?? data.data ?? data.curve_data ?? data.entries ?? data.values ?? null
    );
  }

  return {
    curve_number: curveNumber,
    label,
    kind,
    points
  };
}

function extractMessageCandidate(data: unknown): string | null {
  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const candidates = [record.message, record.error, record.reason, record.detail, record.status];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }

  return null;
}

function containsCurveMissing(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) {
    return false;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('curve not found') || lower.includes('curve missing')) {
      return true;
    }
    return lower.includes('not found') && lower.includes('curve');
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsCurveMissing(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsCurveMissing(item, depth + 1)
    );
  }

  return false;
}

function buildCurveInfoResult(
  response: OscJsonResponse,
  curveNumber: number,
  payload: Record<string, unknown>
): ToolExecutionResult {
  const rawData =
    response.data && typeof response.data === 'object'
      ? ((response.data as Record<string, unknown>).curve ?? response.data)
      : response.data;

  const details = normaliseCurveInfo(rawData, curveNumber);
  const rawMessage =
    extractMessageCandidate(response.data) ??
    (typeof response.error === 'string' ? response.error : null);

  const lowerMessage = rawMessage?.trim().toLowerCase() ?? '';
  const excludedMessages = ['ok', 'success', 'error', 'timeout', 'skipped'];
  const meaningfulMessage =
    rawMessage && !excludedMessages.includes(lowerMessage) ? rawMessage : null;
  const curveMissing = containsCurveMissing(response.data);

  let text: string;
  if (curveMissing) {
    text = `Courbe ${details.curve_number} introuvable.`;
  } else if (response.status === 'timeout') {
    text = `Lecture de la courbe ${details.curve_number} expiree.`;
  } else if (response.status === 'ok') {
    const labelPart = details.label ? `"${details.label}"` : 'sans label';
    const kindPart = details.kind ? ` (${details.kind})` : '';
    const pointCount = details.points.length;
    const pointPart = pointCount > 0 ? ` - ${pointCount} points` : '';
    text = `Courbe ${details.curve_number} ${labelPart}${kindPart}${pointPart}.`;
  } else {
    text = `Lecture de la courbe ${details.curve_number} terminee avec le statut ${response.status}.`;
    if (meaningfulMessage) {
      text += ` (${meaningfulMessage})`;
    }
  }

  return {
    content: [
      { type: 'text', text },
      {
        type: 'object',
        data: {
          action: 'curve_get_info',
          status: response.status,
          request: payload,
          curve: details,
          error: meaningfulMessage,
          osc: {
            address: oscMappings.curves.info,
            response: response.payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

/**
 * @tool eos_curve_select
 * @summary Selection de courbe
 * @description Selectionne une courbe en envoyant son numero a la console.
 * @arguments Voir docs/tools.md#eos-curve-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-curve-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-curve-select pour un exemple OSC.
 */
export const eosCurveSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_curve_select',
  config: {
    title: 'Selection de courbe',
    description: 'Selectionne une courbe en envoyant son numero a la console.',
    inputSchema: selectInputSchema,
    annotations: annotate(oscMappings.curves.select)
  },
  handler: async (args) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      curve: options.curve_number
    };

    await client.sendMessage(oscMappings.curves.select, buildJsonArgs(payload), {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    return createSelectResult(options.curve_number, payload, oscMappings.curves.select);
  }
};

/**
 * @tool eos_curve_get_info
 * @summary Lecture des informations de courbe
 * @description Recupere les informations d'une courbe, incluant label et points.
 * @arguments Voir docs/tools.md#eos-curve-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-curve-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-curve-get-info pour un exemple OSC.
 */
export const eosCurveGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_curve_get_info',
  config: {
    title: 'Lecture des informations de courbe',
    description: 'Recupere les informations d\'une courbe, incluant label et points.',
    inputSchema: getInfoInputSchema,
    outputSchema: {
      curve: z.object({
        curve_number: curveNumberSchema,
        label: z.string().nullable(),
        kind: z.string().nullable(),
        points: z
          .array(
            z.object({
              input: z.number().nullable(),
              output: z.number().nullable()
            })
          )
          .describe('Points constitutifs de la courbe normalises (input/output).')
      }),
      status: z.enum(['ok', 'timeout', 'error', 'skipped'])
    },
    annotations: annotate(oscMappings.curves.info)
  },
  handler: async (args) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {
      curve: options.curve_number
    };

    if (options.fields && options.fields.length > 0) {
      payload.fields = options.fields;
    }

    const cacheKey = createCacheKey({
      address: oscMappings.curves.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'curves',
      key: cacheKey,
      tags: [
        createResourceTag('curves'),
        createResourceTag('curves', String(options.curve_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response = await client.requestJson(oscMappings.curves.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        return buildCurveInfoResult(response, options.curve_number, payload);
      }
    });
  }
};

export const curveTools = [eosCurveSelectTool, eosCurveGetInfoTool];

export default curveTools;
