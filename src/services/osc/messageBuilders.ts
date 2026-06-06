/*
 * Copyright 2026 Florian Ribes (NairolfConcept)
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';
import { buildDmxAddressDmxAddress, buildDmxAddressLevelAddress } from './addressBuilders';
import { oscMappings } from './mappings';
import type { OscMessage, OscMessageArgument } from './index';
import { getOscAddressOfficiality } from './officiality';

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

export type StrictModeBehavior =
  | 'native_official_required'
  | 'validated_cmd_fallback'
  | 'blocked_without_validated_cmd_fallback'
  | 'no_osc_transport';

export interface OscToolStrictModePolicy {
  nativeOscPreferred: boolean;
  cmdFallbackAllowed: boolean;
  requiresConfirmation: boolean;
  strictModeBehavior: StrictModeBehavior;
  officialOscAddresses: string[];
  blockedOscAddresses: string[];
}

export interface BuildOscToolStrictModePolicyOptions {
  oscAddresses?: readonly string[];
  requiresConfirmation?: boolean;
}

const VALIDATED_COMMAND_FALLBACK_ADDRESSES = new Set<string>([
  oscMappings.commands.command,
  oscMappings.commands.newCommand
]);

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

/**
 * Central policy used by MCP tools to expose how strict OSC mode must handle
 * native ETC OSC endpoints versus validated Eos command-line text.
 */
export function buildOscToolStrictModePolicy(
  options: BuildOscToolStrictModePolicyOptions = {}
): OscToolStrictModePolicy {
  const addresses = uniqueStrings(options.oscAddresses ?? []);
  const officialOscAddresses = addresses.filter((address) => getOscAddressOfficiality(address)?.strictModeAllowed === true);
  const blockedOscAddresses = addresses.filter((address) => getOscAddressOfficiality(address)?.strictModeAllowed !== true);
  const hasNativeOfficialAddress = officialOscAddresses.some((address) => !VALIDATED_COMMAND_FALLBACK_ADDRESSES.has(address));
  const hasCommandFallback = addresses.some((address) => VALIDATED_COMMAND_FALLBACK_ADDRESSES.has(address));

  let strictModeBehavior: StrictModeBehavior = 'no_osc_transport';
  if (hasNativeOfficialAddress) {
    strictModeBehavior = blockedOscAddresses.length > 0
      ? 'blocked_without_validated_cmd_fallback'
      : 'native_official_required';
  } else if (hasCommandFallback) {
    strictModeBehavior = blockedOscAddresses.length > 0
      ? 'blocked_without_validated_cmd_fallback'
      : 'validated_cmd_fallback';
  } else if (blockedOscAddresses.length > 0) {
    strictModeBehavior = 'blocked_without_validated_cmd_fallback';
  }

  return {
    nativeOscPreferred: blockedOscAddresses.length === 0 && hasNativeOfficialAddress,
    cmdFallbackAllowed: blockedOscAddresses.length === 0 && !hasNativeOfficialAddress && hasCommandFallback,
    requiresConfirmation: options.requiresConfirmation === true,
    strictModeBehavior,
    officialOscAddresses,
    blockedOscAddresses
  };
}

export interface OscWireContract {
  address: string;
  argumentTypes: OscMessageArgument['type'][];
  family: 'cue' | 'dmx' | 'fader' | 'group' | 'palette' | 'generic';
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

export function buildDmxAddressSelectMessage(address: string): BuiltOscWireMessage {
  return withContract('dmx', oscMappings.dmx.addressSelect, [{ type: 's', value: address }]);
}

export function buildDmxAddressLevelMessage(address: string, level: number): BuiltOscWireMessage {
  return withContract('dmx', buildDmxAddressLevelAddress(address), [{ type: 'f', value: level }]);
}

export function buildDmxAddressDmxMessage(address: string, value: number): BuiltOscWireMessage {
  return withContract('dmx', buildDmxAddressDmxAddress(address), [{ type: 'i', value }]);
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

const QUERY_JSON_ENDPOINTS = Object.values(oscMappings.queries).flatMap((mapping) => [
  mapping.count,
  mapping.list
]);

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
  oscMappings.palettes.beam.info,
  oscMappings.keys.softkeyLabels,
  oscMappings.channels.info,
  oscMappings.presets.info,
  oscMappings.macros.info,
  oscMappings.snapshots.info,
  oscMappings.curves.info,
  oscMappings.effects.info,
  oscMappings.parameters.activeWheels,
  oscMappings.fpe.getSetCount,
  oscMappings.fpe.getSetInfo,
  oscMappings.fpe.getPointInfo,
  oscMappings.pixelMaps.info,
  oscMappings.magicSheets.info,
  oscMappings.patch.channelInfo,
  oscMappings.patch.augment3dPosition,
  oscMappings.patch.augment3dBeam,
  oscMappings.submasters.info,
  oscMappings.showControl.showName,
  oscMappings.showControl.liveBlindState,
  oscMappings.system.getVersion,
  oscMappings.system.getSetupDefaults,
  ...QUERY_JSON_ENDPOINTS
]);

export function isDocumentedJsonEndpoint(address: string): boolean {
  return DOCUMENTED_JSON_ENDPOINTS.has(address);
}
