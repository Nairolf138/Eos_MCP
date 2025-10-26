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

export interface SubmasterTimings {
  up: number | null;
  down: number | null;
  assert: number | null;
  release: number | null;
}

export interface SubmasterInfo {
  submasterNumber: number;
  label: string | null;
  mode: string | null;
  faderMode: string | null;
  htp: boolean;
  exclusive: boolean;
  background: boolean;
  restore: boolean;
  priority: number | null;
  timings: SubmasterTimings;
}

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const submasterNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero de submaster (1-9999)');

const setLevelInputSchema = {
  submaster_number: submasterNumberSchema,
  level: z.union([z.number(), z.string().min(1)]),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const bumpInputSchema = {
  submaster_number: submasterNumberSchema,
  state: z.union([z.boolean(), z.number(), z.string().min(1)]),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  submaster_number: submasterNumberSchema,
  timeoutMs: z.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const defaultTimings: SubmasterTimings = {
  up: null,
  down: null,
  assert: null,
  release: null
};

type MutableTimings = { -readonly [K in keyof SubmasterTimings]: SubmasterTimings[K] };

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

function buildFloatArgs(value: number): OscMessageArgument[] {
  return [
    {
      type: 'f',
      value
    }
  ];
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const normalised = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
  const parsed = Number.parseFloat(normalised.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveLevelValue(value: number | string): number {
  let numeric: number | null = null;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Le niveau doit etre un nombre fini.');
    }
    numeric = value;
  } else {
    const lowered = value.trim().toLowerCase();
    if (lowered === 'full') {
      numeric = 1;
    } else if (lowered === 'out') {
      numeric = 0;
    } else {
      numeric = toNumber(value);
    }
  }

  if (numeric == null) {
    throw new Error("Impossible d'interpreter la valeur de niveau.");
  }

  if (numeric > 1) {
    if (numeric > 100) {
      throw new Error('Le niveau ne peut pas exceder 100%.');
    }
    numeric = numeric / 100;
  }

  if (numeric < 0 || numeric > 1) {
    throw new Error('Le niveau doit etre compris entre 0 et 1 (ou 0% et 100%).');
  }

  return numeric;
}

function resolveBumpState(value: boolean | number | string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('La valeur de bump doit etre un nombre fini.');
    }
    return value !== 0;
  }

  const lowered = value.trim().toLowerCase();
  if (lowered.length === 0) {
    return false;
  }
  if (['on', 'true', 'yes', 'enable', 'enabled'].includes(lowered)) {
    return true;
  }
  if (['off', 'false', 'no', 'disable', 'disabled'].includes(lowered)) {
    return false;
  }
  const numeric = toNumber(value);
  if (numeric == null) {
    return false;
  }
  return numeric !== 0;
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
    const parsed = toNumber(value);
    if (parsed != null) {
      return parsed;
    }
  }
  return null;
}

function asFiniteInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  if (numeric == null) {
    return null;
  }
  const rounded = Math.trunc(numeric);
  return Number.isFinite(rounded) ? rounded : null;
}

function normaliseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      return false;
    }
    if (['true', 'yes', 'on', 'enable', 'enabled', 'htp'].includes(trimmed)) {
      return true;
    }
    if (['false', 'no', 'off', 'disable', 'disabled', 'ltp'].includes(trimmed)) {
      return false;
    }
    const parsed = toNumber(trimmed);
    if (parsed != null) {
      return parsed !== 0;
    }
  }
  return false;
}

function normaliseTimings(raw: unknown): SubmasterTimings {
  const timings: MutableTimings = { ...defaultTimings };
  if (!isRecord(raw)) {
    return timings;
  }

  const source = raw as Record<string, unknown>;
  timings.up =
    asFiniteNumber(
      source.up ??
        source.up_time ??
        source.fade_up ??
        source.raise ??
        source.rise ??
        source.time_up
    ) ?? timings.up;

  timings.down =
    asFiniteNumber(
      source.down ??
        source.down_time ??
        source.fade_down ??
        source.lower ??
        source.fall ??
        source.time_down
    ) ?? timings.down;

  timings.assert =
    asFiniteNumber(source.assert ?? source.assert_time ?? source.time_assert ?? source.assertion) ?? timings.assert;

  timings.release =
    asFiniteNumber(
      source.release ?? source.release_time ?? source.time_release ?? source.rel ?? source.fade_release
    ) ?? timings.release;

  return timings;
}

function normaliseSubmasterInfo(raw: unknown, fallbackNumber: number): SubmasterInfo {
  if (!isRecord(raw)) {
    return {
      submasterNumber: fallbackNumber,
      label: null,
      mode: null,
      faderMode: null,
      htp: false,
      exclusive: false,
      background: false,
      restore: false,
      priority: null,
      timings: { ...defaultTimings }
    };
  }

  const container = raw as Record<string, unknown>;
  const source = isRecord(container.submaster)
    ? (container.submaster as Record<string, unknown>)
    : container;

  const flagsSource = isRecord(source.flags) ? (source.flags as Record<string, unknown>) : {};

  const submasterNumber =
    asFiniteInteger(source.submaster_number ?? source.sub_number ?? source.number ?? source.id) ?? fallbackNumber;

  const label = asString(source.label ?? source.name ?? source.title);
  const mode = asString(source.mode ?? source.type ?? source.submaster_mode ?? source.playback_mode);
  const faderMode = asString(source.fader_mode ?? source.faderMode ?? source.slider_mode ?? source.handle_mode);
  const priority =
    asFiniteNumber(source.priority ?? source.prio ?? source.priority_level ?? source.priorityValue ?? flagsSource.priority) ??
    null;

  const timings = normaliseTimings(
    source.timings ?? source.timing ?? source.fade ?? source.time ?? source.times ?? container.timings ?? container.timing
  );

  const htp = normaliseBoolean(
    source.htp ??
      flagsSource.htp ??
      flagsSource.high_takes_precedence ??
      flagsSource.hightakesprecedence ??
      flagsSource.mode === 'htp'
  );

  const exclusive = normaliseBoolean(
    source.exclusive ??
      flagsSource.exclusive ??
      flagsSource.exclusive_mode ??
      flagsSource.exclusiveFlag ??
      flagsSource.mode === 'exclusive'
  );

  const background = normaliseBoolean(
    source.background ??
      flagsSource.background ??
      flagsSource.background_enable ??
      flagsSource.backgrounded ??
      flagsSource.background_mode
  );

  const restore = normaliseBoolean(
    source.restore ??
      flagsSource.restore ??
      flagsSource.restore_enable ??
      flagsSource.restorable ??
      flagsSource.auto_restore
  );

  return {
    submasterNumber,
    label,
    mode,
    faderMode,
    htp,
    exclusive,
    background,
    restore,
    priority,
    timings
  };
}

/**
 * @tool eos_submaster_set_level
 * @summary Reglage de submaster
 * @description Ajuste le niveau d'un submaster sur une echelle de 0.0 a 1.0.
 * @arguments Voir docs/tools.md#eos-submaster-set-level pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-submaster-set-level pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-submaster-set-level pour un exemple OSC.
 */
export const eosSubmasterSetLevelTool: ToolDefinition<typeof setLevelInputSchema> = {
  name: 'eos_submaster_set_level',
  config: {
    title: 'Reglage de submaster',
    description: "Ajuste le niveau d'un submaster sur une echelle de 0.0 a 1.0.",
    inputSchema: setLevelInputSchema,
    annotations: annotate(`${oscMappings.submasters.base}/{id}`)
  },
  handler: async (args, _extra) => {
    const schema = z.object(setLevelInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const level = resolveLevelValue(options.level);
    const address = `${oscMappings.submasters.base}/${options.submaster_number}`;

    await client.sendMessage(address, buildFloatArgs(level), extractTargetOptions(options));

    return createResult(`Niveau du submaster ${options.submaster_number} regle a ${Math.round(level * 100)}%`, {
      action: 'submaster_set_level',
      submaster_number: options.submaster_number,
      level,
      osc: {
        address,
        args: level
      }
    });
  }
};

/**
 * @tool eos_submaster_bump
 * @summary Commande de bump
 * @description Active ou desactive le bump d'un submaster.
 * @arguments Voir docs/tools.md#eos-submaster-bump pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-submaster-bump pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-submaster-bump pour un exemple OSC.
 */
export const eosSubmasterBumpTool: ToolDefinition<typeof bumpInputSchema> = {
  name: 'eos_submaster_bump',
  config: {
    title: 'Commande de bump',
    description: "Active ou desactive le bump d'un submaster.",
    inputSchema: bumpInputSchema,
    annotations: annotate(`${oscMappings.submasters.base}/{id}/bump`)
  },
  handler: async (args, _extra) => {
    const schema = z.object(bumpInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const state = resolveBumpState(options.state);
    const address = `${oscMappings.submasters.base}/${options.submaster_number}/bump`;
    const value = state ? 1 : 0;

    await client.sendMessage(address, buildFloatArgs(value), extractTargetOptions(options));

    return createResult(`Bump du submaster ${options.submaster_number} ${state ? 'active' : 'desactive'}`, {
      action: 'submaster_bump',
      submaster_number: options.submaster_number,
      state,
      osc: {
        address,
        args: value
      }
    });
  }
};

/**
 * @tool eos_submaster_get_info
 * @summary Informations sur un submaster
 * @description Recupere et normalise les informations d'un submaster.
 * @arguments Voir docs/tools.md#eos-submaster-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-submaster-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-submaster-get-info pour un exemple OSC.
 */
export const eosSubmasterGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_submaster_get_info',
  config: {
    title: 'Informations sur un submaster',
    description: "Recupere et normalise les informations d'un submaster.",
    inputSchema: getInfoInputSchema,
    outputSchema: {
      submaster: z.object({
        submasterNumber: z.number(),
        label: z.string().nullable(),
        mode: z.string().nullable(),
        faderMode: z.string().nullable(),
        htp: z.boolean(),
        exclusive: z.boolean(),
        background: z.boolean(),
        restore: z.boolean(),
        priority: z.number().nullable(),
        timings: z.object({
          up: z.number().nullable(),
          down: z.number().nullable(),
          assert: z.number().nullable(),
          release: z.number().nullable()
        })
      })
    },
    annotations: annotate(oscMappings.submasters.info)
  },
  handler: async (args, _extra) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = { submaster: options.submaster_number };
    const cacheKey = createCacheKey({
      address: oscMappings.submasters.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'submasters',
      key: cacheKey,
      tags: [
        createResourceTag('submasters'),
        createResourceTag('submasters', String(options.submaster_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(oscMappings.submasters.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const info = normaliseSubmasterInfo(
          (response.data as Record<string, unknown> | null)?.submaster ?? response.data,
          options.submaster_number
        );

        const text =
          response.status === 'ok'
            ? `Informations recues pour le submaster ${info.submasterNumber}.`
            : `Lecture des informations du submaster ${info.submasterNumber} terminee avec le statut ${response.status}.`;

        return createResult(text, {
          action: 'submaster_get_info',
          status: response.status,
          request: payload,
          submaster: info,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: oscMappings.submasters.info,
            args: payload
          }
        });
      }
    });
  }
};

const submasterTools = [
  eosSubmasterSetLevelTool,
  eosSubmasterBumpTool,
  eosSubmasterGetInfoTool
];

export default submasterTools;
