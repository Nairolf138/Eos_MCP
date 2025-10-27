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
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const snapshotNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero de snapshot (1-9999)');

const recallInputSchema = {
  snapshot_number: snapshotNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  snapshot_number: snapshotNumberSchema,
  fields: z.array(z.string().min(1)).optional(),
  timeoutMs: z.coerce.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

interface SnapshotInfo {
  snapshot_number: number;
  label: string | null;
  uid: string | null;
}

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

function annotate(osc: string): Record<string, unknown> {
  return {
    mapping: {
      osc
    }
  };
}

function createRecallResult(
  snapshotNumber: number,
  payload: Record<string, unknown>,
  oscAddress: string
): ToolExecutionResult {
  return {
    content: [{ type: 'text', text: `Snapshot ${snapshotNumber} rappelle.` }],
    structuredContent: {
      action: 'snapshot_recall',
      snapshot_number: snapshotNumber,
      request: payload,
      osc: {
        address: oscAddress,
        args: payload
      }
    }
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

function normaliseSnapshotInfo(raw: unknown, fallbackNumber: number): SnapshotInfo {
  let snapshotNumber = fallbackNumber;
  let label: string | null = null;
  let uid: string | null = null;

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const numberCandidates = [
      data.snapshot_number,
      data.number,
      data.id,
      data.index,
      data.snapshot,
      data.uid_number
    ];

    for (const candidate of numberCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        snapshotNumber = parsed;
        break;
      }
    }

    const labelCandidate = data.label ?? data.name ?? data.title ?? data.description;
    const uidCandidate = data.uid ?? data.uuid ?? data.uid_string ?? data.uid_value ?? data.uidNumber;

    label = asString(labelCandidate);
    uid = asString(uidCandidate);
  }

  return {
    snapshot_number: snapshotNumber,
    label,
    uid
  };
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

function containsSnapshotMissing(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) {
    return false;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('snapshot missing')) {
      return true;
    }
    return lower.includes('not found') && lower.includes('snapshot');
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSnapshotMissing(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsSnapshotMissing(item, depth + 1)
    );
  }

  return false;
}

function buildSnapshotInfoResult(
  response: OscJsonResponse,
  snapshotNumber: number,
  payload: Record<string, unknown>
): ToolExecutionResult {
  const rawData =
    response.data && typeof response.data === 'object'
      ? ((response.data as Record<string, unknown>).snapshot ?? response.data)
      : response.data;

  const details = normaliseSnapshotInfo(rawData, snapshotNumber);
  const rawMessage =
    extractMessageCandidate(response.data) ??
    (typeof response.error === 'string' ? response.error : null);
  const trimmedMessage = rawMessage?.trim() ?? '';
  const loweredMessage = trimmedMessage.toLowerCase();
  const excludedMessages = ['ok', 'success', 'error', 'timeout', 'skipped'];
  const meaningfulMessage =
    trimmedMessage.length > 0 && !excludedMessages.includes(loweredMessage)
      ? trimmedMessage
      : null;
  const snapshotMissing =
    containsSnapshotMissing(response.data) || loweredMessage.includes('snapshot missing');

  let text: string;
  let errorMessage: string | null = null;

  if (snapshotMissing) {
    text = `Snapshot ${details.snapshot_number} introuvable.`;
    errorMessage = meaningfulMessage ?? 'Snapshot missing';
  } else if (response.status === 'timeout') {
    text = `Lecture du snapshot ${details.snapshot_number} expiree.`;
    errorMessage = meaningfulMessage ?? response.error ?? null;
  } else if (response.status === 'ok') {
    const labelPart = details.label ? `"${details.label}"` : 'sans label';
    const uidPart = details.uid ? ` (UID ${details.uid})` : '';
    text = `Snapshot ${details.snapshot_number} ${labelPart}${uidPart}.`;
  } else {
    text = `Lecture du snapshot ${details.snapshot_number} terminee avec le statut ${response.status}.`;
    if (meaningfulMessage) {
      text += ` (${meaningfulMessage})`;
      errorMessage = meaningfulMessage;
    }
  }

  if (!errorMessage && meaningfulMessage) {
    errorMessage = meaningfulMessage;
  }
  if (!errorMessage && typeof response.error === 'string') {
    const trimmed = response.error.trim();
    if (trimmed.length > 0 && !excludedMessages.includes(trimmed.toLowerCase())) {
      errorMessage = trimmed;
    }
  }

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      action: 'snapshot_get_info',
      status: response.status,
      request: payload,
      snapshot: details,
      error: errorMessage,
      osc: {
        address: oscMappings.snapshots.info,
        response: response.payload
      }
    }
  } as ToolExecutionResult;
}

/**
 * @tool eos_snapshot_recall
 * @summary Rappel de snapshot
 * @description Rappelle un snapshot en envoyant son numero a la console.
 * @arguments Voir docs/tools.md#eos-snapshot-recall pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-snapshot-recall pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-snapshot-recall pour un exemple OSC.
 */
export const eosSnapshotRecallTool: ToolDefinition<typeof recallInputSchema> = {
  name: 'eos_snapshot_recall',
  config: {
    title: 'Rappel de snapshot',
    description: 'Rappelle un snapshot en envoyant son numero a la console.',
    inputSchema: recallInputSchema,
    annotations: annotate(oscMappings.snapshots.recall)
  },
  handler: async (args) => {
    const schema = z.object(recallInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      snapshot: options.snapshot_number
    };

    await client.sendMessage(
      oscMappings.snapshots.recall,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createRecallResult(options.snapshot_number, payload, oscMappings.snapshots.recall);
  }
};

/**
 * @tool eos_snapshot_get_info
 * @summary Lecture des informations de snapshot
 * @description Recupere les informations d'un snapshot, incluant label et UID.
 * @arguments Voir docs/tools.md#eos-snapshot-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-snapshot-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-snapshot-get-info pour un exemple OSC.
 */
export const eosSnapshotGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_snapshot_get_info',
  config: {
    title: 'Lecture des informations de snapshot',
    description: 'Recupere les informations d\'un snapshot, incluant label et UID.',
    inputSchema: getInfoInputSchema,
    outputSchema: {
      snapshot: z.object({
        snapshot_number: snapshotNumberSchema,
        label: z.string().nullable(),
        uid: z.string().nullable()
      }),
      status: z.enum(['ok', 'timeout', 'error', 'skipped'])
    },
    annotations: annotate(oscMappings.snapshots.info)
  },
  handler: async (args) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {
      snapshot: options.snapshot_number
    };

    if (options.fields && options.fields.length > 0) {
      payload.fields = options.fields;
    }

    const cacheKey = createCacheKey({
      address: oscMappings.snapshots.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'snapshots',
      key: cacheKey,
      tags: [
        createResourceTag('snapshots'),
        createResourceTag('snapshots', String(options.snapshot_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response = await client.requestJson(oscMappings.snapshots.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        return buildSnapshotInfoResult(response, options.snapshot_number, payload);
      }
    });
  }
};

export const snapshotTools = [eosSnapshotRecallTool, eosSnapshotGetInfoTool];

export default snapshotTools;
