/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { oscMappings } from './mappings';
import type { OscMessage, OscMessageArgument } from './index';

const jsonArgumentSchema = z.object({
  type: z.literal('s'),
  value: z.string()
});

const floatArgumentSchema = z.object({
  type: z.literal('f'),
  value: z.number().finite()
});

const intArgumentSchema = z.object({
  type: z.literal('i'),
  value: z.number().int()
});

export interface OscWireContract {
  address: string;
  argumentTypes: OscMessageArgument['type'][];
  family: 'cue' | 'fader' | 'group' | 'palette' | 'generic';
}

export interface BuiltOscWireMessage {
  message: OscMessage;
  contract: OscWireContract;
}

function serialiseJsonPayload(payload: Record<string, unknown>): OscMessageArgument {
  return {
    type: 's',
    value: JSON.stringify(payload)
  };
}

export function validateWireMessage(contract: OscWireContract, message: OscMessage): void {
  if (message.address !== contract.address) {
    throw new Error(
      `Contrat wire OSC invalide: adresse attendue '${contract.address}', recue '${message.address}'.`
    );
  }

  const args = Array.isArray(message.args) ? message.args : [];
  const receivedTypes = args.map((arg) => arg.type);

  if (receivedTypes.length !== contract.argumentTypes.length) {
    throw new Error(
      `Contrat wire OSC invalide pour ${contract.address}: ${contract.argumentTypes.length} argument(s) attendu(s), ${receivedTypes.length} recu(s).`
    );
  }

  contract.argumentTypes.forEach((type, index) => {
    if (receivedTypes[index] !== type) {
      throw new Error(
        `Contrat wire OSC invalide pour ${contract.address}: argument #${index + 1} attendu '${type}', recu '${receivedTypes[index]}'.`
      );
    }
  });

  args.forEach((arg, index) => {
    if (arg.type === 's' && contract.argumentTypes[index] === 's') {
      jsonArgumentSchema.parse(arg);
      return;
    }
    if (arg.type === 'f' && contract.argumentTypes[index] === 'f') {
      floatArgumentSchema.parse(arg);
      return;
    }
    if (arg.type === 'i' && contract.argumentTypes[index] === 'i') {
      intArgumentSchema.parse(arg);
    }
  });
}

function withContract(
  family: OscWireContract['family'],
  address: string,
  args: OscMessageArgument[]
): BuiltOscWireMessage {
  const message: OscMessage = { address, args };
  const contract: OscWireContract = {
    family,
    address,
    argumentTypes: args.map((arg) => arg.type)
  };
  validateWireMessage(contract, message);
  return { message, contract };
}

export function buildCueJsonMessage(
  address:
    | typeof oscMappings.cues.info
    | typeof oscMappings.cues.list
    | typeof oscMappings.cues.cuelistInfo
    | typeof oscMappings.cues.active
    | typeof oscMappings.cues.pending,
  payload: Record<string, unknown>
): BuiltOscWireMessage {
  return withContract('cue', address, [serialiseJsonPayload(payload)]);
}

export function buildGroupJsonMessage(
  address: typeof oscMappings.groups.info | typeof oscMappings.groups.list,
  payload: Record<string, unknown>
): BuiltOscWireMessage {
  return withContract('group', address, [serialiseJsonPayload(payload)]);
}

export function buildFaderBankCreateMessage(
  bankIndex: number,
  faderCount: number,
  page: number
): BuiltOscWireMessage {
  const address = `${oscMappings.faders.base}/${bankIndex}/config/${faderCount}/${page}`;
  return withContract('fader', address, []);
}

export function buildFaderSetLevelMessage(
  bankIndex: number,
  page: number,
  faderIndex: number,
  level: number
): BuiltOscWireMessage {
  const address = `${oscMappings.faders.base}/${bankIndex}/${page}/${faderIndex}`;
  return withContract('fader', address, [{ type: 'f', value: level }]);
}

export function buildGroupSelectMessage(groupNumber: number): BuiltOscWireMessage {
  return withContract('group', oscMappings.groups.select, [{ type: 'i', value: groupNumber }]);
}

export function buildPaletteFireMessage(address: string, paletteNumber: number): BuiltOscWireMessage {
  return withContract('palette', address, [{ type: 'i', value: paletteNumber }]);
}

export function buildPaletteInfoJsonMessage(address: string, payload: Record<string, unknown>): BuiltOscWireMessage {
  return withContract('palette', address, [serialiseJsonPayload(payload)]);
}

export function extractJsonPayloadFromMessage(message: OscMessage): Record<string, unknown> {
  const args = Array.isArray(message.args) ? message.args : [];
  if (args.length === 0) {
    return {};
  }
  const [first] = args;
  if (first?.type !== 's' || typeof first.value !== 'string') {
    throw new Error(`Payload JSON OSC invalide pour ${message.address}.`);
  }
  const parsed = JSON.parse(first.value) as unknown;
  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    throw new Error(`Payload JSON OSC invalide pour ${message.address}: objet attendu.`);
  }
  return parsed as Record<string, unknown>;
}

const DOCUMENTED_JSON_ENDPOINTS = new Set<string>([
  oscMappings.cues.info,
  oscMappings.cues.list,
  oscMappings.cues.cuelistInfo,
  oscMappings.cues.active,
  oscMappings.cues.pending,
  oscMappings.groups.info,
  oscMappings.groups.list,
  oscMappings.palettes.info,
  oscMappings.palettes.intensity.info,
  oscMappings.palettes.focus.info,
  oscMappings.palettes.color.info,
  oscMappings.palettes.beam.info
]);

export function isDocumentedJsonEndpoint(address: string): boolean {
  return DOCUMENTED_JSON_ENDPOINTS.has(address);
}
