import { z, type ZodRawShape } from 'zod';
import { getOscClient, type OscJsonResponse } from '../../services/osc/client';
import { oscMappings } from '../../services/osc/mappings';
import type { ToolDefinition, ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.number().int().min(1).max(65535).optional()
} satisfies ZodRawShape;

const dmxAddressSchema = z
  .union([z.string().min(1), z.number().int().min(1).max(65535)])
  .describe("Adresse DMX au format 'univers/adresse' ou numero absolu.");

const levelValueSchema = z.union([z.number(), z.string().min(1)]);
const dmxValueSchema = z.union([z.number(), z.string().min(1)]);

const LEVEL_KEYWORDS: Record<string, number> = {
  full: 100,
  out: 0
};

const DMX_KEYWORDS: Record<string, number> = {
  full: 255,
  out: 0
};

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

function normaliseAddress(value: number | string): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error("L'adresse DMX doit etre un nombre fini ou une chaine valide.");
    }
    if (value < 1 || value > 65535) {
      throw new Error("L'adresse DMX numerique doit etre comprise entre 1 et 65535.");
    }
    return String(Math.trunc(value));
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("L'adresse DMX ne peut pas etre vide.");
  }

  const normalised = trimmed.replace(/\s+/g, '');

  const parts = normalised.split(/[./:-]/);

  if (parts.length === 2) {
    const [universeText, slotText] = parts;
    const universe = Number.parseInt(universeText, 10);
    const slot = Number.parseInt(slotText, 10);

    if (Number.isFinite(universe) && Number.isFinite(slot)) {
      if (universe < 1 || universe > 9999) {
        throw new Error("Le numero d'univers doit etre compris entre 1 et 9999.");
      }
      if (slot < 1 || slot > 512) {
        throw new Error('Le numero de canal DMX doit etre compris entre 1 et 512.');
      }
      return `${universe}/${slot.toString().padStart(3, '0')}`;
    }
  }

  return normalised;
}

function parseResponseStatus(response: OscJsonResponse): string {
  return response.status ?? 'unknown';
}

const addressSelectInputSchema = {
  address_number: dmxAddressSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const addressSetLevelInputSchema = {
  address_number: dmxAddressSchema,
  level: levelValueSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

const addressSetDmxInputSchema = {
  address_number: dmxAddressSchema,
  dmx_value: dmxValueSchema,
  ...targetOptionsSchema
} satisfies ZodRawShape;

/**
 * @tool eos_address_select
 * @summary Selection d'adresse DMX
 * @description Selectionne une adresse DMX specifique sur la console.
 * @arguments Voir docs/tools.md#eos-address-select pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-address-select pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-address-select pour un exemple OSC.
 */
export const eosAddressSelectTool: ToolDefinition<typeof addressSelectInputSchema> = {
  name: 'eos_address_select',
  config: {
    title: "Selection d'adresse DMX",
    description: 'Selectionne une adresse DMX specifique sur la console.',
    inputSchema: addressSelectInputSchema,
    annotations: annotate(oscMappings.dmx.addressSelect)
  },
  handler: async (args) => {
    const schema = z.object(addressSelectInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const address = normaliseAddress(options.address_number);
    const payload = { address };

    const response: OscJsonResponse = await client.requestJson(oscMappings.dmx.addressSelect, {
      payload,
      ...extractTargetOptions(options)
    });

    return createResult(`Adresse DMX ${address} selectionnee.`, {
      action: 'address_select',
      address,
      status: parseResponseStatus(response),
      osc: {
        address: oscMappings.dmx.addressSelect,
        request: payload,
        response: response.payload
      }
    });
  }
};

/**
 * @tool eos_address_set_level
 * @summary Reglage de niveau d'adresse DMX
 * @description Ajuste le niveau (0-100) pour une adresse DMX donnee.
 * @arguments Voir docs/tools.md#eos-address-set-level pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-address-set-level pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-address-set-level pour un exemple OSC.
 */
export const eosAddressSetLevelTool: ToolDefinition<typeof addressSetLevelInputSchema> = {
  name: 'eos_address_set_level',
  config: {
    title: "Reglage de niveau d'adresse DMX",
    description: 'Ajuste le niveau (0-100) pour une adresse DMX donnee.',
    inputSchema: addressSetLevelInputSchema,
    annotations: annotate(oscMappings.dmx.addressLevel)
  },
  handler: async (args) => {
    const schema = z.object(addressSetLevelInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const address = normaliseAddress(options.address_number);
    const level = resolveLevelValue(options.level);
    const payload = { address, level };

    const response: OscJsonResponse = await client.requestJson(oscMappings.dmx.addressLevel, {
      payload,
      ...extractTargetOptions(options)
    });

    return createResult(`Niveau ${level}% applique a l'adresse DMX ${address}.`, {
      action: 'address_set_level',
      address,
      level,
      status: parseResponseStatus(response),
      osc: {
        address: oscMappings.dmx.addressLevel,
        request: payload,
        response: response.payload
      }
    });
  }
};

/**
 * @tool eos_address_set_dmx
 * @summary Reglage DMX brut
 * @description Fixe une valeur DMX brute (0-255) pour une adresse DMX.
 * @arguments Voir docs/tools.md#eos-address-set-dmx pour le schema complet.
 * @returns ToolExecutionResult avec contenu texte et objet.
 * @example CLI Consultez docs/tools.md#eos-address-set-dmx pour un exemple CLI.
 * @example OSC Consultez docs/tools.md#eos-address-set-dmx pour un exemple OSC.
 */
export const eosAddressSetDmxTool: ToolDefinition<typeof addressSetDmxInputSchema> = {
  name: 'eos_address_set_dmx',
  config: {
    title: "Reglage DMX brut",
    description: 'Fixe une valeur DMX brute (0-255) pour une adresse DMX.',
    inputSchema: addressSetDmxInputSchema,
    annotations: annotate(oscMappings.dmx.addressDmx)
  },
  handler: async (args) => {
    const schema = z.object(addressSetDmxInputSchema).strict();
    const options = schema.parse(args ?? {});
    const client = getOscClient();
    const address = normaliseAddress(options.address_number);
    const value = resolveDmxValue(options.dmx_value);
    const payload = { address, value };

    const response: OscJsonResponse = await client.requestJson(oscMappings.dmx.addressDmx, {
      payload,
      ...extractTargetOptions(options)
    });

    return createResult(`Valeur DMX ${value} appliquee a l'adresse ${address}.`, {
      action: 'address_set_dmx',
      address,
      value,
      status: parseResponseStatus(response),
      osc: {
        address: oscMappings.dmx.addressDmx,
        request: payload,
        response: response.payload
      }
    });
  }
};

export const dmxTools = [eosAddressSelectTool, eosAddressSetLevelTool, eosAddressSetDmxTool];

export default dmxTools;
