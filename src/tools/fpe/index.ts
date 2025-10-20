import { z, type ZodRawShape } from 'zod';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types.js';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const timeoutSchema = z.number().int().min(50).optional();

const setNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero de set FPE (1-9999).');

const pointNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero de point FPE (1-9999).');

const getSetCountInputSchema = {
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getSetInfoInputSchema = {
  set_number: setNumberSchema,
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getPointInfoInputSchema = {
  set_number: setNumberSchema,
  point_number: pointNumberSchema,
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

interface FpePosition {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface FpePointInfo {
  set_number: number;
  point_number: number;
  label: string | null;
  focus_palette_number: number | null;
  position: FpePosition;
}

export interface FpeSetInfo {
  set_number: number;
  label: string | null;
  point_count: number;
  points: FpePointInfo[];
}

function annotate(osc: string): Record<string, unknown> {
  return {
    mapping: {
      osc
    }
  };
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

function normalisePosition(raw: unknown): FpePosition {
  if (Array.isArray(raw)) {
    return {
      x: asFiniteNumber(raw[0] ?? null),
      y: asFiniteNumber(raw[1] ?? null),
      z: asFiniteNumber(raw[2] ?? null)
    };
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const xCandidate = data.x ?? data.X ?? data.lon ?? data.longitude ?? data.east_west ?? data.horizontal;
    const yCandidate = data.y ?? data.Y ?? data.lat ?? data.latitude ?? data.north_south ?? data.vertical;
    const zCandidate = data.z ?? data.Z ?? data.alt ?? data.altitude ?? data.height ?? data.depth;

    return {
      x: asFiniteNumber(xCandidate),
      y: asFiniteNumber(yCandidate),
      z: asFiniteNumber(zCandidate)
    };
  }

  if (typeof raw === 'number' || typeof raw === 'string') {
    const parsed = asFiniteNumber(raw);
    return {
      x: parsed,
      y: null,
      z: null
    };
  }

  return { x: null, y: null, z: null };
}

function normalisePoint(raw: unknown, fallbackSet: number, fallbackPoint: number): FpePointInfo {
  let setNumber = fallbackSet;
  let pointNumber = fallbackPoint;
  let label: string | null = null;
  let focusPaletteNumber: number | null = null;
  let position: FpePosition = { x: null, y: null, z: null };

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;

    const setCandidates = [data.set_number, data.set, data.setId, data.set_index, data.parent_set];
    for (const candidate of setCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        setNumber = parsed;
        break;
      }
    }

    const pointCandidates = [data.point_number, data.point, data.number, data.id, data.index];
    for (const candidate of pointCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        pointNumber = parsed;
        break;
      }
    }

    const labelCandidate =
      data.label ?? data.name ?? data.title ?? data.description ?? data.point_label ?? data.text;
    label = asString(labelCandidate);

    const focusPaletteCandidates = [
      data.focus_palette,
      data.focusPalette,
      data.focus_palette_number,
      data.focusPaletteNumber,
      data.fp,
      data.focus,
      data.palette
    ];
    for (const candidate of focusPaletteCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        focusPaletteNumber = parsed;
        break;
      }
    }

    const positionCandidates = [
      data.position,
      data.pos,
      data.xyz,
      data.coordinates,
      data.location,
      data.vector,
      Array.isArray(data) ? data : null,
      [data.x, data.y, data.z]
    ];
    for (const candidate of positionCandidates) {
      if (candidate != null) {
        position = normalisePosition(candidate);
        break;
      }
    }
  } else if (Array.isArray(raw)) {
    position = normalisePosition(raw);
  }

  return {
    set_number: setNumber,
    point_number: pointNumber,
    label,
    focus_palette_number: focusPaletteNumber,
    position
  };
}

function normalisePointCollection(raw: unknown, setNumber: number): FpePointInfo[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item, index) => normalisePoint(item, setNumber, index + 1))
      .filter((item) => item != null);
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;
    const entries = Object.entries(data);
    if (entries.length === 0) {
      return [];
    }

    return entries
      .map(([key, value], index) => {
        const fallbackPoint = parseInteger(key) ?? index + 1;
        return normalisePoint(value, setNumber, fallbackPoint);
      })
      .filter((item) => item != null);
  }

  return [];
}

function normaliseSet(raw: unknown, fallbackNumber: number): FpeSetInfo {
  let setNumber = fallbackNumber;
  let label: string | null = null;
  let pointCount = 0;
  let points: FpePointInfo[] = [];

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;

    const setCandidates = [data.set_number, data.set, data.number, data.id, data.index];
    for (const candidate of setCandidates) {
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        setNumber = parsed;
        break;
      }
    }

    const labelCandidate = data.label ?? data.name ?? data.title ?? data.description ?? data.set_label;
    label = asString(labelCandidate);

    const pointCountCandidates = [data.point_count, data.points, data.count, data.total_points, data.size];
    for (const candidate of pointCountCandidates) {
      if (Array.isArray(candidate)) {
        pointCount = candidate.length;
        break;
      }
      const parsed = parseInteger(candidate);
      if (parsed != null) {
        pointCount = parsed;
        break;
      }
    }

    const pointsCandidates = [data.points, data.point_list, data.items, data.point, data.data, data.entries];
    for (const candidate of pointsCandidates) {
      if (candidate != null) {
        points = normalisePointCollection(candidate, setNumber);
        break;
      }
    }
  }

  if (pointCount === 0) {
    pointCount = points.length;
  }

  return {
    set_number: setNumber,
    label,
    point_count: pointCount,
    points
  };
}

function collectCandidates(raw: unknown): unknown[] {
  const visited = new Set<unknown>();
  const queue: unknown[] = [];

  if (raw != null) {
    queue.push(raw);
  }

  const candidates: unknown[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null) {
      continue;
    }

    if (typeof current !== 'object') {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    candidates.push(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const data = current as Record<string, unknown>;
    for (const value of Object.values(data)) {
      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return candidates;
}

function findSetPayload(raw: unknown, setNumber: number): unknown | null {
  const candidates = collectCandidates(raw);
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const data = candidate as Record<string, unknown>;
      const setCandidates = [data.set_number, data.set, data.number, data.id, data.index];
      for (const setCandidate of setCandidates) {
        const parsed = parseInteger(setCandidate);
        if (parsed != null && parsed === setNumber) {
          return candidate;
        }
      }
    }
  }
  return null;
}

function findPointPayload(raw: unknown, setNumber: number, pointNumber: number): unknown | null {
  const candidates = collectCandidates(raw);
  let fallback: unknown | null = null;

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const data = candidate as Record<string, unknown>;
    const pointCandidates = [data.point_number, data.point, data.number, data.id, data.index];

    let pointMatch = false;
    for (const pointCandidate of pointCandidates) {
      const parsed = parseInteger(pointCandidate);
      if (parsed != null && parsed === pointNumber) {
        pointMatch = true;
        break;
      }
    }

    if (!pointMatch) {
      continue;
    }

    const setCandidates = [data.set_number, data.set, data.parent_set];
    let setMatch = false;
    let hasSetInfo = false;

    for (const setCandidate of setCandidates) {
      const parsed = parseInteger(setCandidate);
      if (parsed != null) {
        hasSetInfo = true;
        if (parsed === setNumber) {
          setMatch = true;
          break;
        }
      }
    }

    if (setMatch) {
      return candidate;
    }

    if (!hasSetInfo && fallback == null) {
      fallback = candidate;
    }
  }

  return fallback;
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

function containsSetNotFound(value: unknown, depth = 0): boolean {
  if (depth > 5 || value == null) {
    return false;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower.includes('set not found') || lower.includes('fpe set not found')) {
      return true;
    }
    return lower.includes('not found') && lower.includes('set');
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSetNotFound(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) =>
      containsSetNotFound(item, depth + 1)
    );
  }

  return false;
}

function buildSetCountResult(
  response: OscJsonResponse,
  payload: Record<string, unknown>,
  oscAddress: string
): ToolExecutionResult {
  let setCount = 0;

  if (response.data != null) {
    if (typeof response.data === 'number') {
      setCount = Math.max(0, Math.trunc(response.data));
    } else if (typeof response.data === 'string') {
      const parsed = parseInteger(response.data);
      setCount = parsed != null ? Math.max(0, parsed) : 0;
    } else if (typeof response.data === 'object') {
      const record = response.data as Record<string, unknown>;
      const countCandidates = [
        record.count,
        record.total,
        record.set_count,
        record.sets,
        record.items,
        record.total_sets
      ];
      for (const candidate of countCandidates) {
        if (Array.isArray(candidate)) {
          setCount = candidate.length;
          break;
        }
        const parsed = parseInteger(candidate);
        if (parsed != null) {
          setCount = parsed;
          break;
        }
      }
    }
  }

  const message = response.status === 'timeout'
    ? 'Lecture du nombre de sets FPE expiree.'
    : `Nombre de sets FPE: ${setCount}.`;

  return {
    content: [
      { type: 'text', text: message },
      {
        type: 'object',
        data: {
          action: 'get_set_count',
          status: response.status,
          set_count: setCount,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: oscAddress,
            args: payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

function buildSetInfoResult(
  response: OscJsonResponse,
  setNumber: number,
  payload: Record<string, unknown>,
  oscAddress: string
): ToolExecutionResult {
  const setPayload = findSetPayload(response.data, setNumber);
  const details = normaliseSet(setPayload ?? response.data, setNumber);
  const rawMessage =
    extractMessageCandidate(response.data) ??
    (typeof response.error === 'string' ? response.error : null);
  const setMissing = containsSetNotFound(response.data);

  let text: string;
  if (setMissing) {
    text = `Set FPE ${setNumber} introuvable.`;
  } else if (response.status === 'timeout') {
    text = `Lecture du set FPE ${setNumber} expiree.`;
  } else if (response.status === 'ok') {
    const labelPart = details.label ? `"${details.label}"` : 'sans label';
    const pointPart = details.point_count === 1 ? '1 point' : `${details.point_count} points`;
    text = `Set FPE ${details.set_number} ${labelPart} - ${pointPart}.`;
  } else {
    text = `Lecture du set FPE ${setNumber} terminee avec le statut ${response.status}.`;
  }

  return {
    content: [
      { type: 'text', text },
      {
        type: 'object',
        data: {
          action: 'get_set_info',
          status: response.status,
          set_number: setNumber,
          set: details,
          data: response.data,
          error: rawMessage,
          osc: {
            address: oscAddress,
            args: payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
}

function buildPointInfoResult(
  response: OscJsonResponse,
  setNumber: number,
  pointNumber: number,
  payload: Record<string, unknown>,
  oscAddress: string
): ToolExecutionResult {
  const setPayload = findSetPayload(response.data, setNumber);
  const setInfo = normaliseSet(setPayload ?? response.data, setNumber);
  const pointPayload =
    findPointPayload(response.data, setNumber, pointNumber) ??
    (setPayload ? findPointPayload(setPayload, setNumber, pointNumber) : null);
  let pointInfo = normalisePoint(pointPayload ?? response.data, setNumber, pointNumber);

  if (!pointPayload) {
    const fallback = setInfo.points.find((point) => point.point_number === pointNumber);
    if (fallback) {
      pointInfo = fallback;
    }
  }

  const rawMessage =
    extractMessageCandidate(response.data) ??
    (typeof response.error === 'string' ? response.error : null);
  const setMissing = containsSetNotFound(response.data);

  let text: string;
  if (setMissing) {
    text = `Set FPE ${setNumber} introuvable.`;
  } else if (response.status === 'timeout') {
    text = `Lecture du point FPE ${setNumber}.${pointNumber} expiree.`;
  } else if (response.status === 'ok') {
    const labelPart = pointInfo.label ? `"${pointInfo.label}"` : 'sans label';
    const fpPart =
      pointInfo.focus_palette_number != null
        ? ` - Palette focus ${pointInfo.focus_palette_number}`
        : '';
    const position = pointInfo.position;
    const posPart =
      position.x != null || position.y != null || position.z != null
        ? ` - Position (${position.x ?? '∅'}, ${position.y ?? '∅'}, ${position.z ?? '∅'})`
        : '';
    text = `Point FPE ${pointInfo.set_number}.${pointInfo.point_number} ${labelPart}${fpPart}${posPart}.`;
  } else {
    text = `Lecture du point FPE ${setNumber}.${pointNumber} terminee avec le statut ${response.status}.`;
  }

  return {
    content: [
      { type: 'text', text },
      {
        type: 'object',
        data: {
          action: 'get_point_info',
          status: response.status,
          set_number: setNumber,
          point_number: pointNumber,
          point: pointInfo,
          set: setInfo,
          data: response.data,
          error: rawMessage,
          osc: {
            address: oscAddress,
            args: payload
          }
        }
      }
    ]
  } as ToolExecutionResult;
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

/**
 * @tool eos_fpe_get_set_count
 * @summary Compter les sets FPE
 * @description Recupere le nombre total de sets Focus Palette Encoder.
 * @arguments Voir docs/tools.md#eos-fpe-get-set-count pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fpe-get-set-count pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fpe-get-set-count pour un exemple OSC.
 */
export const eosFpeGetSetCountTool: ToolDefinition<typeof getSetCountInputSchema> = {
  name: 'eos_fpe_get_set_count',
  config: {
    title: 'Compter les sets FPE',
    description: 'Recupere le nombre total de sets Focus Palette Encoder.',
    inputSchema: getSetCountInputSchema,
    annotations: annotate(oscMappings.fpe.getSetCount)
  },
  handler: async (args) => {
    const schema = z.object(getSetCountInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const response = await client.requestJson(oscMappings.fpe.getSetCount, {
      timeoutMs: options.timeoutMs,
      ...extractTargetOptions(options)
    });

    return buildSetCountResult(response, {}, oscMappings.fpe.getSetCount);
  }
};

/**
 * @tool eos_fpe_get_set_info
 * @summary Informations set FPE
 * @description Recupere les informations detaillees pour un set Focus Palette Encoder.
 * @arguments Voir docs/tools.md#eos-fpe-get-set-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fpe-get-set-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fpe-get-set-info pour un exemple OSC.
 */
export const eosFpeGetSetInfoTool: ToolDefinition<typeof getSetInfoInputSchema> = {
  name: 'eos_fpe_get_set_info',
  config: {
    title: 'Informations set FPE',
    description: 'Recupere les informations detaillees pour un set Focus Palette Encoder.',
    inputSchema: getSetInfoInputSchema,
    annotations: annotate(oscMappings.fpe.getSetInfo)
  },
  handler: async (args) => {
    const schema = z.object(getSetInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = { set: options.set_number };
    const response = await client.requestJson(oscMappings.fpe.getSetInfo, {
      timeoutMs: options.timeoutMs,
      payload,
      ...extractTargetOptions(options)
    });

    return buildSetInfoResult(response, options.set_number, payload, oscMappings.fpe.getSetInfo);
  }
};

/**
 * @tool eos_fpe_get_point_info
 * @summary Informations point FPE
 * @description Recupere les informations detaillees pour un point Focus Palette Encoder.
 * @arguments Voir docs/tools.md#eos-fpe-get-point-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-fpe-get-point-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-fpe-get-point-info pour un exemple OSC.
 */
export const eosFpeGetPointInfoTool: ToolDefinition<typeof getPointInfoInputSchema> = {
  name: 'eos_fpe_get_point_info',
  config: {
    title: 'Informations point FPE',
    description: 'Recupere les informations detaillees pour un point Focus Palette Encoder.',
    inputSchema: getPointInfoInputSchema,
    annotations: annotate(oscMappings.fpe.getPointInfo)
  },
  handler: async (args) => {
    const schema = z.object(getPointInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();

    const payload = { set: options.set_number, point: options.point_number };
    const response = await client.requestJson(oscMappings.fpe.getPointInfo, {
      timeoutMs: options.timeoutMs,
      payload,
      ...extractTargetOptions(options)
    });

    return buildPointInfoResult(
      response,
      options.set_number,
      options.point_number,
      payload,
      oscMappings.fpe.getPointInfo
    );
  }
};

export const fpeTools = [
  eosFpeGetSetCountTool,
  eosFpeGetSetInfoTool,
  eosFpeGetPointInfoTool
];

export default fpeTools;
