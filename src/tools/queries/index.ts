import { z, type ZodRawShape } from 'zod';
import {
  createCacheKey,
  createOscPrefixTag,
  createResourceTag,
  getResourceCache
} from '../../services/cache/index';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

interface QueryListItem {
  number: string;
  uid: string;
  label: string | null;
}

interface QueryTargetConfig {
  label: string;
  countAddress: string;
  listAddress: string;
  responseKeys: string[];
}

type QueryTargetType = keyof typeof TARGET_TYPE_CONFIGS;

const TARGET_TYPE_CONFIGS = {
  cue: {
    label: 'cues',
    countAddress: oscMappings.queries.cue.count,
    listAddress: oscMappings.queries.cue.list,
    responseKeys: ['cues', 'items']
  },
  cuelist: {
    label: 'cue lists',
    countAddress: oscMappings.queries.cuelist.count,
    listAddress: oscMappings.queries.cuelist.list,
    responseKeys: ['cuelists', 'lists', 'items']
  },
  group: {
    label: 'groupes',
    countAddress: oscMappings.queries.group.count,
    listAddress: oscMappings.queries.group.list,
    responseKeys: ['groups', 'items']
  },
  macro: {
    label: 'macros',
    countAddress: oscMappings.queries.macro.count,
    listAddress: oscMappings.queries.macro.list,
    responseKeys: ['macros', 'items']
  },
  ms: {
    label: 'magic sheets',
    countAddress: oscMappings.queries.ms.count,
    listAddress: oscMappings.queries.ms.list,
    responseKeys: ['magic_sheets', 'magicSheets', 'items']
  },
  ip: {
    label: 'intensity palettes',
    countAddress: oscMappings.queries.ip.count,
    listAddress: oscMappings.queries.ip.list,
    responseKeys: ['intensity_palettes', 'ip', 'items']
  },
  fp: {
    label: 'focus palettes',
    countAddress: oscMappings.queries.fp.count,
    listAddress: oscMappings.queries.fp.list,
    responseKeys: ['focus_palettes', 'fp', 'items']
  },
  cp: {
    label: 'color palettes',
    countAddress: oscMappings.queries.cp.count,
    listAddress: oscMappings.queries.cp.list,
    responseKeys: ['color_palettes', 'cp', 'items']
  },
  bp: {
    label: 'beam palettes',
    countAddress: oscMappings.queries.bp.count,
    listAddress: oscMappings.queries.bp.list,
    responseKeys: ['beam_palettes', 'bp', 'items']
  },
  preset: {
    label: 'presets',
    countAddress: oscMappings.queries.preset.count,
    listAddress: oscMappings.queries.preset.list,
    responseKeys: ['presets', 'items']
  },
  sub: {
    label: 'submasters',
    countAddress: oscMappings.queries.sub.count,
    listAddress: oscMappings.queries.sub.list,
    responseKeys: ['submasters', 'subs', 'items']
  },
  fx: {
    label: 'effects',
    countAddress: oscMappings.queries.fx.count,
    listAddress: oscMappings.queries.fx.list,
    responseKeys: ['effects', 'fx', 'items']
  },
  curve: {
    label: 'courbes',
    countAddress: oscMappings.queries.curve.count,
    listAddress: oscMappings.queries.curve.list,
    responseKeys: ['curves', 'items']
  },
  snap: {
    label: 'snapshots',
    countAddress: oscMappings.queries.snap.count,
    listAddress: oscMappings.queries.snap.list,
    responseKeys: ['snapshots', 'snaps', 'items']
  },
  pixmap: {
    label: 'pixel maps',
    countAddress: oscMappings.queries.pixmap.count,
    listAddress: oscMappings.queries.pixmap.list,
    responseKeys: ['pixmaps', 'pixel_maps', 'items']
  }
} as const satisfies Record<string, QueryTargetConfig>;

const TARGET_TYPE_ERROR_MESSAGE = [
  'Type de cible invalide.',
  'Valeurs supportees: cue, cuelist, group, macro, ms, ip, fp, cp, bp, preset, sub, fx, curve, snap, pixmap.'
].join(' ');

const statusSchema = z.enum(['ok', 'timeout', 'error', 'skipped']);

const listItemOutputSchema = z.object({
  number: z.string(),
  uid: z.string(),
  label: z.string().nullable()
});

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const targetTypeSchema = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const key = value.trim().toLowerCase();
    if (!isQueryTargetType(key)) {
      ctx.addIssue({
        code: 'custom',
        message: TARGET_TYPE_ERROR_MESSAGE
      });
      return z.NEVER;
    }
    return key;
  });

const countInputSchema = {
  target_type: targetTypeSchema,
  timeoutMs: z.coerce.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const listInputSchema = {
  target_type: targetTypeSchema,
  timeoutMs: z.coerce.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const countOutputSchema = {
  action: z.literal('get_count'),
  status: statusSchema,
  target_type: z.string(),
  count: z.coerce.number().int().min(0),
  data: z.unknown(),
  error: z.string().nullable(),
  osc: z.object({
    address: z.string(),
    args: z.record(z.string(), z.unknown())
  })
} satisfies ZodRawShape;

const listOutputSchema = {
  action: z.literal('list_all'),
  status: statusSchema,
  target_type: z.string(),
  items: z.array(listItemOutputSchema),
  data: z.unknown(),
  error: z.string().nullable(),
  osc: z.object({
    address: z.string(),
    args: z.record(z.string(), z.unknown())
  })
} satisfies ZodRawShape;

/**
 * @tool eos_get_count
 * @summary Compter les elements
 * @description Recupere le nombre total d'elements pour un type donne.
 * @arguments Voir docs/tools.md#eos-get-count pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-count pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-count pour un exemple OSC.
 */
export const eosGetCountTool: ToolDefinition<typeof countInputSchema> = {
  name: 'eos_get_count',
  config: {
    title: 'Compter les elements',
    description: 'Recupere le nombre total d\'elements pour un type donne.',
    inputSchema: countInputSchema,
    outputSchema: countOutputSchema,
    annotations: annotate('count')
  },
  handler: async (args, _extra) => {
    const schema = z.object(countInputSchema).strict();
    const options = schema.parse(args ?? {});
    const config = getTargetConfig(options.target_type);
    const client = getOscClient();

    const cacheKey = createCacheKey({
      address: config.countAddress,
      payload: {},
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      extra: { target: config.key }
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'queries',
      key: cacheKey,
      tags: [
        createResourceTag('queries'),
        createResourceTag('queries', config.key)
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(config.countAddress, {
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const count = Math.max(0, normaliseCount(response.data));

        const baseText =
          response.status === 'ok'
            ? `Nombre de ${config.label}: ${count}.`
            : `Lecture du compte des ${config.label} terminee avec le statut ${response.status}.`;

        return createResult(baseText, {
          action: 'get_count',
          status: response.status,
          target_type: config.key,
          count,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: config.countAddress,
            args: {}
          }
        });
      }
    });
  }
};

/**
 * @tool eos_get_list_all
 * @summary Lister tous les elements
 * @description Recupere la liste complete des elements pour un type donne.
 * @arguments Voir docs/tools.md#eos-get-list-all pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-list-all pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-list-all pour un exemple OSC.
 */
export const eosGetListAllTool: ToolDefinition<typeof listInputSchema> = {
  name: 'eos_get_list_all',
  config: {
    title: 'Lister tous les elements',
    description: 'Recupere la liste complete des elements pour un type donne.',
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema,
    annotations: annotate('list')
  },
  handler: async (args, _extra) => {
    const schema = z.object(listInputSchema).strict();
    const options = schema.parse(args ?? {});
    const config = getTargetConfig(options.target_type);
    const client = getOscClient();

    const cacheKey = createCacheKey({
      address: config.listAddress,
      payload: {},
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      extra: { target: config.key }
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'queries',
      key: cacheKey,
      tags: [
        createResourceTag('queries'),
        createResourceTag('queries', config.key)
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(config.listAddress, {
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const items = normaliseList(response.data, config);

        const baseText =
          response.status === 'ok'
            ? `Elements ${config.label}: ${items.length}.`
            : `Lecture de la liste des ${config.label} terminee avec le statut ${response.status}.`;

        return createResult(baseText, {
          action: 'list_all',
          status: response.status,
          target_type: config.key,
          items,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: config.listAddress,
            args: {}
          }
        });
      }
    });
  }
};

const queryTools = [eosGetCountTool, eosGetListAllTool];

export default queryTools;

function annotate(mode: 'count' | 'list'): Record<string, unknown> {
  const mappingEntries = Object.entries(TARGET_TYPE_CONFIGS).map(([key, config]) => {
    const address = mode === 'count' ? config.countAddress : config.listAddress;
    return [key, address];
  });

  return {
    mapping: {
      osc: Object.fromEntries(mappingEntries)
    }
  };
}

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function isQueryTargetType(value: string): value is QueryTargetType {
  return value in TARGET_TYPE_CONFIGS;
}

function getTargetConfig(value: string): QueryTargetConfig & { key: QueryTargetType } {
  const config = TARGET_TYPE_CONFIGS[value as QueryTargetType];
  if (!config) {
    throw new Error(TARGET_TYPE_ERROR_MESSAGE);
  }
  return { ...config, key: value as QueryTargetType };
}

function normaliseCount(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.trunc(raw));
  }

  if (typeof raw === 'string') {
    const numeric = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(numeric)) {
      return Math.max(0, numeric);
    }
  }

  if (raw && typeof raw === 'object') {
    const candidate = raw as Record<string, unknown>;
    const fromKey = ['count', 'total', 'value', 'length']
      .map((key) => candidate[key])
      .find((value) => typeof value === 'number' || typeof value === 'string');

    if (typeof fromKey === 'number') {
      return normaliseCount(fromKey);
    }

    if (typeof fromKey === 'string') {
      return normaliseCount(fromKey);
    }

    if (Array.isArray(candidate.items)) {
      return candidate.items.length;
    }
  }

  return 0;
}

function normaliseList(data: unknown, config: QueryTargetConfig): QueryListItem[] {
  const payload = extractListPayload(data, config);
  const items: QueryListItem[] = [];

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const normalised = normaliseListItem(entry);
      if (normalised) {
        items.push(normalised);
      }
    }
    return items;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.items)) {
      for (const entry of record.items) {
        const normalised = normaliseListItem(entry);
        if (normalised) {
          items.push(normalised);
        }
      }
      return items;
    }

    const numbers = extractStringArray(record.numbers ?? record.list ?? record.ids ?? record.index ?? record.indexes);
    const uids = extractStringArray(record.uids ?? record.uid);
    const labels = extractStringArray(record.labels ?? record.names ?? record.texts ?? record.label);

    if (numbers.length > 0 || uids.length > 0 || labels.length > 0) {
      const maxLength = Math.max(numbers.length, uids.length, labels.length);
      for (let index = 0; index < maxLength; index += 1) {
        const uid = uids[index] ?? numbers[index] ?? '';
        if (!uid) {
          continue;
        }
        items.push({
          number: numbers[index] ?? uid,
          uid,
          label: labels[index] ?? null
        });
      }
      return items;
    }

    for (const [key, value] of Object.entries(record)) {
      if (['status', 'error', 'count', 'total'].includes(key)) {
        continue;
      }
      const normalised = normaliseListItem(value, key);
      if (normalised) {
        items.push(normalised);
      }
    }
  }

  return items;
}

function extractListPayload(data: unknown, config: QueryTargetConfig): unknown {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of config.responseKeys) {
      if (key in record) {
        return record[key];
      }
    }
    if ('items' in record) {
      return record.items;
    }
    if ('all' in record) {
      return record.all;
    }
    if ('data' in record) {
      const nested = record.data;
      if (nested && typeof nested === 'object') {
        const nestedRecord = nested as Record<string, unknown>;
        for (const key of config.responseKeys) {
          if (key in nestedRecord) {
            return nestedRecord[key];
          }
        }
        if ('items' in nestedRecord) {
          return nestedRecord.items;
        }
      }
      return nested;
    }
  }
  return data;
}

function normaliseListItem(value: unknown, fallbackNumber?: string): QueryListItem | null {
  if (value && typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    const number = normaliseString(candidate.number ?? candidate.index ?? candidate.id ?? fallbackNumber);
    const uid = normaliseString(candidate.uid ?? candidate.UUID ?? candidate.uuid ?? candidate.id ?? fallbackNumber);
    const label = normaliseOptionalString(candidate.label ?? candidate.name ?? candidate.text ?? null);

    if (uid) {
      return {
        number: number ?? uid,
        uid,
        label
      };
    }

    if (fallbackNumber) {
      const fallback = normaliseString(fallbackNumber);
      if (fallback) {
        return {
          number: fallback,
          uid: fallback,
          label
        };
      }
    }

    return null;
  }

  const stringValue = normaliseString(value);
  const fallback = normaliseString(fallbackNumber);

  if (!stringValue && !fallback) {
    return null;
  }

  if (fallback) {
    return {
      number: fallback,
      uid: fallback,
      label: stringValue ?? null
    };
  }

  return {
    number: stringValue ?? '',
    uid: stringValue ?? '',
    label: null
  };
}

function extractStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normaliseString(item))
      .filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  return [];
}

function normaliseString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function normaliseOptionalString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const normalised = normaliseString(value);
  return normalised ?? null;
}
