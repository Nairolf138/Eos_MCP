import { z, type ZodRawShape } from 'zod';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const numericInputSchema = z.union([z.number(), z.string().min(1)]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value);
}

function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function parseNumeric(value: unknown): { value: number; hadPercent: boolean } | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return { value, hadPercent: false };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    let hadPercent = false;
    let cleaned = trimmed;

    if (cleaned.endsWith('%')) {
      hadPercent = true;
      cleaned = cleaned.slice(0, -1);
    }

    cleaned = cleaned.replace(/,/g, '.');
    cleaned = cleaned.replace(/\u00b0|deg|degrees/gi, '');
    cleaned = cleaned.replace(/[^0-9.+-]/g, '');

    if (cleaned.length === 0) {
      return null;
    }

    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return { value: parsed, hadPercent };
  }

  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseTicks(value: unknown): number {
  const numeric = parseNumeric(value);
  if (numeric == null) {
    throw new Error('Impossible de normaliser le nombre de ticks.');
  }

  return Math.round(numeric.value);
}

function normaliseRate(value: unknown): number {
  const numeric = parseNumeric(value);
  if (numeric == null) {
    throw new Error("Impossible d'interpreter le taux continue.");
  }

  let rate = numeric.value;

  const shouldConvertToPercent =
    numeric.hadPercent ||
    (Math.abs(rate) > 1 && Math.abs(rate) <= 100 && Number.isInteger(rate));

  if (shouldConvertToPercent) {
    rate /= 100;
  }

  rate = clamp(rate, -1, 1);
  return roundTo(rate, 3);
}

function normaliseHue(value: unknown): number {
  const numeric = parseNumeric(value);
  if (numeric == null) {
    throw new Error("Impossible d'interpreter la teinte (hue).");
  }

  const hue = clamp(numeric.value, 0, 360);
  return roundTo(hue, 2);
}

function normalisePercentage(value: unknown, label: string): number {
  const numeric = parseNumeric(value);
  if (numeric == null) {
    throw new Error(`Impossible d'interpreter ${label}.`);
  }

  let resolved = numeric.value;
  const shouldConvertToPercent =
    numeric.hadPercent || (resolved > 1 && resolved <= 100 && Number.isInteger(resolved));

  if (shouldConvertToPercent) {
    resolved /= 100;
  }

  resolved = clamp(resolved, 0, 1);
  return roundTo(resolved, 4);
}

function normaliseCoordinate(value: unknown, label: string): number {
  const numeric = parseNumeric(value);
  if (numeric == null) {
    throw new Error(`Impossible d'interpreter la coordonnee ${label}.`);
  }

  return roundTo(numeric.value, 3);
}

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function annotate(osc: string): Record<string, unknown> {
  return {
    mapping: {
      osc
    }
  };
}

function normaliseParameterName(name: unknown): string {
  if (typeof name !== 'string') {
    throw new Error("Le nom du parametre doit etre une chaine de caracteres.");
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Le nom du parametre ne peut pas etre vide.');
  }

  return trimmed;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

interface ActiveWheelInfo {
  wheelIndex: number;
  parameter: string;
  label: string | null;
  display: string | null;
  rawValue: number | null;
  coarseValue: number | null;
  fineValue: number | null;
  units: string | null;
}

function parseWheelNumeric(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (key in source) {
      const numeric = parseNumeric(source[key]);
      if (numeric) {
        const base = numeric.hadPercent ? numeric.value / 100 : numeric.value;
        if (Number.isFinite(base)) {
          return roundTo(base, 4);
        }
      }
    }
  }
  return null;
}

function parseWheelIndex(source: Record<string, unknown>): number | null {
  const numeric = parseWheelNumeric(source, ['wheel', 'wheel_index', 'index', 'slot', 'id', 'encoder']);
  return numeric != null ? Math.trunc(numeric) : null;
}

function parseWheelParameter(source: Record<string, unknown>): string | null {
  const candidates = ['parameter', 'parameter_name', 'name', 'param'];
  for (const key of candidates) {
    if (key in source) {
      const value = toStringOrNull(source[key]);
      if (value) {
        return value;
      }
    }
  }
  return null;
}

function normaliseActiveWheel(raw: unknown): ActiveWheelInfo | null {
  if (!isRecord(raw)) {
    return null;
  }

  const wheelIndex = parseWheelIndex(raw);
  const parameter = parseWheelParameter(raw);

  if (wheelIndex == null || parameter == null) {
    return null;
  }

  const label =
    toStringOrNull(raw.label) ??
    toStringOrNull(raw.display_label) ??
    toStringOrNull(raw.parameter_label) ??
    null;

  const display =
    toStringOrNull(raw.display) ??
    toStringOrNull(raw.display_value) ??
    toStringOrNull(raw.displayValue) ??
    null;

  const units =
    toStringOrNull(raw.unit) ??
    toStringOrNull(raw.units) ??
    toStringOrNull(raw.display_units) ??
    null;

  const rawValue = parseWheelNumeric(raw, ['value', 'raw', 'raw_value', 'rawValue', 'percent']);
  const coarseValue = parseWheelNumeric(raw, ['coarse', 'coarse_value', 'coarseValue']);
  const fineValue = parseWheelNumeric(raw, ['fine', 'fine_value', 'fineValue']);

  return {
    wheelIndex,
    parameter,
    label,
    display,
    units,
    rawValue,
    coarseValue,
    fineValue
  };
}

function extractActiveWheels(payload: unknown): ActiveWheelInfo[] {
  if (!isRecord(payload)) {
    return [];
  }

  const sourceList = Array.isArray(payload.wheels)
    ? payload.wheels
    : Array.isArray(payload.parameters)
      ? payload.parameters
      : [];

  return sourceList
    .map((item) => normaliseActiveWheel(item))
    .filter((item): item is ActiveWheelInfo => item != null)
    .sort((a, b) => a.wheelIndex - b.wheelIndex);
}

const wheelTickInputSchema = {
  parameter_name: z.string().min(1),
  ticks: numericInputSchema,
  mode: z.enum(['coarse', 'fine']).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

const wheelRateInputSchema = {
  parameter_name: z.string().min(1),
  rate: numericInputSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const colorHsInputSchema = {
  hue: numericInputSchema,
  saturation: numericInputSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const colorRgbInputSchema = {
  red: numericInputSchema,
  green: numericInputSchema,
  blue: numericInputSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const panTiltInputSchema = {
  x: numericInputSchema,
  y: numericInputSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const xyzInputSchema = {
  x: numericInputSchema,
  y: numericInputSchema,
  z: numericInputSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getActiveWheelsSchema = {
  timeoutMs: z.coerce.number().int().min(50).optional(),
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_wheel_tick
 * @summary Rotation d'encodeur
 * @description Simule une rotation d'encodeur pour un parametre donne.
 * @arguments Voir docs/tools.md#eos-wheel-tick pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-wheel-tick pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-wheel-tick pour un exemple OSC.
 */
export const eosWheelTickTool: ToolDefinition<typeof wheelTickInputSchema> = {
  name: 'eos_wheel_tick',
  config: {
    title: "Rotation d'encodeur",
    description: "Simule une rotation d'encodeur pour un parametre donne.",
    inputSchema: wheelTickInputSchema,
    annotations: annotate(oscMappings.parameters.wheelTick)
  },
  handler: async (args, _extra) => {
    const schema = z.object(wheelTickInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const parameter = normaliseParameterName(options.parameter_name);
    const ticks = normaliseTicks(options.ticks);
    const mode = options.mode ?? 'coarse';

    const payload = {
      parameter,
      ticks,
      mode
    };

    await client.sendMessage(
      oscMappings.parameters.wheelTick,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createResult(`Rotation ${mode} de ${ticks} ticks sur ${parameter}`, {
      parameter,
      ticks,
      mode,
      osc: {
        address: oscMappings.parameters.wheelTick,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_switch_continuous
 * @summary Mouvement continu
 * @description Active un mouvement continu d'encodeur sur un parametre.
 * @arguments Voir docs/tools.md#eos-switch-continuous pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-switch-continuous pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-switch-continuous pour un exemple OSC.
 */
export const eosWheelSwitchContinuousTool: ToolDefinition<typeof wheelRateInputSchema> = {
  name: 'eos_switch_continuous',
  config: {
    title: 'Mouvement continu',
    description: "Active un mouvement continu d'encodeur sur un parametre.",
    inputSchema: wheelRateInputSchema,
    annotations: annotate(oscMappings.parameters.wheelRate)
  },
  handler: async (args, _extra) => {
    const schema = z.object(wheelRateInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const parameter = normaliseParameterName(options.parameter_name);
    const rate = normaliseRate(options.rate);

    const payload = {
      parameter,
      rate
    };

    await client.sendMessage(
      oscMappings.parameters.wheelRate,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createResult(`Mouvement continu ${rate} sur ${parameter}`, {
      parameter,
      rate,
      osc: {
        address: oscMappings.parameters.wheelRate,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_set_color_hs
 * @summary Couleur HS
 * @description Definit une couleur via Hue/Saturation.
 * @arguments Voir docs/tools.md#eos-set-color-hs pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-set-color-hs pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-set-color-hs pour un exemple OSC.
 */
export const eosSetColorHsTool: ToolDefinition<typeof colorHsInputSchema> = {
  name: 'eos_set_color_hs',
  config: {
    title: 'Couleur HS',
    description: 'Definit une couleur via Hue/Saturation.',
    inputSchema: colorHsInputSchema,
    annotations: annotate(oscMappings.parameters.colorHs)
  },
  handler: async (args, _extra) => {
    const schema = z.object(colorHsInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = {
      hue: normaliseHue(options.hue),
      saturation: normalisePercentage(options.saturation, 'la saturation') * 100
    };

    await client.sendMessage(
      oscMappings.parameters.colorHs,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createResult(`Couleur HS definie (H=${payload.hue}°, S=${roundTo(payload.saturation, 2)}%)`, {
      hue: payload.hue,
      saturation: roundTo(payload.saturation, 2),
      osc: {
        address: oscMappings.parameters.colorHs,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_set_color_rgb
 * @summary Couleur RGB
 * @description Definit une couleur via valeurs RGB (0-1).
 * @arguments Voir docs/tools.md#eos-set-color-rgb pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-set-color-rgb pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-set-color-rgb pour un exemple OSC.
 */
export const eosSetColorRgbTool: ToolDefinition<typeof colorRgbInputSchema> = {
  name: 'eos_set_color_rgb',
  config: {
    title: 'Couleur RGB',
    description: 'Definit une couleur via valeurs RGB (0-1).',
    inputSchema: colorRgbInputSchema,
    annotations: annotate(oscMappings.parameters.colorRgb)
  },
  handler: async (args, _extra) => {
    const schema = z.object(colorRgbInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = {
      red: normalisePercentage(options.red, 'le rouge'),
      green: normalisePercentage(options.green, 'le vert'),
      blue: normalisePercentage(options.blue, 'le bleu')
    };

    await client.sendMessage(
      oscMappings.parameters.colorRgb,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createResult(`Couleur RGB definie (${payload.red}, ${payload.green}, ${payload.blue})`, {
      ...payload,
      osc: {
        address: oscMappings.parameters.colorRgb,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_set_pantilt_xy
 * @summary Position Pan/Tilt XY
 * @description Definit une position normalisee sur le plan XY (0-1).
 * @arguments Voir docs/tools.md#eos-set-pantilt-xy pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-set-pantilt-xy pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-set-pantilt-xy pour un exemple OSC.
 */
export const eosSetPanTiltXYTool: ToolDefinition<typeof panTiltInputSchema> = {
  name: 'eos_set_pantilt_xy',
  config: {
    title: 'Position Pan/Tilt XY',
    description: 'Definit une position normalisee sur le plan XY (0-1).',
    inputSchema: panTiltInputSchema,
    annotations: annotate(oscMappings.parameters.positionXY)
  },
  handler: async (args, _extra) => {
    const schema = z.object(panTiltInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = {
      x: normalisePercentage(options.x, 'x'),
      y: normalisePercentage(options.y, 'y')
    };

    await client.sendMessage(
      oscMappings.parameters.positionXY,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createResult(`Position XY definie (${payload.x}, ${payload.y})`, {
      ...payload,
      osc: {
        address: oscMappings.parameters.positionXY,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_set_xyz_position
 * @summary Position XYZ
 * @description Definit une position XYZ en metres.
 * @arguments Voir docs/tools.md#eos-set-xyz-position pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-set-xyz-position pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-set-xyz-position pour un exemple OSC.
 */
export const eosSetXYZPositionTool: ToolDefinition<typeof xyzInputSchema> = {
  name: 'eos_set_xyz_position',
  config: {
    title: 'Position XYZ',
    description: 'Definit une position XYZ en metres.',
    inputSchema: xyzInputSchema,
    annotations: annotate(oscMappings.parameters.positionXYZ)
  },
  handler: async (args, _extra) => {
    const schema = z.object(xyzInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = {
      x: normaliseCoordinate(options.x, 'x'),
      y: normaliseCoordinate(options.y, 'y'),
      z: normaliseCoordinate(options.z, 'z')
    };

    await client.sendMessage(
      oscMappings.parameters.positionXYZ,
      buildJsonArgs(payload),
      extractTargetOptions(options)
    );

    return createResult(`Position XYZ definie (${payload.x}, ${payload.y}, ${payload.z})`, {
      ...payload,
      osc: {
        address: oscMappings.parameters.positionXYZ,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_get_active_wheels
 * @summary Encodeurs actifs
 * @description Recupere et normalise la liste des encodeurs actifs.
 * @arguments Voir docs/tools.md#eos-get-active-wheels pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-get-active-wheels pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-get-active-wheels pour un exemple OSC.
 */
export const eosGetActiveWheelsTool: ToolDefinition<typeof getActiveWheelsSchema> = {
  name: 'eos_get_active_wheels',
  config: {
    title: 'Encodeurs actifs',
    description: 'Recupere et normalise la liste des encodeurs actifs.',
    inputSchema: getActiveWheelsSchema,
    annotations: annotate(oscMappings.parameters.activeWheels)
  },
  handler: async (args, _extra) => {
    const schema = z.object(getActiveWheelsSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const response: OscJsonResponse = await client.requestJson(oscMappings.parameters.activeWheels, {
      targetAddress: options.targetAddress,
      targetPort: options.targetPort,
      timeoutMs: options.timeoutMs
    });

    const wheels = extractActiveWheels(response.data);

    return createResult(`Encodeurs actifs (${wheels.length})`, {
      status: response.status,
      wheels,
      osc: {
        request: oscMappings.parameters.activeWheels,
        response: response.payload
      }
    });
  }
};

const parameterTools = [
  eosWheelTickTool,
  eosWheelSwitchContinuousTool,
  eosSetColorHsTool,
  eosSetColorRgbTool,
  eosSetPanTiltXYTool,
  eosSetXYZPositionTool,
  eosGetActiveWheelsTool
];

export default parameterTools;
