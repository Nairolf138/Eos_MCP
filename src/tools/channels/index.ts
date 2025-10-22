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

const channelNumberSchema = z.number().int().min(1).max(99999);
const channelListSchema = z
  .union([channelNumberSchema, z.array(channelNumberSchema).min(1)])
  .describe('Un numero de canal ou une liste de canaux');

const levelValueSchema = z.union([z.number(), z.string().min(1)]);
const dmxValueSchema = z.union([z.number(), z.string().min(1)]);
const parameterValueSchema = z.union([z.number(), z.string().min(1)]);

const LEVEL_KEYWORDS: Record<string, number> = {
  full: 100,
  out: 0
};

const DMX_KEYWORDS: Record<string, number> = {
  full: 255,
  out: 0
};

function normaliseChannels(value: number | number[]): number[] {
  const list = Array.isArray(value) ? value : [value];
  const unique = Array.from(new Set(list.map((item) => Math.trunc(item))));
  return unique.sort((a, b) => a - b);
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

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const withoutPercent = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
  const normalised = withoutPercent.replace(',', '.');
  const parsed = Number.parseFloat(normalised);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveNumericValue(
  value: number | string,
  keywords: Record<string, number>,
  min: number,
  max: number,
  label: string,
  integer: boolean
): number {
  let numeric: number | null = null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`La valeur ${label} doit etre un nombre fini.`);
    }
    numeric = value;
  } else {
    const lowered = value.trim().toLowerCase();
    if (lowered in keywords) {
      numeric = keywords[lowered];
    } else {
      numeric = toNumber(value);
    }
  }

  if (numeric == null) {
    throw new Error(`Impossible d'interpreter la valeur ${label}.`);
  }

  if (integer) {
    numeric = Math.round(numeric);
  }

  if (numeric < min || numeric > max) {
    throw new Error(`La valeur ${label} doit etre comprise entre ${min} et ${max}.`);
  }

  return numeric;
}

function resolveLevelValue(value: number | string): number {
  return resolveNumericValue(value, LEVEL_KEYWORDS, 0, 100, 'de niveau', false);
}

function resolveDmxValue(value: number | string): number {
  return resolveNumericValue(value, DMX_KEYWORDS, 0, 255, 'DMX', true);
}

function resolveParameterValue(value: number | string): number {
  return resolveNumericValue(value, LEVEL_KEYWORDS, 0, 100, 'de parametre', false);
}

function buildJsonArgs(payload: Record<string, unknown>): OscMessageArgument[] {
  return [
    {
      type: 's' as const,
      value: JSON.stringify(payload)
    }
  ];
}

function createResult(text: string, data: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      { type: 'object', data }
    ]
  } as ToolExecutionResult;
}

function annotate(osc: string): Record<string, unknown> {
  return {
    mapping: {
      osc
    }
  };
}

const selectInputSchema = {
  channels: channelListSchema,
  exclusive: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setLevelSchema = {
  channels: channelListSchema,
  level: levelValueSchema,
  snap: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setDmxSchema = {
  addresses: z.union([z.number().int().min(1).max(65535), z.array(z.number().int().min(1).max(65535)).min(1)]),
  value: dmxValueSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setParameterSchema = {
  channels: channelListSchema,
  parameter: z.string().min(1),
  value: parameterValueSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoSchema = {
  channels: channelListSchema,
  fields: z.array(z.string().min(1)).optional(),
  timeoutMs: z.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_channel_select
 * @summary Selection de canaux
 * @description Selectionne un ou plusieurs canaux sur la console.
 * @arguments Voir docs/tools.md#eos-channel-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-channel-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-channel-select pour un exemple OSC.
 */
export const eosChannelSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_channel_select',
  config: {
    title: 'Selection de canaux',
    description: 'Selectionne un ou plusieurs canaux sur la console.',
    inputSchema: selectInputSchema,
    annotations: annotate(oscMappings.channels.select)
  },
  handler: async (args, _extra) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const channels = normaliseChannels(options.channels);
    const payload: Record<string, unknown> = {
      channels,
      exclusive: options.exclusive ?? false
    };

    await client.sendMessage(oscMappings.channels.select, buildJsonArgs(payload), extractTargetOptions(options));

    return createResult(`Canaux selectionnes: ${channels.join(', ')}`, {
      action: 'select',
      channels,
      exclusive: options.exclusive ?? false,
      osc: {
        address: oscMappings.channels.select,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_channel_set_level
 * @summary Reglage de niveau
 * @description Ajuste le niveau intensite de canaux specifiques (0-100).
 * @arguments Voir docs/tools.md#eos-channel-set-level pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-channel-set-level pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-channel-set-level pour un exemple OSC.
 */
export const eosChannelSetLevelTool: ToolDefinition<typeof setLevelSchema> = {
  name: 'eos_channel_set_level',
  config: {
    title: 'Reglage de niveau',
    description: 'Ajuste le niveau intensite de canaux specifiques (0-100).',
    inputSchema: setLevelSchema,
    annotations: annotate(oscMappings.channels.level)
  },
  handler: async (args, _extra) => {
    const schema = z.object(setLevelSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const channels = normaliseChannels(options.channels);
    const level = resolveLevelValue(options.level);
    const payload: Record<string, unknown> = {
      channels,
      level,
      snap: options.snap ?? false
    };

    await client.sendMessage(oscMappings.channels.level, buildJsonArgs(payload), extractTargetOptions(options));

    return createResult(`Niveau regle a ${level}% pour les canaux ${channels.join(', ')}`, {
      action: 'set_level',
      channels,
      level,
      snap: options.snap ?? false,
      osc: {
        address: oscMappings.channels.level,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_set_dmx
 * @summary Reglage DMX
 * @description Fixe une valeur DMX (0-255) sur une ou plusieurs adresses.
 * @arguments Voir docs/tools.md#eos-set-dmx pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-set-dmx pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-set-dmx pour un exemple OSC.
 */
export const eosSetDmxTool: ToolDefinition<typeof setDmxSchema> = {
  name: 'eos_set_dmx',
  config: {
    title: 'Reglage DMX',
    description: 'Fixe une valeur DMX (0-255) sur une ou plusieurs adresses.',
    inputSchema: setDmxSchema,
    annotations: annotate(oscMappings.channels.dmx)
  },
  handler: async (args, _extra) => {
    const schema = z.object(setDmxSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const addresses = normaliseChannels(options.addresses);
    const value = resolveDmxValue(options.value);
    const payload: Record<string, unknown> = {
      addresses,
      value
    };

    await client.sendMessage(oscMappings.channels.dmx, buildJsonArgs(payload), extractTargetOptions(options));

    return createResult(`Valeur DMX ${value} envoyee sur les adresses ${addresses.join(', ')}`, {
      action: 'set_dmx',
      addresses,
      value,
      osc: {
        address: oscMappings.channels.dmx,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_channel_set_parameter
 * @summary Reglage de parametre
 * @description Ajuste un parametre de canal sur une echelle de 0 a 100.
 * @arguments Voir docs/tools.md#eos-channel-set-parameter pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-channel-set-parameter pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-channel-set-parameter pour un exemple OSC.
 */
export const eosChannelSetParameterTool: ToolDefinition<typeof setParameterSchema> = {
  name: 'eos_channel_set_parameter',
  config: {
    title: 'Reglage de parametre',
    description: 'Ajuste un parametre de canal sur une echelle de 0 a 100.',
    inputSchema: setParameterSchema,
    annotations: annotate(oscMappings.channels.parameter)
  },
  handler: async (args, _extra) => {
    const schema = z.object(setParameterSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const channels = normaliseChannels(options.channels);
    const value = resolveParameterValue(options.value);
    const payload: Record<string, unknown> = {
      channels,
      parameter: options.parameter,
      value
    };

    await client.sendMessage(oscMappings.channels.parameter, buildJsonArgs(payload), extractTargetOptions(options));

    return createResult(`Parametre ${options.parameter} regle a ${value} pour les canaux ${channels.join(', ')}`, {
      action: 'set_parameter',
      channels,
      parameter: options.parameter,
      value,
      osc: {
        address: oscMappings.channels.parameter,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_channel_get_info
 * @summary Informations de canaux
 * @description Recupere des informations sur les canaux depuis la console.
 * @arguments Voir docs/tools.md#eos-channel-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-channel-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-channel-get-info pour un exemple OSC.
 */
export const eosChannelGetInfoTool: ToolDefinition<typeof getInfoSchema> = {
  name: 'eos_channel_get_info',
  config: {
    title: 'Informations de canaux',
    description: 'Recupere des informations sur les canaux depuis la console.',
    inputSchema: getInfoSchema,
    annotations: annotate(oscMappings.channels.info)
  },
  handler: async (args, _extra) => {
    const schema = z.object(getInfoSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const channels = normaliseChannels(options.channels);
    const payload: Record<string, unknown> = { channels };

    if (options.fields?.length) {
      payload.fields = options.fields;
    }

    const cacheKey = createCacheKey({
      address: oscMappings.channels.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'channels',
      key: cacheKey,
      tags: [createResourceTag('channels')],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(oscMappings.channels.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const baseText = response.status === 'ok'
          ? `Informations recues pour ${channels.length} canal(aux).`
          : `Lecture des informations de canaux terminee avec le statut ${response.status}.`;

        return createResult(baseText, {
          action: 'get_info',
          status: response.status,
          channels,
          request: payload,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: oscMappings.channels.info,
            args: payload
          }
        });
      }
    });
  }
};

const channelTools = [
  eosChannelSelectTool,
  eosChannelSetLevelTool,
  eosSetDmxTool,
  eosChannelSetParameterTool,
  eosChannelGetInfoTool
];

export default channelTools;
