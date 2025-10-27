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

const pixmapNumberSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(9999)
  .describe('Numero du pixel map (1-9999).');

const timeoutSchema = z.coerce.number().int().min(50).optional();

const selectInputSchema = {
  pixmap_number: pixmapNumberSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const getInfoInputSchema = {
  pixmap_number: pixmapNumberSchema,
  timeoutMs: timeoutSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

interface PixelMapFixtureSegment {
  start_pixel: number | null;
  end_pixel: number | null;
  pixel_count: number | null;
  universe: number | null;
  address: number | null;
  string_number: number | null;
}

interface PixelMapFixture {
  channel: number;
  label: string | null;
  start_pixel: number | null;
  end_pixel: number | null;
  pixel_count: number | null;
  segments: PixelMapFixtureSegment[];
}

interface PixelMapInfo {
  pixmap_number: number;
  label: string | null;
  server_channel: number | null;
  interface: string | null;
  width: number | null;
  height: number | null;
  pixel_count: number | null;
  fixture_count: number | null;
  fixtures: PixelMapFixture[];
}

const pixelMapFixtureSegmentOutputShape = {
  start_pixel: z.coerce.number().int().min(0).nullable(),
  end_pixel: z.coerce.number().int().min(0).nullable(),
  pixel_count: z.coerce.number().int().min(0).nullable(),
  universe: z.coerce.number().int().min(0).nullable(),
  address: z.coerce.number().int().min(0).nullable(),
  string_number: z.coerce.number().int().min(0).nullable()
} satisfies ZodRawShape;

export const pixelMapFixtureSegmentOutputSchema = z.object(pixelMapFixtureSegmentOutputShape);

const pixelMapFixtureOutputShape = {
  channel: z.coerce.number().int().min(1),
  label: z.string().nullable(),
  start_pixel: z.coerce.number().int().min(0).nullable(),
  end_pixel: z.coerce.number().int().min(0).nullable(),
  pixel_count: z.coerce.number().int().min(0).nullable(),
  segments: z.array(pixelMapFixtureSegmentOutputSchema)
} satisfies ZodRawShape;

export const pixelMapFixtureOutputSchema = z.object(pixelMapFixtureOutputShape);

const pixelMapInfoOutputShape = {
  pixmap_number: pixmapNumberSchema,
  label: z.string().nullable(),
  server_channel: z.coerce.number().int().min(0).nullable(),
  interface: z.string().nullable(),
  width: z.coerce.number().int().min(0).nullable(),
  height: z.coerce.number().int().min(0).nullable(),
  pixel_count: z.coerce.number().int().min(0).nullable(),
  fixture_count: z.coerce.number().int().min(0).nullable(),
  fixtures: z.array(pixelMapFixtureOutputSchema)
} satisfies ZodRawShape;

const pixelMapInfoOutputSchema = z.object(pixelMapInfoOutputShape);

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

function createResult(text: string, structuredContent: Record<string, unknown>): ToolExecutionResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent
  } as ToolExecutionResult;
}

function asFiniteInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const match = trimmed.match(/(-?\d+)/);
    if (match) {
      return Number.parseInt(match[1] ?? '', 10);
    }
  }

  return null;
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

function parseDimensionString(value: string): { width: number | null; height: number | null } {
  const match = value.match(/(\d+)[^\d]+(\d+)/);
  if (match) {
    return {
      width: Number.parseInt(match[1] ?? '', 10),
      height: Number.parseInt(match[2] ?? '', 10)
    };
  }
  return { width: null, height: null };
}

function normaliseSegment(raw: unknown): PixelMapFixtureSegment | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;

  let start =
    asFiniteInteger(data.start_pixel) ??
    asFiniteInteger(data.start) ??
    asFiniteInteger(data.pixel_start) ??
    asFiniteInteger(data.startPixel) ??
    asFiniteInteger((data.range as Record<string, unknown> | undefined)?.start);

  let end =
    asFiniteInteger(data.end_pixel) ??
    asFiniteInteger(data.end) ??
    asFiniteInteger(data.pixel_end) ??
    asFiniteInteger(data.endPixel) ??
    asFiniteInteger((data.range as Record<string, unknown> | undefined)?.end);

  let count =
    asFiniteInteger(data.pixel_count) ??
    asFiniteInteger(data.pixelCount) ??
    asFiniteInteger(data.count) ??
    asFiniteInteger(data.pixels) ??
    asFiniteInteger(data.length) ??
    asFiniteInteger((data.range as Record<string, unknown> | undefined)?.count);

  if (count == null && start != null && end != null) {
    const computed = end - start + 1;
    if (computed > 0) {
      count = computed;
    }
  }

  if (end == null && start != null && count != null) {
    end = start + count - 1;
  }

  if (start == null && end != null && count != null) {
    start = end - count + 1;
  }

  if (start == null && end == null && count == null) {
    return null;
  }

  const universe =
    asFiniteInteger(data.universe) ??
    asFiniteInteger(data.uni) ??
    asFiniteInteger(data.univ) ??
    asFiniteInteger(data.u);

  const address =
    asFiniteInteger(data.address) ??
    asFiniteInteger(data.addr) ??
    asFiniteInteger(data.ad) ??
    asFiniteInteger(data.start_address) ??
    asFiniteInteger(data.address_start) ??
    asFiniteInteger(data.startAddress);

  const stringNumber =
    asFiniteInteger(data.string_number) ??
    asFiniteInteger(data.string) ??
    asFiniteInteger(data.run) ??
    asFiniteInteger(data.segment) ??
    asFiniteInteger(data.line);

  return {
    start_pixel: start,
    end_pixel: end,
    pixel_count: count,
    universe,
    address,
    string_number: stringNumber
  };
}

function collectSegments(value: unknown): PixelMapFixtureSegment[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normaliseSegment(item))
      .filter((item): item is PixelMapFixtureSegment => item != null);
  }

  const single = normaliseSegment(value);
  return single ? [single] : [];
}

function normaliseSegments(data: Record<string, unknown>): PixelMapFixtureSegment[] {
  const segments: PixelMapFixtureSegment[] = [];

  segments.push(...collectSegments(data.segments ?? data.segment));
  segments.push(...collectSegments(data.pixel_range ?? data.range));
  segments.push(...collectSegments(data.mapping));

  const strings = data.strings ?? data.string ?? data.runs ?? data.lines;
  if (strings) {
    segments.push(...collectSegments(strings));
  }

  const unique = new Map<string, PixelMapFixtureSegment>();
  for (const segment of segments) {
    const key = [segment.start_pixel, segment.end_pixel, segment.pixel_count, segment.universe, segment.address, segment.string_number]
      .map((item) => (item == null ? '' : String(item)))
      .join('|');
    if (!unique.has(key)) {
      unique.set(key, segment);
    }
  }

  return Array.from(unique.values()).sort((a, b) => {
    const aStart = a.start_pixel ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.start_pixel ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
}

function normaliseFixture(raw: unknown): PixelMapFixture | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return {
      channel: Math.trunc(raw),
      label: null,
      start_pixel: null,
      end_pixel: null,
      pixel_count: null,
      segments: []
    };
  }

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const data = raw as Record<string, unknown>;

  const channel =
    asFiniteInteger(data.channel) ??
    asFiniteInteger(data.chan) ??
    asFiniteInteger(data.fixture) ??
    asFiniteInteger(data.id) ??
    asFiniteInteger(data.number);

  if (channel == null) {
    return null;
  }

  const label =
    asNonEmptyString(data.label) ??
    asNonEmptyString(data.name) ??
    asNonEmptyString(data.description) ??
    asNonEmptyString(data.title) ??
    null;

  const fallbackUniverse =
    asFiniteInteger(data.universe) ??
    asFiniteInteger(data.uni) ??
    asFiniteInteger(data.univ) ??
    asFiniteInteger(data.u);

  const fallbackAddress =
    asFiniteInteger(data.address) ??
    asFiniteInteger(data.addr) ??
    asFiniteInteger(data.ad) ??
    asFiniteInteger(data.start_address) ??
    asFiniteInteger(data.address_start) ??
    asFiniteInteger(data.startAddress);

  const fallbackString =
    asFiniteInteger(data.string_number) ??
    asFiniteInteger(data.string) ??
    asFiniteInteger(data.run) ??
    asFiniteInteger(data.segment) ??
    asFiniteInteger(data.line);

  const segments = normaliseSegments(data).map((segment) => ({
    ...segment,
    universe: segment.universe ?? fallbackUniverse,
    address: segment.address ?? fallbackAddress,
    string_number: segment.string_number ?? fallbackString
  }));

  let start =
    asFiniteInteger(data.start_pixel) ??
    asFiniteInteger(data.pixel_start) ??
    asFiniteInteger(data.start) ??
    asFiniteInteger((data.range as Record<string, unknown> | undefined)?.start);

  let end =
    asFiniteInteger(data.end_pixel) ??
    asFiniteInteger(data.pixel_end) ??
    asFiniteInteger(data.end) ??
    asFiniteInteger((data.range as Record<string, unknown> | undefined)?.end);

  let count =
    asFiniteInteger(data.pixel_count) ??
    asFiniteInteger(data.pixelCount) ??
    asFiniteInteger(data.pixels) ??
    asFiniteInteger(data.count) ??
    asFiniteInteger(data.length) ??
    asFiniteInteger((data.range as Record<string, unknown> | undefined)?.count);

  if (segments.length > 0) {
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    start = start ?? firstSegment.start_pixel ?? null;
    end = end ?? lastSegment.end_pixel ?? null;
    if (count == null) {
      const total = segments.reduce((sum, segment) => {
        const value = segment.pixel_count ??
          (segment.start_pixel != null && segment.end_pixel != null ? segment.end_pixel - segment.start_pixel + 1 : 0);
        return sum + value;
      }, 0);
      if (total > 0) {
        count = total;
      }
    }
  }

  if (count == null && start != null && end != null) {
    const computed = end - start + 1;
    if (computed > 0) {
      count = computed;
    }
  }

  if (end == null && start != null && count != null) {
    end = start + count - 1;
  }

  if (start == null && end != null && count != null) {
    start = end - count + 1;
  }

  return {
    channel,
    label,
    start_pixel: start,
    end_pixel: end,
    pixel_count: count,
    segments
  };
}

function normaliseFixtures(raw: unknown): PixelMapFixture[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const fixtures = raw
    .map((item) => normaliseFixture(item))
    .filter((item): item is PixelMapFixture => item != null);

  const merged = new Map<number, PixelMapFixture>();

  for (const fixture of fixtures) {
    const existing = merged.get(fixture.channel);
    if (!existing) {
      merged.set(fixture.channel, fixture);
      continue;
    }

    if (!existing.label && fixture.label) {
      existing.label = fixture.label;
    }

    if (existing.start_pixel == null || (fixture.start_pixel != null && fixture.start_pixel < existing.start_pixel)) {
      existing.start_pixel = fixture.start_pixel;
    }

    if (existing.end_pixel == null || (fixture.end_pixel != null && fixture.end_pixel > existing.end_pixel)) {
      existing.end_pixel = fixture.end_pixel;
    }

    if (fixture.pixel_count != null) {
      existing.pixel_count = (existing.pixel_count ?? 0) + fixture.pixel_count;
    }

    const combinedSegments = [...existing.segments, ...fixture.segments];
    const unique = new Map<string, PixelMapFixtureSegment>();
    for (const segment of combinedSegments) {
      const key = [segment.start_pixel, segment.end_pixel, segment.pixel_count, segment.universe, segment.address, segment.string_number]
        .map((item) => (item == null ? '' : String(item)))
        .join('|');
      if (!unique.has(key)) {
        unique.set(key, segment);
      }
    }
    existing.segments = Array.from(unique.values()).sort((a, b) => {
      const aStart = a.start_pixel ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.start_pixel ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    });
  }

  for (const fixture of merged.values()) {
    if (fixture.pixel_count == null && fixture.start_pixel != null && fixture.end_pixel != null) {
      const computed = fixture.end_pixel - fixture.start_pixel + 1;
      if (computed > 0) {
        fixture.pixel_count = computed;
      }
    }

    if (fixture.pixel_count == null) {
      const total = fixture.segments.reduce((sum, segment) => {
        const value = segment.pixel_count ??
          (segment.start_pixel != null && segment.end_pixel != null ? segment.end_pixel - segment.start_pixel + 1 : 0);
        return sum + value;
      }, 0);
      if (total > 0) {
        fixture.pixel_count = total;
      }
    }

    if (fixture.start_pixel == null && fixture.segments.length > 0) {
      fixture.start_pixel = fixture.segments.reduce<number | null>((min, segment) => {
        if (segment.start_pixel == null) {
          return min;
        }
        if (min == null || segment.start_pixel < min) {
          return segment.start_pixel;
        }
        return min;
      }, null);
    }

    if (fixture.end_pixel == null && fixture.segments.length > 0) {
      fixture.end_pixel = fixture.segments.reduce<number | null>((max, segment) => {
        if (segment.end_pixel == null) {
          return max;
        }
        if (max == null || segment.end_pixel > max) {
          return segment.end_pixel;
        }
        return max;
      }, null);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.channel - b.channel);
}

function normalisePixelMapInfo(raw: unknown, fallbackNumber: number): PixelMapInfo {
  const info: PixelMapInfo = {
    pixmap_number: fallbackNumber,
    label: null,
    server_channel: null,
    interface: null,
    width: null,
    height: null,
    pixel_count: null,
    fixture_count: null,
    fixtures: []
  };

  if (!raw || typeof raw !== 'object') {
    return info;
  }

  const data = raw as Record<string, unknown>;

  const numberCandidate =
    data.pixmap_number ??
    data.pixmap ??
    data.number ??
    data.id;
  const parsedNumber = asFiniteInteger(numberCandidate);
  if (parsedNumber != null) {
    info.pixmap_number = parsedNumber;
  }

  info.label =
    asNonEmptyString(data.label) ??
    asNonEmptyString(data.name) ??
    asNonEmptyString(data.title) ??
    asNonEmptyString(data.description) ??
    info.label;

  info.server_channel =
    asFiniteInteger(data.server_channel) ??
    asFiniteInteger(data.serverChannel) ??
    asFiniteInteger(data.server) ??
    asFiniteInteger(data.channel) ??
    info.server_channel;

  const interfaceValue =
    asNonEmptyString(data.interface) ??
    asNonEmptyString(data.interface_name) ??
    asNonEmptyString(data.iface) ??
    asNonEmptyString(data.network_interface);
  if (interfaceValue) {
    info.interface = interfaceValue;
  }

  const widthCandidates = [
    data.width,
    data.w,
    (data.dimensions as Record<string, unknown> | undefined)?.width,
    (data.size as Record<string, unknown> | undefined)?.width,
    (data.resolution as Record<string, unknown> | undefined)?.width
  ];

  for (const candidate of widthCandidates) {
    const parsed = asFiniteInteger(candidate);
    if (parsed != null) {
      info.width = parsed;
      break;
    }
  }

  const heightCandidates = [
    data.height,
    data.h,
    (data.dimensions as Record<string, unknown> | undefined)?.height,
    (data.size as Record<string, unknown> | undefined)?.height,
    (data.resolution as Record<string, unknown> | undefined)?.height
  ];

  for (const candidate of heightCandidates) {
    const parsed = asFiniteInteger(candidate);
    if (parsed != null) {
      info.height = parsed;
      break;
    }
  }

  if ((info.width == null || info.height == null) && typeof data.dimensions === 'string') {
    const parsed = parseDimensionString(data.dimensions);
    info.width = info.width ?? parsed.width;
    info.height = info.height ?? parsed.height;
  }

  if ((info.width == null || info.height == null) && typeof data.size === 'string') {
    const parsed = parseDimensionString(data.size);
    info.width = info.width ?? parsed.width;
    info.height = info.height ?? parsed.height;
  }

  if ((info.width == null || info.height == null) && typeof data.resolution === 'string') {
    const parsed = parseDimensionString(data.resolution);
    info.width = info.width ?? parsed.width;
    info.height = info.height ?? parsed.height;
  }

  info.pixel_count =
    asFiniteInteger(data.pixel_count) ??
    asFiniteInteger(data.pixelCount) ??
    asFiniteInteger(data.pixels) ??
    asFiniteInteger(data.count) ??
    info.pixel_count;

  info.fixture_count =
    asFiniteInteger(data.fixture_count) ??
    asFiniteInteger(data.fixtures) ??
    asFiniteInteger(data.fixtureCount) ??
    info.fixture_count;

  const fixtureSource =
    (Array.isArray(data.fixtures) && data.fixtures) ||
    (Array.isArray(data.channels) && data.channels) ||
    (Array.isArray(data.contents) && data.contents) ||
    (Array.isArray(data.data) && data.data) ||
    [];

  info.fixtures = normaliseFixtures(fixtureSource);

  if (info.fixture_count == null && info.fixtures.length > 0) {
    info.fixture_count = info.fixtures.length;
  }

  if (info.pixel_count == null && info.fixtures.length > 0) {
    const totalPixels = info.fixtures.reduce((sum, fixture) => sum + (fixture.pixel_count ?? 0), 0);
    if (totalPixels > 0) {
      info.pixel_count = totalPixels;
    }
  }

  return info;
}

/**
 * @tool eos_pixmap_select
 * @summary Selection de pixel map
 * @description Selectionne un pixel map sur la console Eos.
 * @arguments Voir docs/tools.md#eos-pixmap-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-pixmap-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-pixmap-select pour un exemple OSC.
 */
export const eosPixmapSelectTool: ToolDefinition<typeof selectInputSchema> = {
  name: 'eos_pixmap_select',
  config: {
    title: 'Selection de pixel map',
    description: 'Selectionne un pixel map sur la console Eos.',
    inputSchema: selectInputSchema,
    annotations: annotate(oscMappings.pixelMaps.select)
  },
  handler: async (args, _extra) => {
    const schema = z.object(selectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      pixmap: options.pixmap_number
    };

    await client.sendMessage(
      oscMappings.pixelMaps.select,
      buildJsonArgs(payload),
      {
        targetAddress: options.targetAddress,
        targetPort: options.targetPort
      }
    );

    return createResult(`Pixel map ${options.pixmap_number} selectionne`, {
      action: 'select',
      pixmap_number: options.pixmap_number,
      osc: {
        address: oscMappings.pixelMaps.select,
        args: payload
      }
    });
  }
};

/**
 * @tool eos_pixmap_get_info
 * @summary Informations sur un pixel map
 * @description Recupere les informations detaillees pour un pixel map donne.
 * @arguments Voir docs/tools.md#eos-pixmap-get-info pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-pixmap-get-info pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-pixmap-get-info pour un exemple OSC.
 */
export const eosPixmapGetInfoTool: ToolDefinition<typeof getInfoInputSchema> = {
  name: 'eos_pixmap_get_info',
  config: {
    title: 'Informations sur un pixel map',
    description: 'Recupere les informations detaillees pour un pixel map donne.',
    inputSchema: getInfoInputSchema,
    outputSchema: pixelMapInfoOutputShape,
    annotations: annotate(oscMappings.pixelMaps.info)
  },
  handler: async (args, _extra) => {
    const schema = z.object(getInfoInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const payload = {
      pixmap: options.pixmap_number
    };
    const cacheKey = createCacheKey({
      address: oscMappings.pixelMaps.info,
      payload,
      targetAddress: options.targetAddress,
      targetPort: options.targetPort
    });
    const cache = getResourceCache();

    return cache.fetch<ToolExecutionResult>({
      resourceType: 'pixelMaps',
      key: cacheKey,
      tags: [
        createResourceTag('pixelMaps'),
        createResourceTag('pixelMaps', String(options.pixmap_number))
      ],
      prefixTags: [createOscPrefixTag('/eos/out/')],
      fetcher: async () => {
        const response: OscJsonResponse = await client.requestJson(oscMappings.pixelMaps.info, {
          payload,
          timeoutMs: options.timeoutMs,
          targetAddress: options.targetAddress,
          targetPort: options.targetPort
        });

        const pixmapData = normalisePixelMapInfo(
          (response.data as Record<string, unknown> | null)?.pixmap ?? response.data,
          options.pixmap_number
        );

        const validatedPixmap = pixelMapInfoOutputSchema.parse(pixmapData);

        const baseText =
          response.status === 'ok'
            ? `Informations recues pour le pixel map ${validatedPixmap.pixmap_number}.`
            : `Lecture des informations du pixel map ${validatedPixmap.pixmap_number} terminee avec le statut ${response.status}.`;

        return createResult(baseText, {
          action: 'get_info',
          status: response.status,
          request: payload,
          pixmap: validatedPixmap,
          data: response.data,
          error: response.error ?? null,
          osc: {
            address: oscMappings.pixelMaps.info,
            args: payload
          }
        });
      }
    });
  }
};

export default [eosPixmapSelectTool, eosPixmapGetInfoTool];

