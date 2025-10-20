import { z, type ZodRawShape } from 'zod';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import type { OscMessageArgument } from '../../services/osc/index';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const timeoutSchema = z.number().int().min(50).optional();

const channelNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(99999)
  .describe('Numero de canal (1-99999).');

const partNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(99)
  .describe('Numero de partie (1-99).');

const partNumberWithAllSchema = z
  .number()
  .int()
  .min(0)
  .max(99)
  .describe('Numero de partie (0 = toutes les parties, 1-99).');

interface PatchChannelTextFields {
  text1: string | null;
  text2: string | null;
  text3: string | null;
  text4: string | null;
  text5: string | null;
  text6: string | null;
  text7: string | null;
  text8: string | null;
  text9: string | null;
  text10: string | null;
}

const TEXT_KEYS = [
  'text1',
  'text2',
  'text3',
  'text4',
  'text5',
  'text6',
  'text7',
  'text8',
  'text9',
  'text10'
] as const satisfies readonly (keyof PatchChannelTextFields)[];

type PatchChannelTextKey = (typeof TEXT_KEYS)[number];

interface PatchChannelPartInfo {
  part_number: number;
  label: string | null;
  manufacturer: string | null;
  model: string | null;
  dmx_address: string | null;
  gel: string | null;
  text: PatchChannelTextFields;
  notes: string | null;
}

interface PatchChannelInfo {
  channel_number: number;
  label: string | null;
  part_count: number | null;
  notes: string | null;
  parts: PatchChannelPartInfo[];
}

interface Augment3dVector3 {
  x: number | null;
  y: number | null;
  z: number | null;
}

interface Augment3dPositionInfo {
  channel_number: number;
  part_number: number;
  position: Augment3dVector3;
  orientation: Augment3dVector3;
  fpe_set: number | null;
}

interface Augment3dBeamInfo {
  channel_number: number;
  part_number: number;
  beam_angle: number | null;
  gel_color: string | null;
  shutters: Record<string, number | null>;
  gobo: string | null;
  gobo_rotation: number | null;
  hide_beam: boolean | null;
}

const patchChannelTextOutputShape = {
  text1: z.string().nullable(),
  text2: z.string().nullable(),
  text3: z.string().nullable(),
  text4: z.string().nullable(),
  text5: z.string().nullable(),
  text6: z.string().nullable(),
  text7: z.string().nullable(),
  text8: z.string().nullable(),
  text9: z.string().nullable(),
  text10: z.string().nullable()
} satisfies ZodRawShape;

const patchChannelPartOutputShape = {
  part_number: partNumberSchema,
  label: z.string().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  dmx_address: z.string().nullable(),
  gel: z.string().nullable(),
  text: z.object(patchChannelTextOutputShape),
  notes: z.string().nullable()
} satisfies ZodRawShape;

const patchChannelInfoOutputShape = {
  channel_number: channelNumberSchema,
  label: z.string().nullable(),
  part_count: z.number().int().min(0).nullable(),
  notes: z.string().nullable(),
  parts: z.array(z.object(patchChannelPartOutputShape))
} satisfies ZodRawShape;

const augment3dVectorOutputShape = {
  x: z.number().nullable(),
  y: z.number().nullable(),
  z: z.number().nullable()
} satisfies ZodRawShape;

const augment3dPositionOutputShape = {
  channel_number: channelNumberSchema,
  part_number: partNumberSchema,
  position: z.object(augment3dVectorOutputShape),
  orientation: z.object(augment3dVectorOutputShape),
  fpe_set: z.number().int().min(0).nullable()
} satisfies ZodRawShape;

const augment3dBeamOutputShape = {
  channel_number: channelNumberSchema,
  part_number: partNumberSchema,
  beam_angle: z.number().nullable(),
  gel_color: z.string().nullable(),
  shutters: z.record(z.string(), z.number().nullable()),
  gobo: z.string().nullable(),
  gobo_rotation: z.number().nullable(),
  hide_beam: z.boolean().nullable()
} satisfies ZodRawShape;

const patchChannelTextOutputSchema = z.object(patchChannelTextOutputShape);
const patchChannelPartOutputSchema = z.object(patchChannelPartOutputShape);
const patchChannelInfoOutputSchema = z.object(patchChannelInfoOutputShape);
const augment3dVectorOutputSchema = z.object(augment3dVectorOutputShape);
const augment3dPositionOutputSchema = z.object(augment3dPositionOutputShape);
const augment3dBeamOutputSchema = z.object(augment3dBeamOutputShape);

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

function createResult(text: string, data: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [
      { type: 'text', text },
      { type: 'object', data }
    ]
  } as ToolExecutionResult;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalised = trimmed.replace(',', '.');
    const parsed = Number.parseFloat(normalised);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asFiniteInteger(value: unknown): number | null {
  const numeric = asFiniteNumber(value);
  return numeric == null ? null : Math.trunc(numeric);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (!lowered) {
      return null;
    }
    if (['1', 'true', 'yes', 'on'].includes(lowered)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(lowered)) {
      return false;
    }
  }

  return null;
}

function normaliseDmxAddress(value: unknown): string | null {
  const asString = asNonEmptyString(value);
  if (asString) {
    return asString;
  }

  if (typeof value === 'object' && value) {
    const data = value as Record<string, unknown>;
    const universe = asFiniteInteger(data.universe ?? data.univ ?? data.u ?? data.net);
    const address = asFiniteInteger(data.address ?? data.addr ?? data.channel ?? data.dmx);
    if (universe != null && address != null) {
      const padded = address.toString().padStart(3, '0');
      return `${universe}/${padded}`;
    }
  }

  return null;
}

function textKeyFromIndex(index: number): PatchChannelTextKey | null {
  return TEXT_KEYS[index - 1] ?? null;
}

function toPositiveInteger(value: number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return null;
}

function extractTexts(raw: Record<string, unknown> | undefined): PatchChannelTextFields {
  const values = new Map<PatchChannelTextKey, string>();

  const source = raw ?? {};
  const candidate = source.texts ?? source.text ?? source.text_fields ?? source.notes;

  if (Array.isArray(candidate)) {
    candidate.forEach((value, index) => {
      const key = TEXT_KEYS[index];
      if (!key) {
        return;
      }
      const text = asNonEmptyString(value);
      if (text != null) {
        values.set(key, text);
      }
    });
  } else if (candidate && typeof candidate === 'object') {
    for (const [key, value] of Object.entries(candidate)) {
      const match = key.match(/(\d+)/);
      if (match) {
        const index = Number.parseInt(match[1] ?? '', 10);
        if (Number.isFinite(index)) {
          const mappedKey = textKeyFromIndex(index);
          if (mappedKey) {
            const text = asNonEmptyString(value);
            if (text != null) {
              values.set(mappedKey, text);
            }
          }
        }
      }
    }
  }

  TEXT_KEYS.forEach((key, position) => {
    const index = position + 1;
    const aliases = [
      `text_${index}`,
      `text${index}`,
      `text_${index.toString().padStart(2, '0')}`,
      `text${index.toString().padStart(2, '0')}`,
      `note_${index}`,
      `note${index}`
    ];

    for (const alias of aliases) {
      if (!values.has(key) && source[alias] != null) {
        const text = asNonEmptyString(source[alias]);
        if (text != null) {
          values.set(key, text);
        }
      }
    }
  });

  const result: PatchChannelTextFields = {
    text1: null,
    text2: null,
    text3: null,
    text4: null,
    text5: null,
    text6: null,
    text7: null,
    text8: null,
    text9: null,
    text10: null
  };

  values.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function mergeTexts(base: PatchChannelTextFields, override: PatchChannelTextFields): PatchChannelTextFields {
  const merged: PatchChannelTextFields = { ...base };
  TEXT_KEYS.forEach((key) => {
    if (override[key] != null) {
      merged[key] = override[key];
    }
  });
  return merged;
}

interface PartNormalisationContext {
  fallbackPartNumber: number | null;
  fallbackData: PatchChannelPartInfo;
  index: number;
}

function normaliseChannelPart(raw: unknown, context: PartNormalisationContext): PatchChannelPartInfo {
  const base = context.fallbackData;
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      part_number: context.fallbackPartNumber ?? base.part_number ?? context.index + 1,
      text: { ...base.text }
    };
  }

  const data = raw as Record<string, unknown>;
  const candidatePartNumber = toPositiveInteger(
    asFiniteInteger(data.part_number ?? data.part ?? data.partNumber ?? data.number)
  );
  const fallbackPartNumber = toPositiveInteger(context.fallbackPartNumber);
  const basePartNumber = toPositiveInteger(base.part_number);
  const partNumber = candidatePartNumber ?? fallbackPartNumber ?? basePartNumber ?? context.index + 1;

  const extractedTexts = extractTexts(data);
  const mergedTexts = mergeTexts(base.text, extractedTexts);

  const part: PatchChannelPartInfo = {
    part_number: partNumber,
    label: asNonEmptyString(data.label ?? data.name ?? data.fixture_label) ?? base.label,
    manufacturer: asNonEmptyString(data.manufacturer ?? data.mfg ?? data.brand ?? data.make) ?? base.manufacturer,
    model: asNonEmptyString(data.model ?? data.fixture ?? data.type ?? data.mode) ?? base.model,
    dmx_address:
      normaliseDmxAddress(
        data.dmx_address ?? data.address ?? data.addr ?? data.dmx ?? data.patch ?? data.patch_address
      ) ?? base.dmx_address,
    gel: asNonEmptyString(data.gel ?? data.color ?? data.filter ?? data.gel_color) ?? base.gel,
    text: mergedTexts,
    notes: asNonEmptyString(data.notes ?? data.note ?? data.comment) ?? null
  };

  return part;
}

function normaliseChannelInfo(
  raw: unknown,
  channelNumber: number,
  requestedPartNumber: number | null
): PatchChannelInfo {
  const baseInfo: PatchChannelInfo = {
    channel_number: channelNumber,
    label: null,
    part_count: null,
    notes: null,
    parts: []
  };

  if (!raw || typeof raw !== 'object') {
    const fallbackPart: PatchChannelPartInfo = {
      part_number: requestedPartNumber && requestedPartNumber > 0 ? requestedPartNumber : 1,
      label: null,
      manufacturer: null,
      model: null,
      dmx_address: null,
      gel: null,
      text: extractTexts(undefined),
      notes: null
    };
    return {
      ...baseInfo,
      parts: [fallbackPart]
    };
  }

  const data = raw as Record<string, unknown>;

  const rawFallbackPartNumber = asFiniteInteger(data.part_number ?? data.part ?? data.partNumber);
  const fallbackPartNumber = toPositiveInteger(rawFallbackPartNumber);
  const requestedPart = requestedPartNumber && requestedPartNumber > 0 ? requestedPartNumber : null;
  const basePartTexts = extractTexts(data);
  const fallbackPart: PatchChannelPartInfo = {
    part_number: requestedPart ?? fallbackPartNumber ?? 1,
    label: asNonEmptyString(data.label ?? data.channel_label ?? data.name ?? data.fixture_label) ?? null,
    manufacturer: asNonEmptyString(data.manufacturer ?? data.mfg ?? data.brand ?? data.make) ?? null,
    model: asNonEmptyString(data.model ?? data.fixture ?? data.type ?? data.mode) ?? null,
    dmx_address:
      normaliseDmxAddress(
        data.dmx_address ?? data.address ?? data.addr ?? data.dmx ?? data.patch ?? data.patch_address
      ) ?? null,
    gel: asNonEmptyString(data.gel ?? data.color ?? data.filter ?? data.gel_color) ?? null,
    text: basePartTexts,
    notes: asNonEmptyString(data.notes ?? data.note ?? data.comment) ?? null
  };

  const partsRaw =
    data.parts ??
    data.channel_parts ??
    data.part ??
    data.channel_part ??
    (Array.isArray(data) ? data : undefined);

  const partArray = Array.isArray(partsRaw)
    ? partsRaw
    : partsRaw != null
      ? [partsRaw]
      : [];

  const parts = partArray.map((item, index) =>
    normaliseChannelPart(item, {
      fallbackPartNumber: fallbackPartNumber ?? requestedPart ?? null,
      fallbackData: fallbackPart,
      index
    })
  );

  if (parts.length === 0) {
    parts.push(
      normaliseChannelPart(data, {
        fallbackPartNumber: fallbackPartNumber ?? requestedPart ?? null,
        fallbackData: fallbackPart,
        index: 0
      })
    );
  }

  const info: PatchChannelInfo = {
    channel_number:
      asFiniteInteger(data.channel_number ?? data.channel ?? data.chan ?? data.number) ?? channelNumber,
    label:
      asNonEmptyString(data.label ?? data.channel_label ?? data.name ?? data.fixture_label) ??
      parts[0]?.label ??
      null,
    part_count:
      asFiniteInteger(data.part_count ?? data.parts ?? data.total_parts ?? data.count) ?? parts.length ?? null,
    notes: asNonEmptyString(data.notes ?? data.note ?? data.comment ?? data.channel_notes) ?? fallbackPart.notes,
    parts
  };

  if (info.part_count != null && info.part_count < parts.length) {
    info.part_count = parts.length;
  }

  return info;
}

function normaliseVector(raw: unknown): Augment3dVector3 {
  if (Array.isArray(raw)) {
    return {
      x: asFiniteNumber(raw[0] ?? null),
      y: asFiniteNumber(raw[1] ?? null),
      z: asFiniteNumber(raw[2] ?? null)
    };
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    return {
      x: asFiniteNumber(
        data.x ?? data.X ?? data.pos_x ?? data.position_x ?? data.pitch ?? data.horizontal ?? data.lon
      ),
      y: asFiniteNumber(
        data.y ?? data.Y ?? data.pos_y ?? data.position_y ?? data.yaw ?? data.vertical ?? data.lat
      ),
      z: asFiniteNumber(
        data.z ?? data.Z ?? data.pos_z ?? data.position_z ?? data.roll ?? data.depth ?? data.alt
      )
    };
  }

  return { x: null, y: null, z: null };
}

function normaliseAugment3dPosition(
  raw: unknown,
  channelNumber: number,
  partNumber: number
): Augment3dPositionInfo {
  if (!raw || typeof raw !== 'object') {
    return {
      channel_number: channelNumber,
      part_number: partNumber,
      position: { x: null, y: null, z: null },
      orientation: { x: null, y: null, z: null },
      fpe_set: null
    };
  }

  const data = raw as Record<string, unknown>;

  return {
    channel_number:
      asFiniteInteger(data.channel_number ?? data.channel ?? data.chan ?? data.number) ?? channelNumber,
    part_number: asFiniteInteger(data.part_number ?? data.part ?? data.partNumber) ?? partNumber,
    position: normaliseVector(data.position ?? data.pos ?? data.xyz ?? data.location ?? data.coordinates),
    orientation: normaliseVector(
      data.orientation ?? data.orient ?? data.rotation ?? data.rot ?? data.angles ?? data.direction
    ),
    fpe_set: asFiniteInteger(data.fpe_set ?? data.fpeSet ?? data.fpe ?? data.set ?? data.focus_point_editor)
  };
}

function normaliseShutterKey(key: string): string {
  return key
    .trim()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toLowerCase();
}

function normaliseShutters(raw: unknown): Record<string, number | null> {
  const shutters: Record<string, number | null> = {};

  if (Array.isArray(raw)) {
    raw.forEach((value, index) => {
      if (value && typeof value === 'object') {
        const data = value as Record<string, unknown>;
        const key =
          asNonEmptyString(data.blade ?? data.name ?? data.key ?? data.id ?? data.type) ?? `blade_${index + 1}`;
        const angle = asFiniteNumber(data.angle ?? data.value ?? data.position ?? data.rotation ?? data.size);
        shutters[normaliseShutterKey(key)] = angle;
      } else {
        shutters[`blade_${index + 1}`] = asFiniteNumber(value);
      }
    });
    return shutters;
  }

  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      if (value && typeof value === 'object') {
        const data = value as Record<string, unknown>;
        const angle = asFiniteNumber(data.angle ?? data.value ?? data.position ?? data.rotation ?? data.size);
        shutters[normaliseShutterKey(key)] = angle;
      } else {
        shutters[normaliseShutterKey(key)] = asFiniteNumber(value);
      }
    }
    return shutters;
  }

  return shutters;
}

function normaliseAugment3dBeam(
  raw: unknown,
  channelNumber: number,
  partNumber: number
): Augment3dBeamInfo {
  if (!raw || typeof raw !== 'object') {
    return {
      channel_number: channelNumber,
      part_number: partNumber,
      beam_angle: null,
      gel_color: null,
      shutters: {},
      gobo: null,
      gobo_rotation: null,
      hide_beam: null
    };
  }

  const data = raw as Record<string, unknown>;

  return {
    channel_number:
      asFiniteInteger(data.channel_number ?? data.channel ?? data.chan ?? data.number) ?? channelNumber,
    part_number: asFiniteInteger(data.part_number ?? data.part ?? data.partNumber) ?? partNumber,
    beam_angle: asFiniteNumber(data.beam_angle ?? data.beamAngle ?? data.angle ?? data.beam),
    gel_color: asNonEmptyString(data.gel ?? data.gel_color ?? data.color ?? data.filter),
    shutters: normaliseShutters(data.shutters ?? data.shutter ?? data.blades ?? data.flags ?? data.iris),
    gobo: asNonEmptyString(data.gobo ?? data.pattern ?? data.template ?? data.gobo_pattern),
    gobo_rotation: asFiniteNumber(data.gobo_rotation ?? data.goboRotation ?? data.rotation ?? data.gobo_rot),
    hide_beam: asBoolean(data.hide_beam ?? data.hideBeam ?? data.hidden ?? data.hide)
  };
}

const channelInfoInputSchema = {
  channel_number: channelNumberSchema,
  part_number: partNumberWithAllSchema.optional(),
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const augment3dInputSchema = {
  channel_number: channelNumberSchema,
  part_number: partNumberSchema,
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_patch_get_channel_info
 * @summary Informations de patch
 * @description Recupere les informations de patch pour un canal donne.
 * @arguments Voir docs/tools.md#eos-patch-get-channel-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-patch-get-channel-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-patch-get-channel-info pour un exemple OSC.
 */
export const eosPatchGetChannelInfoTool: ToolDefinition<typeof channelInfoInputSchema> = {
  name: 'eos_patch_get_channel_info',
  config: {
    title: 'Informations de patch',
    description: 'Recupere les informations de patch pour un canal donne.',
    inputSchema: channelInfoInputSchema,
    outputSchema: patchChannelInfoOutputShape,
    annotations: annotate(oscMappings.patch.channelInfo)
  },
  handler: async (args, _extra) => {
    const schema = z.object(channelInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      channel: options.channel_number,
      part: options.part_number ?? 0
    };

    const response: OscJsonResponse = await client.requestJson(oscMappings.patch.channelInfo, {
      payload,
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    const channelData = normaliseChannelInfo(
      (response.data as Record<string, unknown> | null)?.channel ?? response.data,
      options.channel_number,
      options.part_number ?? null
    );

    const validatedChannel = patchChannelInfoOutputSchema.parse(channelData);

    const baseText =
      response.status === 'ok'
        ? `Informations recues pour le canal ${validatedChannel.channel_number}.`
        : `Lecture des informations du canal ${validatedChannel.channel_number} terminee avec le statut ${response.status}.`;

    return createResult(baseText, {
      status: response.status,
      channel: validatedChannel,
      osc: {
        address: oscMappings.patch.channelInfo,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_patch_get_augment3d_position
 * @summary Position Augment3d
 * @description Recupere la position Augment3d d'une partie de canal.
 * @arguments Voir docs/tools.md#eos-patch-get-augment3d-position pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-patch-get-augment3d-position pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-patch-get-augment3d-position pour un exemple OSC.
 */
export const eosPatchGetAugment3dPositionTool: ToolDefinition<typeof augment3dInputSchema> = {
  name: 'eos_patch_get_augment3d_position',
  config: {
    title: 'Position Augment3d',
    description: "Recupere la position Augment3d d'une partie de canal.",
    inputSchema: augment3dInputSchema,
    outputSchema: augment3dPositionOutputShape,
    annotations: annotate(oscMappings.patch.augment3dPosition)
  },
  handler: async (args, _extra) => {
    const schema = z.object(augment3dInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      channel: options.channel_number,
      part: options.part_number
    };

    const response: OscJsonResponse = await client.requestJson(oscMappings.patch.augment3dPosition, {
      payload,
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    const positionData = normaliseAugment3dPosition(
      (response.data as Record<string, unknown> | null)?.augment3d ?? response.data,
      options.channel_number,
      options.part_number
    );

    const validatedPosition = augment3dPositionOutputSchema.parse(positionData);

    const baseText =
      response.status === 'ok'
        ? `Position Augment3d recue pour le canal ${validatedPosition.channel_number} partie ${validatedPosition.part_number}.`
        : `Lecture de la position Augment3d du canal ${validatedPosition.channel_number} partie ${validatedPosition.part_number} terminee avec le statut ${response.status}.`;

    return createResult(baseText, {
      status: response.status,
      augment3d: validatedPosition,
      osc: {
        address: oscMappings.patch.augment3dPosition,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_patch_get_augment3d_beam
 * @summary Faisceau Augment3d
 * @description Recupere les informations de faisceau Augment3d pour une partie de canal.
 * @arguments Voir docs/tools.md#eos-patch-get-augment3d-beam pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-patch-get-augment3d-beam pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-patch-get-augment3d-beam pour un exemple OSC.
 */
export const eosPatchGetAugment3dBeamTool: ToolDefinition<typeof augment3dInputSchema> = {
  name: 'eos_patch_get_augment3d_beam',
  config: {
    title: 'Faisceau Augment3d',
    description: 'Recupere les informations de faisceau Augment3d pour une partie de canal.',
    inputSchema: augment3dInputSchema,
    outputSchema: augment3dBeamOutputShape,
    annotations: annotate(oscMappings.patch.augment3dBeam)
  },
  handler: async (args, _extra) => {
    const schema = z.object(augment3dInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      channel: options.channel_number,
      part: options.part_number
    };

    const response: OscJsonResponse = await client.requestJson(oscMappings.patch.augment3dBeam, {
      payload,
      timeoutMs: options.timeoutMs,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });

    const beamData = normaliseAugment3dBeam(
      (response.data as Record<string, unknown> | null)?.augment3d ?? response.data,
      options.channel_number,
      options.part_number
    );

    const validatedBeam = augment3dBeamOutputSchema.parse(beamData);

    const baseText =
      response.status === 'ok'
        ? `Faisceau Augment3d recu pour le canal ${validatedBeam.channel_number} partie ${validatedBeam.part_number}.`
        : `Lecture du faisceau Augment3d du canal ${validatedBeam.channel_number} partie ${validatedBeam.part_number} terminee avec le statut ${response.status}.`;

    return createResult(baseText, {
      status: response.status,
      augment3d: validatedBeam,
      osc: {
        address: oscMappings.patch.augment3dBeam,
        args: payload
      }
    });
  }
};

const patchTools = [
  eosPatchGetChannelInfoTool,
  eosPatchGetAugment3dPositionTool,
  eosPatchGetAugment3dBeamTool
];

export default patchTools;
