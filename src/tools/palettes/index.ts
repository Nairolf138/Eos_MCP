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

const paletteNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(99999)
  .describe('Numero de palette (1-99999)');

const paletteTypeSchema = z
  .enum(['ip', 'fp', 'cp', 'bp'])
  .describe("Type de palette: 'ip' (intensite), 'fp' (focus), 'cp' (couleur), 'bp' (beam)");

type PaletteType = z.infer<typeof paletteTypeSchema>;

interface PaletteInfo {
  paletteType: PaletteType;
  paletteNumber: number;
  label: string | null;
  absolute: boolean;
  locked: boolean;
  channels: number[];
  byTypeChannels: Record<string, number[]>;
}

const paletteTypeLabels: Record<PaletteType, string> = {
  ip: 'intensite',
  fp: 'focus',
  cp: 'couleur',
  bp: 'beam'
};

const paletteTypeTitles: Record<PaletteType, string> = {
  ip: 'Palette Intensite',
  fp: 'Palette Focus',
  cp: 'Palette Couleur',
  bp: 'Palette Beam'
};

const paletteFireInputSchema = {
  palette_number: paletteNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const paletteGetInfoInputSchema = {
  palette_type: paletteTypeSchema,
  palette_number: paletteNumberSchema,
  fields: z.array(z.string().min(1)).optional(),
  timeoutMs: z.coerce.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

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

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
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

function asFiniteInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return null;
  }
  const truncated = Math.trunc(numeric);
  return Number.isFinite(truncated) ? truncated : null;
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

function normaliseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled', 'abs'].includes(lowered)) {
      return true;
    }
    if (['0', 'false', 'no', 'off', 'disabled'].includes(lowered)) {
      return false;
    }
  }
  return false;
}

function normaliseByTypeKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const lowered = trimmed.toLowerCase();
  const aliases: Record<string, string> = {
    intensity: 'intensity',
    intensite: 'intensity',
    ip: 'intensity',
    focus: 'focus',
    position: 'focus',
    fp: 'focus',
    color: 'color',
    colour: 'color',
    cp: 'color',
    beam: 'beam',
    form: 'beam',
    bp: 'beam'
  };
  const alias = aliases[lowered];
  const base = alias ?? lowered;
  return base.replace(/[^a-z0-9]+/g, '_');
}

function collectChannelNumbers(value: unknown, seen = new Set<unknown>()): number[] {
  const result = new Set<number>();

  function visit(candidate: unknown): void {
    if (candidate == null) {
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach((item) => visit(item));
      return;
    }
    if (isRecord(candidate)) {
      if (seen.has(candidate)) {
        return;
      }
      seen.add(candidate);
      if ('channel' in candidate) {
        const channel = asFiniteInteger(candidate.channel);
        if (channel != null && channel > 0) {
          result.add(channel);
        }
      }
      if ('number' in candidate) {
        const channel = asFiniteInteger(candidate.number);
        if (channel != null && channel > 0) {
          result.add(channel);
        }
      }
      if ('id' in candidate) {
        const channel = asFiniteInteger(candidate.id);
        if (channel != null && channel > 0) {
          result.add(channel);
        }
      }
      if ('target' in candidate) {
        const channel = asFiniteInteger(candidate.target);
        if (channel != null && channel > 0) {
          result.add(channel);
        }
      }
      for (const key of Object.keys(candidate)) {
        if (key.toLowerCase().includes('channel')) {
          visit(candidate[key]);
        }
      }
      return;
    }
    const numeric = asFiniteInteger(candidate);
    if (numeric != null && numeric > 0) {
      result.add(numeric);
    }
  }

  visit(value);
  return Array.from(result).sort((a, b) => a - b);
}

function mapByTypeChannels(value: unknown): Record<string, number[]> {
  if (!isRecord(value)) {
    return {};
  }
  const entries: Record<string, number[]> = {};
  for (const [key, channels] of Object.entries(value)) {
    const normalisedKey = normaliseByTypeKey(key);
    if (!normalisedKey) {
      continue;
    }
    const list = collectChannelNumbers(channels);
    if (list.length > 0) {
      entries[normalisedKey] = list;
    }
  }
  return entries;
}

function mapPaletteInfo(raw: unknown, fallback: { type: PaletteType; number: number }): PaletteInfo {
  const root = isRecord(raw) ? raw : {};
  const container = isRecord(root.palette) ? (root.palette as Record<string, unknown>) : root;

  const paletteNumber =
    asFiniteInteger(container.palette) ??
    asFiniteInteger(container.number) ??
    asFiniteInteger(container.id) ??
    asFiniteInteger(root.palette_number) ??
    fallback.number;

  const label =
    asString(container.label) ??
    asString(container.name) ??
    asString(root.label) ??
    null;

  const absolute = normaliseBoolean(
    container.absolute ?? container.abs ?? container.absolute_flag ?? container.absolute_mode ?? root.absolute
  );
  const locked = normaliseBoolean(container.locked ?? container.lock ?? container.is_locked ?? root.locked);

  const directChannels = collectChannelNumbers(
    container.channels ??
      container.members ??
      container.channel_list ??
      container.channel ??
      root.channels ??
      root.members
  );

  const byTypeSource =
    (container as Record<string, unknown>)['by-type channels'] ??
    container.by_type_channels ??
    container.channels_by_type ??
    container.byTypeChannels ??
    root.by_type_channels ??
    root.channels_by_type ??
    null;

  const byTypeChannels = mapByTypeChannels(byTypeSource);
  const combinedChannels = new Set<number>(directChannels);
  Object.values(byTypeChannels).forEach((list) => {
    list.forEach((channel) => combinedChannels.add(channel));
  });

  return {
    paletteType: fallback.type,
    paletteNumber,
    label,
    absolute,
    locked,
    channels: Array.from(combinedChannels).sort((a, b) => a - b),
    byTypeChannels
  };
}

function formatPaletteDescription(info: PaletteInfo): string {
  const typeTitle = paletteTypeTitles[info.paletteType];
  const label = info.label ? `"${info.label}"` : 'sans label';
  const mode = info.absolute ? 'absolue' : 'relative';
  const lockState = info.locked ? 'verrouillee' : 'modifiable';
  const channels = info.channels.length > 0 ? info.channels.join(', ') : 'aucun canal';
  return `${typeTitle} ${info.paletteNumber} ${label} (${mode}, ${lockState}, canaux: ${channels})`;
}

interface PaletteFireConfig {
  type: PaletteType;
  name: string;
  title: string;
  description: string;
  mapping: string;
}

function createPaletteFireTool({ type, name, title, description, mapping }: PaletteFireConfig): ToolDefinition<
  typeof paletteFireInputSchema
> {
  return {
    name,
    config: {
      title,
      description,
      inputSchema: paletteFireInputSchema,
      annotations: annotate(mapping)
    },
    handler: async (args) => {
      const schema = z.object(paletteFireInputSchema).strict();
      const options = schema.parse(args ?? {});
      const client = getOscClient();
      const oscArgs: OscMessageArgument[] = [
        {
          type: 'i',
          value: options.palette_number
        }
      ];

      await client.sendMessage(mapping, oscArgs, extractTargetOptions(options));

      return createResult(`Palette ${paletteTypeLabels[type]} ${options.palette_number} declenchee`, {
        action: 'palette_fire',
        palette_type: type,
        palette_number: options.palette_number,
        osc: {
          address: mapping,
          args: oscArgs
        }
      });
    }
  } satisfies ToolDefinition<typeof paletteFireInputSchema>;
}

function getInfoMappingForType(type: PaletteType): string {
  switch (type) {
    case 'ip':
      return oscMappings.palettes.intensity.info;
    case 'fp':
      return oscMappings.palettes.focus.info;
    case 'cp':
      return oscMappings.palettes.color.info;
    case 'bp':
      return oscMappings.palettes.beam.info;
    default:
      return oscMappings.palettes.intensity.info;
  }
}

/**
 * @tool eos_intensity_palette_fire
 * @summary eos_intensity_palette_fire
 * @description Declenche une palette d'intensite sur la console Eos.
 * @arguments Voir docs/tools.md#eos-intensity-palette-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-intensity-palette-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-intensity-palette-fire pour un exemple OSC.
 */
export const eosIntensityPaletteFireTool = createPaletteFireTool({
  type: 'ip',
  name: 'eos_intensity_palette_fire',
  title: "Declenchement de palette d'intensite",
  description: "Declenche une palette d'intensite sur la console Eos.",
  mapping: oscMappings.palettes.intensity.fire
});

/**
 * @tool eos_focus_palette_fire
 * @summary eos_focus_palette_fire
 * @description Declenche une palette de focus sur la console Eos.
 * @arguments Voir docs/tools.md#eos-focus-palette-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-focus-palette-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-focus-palette-fire pour un exemple OSC.
 */
export const eosFocusPaletteFireTool = createPaletteFireTool({
  type: 'fp',
  name: 'eos_focus_palette_fire',
  title: 'Declenchement de palette de focus',
  description: 'Declenche une palette de focus sur la console Eos.',
  mapping: oscMappings.palettes.focus.fire
});

/**
 * @tool eos_color_palette_fire
 * @summary eos_color_palette_fire
 * @description Declenche une palette de couleur sur la console Eos.
 * @arguments Voir docs/tools.md#eos-color-palette-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-color-palette-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-color-palette-fire pour un exemple OSC.
 */
export const eosColorPaletteFireTool = createPaletteFireTool({
  type: 'cp',
  name: 'eos_color_palette_fire',
  title: 'Declenchement de palette de couleur',
  description: 'Declenche une palette de couleur sur la console Eos.',
  mapping: oscMappings.palettes.color.fire
});

/**
 * @tool eos_beam_palette_fire
 * @summary eos_beam_palette_fire
 * @description Declenche une palette de beam sur la console Eos.
 * @arguments Voir docs/tools.md#eos-beam-palette-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-beam-palette-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-beam-palette-fire pour un exemple OSC.
 */
export const eosBeamPaletteFireTool = createPaletteFireTool({
  type: 'bp',
  name: 'eos_beam_palette_fire',
  title: 'Declenchement de palette de beam',
  description: 'Declenche une palette de beam sur la console Eos.',
  mapping: oscMappings.palettes.beam.fire
});

/**
 * @tool eos_palette_get_info
 * @summary Informations de palette
 * @description Recupere les informations detaillees pour une palette donnee.
 * @arguments Voir docs/tools.md#eos-palette-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-palette-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-palette-get-info pour un exemple OSC.
 */
export const eosPaletteGetInfoTool: ToolDefinition<typeof paletteGetInfoInputSchema> = {
  name: 'eos_palette_get_info',
  config: {
    title: 'Informations de palette',
    description: 'Recupere les informations detaillees pour une palette donnee.',
    inputSchema: paletteGetInfoInputSchema,
    annotations: annotate(oscMappings.palettes.info)
  },
  handler: async (args) => {
    const schema = z.object(paletteGetInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const mapping = getInfoMappingForType(options.palette_type);
    const payload: Record<string, unknown> = {
      palette: options.palette_number,
      type: options.palette_type
    };
    if (options.fields?.length) {
      payload.fields = options.fields;
    }

    const cacheKey = createCacheKey({
      address: mapping,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'palettes',
      key: cacheKey,
      tags: [
        createResourceTag('palettes'),
        createResourceTag('palettes', `${options.palette_type}:${options.palette_number}`)
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(mapping, {
          payload,
          timeoutMs: options.timeoutMs,
          ...extractTargetOptions(options)
        });

        const info = mapPaletteInfo(response.data, {
          type: options.palette_type,
          number: options.palette_number
        });

        const text = formatPaletteDescription(info);

        const result: ToolExecutionResult = {
          content: [{ type: 'text', text }],
          structuredContent: {
            action: 'palette_get_info',
            status: response.status,
            request: payload,
            palette: info,
            osc: {
              address: mapping,
              response: response.payload
            }
          }
        } as ToolExecutionResult;

        return result;
      }
    });
  }
};

const paletteTools = [
  eosIntensityPaletteFireTool,
  eosFocusPaletteFireTool,
  eosColorPaletteFireTool,
  eosBeamPaletteFireTool,
  eosPaletteGetInfoTool
];

export default paletteTools;
