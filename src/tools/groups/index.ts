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

const groupNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(99999)
  .describe('Numero de groupe (1-99999)');

const levelValueSchema = z.union([z.number(), z.string().min(1)]);

const LEVEL_KEYWORDS: Record<string, number> = {
  full: 100,
  out: 0
};

interface NormalisedGroupMember {
  channel: number;
  label: string | null;
}

interface NormalisedGroup {
  group_number: number;
  label: string | null;
  members: NormalisedGroupMember[];
}

const groupMemberOutputSchema = z.object({
  channel: z.number().int().min(1),
  label: z.string().nullable()
});

const groupDetailsOutputSchema = z.object({
  group_number: groupNumberSchema,
  label: z.string().nullable(),
  members: z.array(groupMemberOutputSchema)
});

function buildJsonArgs(payload: Record<string, unknown>): OscMessageArgument[] {
  const json = JSON.stringify(payload);
  return [
    {
      type: 's' as const,
      value: json
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

function createResult(text: string, data: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      { type: 'object', data }
    ]
  } as ToolExecutionResult;
}

function resolveLevelValue(value: number | string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('La valeur de niveau doit etre un nombre fini.');
    }
    return value;
  }

  const trimmed = value.trim();
  const keyword = LEVEL_KEYWORDS[trimmed.toLowerCase()];
  if (typeof keyword === 'number') {
    return keyword;
  }

  const normalised = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
  const numeric = Number.parseFloat(normalised.replace(',', '.'));
  if (!Number.isFinite(numeric)) {
    throw new Error(`Impossible d'interpreter la valeur de niveau: ${value}`);
  }
  return numeric;
}

function asFiniteInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return null;
}

function normaliseMember(raw: unknown): NormalisedGroupMember | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { channel: Math.trunc(raw), label: null };
  }

  if (typeof raw === 'object' && raw !== null) {
    const candidate = raw as Record<string, unknown>;
    const channel =
      asFiniteInteger(candidate.channel) ??
      asFiniteInteger(candidate.id) ??
      asFiniteInteger(candidate.number);

    if (channel == null) {
      return null;
    }

    const labelValue = candidate.label ?? candidate.name ?? null;
    return {
      channel,
      label: typeof labelValue === 'string' ? labelValue : null
    };
  }

  return null;
}

function normaliseMembers(raw: unknown): NormalisedGroupMember[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const members = raw
    .map((item) => normaliseMember(item))
    .filter((item): item is NormalisedGroupMember => item != null);
  const uniqueByChannel = new Map<number, NormalisedGroupMember>();
  for (const member of members) {
    if (!uniqueByChannel.has(member.channel)) {
      uniqueByChannel.set(member.channel, member);
    }
  }
  return Array.from(uniqueByChannel.values()).sort((a, b) => a.channel - b.channel);
}

function normaliseGroup(raw: unknown, fallbackNumber: number | null): NormalisedGroup | null {
  if (typeof raw !== 'object' || raw == null) {
    if (fallbackNumber == null) {
      return null;
    }
    return {
      group_number: fallbackNumber,
      label: null,
      members: []
    };
  }

  const data = raw as Record<string, unknown>;
  const groupNumber =
    asFiniteInteger(data.group_number) ??
    asFiniteInteger(data.number) ??
    asFiniteInteger(data.id) ??
    fallbackNumber;

  if (groupNumber == null) {
    return null;
  }

  const labelValue = data.label ?? data.name ?? null;
  const members = normaliseMembers(
    data.members ?? data.channels ?? data.contents ?? data.group ?? []
  );

  return {
    group_number: groupNumber,
    label: typeof labelValue === 'string' ? labelValue : null,
    members
  };
}

function normaliseGroupList(raw: unknown): NormalisedGroup[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const groups = raw
    .map((item) => normaliseGroup(item, null))
    .filter((item): item is NormalisedGroup => item != null);
  const unique = new Map<number, NormalisedGroup>();
  for (const group of groups) {
    if (!unique.has(group.group_number)) {
      unique.set(group.group_number, group);
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.group_number - b.group_number);
}

const selectInputSchema = {
  group_number: groupNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const setLevelInputSchema = {
  group_number: groupNumberSchema,
  level: levelValueSchema,
  snap: z.boolean().optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  group_number: groupNumberSchema,
  timeoutMs: z.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const listAllInputSchema = {
  timeoutMs: z.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_group_select
 * @summary Selection de groupe
 * @description Selectionne un groupe sur la console Eos.
 * @arguments Voir docs/tools.md#eos-group-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-group-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-group-select pour un exemple OSC.
 */
export const eosGroupSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_group_select',
  config: {
    title: 'Selection de groupe',
    description: 'Selectionne un groupe sur la console Eos.',
    inputSchema: selectInputSchema,
    annotations: annotate(oscMappings.groups.select)
  },
  handler: async (args, _extra) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      group: options.group_number
    };

    await client.sendMessage(
      oscMappings.groups.select,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    return createResult(`Groupe ${options.group_number} selectionne`, {
      action: 'select',
      group_number: options.group_number,
      osc: {
        address: oscMappings.groups.select,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_group_set_level
 * @summary Reglage de niveau de groupe
 * @description Ajuste le niveau d'un groupe sur une echelle de 0 a 100.
 * @arguments Voir docs/tools.md#eos-group-set-level pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-group-set-level pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-group-set-level pour un exemple OSC.
 */
export const eosGroupSetLevelTool: ToolDefinition<typeof setLevelInputSchema> = {
  name: 'eos_group_set_level',
  config: {
    title: 'Reglage de niveau de groupe',
    description: 'Ajuste le niveau d\'un groupe sur une echelle de 0 a 100.',
    inputSchema: setLevelInputSchema,
    annotations: annotate(oscMappings.groups.level)
  },
  handler: async (args, _extra) => {
    const schema = z.object(setLevelInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const level = resolveLevelValue(options.level);
    const payload: Record<string, unknown> = {
      group: options.group_number,
      level
    };

    if (typeof options.snap === 'boolean') {
      payload.snap = options.snap;
    }

    await client.sendMessage(
      oscMappings.groups.level,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    getResourceCache().notifyResourceChange('groups', String(options.group_number));

    return createResult(`Niveau du groupe ${options.group_number} regle a ${level}%`, {
      action: 'set_level',
      group_number: options.group_number,
      level,
      snap: options.snap ?? false,
      osc: {
        address: oscMappings.groups.level,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_group_get_info
 * @summary Informations sur un groupe
 * @description Recupere les informations detaillees pour un groupe donne.
 * @arguments Voir docs/tools.md#eos-group-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-group-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-group-get-info pour un exemple OSC.
 */
export const eosGroupGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_group_get_info',
  config: {
    title: 'Informations sur un groupe',
    description: 'Recupere les informations detaillees pour un groupe donne.',
    inputSchema: getInfoInputSchema,
    outputSchema: {
      group_number: groupNumberSchema,
      label: z.string().nullable(),
      members: z.array(groupMemberOutputSchema)
    },
    annotations: annotate(oscMappings.groups.info)
  },
  handler: async (args, _extra) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      group: options.group_number
    };
    const cacheKey = createCacheKey({
      address: oscMappings.groups.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'groups',
      key: cacheKey,
      tags: [
        createResourceTag('groups'),
        createResourceTag('groups', String(options.group_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/group')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(oscMappings.groups.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const groupData =
          normaliseGroup(
            (response.data as Record<string, unknown> | null)?.group ?? response.data,
            options.group_number
          ) ?? {
            group_number: options.group_number,
            label: null,
            members: []
          };

        const baseText =
          response.status === 'ok'
            ? `Informations recues pour le groupe ${groupData.group_number}.`
            : `Lecture des informations du groupe ${groupData.group_number} terminee avec le statut ${response.status}.`;

        return createResult(baseText, {
          action: 'get_info',
          status: response.status,
          request: payload,
          group: groupData,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: oscMappings.groups.info,
            args: payload
          }
        });
      }
    });
  }
};

/**
 * @tool eos_group_list_all
 * @summary Liste des groupes
 * @description Recupere la liste des groupes disponibles avec leurs membres.
 * @arguments Voir docs/tools.md#eos-group-list-all pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-group-list-all pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-group-list-all pour un exemple OSC.
 */
export const eosGroupListAllTool: ToolDefinition<typeof listAllInputSchema> = {
  name: 'eos_group_list_all',
  config: {
    title: 'Liste des groupes',
    description: 'Recupere la liste des groupes disponibles avec leurs membres.',
    inputSchema: listAllInputSchema,
    outputSchema: {
      groups: z.array(groupDetailsOutputSchema)
    },
    annotations: annotate(oscMappings.groups.list)
  },
  handler: async (args, _extra) => {
    const schema = z.object(listAllInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {};

    const cacheKey = createCacheKey({
      address: oscMappings.groups.list,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'groups',
      key: cacheKey,
      tags: [createResourceTag('groups')],
      prefixTags: [createOscPrefixTag('/eos/out/group')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(oscMappings.groups.list, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const groups = normaliseGroupList(
          (response.data as Record<string, unknown> | null)?.groups ?? response.data
        );

        const baseText =
          response.status === 'ok'
            ? `Groupes disponibles: ${groups.length}.`
            : `Lecture des groupes terminee avec le statut ${response.status}.`;

        return createResult(baseText, {
          action: 'list_all',
          status: response.status,
          groups,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: oscMappings.groups.list,
            args: payload
          }
        });
      }
    });
  }
};

const groupTools = [
  eosGroupSelectTool,
  eosGroupSetLevelTool,
  eosGroupGetInfoTool,
  eosGroupListAllTool
];

export default groupTools;
