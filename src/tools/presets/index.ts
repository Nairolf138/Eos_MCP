import { z, type ZodRawShape } from 'zod';
import {
  createCacheKey,
  createOscPrefixTag,
  createResourceTag,
  getResourceCache
} from '../../services/cache/index';
import { getOscClient } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const presetNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(99999)
  .describe('Numero de preset (1-99999)');

const presetFireInputSchema = {
  preset_number: presetNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const presetGetInfoInputSchema = {
  preset_number: presetNumberSchema,
  fields: z.array(z.string().min(1)).optional(),
  timeoutMs: z.coerce.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

interface PresetFlags {
  absolute: boolean;
  locked: boolean;
  assert: boolean;
  block: boolean;
  background: boolean;
  solo: boolean;
  mark: boolean;
  inhibit: boolean;
}

const defaultPresetFlags: PresetFlags = {
  absolute: false,
  locked: false,
  assert: false,
  block: false,
  background: false,
  solo: false,
  mark: false,
  inhibit: false
};

type MutablePresetFlags = {
  -readonly [K in keyof PresetFlags]: PresetFlags[K];
};

interface PresetEffectFlags {
  assert: boolean;
  block: boolean;
  background: boolean;
  solo: boolean;
  mark: boolean;
  manual: boolean;
  independent: boolean;
}

const defaultEffectFlags: PresetEffectFlags = {
  assert: false,
  block: false,
  background: false,
  solo: false,
  mark: false,
  manual: false,
  independent: false
};

type MutablePresetEffectFlags = {
  -readonly [K in keyof PresetEffectFlags]: PresetEffectFlags[K];
};

interface PresetEffectInfo {
  effect_number: number;
  label: string | null;
  type: string | null;
  rate: number | null;
  channels: number[];
  flags: PresetEffectFlags;
}

interface PresetInfo {
  preset_number: number;
  label: string | null;
  absolute: boolean;
  locked: boolean;
  channels: number[];
  effects: PresetEffectInfo[];
  flags: PresetFlags;
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

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
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
    if (['0', 'false', 'no', 'off', 'disabled', 'rel'].includes(lowered)) {
      return false;
    }
  }
  return false;
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
      const directKeys = ['channel', 'number', 'id', 'target'];
      for (const key of directKeys) {
        if (key in candidate) {
          const channel = asFiniteInteger(candidate[key]);
          if (channel != null && channel > 0) {
            result.add(channel);
          }
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

function mapPresetFlags(source: Record<string, unknown>): PresetFlags {
  const flagsSource = isRecord(source.flags) ? (source.flags as Record<string, unknown>) : source;

  const flags: MutablePresetFlags = {
    ...defaultPresetFlags
  };

  flags.absolute =
    normaliseBoolean(source.absolute ?? source.abs ?? flagsSource.absolute ?? flagsSource.abs ?? flagsSource.absolute_flag) ||
    flags.absolute;

  flags.locked =
    normaliseBoolean(source.locked ?? source.lock ?? flagsSource.locked ?? flagsSource.lock ?? flagsSource.is_locked) ||
    flags.locked;

  flags.assert = normaliseBoolean(flagsSource.assert ?? flagsSource.asserted) || flags.assert;
  flags.block = normaliseBoolean(flagsSource.block ?? flagsSource.blocked) || flags.block;
  flags.background =
    normaliseBoolean(
      flagsSource.background ?? flagsSource.background_enable ?? flagsSource.backgrounded ?? flagsSource.background_mode
    ) || flags.background;
  flags.solo =
    normaliseBoolean(flagsSource.solo ?? flagsSource.solo_mode ?? flagsSource.soloMode ?? flagsSource.independent) || flags.solo;
  flags.mark = normaliseBoolean(flagsSource.mark ?? flagsSource.marked) || flags.mark;
  flags.inhibit =
    normaliseBoolean(flagsSource.inhibit ?? flagsSource.inhibitive ?? flagsSource.inhibited ?? flagsSource.blocking) ||
    flags.inhibit;

  return flags;
}

function mergeEffectFlags(base: PresetEffectFlags, extra: PresetEffectFlags): PresetEffectFlags {
  const merged: MutablePresetEffectFlags = { ...base };
  (Object.keys(merged) as (keyof PresetEffectFlags)[]).forEach((key) => {
    merged[key] = merged[key] || extra[key];
  });
  return merged;
}

function mapPresetEffect(raw: unknown): PresetEffectInfo | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return {
      effect_number: Math.trunc(raw),
      label: null,
      type: null,
      rate: null,
      channels: [],
      flags: { ...defaultEffectFlags }
    };
  }

  if (typeof raw === 'string') {
    const numeric = asFiniteInteger(raw);
    if (numeric != null) {
      return {
        effect_number: numeric,
        label: null,
        type: null,
        rate: null,
        channels: [],
        flags: { ...defaultEffectFlags }
      };
    }
  }

  if (!isRecord(raw)) {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const effectNumber =
    asFiniteInteger(source.effect ?? source.effect_number ?? source.number ?? source.id ?? source.target) ?? null;

  if (effectNumber == null) {
    return null;
  }

  const label =
    asString(source.label ?? source.name ?? source.description ?? source.title ?? source.effect_label ?? source.effect_name) ??
    null;

  const type =
    asString(source.type ?? source.mode ?? source.kind ?? source.category ?? source.effect_type ?? source.classification) ??
    null;

  const rate =
    asFiniteNumber(source.rate ?? source.speed ?? source.tempo ?? source.bpm ?? source.frequency ?? source.hz ?? source.fade) ??
    null;

  const channels = collectChannelNumbers(
    source.channels ??
      source.channel ??
      source.members ??
      source.targets ??
      source.target ??
      source.contents ??
      source.applies_to ??
      source.applied_to
  );

  const flagsSource = isRecord(source.flags) ? (source.flags as Record<string, unknown>) : source;
  const flags: MutablePresetEffectFlags = {
    ...defaultEffectFlags
  };
  flags.assert = normaliseBoolean(flagsSource.assert ?? flagsSource.asserted) || flags.assert;
  flags.block = normaliseBoolean(flagsSource.block ?? flagsSource.blocked) || flags.block;
  flags.background =
    normaliseBoolean(flagsSource.background ?? flagsSource.background_enable ?? flagsSource.backgrounded) || flags.background;
  flags.solo = normaliseBoolean(flagsSource.solo ?? flagsSource.solo_mode ?? flagsSource.soloMode) || flags.solo;
  flags.mark = normaliseBoolean(flagsSource.mark ?? flagsSource.marked) || flags.mark;
  flags.manual = normaliseBoolean(flagsSource.manual ?? flagsSource.manual_mode ?? flagsSource.is_manual) || flags.manual;
  flags.independent =
    normaliseBoolean(flagsSource.independent ?? flagsSource.independent_mode ?? flagsSource.independentFlag) || flags.independent;

  return {
    effect_number: effectNumber,
    label,
    type,
    rate,
    channels,
    flags
  };
}

function mergeEffectDetails(current: PresetEffectInfo, next: PresetEffectInfo): PresetEffectInfo {
  const mergedChannels = new Set<number>([...current.channels, ...next.channels]);
  const mergedFlags = mergeEffectFlags(current.flags, next.flags);

  return {
    effect_number: current.effect_number,
    label: current.label ?? next.label,
    type: current.type ?? next.type,
    rate: current.rate ?? next.rate,
    channels: Array.from(mergedChannels).sort((a, b) => a - b),
    flags: mergedFlags
  };
}

function mapPresetEffects(raw: unknown): PresetEffectInfo[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.values(raw)
      : raw != null
        ? [raw]
        : [];

  const byNumber = new Map<number, PresetEffectInfo>();

  for (const entry of list) {
    const effect = mapPresetEffect(entry);
    if (!effect) {
      continue;
    }
    const existing = byNumber.get(effect.effect_number);
    if (existing) {
      byNumber.set(effect.effect_number, mergeEffectDetails(existing, effect));
    } else {
      byNumber.set(effect.effect_number, effect);
    }
  }

  return Array.from(byNumber.values()).sort((a, b) => a.effect_number - b.effect_number);
}

function mapPresetInfo(raw: unknown, fallbackNumber: number): PresetInfo {
  const root = isRecord(raw) ? raw : {};
  const container = isRecord(root.preset) ? (root.preset as Record<string, unknown>) : root;

  const presetNumber =
    asFiniteInteger(container.preset ?? container.number ?? container.id ?? root.preset_number ?? root.number) ?? fallbackNumber;

  const label =
    asString(container.label ?? container.name ?? container.title ?? container.description ?? root.label ?? root.name) ?? null;

  const flags = mapPresetFlags(container);

  const directChannels = collectChannelNumbers(
    container.channels ??
      container.members ??
      container.channel ??
      container.targets ??
      container.contents ??
      container.applies_to ??
      root.channels
  );

  const effects = mapPresetEffects(
    container.effects ?? container.effect_list ?? container.fx ?? root.effects ?? root.effect_list ?? root.fx
  );

  const combinedChannels = new Set<number>(directChannels);
  for (const effect of effects) {
    effect.channels.forEach((channel) => combinedChannels.add(channel));
  }

  return {
    preset_number: presetNumber,
    label,
    absolute: flags.absolute,
    locked: flags.locked,
    channels: Array.from(combinedChannels).sort((a, b) => a - b),
    effects,
    flags
  };
}

function formatPresetDescription(info: PresetInfo): string {
  const label = info.label ? `"${info.label}"` : 'sans label';
  const mode = info.absolute ? 'absolu' : 'relatif';
  const lockState = info.locked ? 'verrouille' : 'modifiable';
  const channels = info.channels.length > 0 ? info.channels.join(', ') : 'aucun canal';
  const effectsCount = info.effects.length;
  const effectsSummary = effectsCount > 0 ? `${effectsCount} effet${effectsCount > 1 ? 's' : ''}` : 'aucun effet';
  return `Preset ${info.preset_number} ${label} (${mode}, ${lockState}, canaux: ${channels}, ${effectsSummary})`;
}

/**
 * @tool eos_preset_fire
 * @summary Declenchement de preset
 * @description Declenche un preset sur la console Eos.
 * @arguments Voir docs/tools.md#eos-preset-fire pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-preset-fire pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-preset-fire pour un exemple OSC.
 */
export const eosPresetFireTool: ToolDefinition<typeof presetFireInputSchema> = {
  name: 'eos_preset_fire',
  config: {
    title: 'Declenchement de preset',
    description: 'Declenche un preset sur la console Eos.',
    inputSchema: presetFireInputSchema,
    annotations: {
      ...annotate(oscMappings.presets.fire),
      highlighted: true
    }
  },
  handler: async (args) => {
    const schema = z.object(presetFireInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const oscArgs: OscMessageArgument[] = [
      {
        type: 'i',
        value: options.preset_number
      }
    ];

    await client.sendMessage(oscMappings.presets.fire, oscArgs, extractTargetOptions(options));

    return createResult(`Preset ${options.preset_number} declenche`, {
      action: 'preset_fire',
      preset_number: options.preset_number,
      osc: {
        address: oscMappings.presets.fire,
        args: oscArgs
      }
    });
  }
} satisfies ToolDefinition<typeof presetFireInputSchema>;

/**
 * @tool eos_preset_select
 * @summary Selection de preset
 * @description Selectionne un preset sur la console Eos.
 * @arguments Voir docs/tools.md#eos-preset-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-preset-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-preset-select pour un exemple OSC.
 */
export const eosPresetSelectTool: ToolDefinition<typeof presetFireInputSchema> = {
  name: 'eos_preset_select',
  config: {
    title: 'Selection de preset',
    description: 'Selectionne un preset sur la console Eos.',
    inputSchema: presetFireInputSchema,
    annotations: annotate(oscMappings.presets.select)
  },
  handler: async (args) => {
    const schema = z.object(presetFireInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const oscArgs: OscMessageArgument[] = [
      {
        type: 'i',
        value: options.preset_number
      }
    ];

    await client.sendMessage(oscMappings.presets.select, oscArgs, extractTargetOptions(options));

    return createResult(`Preset ${options.preset_number} selectionne`, {
      action: 'preset_select',
      preset_number: options.preset_number,
      osc: {
        address: oscMappings.presets.select,
        args: oscArgs
      }
    });
  }
} satisfies ToolDefinition<typeof presetFireInputSchema>;

/**
 * @tool eos_preset_get_info
 * @summary Informations de preset
 * @description Recupere les informations detaillees pour un preset donne.
 * @arguments Voir docs/tools.md#eos-preset-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-preset-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-preset-get-info pour un exemple OSC.
 */
export const eosPresetGetInfoTool: ToolDefinition<typeof presetGetInfoInputSchema> = {
  name: 'eos_preset_get_info',
  config: {
    title: 'Informations de preset',
    description: 'Recupere les informations detaillees pour un preset donne.',
    inputSchema: presetGetInfoInputSchema,
    annotations: {
      ...annotate(oscMappings.presets.info),
      highlighted: true
    }
  },
  handler: async (args) => {
    const schema = z.object(presetGetInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload: Record<string, unknown> = {
      preset: options.preset_number
    };
    if (options.fields?.length) {
      payload.fields = options.fields;
    }

    const cacheKey = createCacheKey({
      address: oscMappings.presets.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'presets',
      key: cacheKey,
      tags: [
        createResourceTag('presets'),
        createResourceTag('presets', String(options.preset_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response = await client.requestJson(oscMappings.presets.info, {
          payload,
          timeoutMs: options.timeoutMs,
          ...extractTargetOptions(options)
        });

        const info = mapPresetInfo(response.data, options.preset_number);
        const text = formatPresetDescription(info);

        const result: ToolExecutionResult = {
          content: [{ type: 'text', text }],
          structuredContent: {
            action: 'preset_get_info',
            status: response.status,
            request: payload,
            preset: info,
            osc: {
              address: oscMappings.presets.info,
              response: response.payload
            }
          }
        } as ToolExecutionResult;

        return result;
      }
    });
  }
};

export const presetTools = [eosPresetFireTool, eosPresetSelectTool, eosPresetGetInfoTool];

export default presetTools;

export {
  presetNumberSchema
};
