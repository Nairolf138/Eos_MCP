/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z, type ZodRawShape } from 'zod';
import { getOscClient } from '../../services/osc/client';
import { dmxAddressSchema, dmxValueSchema, levelValueSchema } from '../../utils/validators';
import { oscMappings } from '../../services/osc/mappings';
import {
  buildDmxAddressDmxMessage,
  buildDmxAddressLevelMessage,
  buildDmxAddressSelectMessage
} from '../../services/osc/messageBuilders';
import { createDryRunResult, resolveSafetyOptions, safetyOptionsSchema } from '../common/safety';
import { buildToolResult, withToolMetadata, type ToolDefinition, type ToolExecutionResult } from '../types';

const targetOptionsSchema = {
  targetAddress: z.string().min(1).optional(),
  targetPort: z.coerce.number().int().min(1).max(65535).optional(),
  ...safetyOptionsSchema
} satisfies ZodRawShape;

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
  return buildToolResult({
    text,
    summary: typeof structuredContent.summary === 'string' ? structuredContent.summary : text,
    structuredContent
  });
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
    const request = buildDmxAddressSelectMessage(address);

    if (resolveSafetyOptions(options).dryRun) {
      return createDryRunResult({
        text: `Selection d'adresse DMX ${address} simulee`,
        action: 'address_select',
        request: { address },
        oscAddress: request.message.address,
        oscArgs: request.message.args ?? []
      });
    }

    await client.sendMessage(request.message.address, request.message.args ?? [], {
      ...extractTargetOptions(options),
      wireContract: request.contract
    });

    return createResult(`Adresse DMX ${address} selectionnee.`, {
      action: 'address_select',
      address,
      osc: {
        address: request.message.address,
        args: request.message.args ?? []
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
    const request = buildDmxAddressLevelMessage(address, level);

    if (resolveSafetyOptions(options).dryRun) {
      return createDryRunResult({
        text: `Reglage de niveau DMX ${level}% simule pour ${address}`,
        action: 'address_set_level',
        request: { address, level },
        oscAddress: request.message.address,
        oscArgs: request.message.args ?? []
      });
    }

    await client.sendMessage(request.message.address, request.message.args ?? [], {
      ...extractTargetOptions(options),
      wireContract: request.contract
    });

    return createResult(`Niveau ${level}% applique a l'adresse DMX ${address}.`, {
      action: 'address_set_level',
      address,
      level,
      osc: {
        address: request.message.address,
        args: request.message.args ?? []
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
    const request = buildDmxAddressDmxMessage(address, value);

    if (resolveSafetyOptions(options).dryRun) {
      return createDryRunResult({
        text: `Reglage DMX brut ${value} simule pour ${address}`,
        action: 'address_set_dmx',
        request: { address, value },
        oscAddress: request.message.address,
        oscArgs: request.message.args ?? []
      });
    }

    await client.sendMessage(request.message.address, request.message.args ?? [], {
      ...extractTargetOptions(options),
      wireContract: request.contract
    });

    return createResult(`Valeur DMX ${value} appliquee a l'adresse ${address}.`, {
      action: 'address_set_dmx',
      address,
      value,
      osc: {
        address: request.message.address,
        args: request.message.args ?? []
      }
    });
  }
};

export const dmxTools = withToolMetadata([eosAddressSelectTool, eosAddressSetLevelTool, eosAddressSetDmxTool], {
  category: 'dmx',
  synonyms: ['dmx', 'address', 'adresse', 'level', 'sortie directe'],
  riskLevel: 'high',
  requiresConfirmation: true,
  preferredWorkflow: 'eos_workflow_create_look'
});

export default dmxTools;
